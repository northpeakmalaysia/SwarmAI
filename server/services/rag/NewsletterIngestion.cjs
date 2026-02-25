/**
 * Newsletter Ingestion Service
 *
 * Orchestrates the ingestion of newsletter/broadcast content into RAG:
 * 1. MessageClassifier - Determines if message should be ingested
 * 2. LibraryMatcher - Finds the best matching library
 * 3. ContentProcessor - Processes content with reliability rating
 * 4. RetrievalService - Stores in vector database
 *
 * Flow:
 * Message → Classify → Match Library → Process → Ingest → Index
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getLibraryMatcher } = require('./LibraryMatcher.cjs');
const { getContentProcessor } = require('./ContentProcessor.cjs');
const { getRetrievalService } = require('./RetrievalService.cjs');
const { getURLScrapingService } = require('./URLScrapingService.cjs');

/**
 * Ingestion result types
 */
const INGESTION_RESULT = {
  SUCCESS: 'success',
  SKIPPED_LOW_RELIABILITY: 'skipped_low_reliability',
  SKIPPED_NO_LIBRARY_MATCH: 'skipped_no_library_match',
  SKIPPED_NO_LIBRARIES: 'skipped_no_libraries',
  SKIPPED_DUPLICATE: 'skipped_duplicate',
  FAILED: 'failed',
};

class NewsletterIngestion {
  constructor(options = {}) {
    this.libraryMatcher = getLibraryMatcher();
    this.contentProcessor = getContentProcessor();
    this.retrievalService = getRetrievalService();
    this.urlScrapingService = getURLScrapingService();

    this.config = {
      minReliabilityScore: options.minReliabilityScore || 0.35,
      minLibraryMatchScore: options.minLibraryMatchScore || 0.60,
      enableDuplicateDetection: options.enableDuplicateDetection !== false,
      duplicateWindowHours: options.duplicateWindowHours || 24,
      maxContentLength: options.maxContentLength || 50000,
      // URL auto-scraping settings
      enableAutoUrlScraping: options.enableAutoUrlScraping !== false,
      minMatchScoreForUrlPrimary: options.minMatchScoreForUrlPrimary || 0.45, // Lower threshold for URL-primary
      ...options,
    };

    // Track recent ingestions for duplicate detection
    this.recentIngestions = new Map();

    // Statistics
    this.stats = {
      totalProcessed: 0,
      successfulIngestions: 0,
      skippedLowReliability: 0,
      skippedNoMatch: 0,
      skippedDuplicate: 0,
      failed: 0,
    };
  }

