/**
 * Content Processor Service
 *
 * Processes content before RAG ingestion with:
 * - Anti-hallucination safeguards (extract facts only, never add)
 * - Source attribution and author tracking
 * - Automatic source reliability rating
 * - Translation to English if needed
 * - Metadata enrichment
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');

// Lazy load SuperBrain to avoid circular dependencies
let _superBrain = null;
function getSuperBrain() {
  if (!_superBrain) {
    try {
      const { getSuperBrainRouter } = require('../ai/SuperBrainRouter.cjs');
      _superBrain = getSuperBrainRouter();
    } catch (error) {
      logger.warn('SuperBrainRouter not available for ContentProcessor');
    }
  }
  return _superBrain;
}

// Lazy load fetch for URL content retrieval
let _fetch = null;
async function getFetch() {
  if (!_fetch) {
    _fetch = (await import('node-fetch')).default;
  }
  return _fetch;
}

/**
 * Known source reliability ratings
 * Score: 0.0 (unreliable) to 1.0 (highly reliable)
 */
const SOURCE_RELIABILITY = {
  // Major news agencies (highly reliable)
  'reuters.com': { score: 0.95, category: 'news_agency', name: 'Reuters' },
  'apnews.com': { score: 0.95, category: 'news_agency', name: 'Associated Press' },
  'afp.com': { score: 0.95, category: 'news_agency', name: 'AFP' },
  'bloomberg.com': { score: 0.92, category: 'financial_news', name: 'Bloomberg' },

  // Major newspapers (reliable)
  'nytimes.com': { score: 0.88, category: 'newspaper', name: 'New York Times' },
  'washingtonpost.com': { score: 0.88, category: 'newspaper', name: 'Washington Post' },
  'theguardian.com': { score: 0.85, category: 'newspaper', name: 'The Guardian' },
  'bbc.com': { score: 0.90, category: 'broadcaster', name: 'BBC' },
  'bbc.co.uk': { score: 0.90, category: 'broadcaster', name: 'BBC' },
  'cnn.com': { score: 0.82, category: 'broadcaster', name: 'CNN' },

  // Malaysian news (local context)
  'thestar.com.my': { score: 0.80, category: 'local_newspaper', name: 'The Star' },
  'nst.com.my': { score: 0.78, category: 'local_newspaper', name: 'New Straits Times' },
  'malaymail.com': { score: 0.75, category: 'local_newspaper', name: 'Malay Mail' },
  'bernama.com': { score: 0.85, category: 'news_agency', name: 'Bernama' },
  'hmetro.com.my': { score: 0.70, category: 'tabloid', name: 'Harian Metro' },
  'beritaharian.sg': { score: 0.75, category: 'local_newspaper', name: 'Berita Harian' },
  'sinarharian.com.my': { score: 0.72, category: 'local_newspaper', name: 'Sinar Harian' },
  'utusan.com.my': { score: 0.72, category: 'local_newspaper', name: 'Utusan Malaysia' },

  // Financial sources
  'tradingview.com': { score: 0.82, category: 'financial', name: 'TradingView' },
  'investing.com': { score: 0.80, category: 'financial', name: 'Investing.com' },
  'forexfactory.com': { score: 0.75, category: 'financial', name: 'Forex Factory' },
  'fxstreet.com': { score: 0.78, category: 'financial', name: 'FXStreet' },

  // Tech sources
  'techcrunch.com': { score: 0.80, category: 'tech_news', name: 'TechCrunch' },
  'theverge.com': { score: 0.78, category: 'tech_news', name: 'The Verge' },
  'arstechnica.com': { score: 0.82, category: 'tech_news', name: 'Ars Technica' },

  // Government sources (high reliability for official info)
  'gov.my': { score: 0.90, category: 'government', name: 'Malaysian Government' },
  'treasury.gov': { score: 0.92, category: 'government', name: 'US Treasury' },
  'federalreserve.gov': { score: 0.95, category: 'government', name: 'Federal Reserve' },

  // Social media (lower reliability, needs verification)
  'twitter.com': { score: 0.40, category: 'social_media', name: 'Twitter/X' },
  'x.com': { score: 0.40, category: 'social_media', name: 'Twitter/X' },
  'facebook.com': { score: 0.35, category: 'social_media', name: 'Facebook' },
  'reddit.com': { score: 0.45, category: 'social_media', name: 'Reddit' },
  'tiktok.com': { score: 0.30, category: 'social_media', name: 'TikTok' },

  // Email providers (moderate reliability)
  'gmail.com': { score: 0.60, category: 'email_provider', name: 'Gmail' },
  'outlook.com': { score: 0.60, category: 'email_provider', name: 'Outlook' },
  'hotmail.com': { score: 0.55, category: 'email_provider', name: 'Hotmail' },
  'yahoo.com': { score: 0.55, category: 'email_provider', name: 'Yahoo Mail' },
  'protonmail.com': { score: 0.65, category: 'email_provider', name: 'ProtonMail' },
  'icloud.com': { score: 0.60, category: 'email_provider', name: 'iCloud' },

  // Enterprise email domains (high reliability)
  'microsoft.com': { score: 0.85, category: 'enterprise', name: 'Microsoft' },
  'google.com': { score: 0.85, category: 'enterprise', name: 'Google' },
  'amazon.com': { score: 0.85, category: 'enterprise', name: 'Amazon' },
  'apple.com': { score: 0.85, category: 'enterprise', name: 'Apple' },

  // Newsletter/Marketing platforms
  'substack.com': { score: 0.65, category: 'newsletter', name: 'Substack' },
  'mailchimp.com': { score: 0.50, category: 'newsletter', name: 'Mailchimp' },
  'sendgrid.net': { score: 0.50, category: 'newsletter', name: 'SendGrid' },
  'constantcontact.com': { score: 0.50, category: 'newsletter', name: 'Constant Contact' },

  // Default for unknown sources
  '_unknown': { score: 0.50, category: 'unknown', name: 'Unknown Source' },
};

