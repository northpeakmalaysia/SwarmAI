/**
 * URL Scraping Service
 *
 * Dedicated service for scraping and extracting content from URLs.
 * Features:
 * - Auto-detection of URL-primary messages
 * - Content extraction with readability-like processing
 * - Article metadata extraction (title, author, date)
 * - Integration with RAG ingestion pipeline
 * - Rate limiting per domain
 * - Caching with TTL
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const { getContentProcessor, SOURCE_RELIABILITY } = require('./ContentProcessor.cjs');

// Lazy load fetch
let _fetch = null;
async function getFetch() {
  if (!_fetch) {
    _fetch = (await import('node-fetch')).default;
  }
  return _fetch;
}

/**
 * URL patterns for detection
 */
const URL_PATTERNS = {
  // Standard URL pattern
  URL: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
  // URL-only message (message is primarily a URL with minimal text)
  URL_PRIMARY: /^[\s\S]{0,50}(https?:\/\/[^\s<>"{}|\\^`\[\]]+)[\s\S]{0,100}$/,
  // News article indicators
  NEWS_ARTICLE: /\/(news|article|story|berita|nasional|world|politics|sport)/i,
};

/**
 * Additional Malaysian news sources for reliability ratings
 */
const MALAYSIAN_NEWS_SOURCES = {
  'buletintv3.my': { score: 0.75, category: 'local_broadcaster', name: 'Buletin TV3' },
  'astroawani.com': { score: 0.80, category: 'local_broadcaster', name: 'Astro Awani' },
  'freemalaysiatoday.com': { score: 0.75, category: 'local_news', name: 'Free Malaysia Today' },
  'says.com': { score: 0.65, category: 'local_media', name: 'SAYS' },
  'worldofbuzz.com': { score: 0.60, category: 'local_media', name: 'World of Buzz' },
  'mstar.com.my': { score: 0.72, category: 'local_newspaper', name: 'MStar' },
  'kosmo.com.my': { score: 0.70, category: 'local_tabloid', name: 'Kosmo' },
  'bharian.com.my': { score: 0.75, category: 'local_newspaper', name: 'Berita Harian' },
  'metroahad.com.my': { score: 0.70, category: 'local_newspaper', name: 'Metro Ahad' },
  'thevibes.com': { score: 0.73, category: 'local_news', name: 'The Vibes' },
  'malaysianow.com': { score: 0.74, category: 'local_news', name: 'MalaysiaNow' },
  'focusmalaysia.my': { score: 0.72, category: 'local_news', name: 'Focus Malaysia' },
  'theedgemarkets.com': { score: 0.82, category: 'financial_news', name: 'The Edge Markets' },
  'met.gov.my': { score: 0.92, category: 'government', name: 'MetMalaysia' },
};

class URLScrapingService {
  constructor(options = {}) {
    this.config = {
      // Scraping settings
      timeout: options.timeout || 15000, // 15 seconds
      maxContentLength: options.maxContentLength || 100000, // 100KB
      minContentLength: options.minContentLength || 100, // Minimum chars to be useful

      // Auto-scrape settings
      autoScrapeOnUrlMessage: options.autoScrapeOnUrlMessage !== false, // Enabled by default
      autoIngestOnScrape: options.autoIngestOnScrape !== false, // Auto-ingest to RAG
      minMatchScoreForAutoIngest: options.minMatchScoreForAutoIngest || 0.50, // Lower threshold for URL-primary

      // Rate limiting per domain
      rateLimitPerDomain: options.rateLimitPerDomain || 5, // requests per minute
      rateLimitWindow: options.rateLimitWindow || 60000, // 1 minute

      // Caching
      cacheTTL: options.cacheTTL || 3600000, // 1 hour
      maxCacheSize: options.maxCacheSize || 200,

      ...options,
    };

    // Cache for scraped content
    this.cache = new Map();

    // Rate limiting tracker per domain
    this.rateLimits = new Map();

    // Register additional Malaysian sources
    this.registerMalaysianSources();

    // Statistics
    this.stats = {
      totalScraped: 0,
      cacheHits: 0,
      rateLimited: 0,
      failures: 0,
      autoIngested: 0,
    };
  }

  /**
   * Register Malaysian news sources to ContentProcessor
   */
  registerMalaysianSources() {
    const contentProcessor = getContentProcessor();
    for (const [domain, info] of Object.entries(MALAYSIAN_NEWS_SOURCES)) {
      contentProcessor.addKnownSource(domain, info);
    }
    logger.info(`URLScrapingService: Registered ${Object.keys(MALAYSIAN_NEWS_SOURCES).length} Malaysian news sources`);
  }

  /**
   * Detect if a message is URL-primary (mainly contains a URL)
   * @param {string} content - Message content
   * @returns {Object} Detection result
   */
  detectUrlPrimaryMessage(content) {
    if (!content) return { isUrlPrimary: false, urls: [] };

    // Extract all URLs
    const urls = content.match(URL_PATTERNS.URL) || [];

    if (urls.length === 0) {
      return { isUrlPrimary: false, urls: [] };
    }

    // Calculate URL portion of message
    const urlLength = urls.reduce((sum, url) => sum + url.length, 0);
    const nonUrlLength = content.length - urlLength;
    const urlRatio = urlLength / content.length;

    // Message is URL-primary if:
    // 1. URL takes up more than 60% of content, OR
    // 2. Non-URL text is less than 150 chars (just context/caption)
    const isUrlPrimary = urlRatio > 0.6 || nonUrlLength < 150;

    // Detect if it's a news article URL
    const hasNewsIndicator = urls.some(url => URL_PATTERNS.NEWS_ARTICLE.test(url));

    return {
      isUrlPrimary,
      urls,
      primaryUrl: urls[0],
      urlRatio,
      nonUrlLength,
      isNewsArticle: hasNewsIndicator,
      urlCount: urls.length,
    };
  }

  /**
   * Check rate limit for domain
   * @private
   */
  checkRateLimit(domain) {
    const now = Date.now();
    const record = this.rateLimits.get(domain);

    if (!record) {
      this.rateLimits.set(domain, { count: 1, windowStart: now });
      return true;
    }

    // Reset window if expired
    if (now - record.windowStart > this.config.rateLimitWindow) {
      this.rateLimits.set(domain, { count: 1, windowStart: now });
      return true;
    }

    // Check if under limit
    if (record.count < this.config.rateLimitPerDomain) {
      record.count++;
      return true;
    }

    this.stats.rateLimited++;
    return false;
  }

  /**
   * Scrape content from a URL
   * @param {string} url - URL to scrape
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} Scraped content result
   */
  async scrape(url, options = {}) {
    const startTime = Date.now();

    try {
      // Validate URL
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname.replace(/^www\./, '');

      // Check cache first
      const cached = this.getFromCache(url);
      if (cached && !options.bypassCache) {
        this.stats.cacheHits++;
        logger.debug(`URLScrapingService: Cache hit for ${url}`);
        return {
          success: true,
          fromCache: true,
          ...cached,
        };
      }

      // Check rate limit
      if (!this.checkRateLimit(domain)) {
        logger.warn(`URLScrapingService: Rate limited for domain ${domain}`);
        return {
          success: false,
          error: 'rate_limited',
          message: `Rate limit exceeded for ${domain}. Try again later.`,
          url,
        };
      }

      // Fetch the URL
      const fetch = await getFetch();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SwarmAI-Bot/1.0; +https://github.com/swarm-ai)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,ms;q=0.8,zh;q=0.7',
        },
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.stats.failures++;
        return {
          success: false,
          error: 'http_error',
          message: `HTTP ${response.status}: ${response.statusText}`,
          url,
          statusCode: response.status,
        };
      }

      // Check content type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        return {
          success: false,
          error: 'unsupported_content_type',
          message: `Unsupported content type: ${contentType}`,
          url,
          contentType,
        };
      }

      // Get HTML content
      let html = await response.text();

      // Truncate if too long
      if (html.length > this.config.maxContentLength) {
        html = html.substring(0, this.config.maxContentLength);
      }

      // Extract content
      const extracted = this.extractContent(html, url);

      // Check minimum content length
      if (extracted.content.length < this.config.minContentLength) {
        return {
          success: false,
          error: 'insufficient_content',
          message: 'Extracted content is too short',
          url,
          contentLength: extracted.content.length,
        };
      }

      // Get source reliability
      const reliability = this.getSourceReliability(domain);

      const result = {
        success: true,
        url,
        domain,
        title: extracted.title,
        content: extracted.content,
        description: extracted.description,
        author: extracted.author,
        publishDate: extracted.publishDate,
        imageUrl: extracted.imageUrl,
        contentLength: extracted.content.length,
        reliability,
        scrapedAt: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
      };

      // Cache the result
      this.addToCache(url, result);

      this.stats.totalScraped++;
      logger.info(`URLScrapingService: Scraped ${url} - ${extracted.title} (${extracted.content.length} chars)`);

      return result;

    } catch (error) {
      this.stats.failures++;

      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'timeout',
          message: 'Request timed out',
          url,
        };
      }

      logger.error(`URLScrapingService: Failed to scrape ${url}: ${error.message}`);
      return {
        success: false,
        error: 'scrape_failed',
        message: error.message,
        url,
      };
    }
  }

  /**
   * Extract readable content from HTML
   * @private
   */
  extractContent(html, url) {
    const result = {
      title: 'Untitled',
      content: '',
      description: '',
      author: null,
      publishDate: null,
      imageUrl: null,
    };

    try {
      // Extract title (try multiple sources)
      const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
      const twitterTitle = html.match(/<meta[^>]*name="twitter:title"[^>]*content="([^"]+)"/i);
      const htmlTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);

      result.title = (ogTitle?.[1] || twitterTitle?.[1] || htmlTitle?.[1] || 'Untitled')
        .trim()
        .replace(/\s+/g, ' ')
        .substring(0, 200);

      // Extract description
      const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
      const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
      result.description = (ogDesc?.[1] || metaDesc?.[1] || '').trim().substring(0, 500);

      // Extract author
      const authorMeta = html.match(/<meta[^>]*name="author"[^>]*content="([^"]+)"/i);
      const authorProperty = html.match(/<meta[^>]*property="article:author"[^>]*content="([^"]+)"/i);
      result.author = authorMeta?.[1] || authorProperty?.[1] || null;

      // Extract publish date
      const publishedTime = html.match(/<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/i);
      const datePublished = html.match(/<meta[^>]*itemprop="datePublished"[^>]*content="([^"]+)"/i);
      result.publishDate = publishedTime?.[1] || datePublished?.[1] || null;

      // Extract image
      const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
      result.imageUrl = ogImage?.[1] || null;

      // Extract main content
      let content = html;

      // Remove non-content elements
      content = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
        .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

      // Try to extract article content (prioritized)
      const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
      const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      const contentMatch = content.match(/<div[^>]*class="[^"]*(?:content|article|post|entry|story)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

      if (articleMatch) {
        content = articleMatch[1];
      } else if (mainMatch) {
        content = mainMatch[1];
      } else if (contentMatch) {
        content = contentMatch[1];
      }

      // Convert to plain text
      content = this.htmlToText(content);

      // Fallback: If extracted text is too short, try to extract from JS framework data
      // Many modern sites (Vue.js, React, Next.js) embed article content in component props or script data
      if (content.length < this.config.minContentLength) {
        const frameworkContent = this.extractFromFrameworkData(html);
        if (frameworkContent && frameworkContent.length > content.length) {
          content = frameworkContent;
          // Also try to get better title/description from framework data
          const frameworkMeta = this.extractMetaFromFrameworkData(html);
          if (frameworkMeta.title) result.title = frameworkMeta.title;
          if (frameworkMeta.description) result.description = frameworkMeta.description;
          if (frameworkMeta.author) result.author = frameworkMeta.author;
          if (frameworkMeta.publishDate) result.publishDate = frameworkMeta.publishDate;
          logger.info(`URLScrapingService: Extracted content from JS framework data (${content.length} chars)`);
        }
      }

      result.content = content;

    } catch (error) {
      logger.warn(`URLScrapingService: Content extraction error: ${error.message}`);
      result.content = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return result;
  }

  /**
   * Convert HTML to plain text
   * @private
   */
  htmlToText(html) {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&mdash;/gi, '—')
      .replace(/&ndash;/gi, '–')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  /**
   * Decode HTML entities in a string
   * @private
   */
  decodeHtmlEntities(str) {
    return str
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  }

  /**
   * Extract article content from JavaScript framework data (Vue.js, React, Next.js)
   * Many modern news sites embed article data in component props or script tags
   * @private
   */
  extractFromFrameworkData(html) {
    try {
      // 1. Vue.js: <article-component :article="{...}"> or similar :data props
      const vueArticleMatch = html.match(/<[a-z-]+(?:-component)?\s[^>]*:article="([^"]*)"/i);
      if (vueArticleMatch) {
        const decoded = this.decodeHtmlEntities(vueArticleMatch[1]);
        try {
          const data = JSON.parse(decoded);
          const body = data.body || data.body_with_inline || data.content || data.articleBody || '';
          const bodyHtml = typeof body === 'object' ? (body.value || body.processed || '') : body;
          if (bodyHtml) {
            const text = this.htmlToText(bodyHtml);
            if (text.length >= this.config.minContentLength) {
              // Prepend lead/summary if available
              const lead = data.field_article_lead || data.lead || data.summary || '';
              return lead ? `${lead}\n\n${text}` : text;
            }
          }
        } catch (e) { /* JSON parse failed, try next */ }
      }

      // 2. Next.js: <script id="__NEXT_DATA__">{...}</script>
      const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        try {
          const data = JSON.parse(nextDataMatch[1]);
          // Navigate common Next.js structures
          const pageProps = data?.props?.pageProps;
          const article = pageProps?.article || pageProps?.post || pageProps?.data?.article || pageProps;
          const body = article?.body || article?.content || article?.articleBody || '';
          const bodyText = typeof body === 'object' ? (body.value || body.processed || JSON.stringify(body)) : body;
          if (bodyText) {
            const text = this.htmlToText(bodyText);
            if (text.length >= this.config.minContentLength) return text;
          }
        } catch (e) { /* parse failed */ }
      }

      // 3. Nuxt.js: window.__NUXT__={...} or <script>window.__NUXT__=...</script>
      const nuxtMatch = html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i);
      if (nuxtMatch) {
        try {
          // Nuxt data can be complex, try to find article body
          const bodyMatch = nuxtMatch[1].match(/"(?:body|articleBody|content)"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (bodyMatch) {
            const text = this.htmlToText(JSON.parse(`"${bodyMatch[1]}"`));
            if (text.length >= this.config.minContentLength) return text;
          }
        } catch (e) { /* parse failed */ }
      }

      // 4. Generic: data-article="{...}" or data-content="{...}" attributes
      const dataAttrMatch = html.match(/data-(?:article|content|page-data)="([^"]*)"/i);
      if (dataAttrMatch) {
        const decoded = this.decodeHtmlEntities(dataAttrMatch[1]);
        try {
          const data = JSON.parse(decoded);
          const body = data.body || data.content || data.articleBody || '';
          const bodyText = typeof body === 'object' ? (body.value || body.processed || '') : body;
          if (bodyText) {
            const text = this.htmlToText(bodyText);
            if (text.length >= this.config.minContentLength) return text;
          }
        } catch (e) { /* parse failed */ }
      }

      // 5. JSON-LD with articleBody
      const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
      if (jsonLdMatches) {
        for (const jsonLdTag of jsonLdMatches) {
          const jsonContent = jsonLdTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
          try {
            const data = JSON.parse(jsonContent);
            const articleBody = data.articleBody || data.text;
            if (articleBody && articleBody.length >= this.config.minContentLength) {
              return this.htmlToText(articleBody);
            }
          } catch (e) { /* parse failed */ }
        }
      }

    } catch (error) {
      logger.debug(`URLScrapingService: Framework data extraction error: ${error.message}`);
    }

    return null;
  }

  /**
   * Extract metadata from JavaScript framework data
   * @private
   */
  extractMetaFromFrameworkData(html) {
    const meta = { title: null, description: null, author: null, publishDate: null };

    try {
      // Vue.js article component
      const vueMatch = html.match(/<[a-z-]+(?:-component)?\s[^>]*:article="([^"]*)"/i);
      if (vueMatch) {
        const decoded = this.decodeHtmlEntities(vueMatch[1]);
        try {
          const data = JSON.parse(decoded);
          meta.title = data.title || null;
          meta.description = data.og_description || data.field_article_lead || data.description || null;
          meta.author = data.field_article_author?.name || data.author || null;
          if (data.created) {
            meta.publishDate = new Date(data.created * 1000).toISOString();
          }
        } catch (e) { /* parse failed */ }
      }
    } catch (error) { /* ignore */ }

    return meta;
  }

  /**
   * Get source reliability rating
   * @private
   */
  getSourceReliability(domain) {
    // Check Malaysian sources first
    if (MALAYSIAN_NEWS_SOURCES[domain]) {
      return MALAYSIAN_NEWS_SOURCES[domain];
    }

    // Check ContentProcessor's known sources
    if (SOURCE_RELIABILITY[domain]) {
      return SOURCE_RELIABILITY[domain];
    }

    // Unknown source
    return { score: 0.50, category: 'unknown', name: domain };
  }

  /**
   * Get from cache
   * @private
   */
  getFromCache(url) {
    const cached = this.cache.get(url);
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.config.cacheTTL) {
      this.cache.delete(url);
      return null;
    }

    return cached.data;
  }

  /**
   * Add to cache
   * @private
   */
  addToCache(url, data) {
    // Clean old entries if cache is full
    if (this.cache.size >= this.config.maxCacheSize) {
      const cutoff = Date.now() - this.config.cacheTTL;
      for (const [key, value] of this.cache) {
        if (value.timestamp < cutoff) {
          this.cache.delete(key);
        }
      }

      // If still full, remove oldest entries
      if (this.cache.size >= this.config.maxCacheSize) {
        const entries = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toDelete = entries.slice(0, Math.floor(this.config.maxCacheSize * 0.2));
        toDelete.forEach(([key]) => this.cache.delete(key));
      }
    }

    this.cache.set(url, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Process a message and auto-scrape URLs if detected
   * @param {Object} message - Message object
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Processing result with scraped content
   */
  async processMessage(message, context = {}) {
    const { content, from } = message;
    const { userId } = context;

    // Detect if URL-primary
    const detection = this.detectUrlPrimaryMessage(content);

    if (!detection.isUrlPrimary || detection.urls.length === 0) {
      return {
        processed: false,
        reason: 'not_url_primary',
        detection,
      };
    }

    logger.info(`URLScrapingService: Detected URL-primary message with ${detection.urls.length} URL(s)`);

    // Scrape the primary URL
    const scrapeResult = await this.scrape(detection.primaryUrl);

    if (!scrapeResult.success) {
      return {
        processed: false,
        reason: 'scrape_failed',
        error: scrapeResult.error,
        detection,
      };
    }

    // Build enriched message
    const enrichedMessage = {
      ...message,
      // Add scraped content
      scrapedContent: scrapeResult.content,
      scrapedTitle: scrapeResult.title,
      scrapedDescription: scrapeResult.description,
      // Combine original with scraped for better context
      enrichedContent: this.buildEnrichedContent(content, scrapeResult),
    };

    return {
      processed: true,
      detection,
      scrapeResult,
      enrichedMessage,
      originalMessage: message,
    };
  }

  /**
   * Build enriched content combining original message and scraped content
   * @param {string} originalContent - Original message content
   * @param {Object} scrapeResult - Result from scrape() method
   * @returns {string} Enriched content with full article text
   */
  buildEnrichedContent(originalContent, scrapeResult) {
    const parts = [];

    // Add original message context if any
    const nonUrlText = originalContent.replace(URL_PATTERNS.URL, '').trim();
    if (nonUrlText) {
      parts.push(`Context: ${nonUrlText}`);
    }

    // Add source info
    parts.push(`Source: ${scrapeResult.title}`);
    parts.push(`From: ${scrapeResult.domain}`);

    if (scrapeResult.author) {
      parts.push(`Author: ${scrapeResult.author}`);
    }

    if (scrapeResult.publishDate) {
      parts.push(`Published: ${scrapeResult.publishDate}`);
    }

    // Add reliability info
    parts.push(`Reliability: ${scrapeResult.reliability.name} (${(scrapeResult.reliability.score * 100).toFixed(0)}%)`);

    // Add description
    if (scrapeResult.description) {
      parts.push(`\nSummary: ${scrapeResult.description}`);
    }

    // Add full content
    parts.push(`\n--- Full Article ---\n${scrapeResult.content}`);

    // Add URL reference
    parts.push(`\nSource URL: ${scrapeResult.url}`);

    return parts.join('\n');
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      cacheSizeMax: this.config.maxCacheSize,
      rateLimitDomains: this.rateLimits.size,
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('URLScrapingService: Cache cleared');
  }

  /**
   * Reset rate limits
   */
  resetRateLimits() {
    this.rateLimits.clear();
    logger.info('URLScrapingService: Rate limits reset');
  }
}

// Singleton instance
let urlScrapingServiceInstance = null;

/**
 * Get the URLScrapingService singleton
 * @param {Object} options - Configuration options
 * @returns {URLScrapingService}
 */
function getURLScrapingService(options = {}) {
  if (!urlScrapingServiceInstance) {
    urlScrapingServiceInstance = new URLScrapingService(options);
  }
  return urlScrapingServiceInstance;
}

module.exports = {
  URLScrapingService,
  getURLScrapingService,
  URL_PATTERNS,
  MALAYSIAN_NEWS_SOURCES,
};