  /**
   * Process and ingest a message into the appropriate RAG library
   * @param {Object} message - Unified message object
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Ingestion result
   */
  async ingest(message, context = {}) {
    const startTime = Date.now();
    const { userId } = context;

    this.stats.totalProcessed++;

    try {
      // Validate input
      if (!message?.content || !userId) {
        return this.buildResult(INGESTION_RESULT.FAILED, {
          error: 'Missing required fields: content or userId',
          processingTimeMs: Date.now() - startTime,
        });
      }

      // Check content length
      if (message.content.length > this.config.maxContentLength) {
        logger.warn(`NewsletterIngestion: Content too long (${message.content.length} chars)`);
        message.content = message.content.substring(0, this.config.maxContentLength);
      }

      // 1. Detect source type
      const source = this.detectSource(message.from);
      logger.debug(`NewsletterIngestion: Source detected as "${source}"`);

      // 1.5. Check for URL-primary message and auto-scrape
      let urlScrapeResult = null;
      let enrichedMessage = message;

      if (this.config.enableAutoUrlScraping) {
        const urlDetection = this.urlScrapingService.detectUrlPrimaryMessage(message.content);

        if (urlDetection.isUrlPrimary && urlDetection.primaryUrl) {
          logger.info(`NewsletterIngestion: URL-primary message detected, auto-scraping: ${urlDetection.primaryUrl}`);

          urlScrapeResult = await this.urlScrapingService.scrape(urlDetection.primaryUrl);

          if (urlScrapeResult.success) {
            // Create enriched message with scraped content
            enrichedMessage = {
              ...message,
              content: this.buildEnrichedContent(message.content, urlScrapeResult),
              originalContent: message.content,
              scrapedUrl: urlScrapeResult.url,
              scrapedTitle: urlScrapeResult.title,
            };

            logger.info(`NewsletterIngestion: URL scraped successfully - "${urlScrapeResult.title}" (${urlScrapeResult.contentLength} chars)`);
          } else {
            logger.warn(`NewsletterIngestion: URL scraping failed - ${urlScrapeResult.error}: ${urlScrapeResult.message}`);
          }
        }
      }

      // 2. Check for duplicates
      if (this.config.enableDuplicateDetection) {
        const duplicate = this.checkDuplicate(message.content, userId);
        if (duplicate) {
          this.stats.skippedDuplicate++;
          return this.buildResult(INGESTION_RESULT.SKIPPED_DUPLICATE, {
            reason: 'Content appears to be duplicate',
            duplicateOf: duplicate.documentId,
            processingTimeMs: Date.now() - startTime,
          });
        }
      }

      // 3. Match to best library (use enriched content for better matching)
      // Use lower threshold for URL-primary messages since we have more content
      const minScore = urlScrapeResult?.success
        ? this.config.minMatchScoreForUrlPrimary
        : this.config.minLibraryMatchScore;

      const matchResult = await this.libraryMatcher.matchLibrary(
        enrichedMessage.content,
        userId,
        {
          source,
          minScore,
        }
      );

      if (!matchResult.matched) {
        this.stats.skippedNoMatch++;
        logger.debug(`NewsletterIngestion: No library match - ${matchResult.reason}`);
        return this.buildResult(INGESTION_RESULT.SKIPPED_NO_LIBRARY_MATCH, {
          reason: matchResult.reason,
          bestScore: matchResult.bestScore,
          threshold: this.config.minLibraryMatchScore,
          processingTimeMs: Date.now() - startTime,
        });
      }

      logger.info(`NewsletterIngestion: Matched library "${matchResult.library.name}" (score: ${matchResult.score.toFixed(2)})`);

      // 4. Process content with reliability analysis
      const processedContent = await this.contentProcessor.process(
        enrichedMessage, // Use enriched message with scraped content
        matchResult,
        {
          userId, // Pass userId for AI provider resolution
          urlCount: this.extractUrls(enrichedMessage.content).length,
          isForwarded: this.isForwardedMessage(message.content),
          urlScraped: !!urlScrapeResult?.success,
          scrapedUrl: urlScrapeResult?.url,
        }
      );

      if (!processedContent.processed) {
        this.stats.skippedLowReliability++;
        logger.info(`NewsletterIngestion: Skipped - ${processedContent.reason}`);
        return this.buildResult(INGESTION_RESULT.SKIPPED_LOW_RELIABILITY, {
          reason: processedContent.reason,
          reliability: processedContent.reliability,
          processingTimeMs: Date.now() - startTime,
        });
      }

      // 5. Ingest into RAG
      const ingestionResult = await this.retrievalService.ingestDocument(
        {
          id: uuidv4(),
          title: processedContent.title,
          content: processedContent.content,
          sourceType: 'newsletter',
          sourceUrl: processedContent.metadata.source_url,
          metadata: {
            ...processedContent.metadata,
            key_facts: processedContent.keyFacts,
            entities: processedContent.entities,
          },
        },
        matchResult.library.id,
        { userId }
      );

      // 6. Track for duplicate detection
      this.trackIngestion(message.content, userId, ingestionResult.documentId);

      // 7. Log to ingestion history
      this.logIngestion({
        userId,
        libraryId: matchResult.library.id,
        documentId: ingestionResult.documentId,
        source,
        reliability: processedContent.reliability,
        matchScore: matchResult.score,
      });

      this.stats.successfulIngestions++;

      logger.info(`NewsletterIngestion: Successfully ingested to "${matchResult.library.name}" - ${processedContent.title}`);

      return this.buildResult(INGESTION_RESULT.SUCCESS, {
        library: {
          id: matchResult.library.id,
          name: matchResult.library.name,
        },
        document: {
          id: ingestionResult.documentId,
          title: processedContent.title,
          chunksCreated: ingestionResult.chunksCreated,
        },
        source: {
          type: processedContent.metadata.source_type,
          name: processedContent.metadata.source_name,
          author: processedContent.metadata.author_name,
        },
        reliability: processedContent.reliability,
        matchScore: matchResult.score,
        alternateLibraries: matchResult.alternates,
        // URL scraping info
        urlScraped: !!urlScrapeResult?.success,
        scrapedUrl: urlScrapeResult?.url || null,
        scrapedTitle: urlScrapeResult?.title || null,
        scrapedContentLength: urlScrapeResult?.contentLength || 0,
        processingTimeMs: Date.now() - startTime,
      });

    } catch (error) {
      this.stats.failed++;
      logger.error(`NewsletterIngestion: Failed - ${error.message}`);
      return this.buildResult(INGESTION_RESULT.FAILED, {
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      });
    }
  }