/**
 * WhatsApp channel/newsletter reliability (based on sender patterns)
 */
const WHATSAPP_SOURCE_PATTERNS = {
  // Official channels tend to have specific patterns
  'newsletter': { baseScore: 0.60, category: 'whatsapp_newsletter' },
  'broadcast': { baseScore: 0.55, category: 'whatsapp_broadcast' },
  'channel': { baseScore: 0.58, category: 'whatsapp_channel' },
};

class ContentProcessor {
  constructor(options = {}) {
    this.config = {
      defaultLanguage: options.defaultLanguage || 'en',
      maxContentLength: options.maxContentLength || 10000,
      minReliabilityScore: options.minReliabilityScore || 0.30,
      enableTranslation: options.enableTranslation !== false,
      // URL fetching settings (only when library matches)
      enableUrlFetching: options.enableUrlFetching !== false,
      urlFetchTimeout: options.urlFetchTimeout || 10000, // 10 seconds
      maxUrlContentLength: options.maxUrlContentLength || 50000, // 50KB
      fetchOnlyForHighMatch: options.fetchOnlyForHighMatch !== false, // Only fetch if match score > 0.7
      minMatchScoreForFetch: options.minMatchScoreForFetch || 0.70,
      ...options,
    };

    // Track source reliability history
    this.sourceHistory = new Map();

    // URL fetch cache to avoid re-fetching same URLs
    this.urlCache = new Map();
    this.urlCacheTTL = 3600000; // 1 hour
  }