  /**
   * Batch ingest multiple messages
   * @param {Array} messages - Array of messages
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Batch ingestion result
   */
  async batchIngest(messages, context = {}) {
    const results = {
      total: messages.length,
      successful: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };

    for (const message of messages) {
      const result = await this.ingest(message, context);
      results.details.push(result);

      if (result.result === INGESTION_RESULT.SUCCESS) {
        results.successful++;
      } else if (result.result === INGESTION_RESULT.FAILED) {
        results.failed++;
      } else {
        results.skipped++;
      }
    }

    return results;
  }

  /**
   * Detect source type from sender address
   * @private
   */
  detectSource(from) {
    if (!from) return 'unknown';

    if (from.includes('@newsletter')) return '@newsletter';
    if (from.includes('@broadcast')) return '@broadcast';
    if (from.includes('@channel')) return '@channel';
    if (from.includes('@g.us')) return 'group';
    if (from.includes('@c.us')) return 'direct';

    return 'unknown';
  }

  /**
   * Build enriched content combining original message and scraped content
   * @private
   */
  buildEnrichedContent(originalContent, scrapeResult) {
    const parts = [];

    // Add original message context (caption/text before URL)
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const nonUrlText = originalContent.replace(urlPattern, '').trim();
    if (nonUrlText && nonUrlText.length > 5) {
      parts.push(`User context: ${nonUrlText}`);
    }

    // Add source info
    parts.push(`Source: ${scrapeResult.title}`);
    parts.push(`From: ${scrapeResult.domain} (${scrapeResult.reliability?.name || 'Unknown'})`);

    if (scrapeResult.author) {
      parts.push(`Author: ${scrapeResult.author}`);
    }

    if (scrapeResult.publishDate) {
      parts.push(`Published: ${scrapeResult.publishDate}`);
    }

    // Add description if available
    if (scrapeResult.description) {
      parts.push(`\nSummary: ${scrapeResult.description}`);
    }

    // Add full scraped content
    parts.push(`\n--- Full Article ---\n${scrapeResult.content}`);

    // Add source URL for reference
    parts.push(`\nSource URL: ${scrapeResult.url}`);

    return parts.join('\n');
  }

  /**
   * Check if message content is a forwarded message
   * @private
   */
  isForwardedMessage(content) {
    if (!content) return false;
    const forwardPatterns = [
      /^\[Forwarded\]/i,
      /^Forwarded from/i,
      /^FWD:/i,
      /^↪️/,
    ];
    return forwardPatterns.some(p => p.test(content.trim()));
  }