  /**
   * Process content for RAG ingestion
   * @param {Object} message - Incoming message
   * @param {Object} matchResult - Library match result
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Processed content with metadata
   */
  async process(message, matchResult, context = {}) {
    const startTime = Date.now();
    const { content, from, sender } = message;

    // 1. Extract source information
    const sourceInfo = this.extractSourceInfo(message);

    // 2. Calculate reliability rating
    const reliability = this.calculateReliability(sourceInfo, context);

    // 3. Skip if below minimum reliability threshold
    if (reliability.score < this.config.minReliabilityScore) {
      logger.info(`ContentProcessor: Skipping low-reliability source (${reliability.score.toFixed(2)})`);
      return {
        processed: false,
        reason: 'low_reliability',
        reliability,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // 4. Extract URLs and clean content
    const urls = this.extractUrls(content);
    let cleanedContent = this.cleanContent(content);

    // 5. Fetch URL content if enabled and match score is high enough
    let fetchedContent = null;
    if (
      this.config.enableUrlFetching &&
      urls.length > 0 &&
      matchResult.score >= this.config.minMatchScoreForFetch
    ) {
      logger.info(`ContentProcessor: Fetching URL for high-match content (score: ${matchResult.score.toFixed(2)})`);
      fetchedContent = await this.fetchUrlContent(urls[0]);

      if (fetchedContent) {
        // Combine original message with fetched content for richer RAG
        cleanedContent = `${cleanedContent}\n\n--- Full Article ---\n${fetchedContent.content}`;
        logger.info(`ContentProcessor: Fetched ${fetchedContent.contentLength} chars from ${fetchedContent.url}`);
      }
    } else if (urls.length > 0 && matchResult.score < this.config.minMatchScoreForFetch) {
      logger.debug(`ContentProcessor: Skipping URL fetch (match score ${matchResult.score.toFixed(2)} < ${this.config.minMatchScoreForFetch})`);
    }

    // 6. Detect language
    const detectedLanguage = this.detectLanguage(cleanedContent);

    // 7. Summarize using AI with anti-hallucination rules
    const processed = await this.summarizeForRAG(cleanedContent, {
      libraryContext: matchResult.library.description,
      sourceUrl: urls[0],
      originalLanguage: detectedLanguage,
      author: sourceInfo.author,
      sourceName: sourceInfo.sourceName,
      userId: context.userId, // Pass userId for AI provider resolution
    });

    // 8. Build comprehensive metadata
    const metadata = {
      // Source tracking
      source_type: sourceInfo.type,
      source_url: urls[0] || null,
      source_name: sourceInfo.sourceName,
      source_domain: sourceInfo.domain,
      source_category: reliability.category,

      // Author tracking
      author_id: sourceInfo.authorId,
      author_name: sourceInfo.authorName,
      author_type: sourceInfo.authorType,

      // Reliability info
      reliability_score: reliability.score,
      reliability_factors: reliability.factors,
      reliability_warnings: reliability.warnings,

      // Content info
      original_language: detectedLanguage,
      original_content_preview: content.substring(0, 300),
      content_length: content.length,
      urls_found: urls,

      // URL fetching info
      url_fetched: !!fetchedContent,
      fetched_content_length: fetchedContent?.contentLength || 0,
      fetched_title: fetchedContent?.title || null,
      fetch_status: fetchedContent?.status || 'not_attempted',

      // Processing info
      ingested_at: new Date().toISOString(),
      match_score: matchResult.score,
      library_id: matchResult.library.id,
      library_name: matchResult.library.name,
      processing_mode: fetchedContent ? 'summarize_with_url_fetch' : 'summarize_with_attribution',
      processor_version: '1.1',
    };

    // 9. Update source history for future reliability calculations
    this.updateSourceHistory(sourceInfo.domain, reliability.score);

    logger.info(`ContentProcessor: Processed content from "${sourceInfo.sourceName}" (reliability: ${reliability.score.toFixed(2)})`);

    return {
      processed: true,
      title: processed.title,
      content: processed.summary,
      keyFacts: processed.keyFacts,
      entities: processed.entities,
      metadata,
      reliability,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Extract source information from message
   * @private
   */
  extractSourceInfo(message) {
    const { content, from, sender, platform } = message;

    const result = {
      type: 'unknown',
      domain: null,
      sourceName: 'Unknown',
      authorId: sender?.id || from,
      authorName: sender?.name || 'Unknown',
      authorType: 'unknown',
    };

    // Extract URLs and analyze domain
    const urls = this.extractUrls(content);
    if (urls.length > 0) {
      try {
        const url = new URL(urls[0]);
        result.domain = url.hostname.replace(/^www\./, '');
        result.type = 'web_link';

        // Look up source name from known sources
        const knownSource = SOURCE_RELIABILITY[result.domain];
        if (knownSource) {
          result.sourceName = knownSource.name;
        } else {
          result.sourceName = result.domain;
        }
      } catch {
        // Invalid URL
      }
    }

    // Analyze WhatsApp source patterns
    if (platform === 'whatsapp' || from?.includes('@')) {
      if (from?.includes('@newsletter')) {
        result.type = 'whatsapp_newsletter';
        result.authorType = 'newsletter';
        // Extract newsletter ID for tracking
        result.authorId = from.replace('@newsletter', '');
      } else if (from?.includes('@broadcast')) {
        result.type = 'whatsapp_broadcast';
        result.authorType = 'broadcast';
      } else if (from?.includes('@c.us')) {
        result.type = 'whatsapp_direct';
        result.authorType = 'individual';
      } else if (from?.includes('@g.us')) {
        result.type = 'whatsapp_group';
        result.authorType = 'group';
      }
    }

    // Use sender name if available
    if (sender?.name && sender.name !== 'Unknown') {
      result.authorName = sender.name;
    }

    return result;
  }

  /**
   * Calculate reliability score for source
   * @private
   */
  calculateReliability(sourceInfo, context = {}) {
    const factors = [];
    const warnings = [];
    let score = 0.50; // Default neutral score

    // 1. Check known source domains
    if (sourceInfo.domain) {
      const knownSource = SOURCE_RELIABILITY[sourceInfo.domain];
      if (knownSource) {
        score = knownSource.score;
        factors.push({ factor: 'known_source', value: knownSource.name, impact: knownSource.score });
      } else {
        // Unknown domain - moderate reliability
        factors.push({ factor: 'unknown_domain', value: sourceInfo.domain, impact: 0 });
        warnings.push('Unknown source domain - verify information independently');
      }
    }

    // 2. Adjust for WhatsApp source types
    if (sourceInfo.type.startsWith('whatsapp_')) {
      const whatsappPattern = WHATSAPP_SOURCE_PATTERNS[sourceInfo.type.replace('whatsapp_', '')];
      if (whatsappPattern) {
        // WhatsApp sources get base score if no URL
        if (!sourceInfo.domain) {
          score = whatsappPattern.baseScore;
          factors.push({ factor: 'whatsapp_source', value: sourceInfo.type, impact: whatsappPattern.baseScore });
        }
      }
    }

    // 3. Check source history (reputation building)
    const historyScore = this.getSourceHistoryScore(sourceInfo.domain || sourceInfo.authorId);
    if (historyScore !== null) {
      // Blend current score with historical average
      const blendedScore = (score * 0.7) + (historyScore * 0.3);
      if (Math.abs(blendedScore - score) > 0.05) {
        factors.push({ factor: 'history_adjustment', value: historyScore.toFixed(2), impact: blendedScore - score });
        score = blendedScore;
      }
    }

    // 4. Content-based adjustments
    // Multiple URLs might indicate aggregated/forwarded content
    if (context.urlCount > 2) {
      score = Math.max(0.3, score - 0.1);
      factors.push({ factor: 'multiple_urls', value: context.urlCount, impact: -0.1 });
      warnings.push('Multiple URLs detected - may be aggregated content');
    }

    // 5. Social media source penalty
    if (sourceInfo.domain && ['twitter.com', 'x.com', 'facebook.com', 'tiktok.com'].includes(sourceInfo.domain)) {
      warnings.push('Social media source - verify claims independently');
    }

    // 6. Forwarded message detection
    if (context.isForwarded) {
      score = Math.max(0.3, score - 0.15);
      factors.push({ factor: 'forwarded_message', impact: -0.15 });
      warnings.push('Forwarded message - original source may differ');
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(1, score));

    return {
      score,
      category: this.getReliabilityCategory(score),
      factors,
      warnings,
      domain: sourceInfo.domain,
      assessed_at: new Date().toISOString(),
    };
  }

  /**
   * Get reliability category from score
   * @private
   */
  getReliabilityCategory(score) {
    if (score >= 0.85) return 'highly_reliable';
    if (score >= 0.70) return 'reliable';
    if (score >= 0.55) return 'moderately_reliable';
    if (score >= 0.40) return 'questionable';
    return 'unreliable';
  }

  /**
   * Fetch URL content for enrichment (only called when library match is high)
   * @private
   */
  async fetchUrlContent(url) {
    if (!url) return null;

    // Check cache first
    const cached = this.urlCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.urlCacheTTL) {
      logger.debug(`ContentProcessor: Using cached URL content for ${url}`);
      return cached.data;
    }

    try {
      const fetch = await getFetch();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.urlFetchTimeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SwarmAI-RAG-Bot/1.0 (+https://github.com/swarm-ai)',
          'Accept': 'text/html,application/xhtml+xml,text/plain',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn(`ContentProcessor: URL fetch failed for ${url}: ${response.status}`);
        return { status: 'fetch_failed', error: `HTTP ${response.status}` };
      }

      const contentType = response.headers.get('content-type') || '';

      // Only process text content
      if (!contentType.includes('text/') && !contentType.includes('application/json')) {
        logger.debug(`ContentProcessor: Skipping non-text content type: ${contentType}`);
        return { status: 'skipped_non_text', contentType };
      }

      let text = await response.text();

      // Truncate if too long
      if (text.length > this.config.maxUrlContentLength) {
        text = text.substring(0, this.config.maxUrlContentLength);
      }

      // Extract main content from HTML
      const extracted = this.extractMainContent(text, contentType);

      const result = {
        status: 'success',
        url,
        content: extracted.content,
        title: extracted.title,
        contentLength: extracted.content.length,
        fetchedAt: new Date().toISOString(),
      };

      // Cache the result
      this.urlCache.set(url, { data: result, timestamp: Date.now() });

      // Cleanup old cache entries
      if (this.urlCache.size > 100) {
        const cutoff = Date.now() - this.urlCacheTTL;
        for (const [key, value] of this.urlCache) {
          if (value.timestamp < cutoff) {
            this.urlCache.delete(key);
          }
        }
      }

      return result;

    } catch (error) {
      if (error.name === 'AbortError') {
        logger.warn(`ContentProcessor: URL fetch timeout for ${url}`);
        return { status: 'timeout', url };
      }
      logger.warn(`ContentProcessor: URL fetch error for ${url}: ${error.message}`);
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Extract main content from HTML
   * @private
   */
  extractMainContent(html, contentType) {
    let title = 'Untitled';
    let content = html;

    if (contentType.includes('text/html')) {
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      // Remove scripts, styles, and other non-content elements
      content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

      // Try to extract article/main content
      const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
      const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

      if (articleMatch) {
        content = articleMatch[1];
      } else if (mainMatch) {
        content = mainMatch[1];
      }

      // Strip remaining HTML tags
      content = content
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    }

    return { title, content };
  }

  /**
   * Summarize content with anti-hallucination safeguards
   * @private
   */
  async summarizeForRAG(content, context) {
    const superBrain = getSuperBrain();

    if (!superBrain) {
      // Fallback: basic extraction without AI
      return this.basicExtraction(content, context);
    }

    const prompt = `You are a precise information extractor for a knowledge base. Extract and summarize ONLY the facts present in the source content.

CONTEXT:
- Knowledge base topic: ${context.libraryContext || 'General'}
- Source: ${context.sourceName || 'Unknown'}
- Source URL: ${context.sourceUrl || 'Not provided'}
- Original language: ${context.originalLanguage || 'Unknown'}
- Author: ${context.author || 'Unknown'}

STRICT ANTI-HALLUCINATION RULES:
1. Extract ONLY facts explicitly stated in the source - NEVER add information
2. Preserve ALL numbers, dates, names, and statistics EXACTLY as written
3. If content is not in English, translate to English accurately
4. Keep the summary concise but factually complete
5. Include source attribution in the summary
6. If uncertain about any fact, mark it with [unverified]
7. Do NOT interpret, analyze, or add commentary
8. Do NOT make assumptions about missing information
9. If the content is too short or unclear, say so

CONTENT TO PROCESS:
---
${content.substring(0, 5000)}
---

Respond in JSON format:
{
  "title": "Brief descriptive title (max 100 chars)",
  "summary": "Factual summary with source attribution. Example: 'According to [Source], ...'",
  "keyFacts": ["fact1 exactly as stated", "fact2 exactly as stated"],
  "entities": ["person/org/place mentioned"],
  "confidence": 0.0-1.0,
  "warnings": ["any issues with the content"]
}`;

    try {
      const result = await superBrain.process({
        task: 'summarize_for_rag',
        messages: [{ role: 'user', content: prompt }],
        userId: context.userId, // Pass userId for AI provider resolution
        temperature: 0.1, // Very low temperature for factual extraction
        maxTokens: 1500,
        preferFree: true,
      });

      // Parse JSON response
      const jsonMatch = (result.content || result.response || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || 'Untitled',
          summary: parsed.summary || content.substring(0, 1000),
          keyFacts: parsed.keyFacts || [],
          entities: parsed.entities || [],
          confidence: parsed.confidence || 0.5,
          warnings: parsed.warnings || [],
        };
      }
    } catch (error) {
      logger.warn(`ContentProcessor: AI summarization failed: ${error.message}`);
    }

    // Fallback to basic extraction
    return this.basicExtraction(content, context);
  }

  /**
   * Basic content extraction without AI
   * @private
   */
  basicExtraction(content, context) {
    // Extract first sentence as title
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const title = sentences[0]?.trim().substring(0, 100) || 'Untitled';

    // Build summary with attribution
    let summary = content.substring(0, 1000);
    if (context.sourceName && context.sourceName !== 'Unknown') {
      summary = `From ${context.sourceName}: ${summary}`;
    }

    // Extract potential entities (capitalized words)
    const entities = [...new Set(
      content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || []
    )].slice(0, 10);

    return {
      title,
      summary,
      keyFacts: [],
      entities,
      confidence: 0.3,
      warnings: ['Processed without AI - manual review recommended'],
    };
  }

  /**
   * Extract URLs from content
   * @private
   */
  extractUrls(content) {
    if (!content) return [];
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    return content.match(urlPattern) || [];
  }

  /**
   * Clean content for processing
   * @private
   */
  cleanContent(content) {
    if (!content) return '';
    return content
      .replace(/\*+/g, '')           // Remove markdown bold
      .replace(/_+/g, '')            // Remove markdown italic
      .replace(/~+/g, '')            // Remove markdown strikethrough
      .replace(/`+/g, '')            // Remove code markers
      .replace(/\n{3,}/g, '\n\n')    // Normalize line breaks
      .replace(/\s{3,}/g, ' ')       // Normalize spaces
      .trim();
  }

  /**
   * Detect content language
   * @private
   */
  detectLanguage(content) {
    if (!content) return 'unknown';

    const words = content.toLowerCase().split(/\s+/);

    // Malay indicators
    const malayKeywords = ['yang', 'dan', 'di', 'untuk', 'dengan', 'ini', 'itu', 'ke', 'dari', 'akan', 'telah', 'pada', 'tidak', 'juga', 'atau', 'oleh', 'satu', 'ada', 'mereka', 'kami', 'kita'];
    const malayCount = words.filter(w => malayKeywords.includes(w)).length;

    // Indonesian indicators (similar to Malay but some differences)
    const indonesianKeywords = ['adalah', 'bahwa', 'tersebut', 'dapat', 'jika', 'maka', 'sehingga', 'sudah', 'belum', 'sedang', 'hanya'];
    const indonesianCount = words.filter(w => indonesianKeywords.includes(w)).length;

    // Chinese indicators (simplified character ranges)
    const chinesePattern = /[\u4e00-\u9fff]/g;
    const chineseCount = (content.match(chinesePattern) || []).length;

    // Arabic indicators
    const arabicPattern = /[\u0600-\u06ff]/g;
    const arabicCount = (content.match(arabicPattern) || []).length;

    // Determine language
    const wordCount = words.length;
    const malayRatio = malayCount / wordCount;
    const indonesianRatio = indonesianCount / wordCount;

    if (chineseCount > 10) return 'zh';
    if (arabicCount > 10) return 'ar';
    if (malayRatio > 0.1) return indonesianRatio > malayRatio ? 'id' : 'ms';
    if (indonesianRatio > 0.1) return 'id';

    return 'en'; // Default to English
  }

  /**
   * Get historical reliability score for a source
   * @private
   */
  getSourceHistoryScore(sourceId) {
    if (!sourceId) return null;
    const history = this.sourceHistory.get(sourceId);
    if (!history || history.scores.length === 0) return null;

    // Calculate weighted average (recent scores weighted more)
    const weights = history.scores.map((_, i) => Math.pow(0.9, history.scores.length - 1 - i));
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const weightedSum = history.scores.reduce((sum, score, i) => sum + score * weights[i], 0);

    return weightedSum / weightSum;
  }

  /**
   * Update source history with new reliability score
   * @private
   */
  updateSourceHistory(sourceId, score) {
    if (!sourceId) return;

    let history = this.sourceHistory.get(sourceId);
    if (!history) {
      history = { scores: [], lastUpdated: null };
    }

    history.scores.push(score);
    // Keep only last 20 scores
    if (history.scores.length > 20) {
      history.scores = history.scores.slice(-20);
    }
    history.lastUpdated = new Date().toISOString();

    this.sourceHistory.set(sourceId, history);
  }

  /**
   * Get known sources for UI
   */
  getKnownSources() {
    return Object.entries(SOURCE_RELIABILITY).map(([domain, info]) => ({
      domain,
      name: info.name,
      score: info.score,
      category: info.category,
    }));
  }

  /**
   * Add or update known source
   * @param {string} domain - Domain name
   * @param {Object} info - Source info {score, category, name}
   */
  addKnownSource(domain, info) {
    SOURCE_RELIABILITY[domain] = info;
    logger.info(`ContentProcessor: Added known source: ${domain} (${info.name})`);
  }

  /**
   * Get configuration
   */
  getConfig() {
    return { ...this.config };
  }
}

// Singleton instance
let contentProcessorInstance = null;

/**
 * Get the ContentProcessor singleton
 * @param {Object} options - Configuration options
 * @returns {ContentProcessor}
 */
function getContentProcessor(options = {}) {
  if (!contentProcessorInstance) {
    contentProcessorInstance = new ContentProcessor(options);
  }
  return contentProcessorInstance;
}

module.exports = {
  ContentProcessor,
  getContentProcessor,
  SOURCE_RELIABILITY,
};