  /**
   * Extract URLs from content
   * @private
   */
  extractUrls(content) {
    if (!content) return [];
    return content.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/g) || [];
  }

  /**
   * Check for duplicate content
   * @private
   */
  checkDuplicate(content, userId) {
    const contentHash = this.hashContent(content);
    const key = `${userId}:${contentHash}`;

    const existing = this.recentIngestions.get(key);
    if (existing) {
      // Check if within duplicate window
      const hoursAgo = (Date.now() - existing.timestamp) / (1000 * 60 * 60);
      if (hoursAgo < this.config.duplicateWindowHours) {
        return existing;
      }
    }

    return null;
  }

  /**
   * Track ingestion for duplicate detection
   * @private
   */
  trackIngestion(content, userId, documentId) {
    const contentHash = this.hashContent(content);
    const key = `${userId}:${contentHash}`;

    this.recentIngestions.set(key, {
      documentId,
      timestamp: Date.now(),
    });

    // Clean old entries
    const cutoff = Date.now() - (this.config.duplicateWindowHours * 60 * 60 * 1000);
    for (const [k, v] of this.recentIngestions) {
      if (v.timestamp < cutoff) {
        this.recentIngestions.delete(k);
      }
    }
  }

  /**
   * Simple content hash for duplicate detection
   * @private
   */
  hashContent(content) {
    // Simple hash: first 100 chars + length + word count
    const preview = content.substring(0, 100).toLowerCase().replace(/\s+/g, '');
    const wordCount = content.split(/\s+/).length;
    return `${preview.length}_${wordCount}_${preview.substring(0, 20)}`;
  }

  /**
   * Log ingestion to database
   * @private
   */
  logIngestion(data) {
    try {
      const db = getDatabase();

      // Check if ingestion_log table exists, create if not
      db.exec(`
        CREATE TABLE IF NOT EXISTS ingestion_log (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          library_id TEXT NOT NULL,
          document_id TEXT NOT NULL,
          source TEXT,
          reliability_score REAL,
          match_score REAL,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.prepare(`
        INSERT INTO ingestion_log (id, user_id, library_id, document_id, source, reliability_score, match_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        data.userId,
        data.libraryId,
        data.documentId,
        data.source,
        data.reliability?.score,
        data.matchScore
      );
    } catch (error) {
      logger.warn(`Failed to log ingestion: ${error.message}`);
    }
  }

  /**
   * Build standardized result object
   * @private
   */
  buildResult(result, data = {}) {
    return {
      result,
      success: result === INGESTION_RESULT.SUCCESS,
      ...data,
    };
  }

  /**
   * Get ingestion statistics
   */
  getStats() {
    return {
      ...this.stats,
      duplicateCacheSize: this.recentIngestions.size,
      successRate: this.stats.totalProcessed > 0
        ? (this.stats.successfulIngestions / this.stats.totalProcessed * 100).toFixed(1) + '%'
        : '0%',
    };
  }

  /**
   * Get recent ingestion history from database
   * @param {string} userId - User ID
   * @param {number} limit - Max records to return
   */
  getIngestionHistory(userId, limit = 50) {
    try {
      const db = getDatabase();
      return db.prepare(`
        SELECT
          il.*,
          kl.name as library_name,
          kd.title as document_title
        FROM ingestion_log il
        LEFT JOIN knowledge_libraries kl ON il.library_id = kl.id
        LEFT JOIN knowledge_documents kd ON il.document_id = kd.id
        WHERE il.user_id = ?
        ORDER BY il.created_at DESC
        LIMIT ?
      `).all(userId, limit);
    } catch (error) {
      logger.warn(`Failed to get ingestion history: ${error.message}`);
      return [];
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalProcessed: 0,
      successfulIngestions: 0,
      skippedLowReliability: 0,
      skippedNoMatch: 0,
      skippedDuplicate: 0,
      failed: 0,
    };
  }

  /**
   * Clear duplicate detection cache
   */
  clearDuplicateCache() {
    this.recentIngestions.clear();
  }
}

// Singleton instance
let newsletterIngestionInstance = null;

/**
 * Get the NewsletterIngestion singleton
 * @param {Object} options - Configuration options
 * @returns {NewsletterIngestion}
 */
function getNewsletterIngestion(options = {}) {
  if (!newsletterIngestionInstance) {
    newsletterIngestionInstance = new NewsletterIngestion(options);
  }
  return newsletterIngestionInstance;
}

module.exports = {
  NewsletterIngestion,
  getNewsletterIngestion,
  INGESTION_RESULT,
};
