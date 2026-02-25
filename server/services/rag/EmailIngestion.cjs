/**
 * Email Ingestion Service
 *
 * Processes and ingests email content into RAG knowledge libraries.
 * Similar to NewsletterIngestion but specialized for email:
 * - Extracts email metadata (subject, from, thread)
 * - Processes email attachments (PDF, DOCX, TXT)
 * - Applies email-specific reliability scoring
 * - Supports auto-ingestion for connected email accounts
 *
 * Flow:
 * Email → Extract Metadata → Match Library → Process Attachments → Ingest → Index
 */

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getLibraryMatcher } = require('./LibraryMatcher.cjs');
const { getContentProcessor } = require('./ContentProcessor.cjs');
const { getRetrievalService } = require('./RetrievalService.cjs');

/**
 * Ingestion result types
 */
const INGESTION_RESULT = {
  SUCCESS: 'success',
  SKIPPED_LOW_RELIABILITY: 'skipped_low_reliability',
  SKIPPED_NO_LIBRARY_MATCH: 'skipped_no_library_match',
  SKIPPED_NO_LIBRARIES: 'skipped_no_libraries',
  SKIPPED_DUPLICATE: 'skipped_duplicate',
  SKIPPED_SPAM: 'skipped_spam',
  FAILED: 'failed',
};

/**
 * Email domain reliability scores
 */
const EMAIL_DOMAIN_RELIABILITY = {
  // Enterprise/Corporate (high trust)
  'microsoft.com': { score: 0.85, category: 'enterprise', name: 'Microsoft' },
  'google.com': { score: 0.85, category: 'enterprise', name: 'Google' },
  'amazon.com': { score: 0.85, category: 'enterprise', name: 'Amazon' },
  'apple.com': { score: 0.85, category: 'enterprise', name: 'Apple' },

  // Email providers (moderate trust)
  'gmail.com': { score: 0.60, category: 'email_provider', name: 'Gmail' },
  'outlook.com': { score: 0.60, category: 'email_provider', name: 'Outlook' },
  'hotmail.com': { score: 0.55, category: 'email_provider', name: 'Hotmail' },
  'yahoo.com': { score: 0.55, category: 'email_provider', name: 'Yahoo Mail' },
  'protonmail.com': { score: 0.65, category: 'email_provider', name: 'ProtonMail' },
  'icloud.com': { score: 0.60, category: 'email_provider', name: 'iCloud' },

  // Newsletter platforms (moderate trust)
  'substack.com': { score: 0.65, category: 'newsletter', name: 'Substack' },
  'mailchimp.com': { score: 0.50, category: 'newsletter', name: 'Mailchimp' },
  'sendgrid.net': { score: 0.50, category: 'newsletter', name: 'SendGrid' },
  'constantcontact.com': { score: 0.50, category: 'newsletter', name: 'Constant Contact' },

  // Government (high trust)
  'gov': { score: 0.90, category: 'government', name: 'Government' },
  'edu': { score: 0.80, category: 'education', name: 'Education' },
  'org': { score: 0.65, category: 'organization', name: 'Organization' },
};

class EmailIngestion {
  constructor(options = {}) {
    this.libraryMatcher = getLibraryMatcher();
    this.contentProcessor = getContentProcessor();
    this.retrievalService = getRetrievalService();

    this.config = {
      minReliabilityScore: options.minReliabilityScore || 0.35,
      minLibraryMatchScore: options.minLibraryMatchScore || 0.55,
      enableDuplicateDetection: options.enableDuplicateDetection !== false,
      duplicateWindowHours: options.duplicateWindowHours || 48,
      maxContentLength: options.maxContentLength || 100000,
      processAttachments: options.processAttachments !== false,
      maxAttachmentSize: options.maxAttachmentSize || 10 * 1024 * 1024, // 10MB
      supportedAttachmentTypes: options.supportedAttachmentTypes || [
        'pdf',
        'txt',
        'doc',
        'docx',
        'md',
        'csv',
      ],
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
      skippedSpam: 0,
      failed: 0,
      attachmentsProcessed: 0,
    };

    // Ensure table exists
    this.ensureTable();
  }

  /**
   * Ensure email_ingestion_log table exists
   */
  ensureTable() {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_ingestion_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        library_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        email_id TEXT NOT NULL,
        email_external_id TEXT,
        platform_account_id TEXT,
        from_address TEXT,
        subject TEXT,
        thread_id TEXT,
        has_attachments INTEGER DEFAULT 0,
        attachment_count INTEGER DEFAULT 0,
        reliability_score REAL,
        match_score REAL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id),
        FOREIGN KEY (document_id) REFERENCES knowledge_documents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_email_ing_user ON email_ingestion_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_email_ing_library ON email_ingestion_log(library_id);
      CREATE INDEX IF NOT EXISTS idx_email_ing_thread ON email_ingestion_log(thread_id);
      CREATE INDEX IF NOT EXISTS idx_email_ing_from ON email_ingestion_log(from_address);
    `);
  }

  /**
   * Ingest an email into RAG
   * @param {Object} email - Email object (unified message format)
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Ingestion result
   */
  async ingestEmail(email, context = {}) {
    const startTime = Date.now();
    const { userId, platformAccountId, libraryId } = context;

    this.stats.totalProcessed++;

    try {
      // Validate input
      if (!email || !userId) {
        return this.buildResult(INGESTION_RESULT.FAILED, {
          error: 'Missing required fields: email or userId',
          processingTimeMs: Date.now() - startTime,
        });
      }

      // Extract email content
      const emailContent = this.extractEmailContent(email);
      const metadata = this.extractEmailMetadata(email);

      // Check for spam/marketing
      if (this.isSpamOrMarketing(email, metadata)) {
        this.stats.skippedSpam++;
        return this.buildResult(INGESTION_RESULT.SKIPPED_SPAM, {
          reason: 'Email detected as spam or marketing',
          processingTimeMs: Date.now() - startTime,
        });
      }

      // Check for duplicates
      if (this.config.enableDuplicateDetection) {
        const duplicate = this.checkDuplicate(emailContent, userId);
        if (duplicate) {
          this.stats.skippedDuplicate++;
          return this.buildResult(INGESTION_RESULT.SKIPPED_DUPLICATE, {
            reason: 'Email appears to be duplicate',
            duplicateOf: duplicate.documentId,
            processingTimeMs: Date.now() - startTime,
          });
        }
      }

      // Calculate reliability score
      const reliability = this.calculateReliability(email, metadata);

      if (reliability.score < this.config.minReliabilityScore) {
        this.stats.skippedLowReliability++;
        return this.buildResult(INGESTION_RESULT.SKIPPED_LOW_RELIABILITY, {
          reliabilityScore: reliability.score,
          reason: reliability.reason,
          processingTimeMs: Date.now() - startTime,
        });
      }

      // Find matching library
      let targetLibraryId = libraryId;
      let matchScore = 1.0;

      if (!targetLibraryId) {
        const matchResult = await this.libraryMatcher.matchLibrary(
          emailContent,
          userId,
          {
            source: 'email',
            minScore: this.config.minLibraryMatchScore,
          }
        );

        if (!matchResult.matched) {
          this.stats.skippedNoMatch++;
          return this.buildResult(INGESTION_RESULT.SKIPPED_NO_LIBRARY_MATCH, {
            reason: 'No matching library found',
            bestScore: matchResult.score,
            processingTimeMs: Date.now() - startTime,
          });
        }

        targetLibraryId = matchResult.library.id;
        matchScore = matchResult.score;
      }

      // Process attachments if enabled
      let attachmentContents = [];
      if (this.config.processAttachments && email.attachments?.length > 0) {
        attachmentContents = await this.processAttachments(
          email.attachments,
          context
        );
        this.stats.attachmentsProcessed += attachmentContents.length;
      }

      // Build final content
      const finalContent = this.buildFinalContent(
        emailContent,
        attachmentContents,
        metadata
      );

      // Create document
      const document = {
        id: uuidv4(),
        title: metadata.subject || `Email from ${metadata.from}`,
        content: finalContent,
        sourceType: 'email',
        sourceUrl: null,
        metadata: {
          ...metadata,
          reliabilityScore: reliability.score,
          matchScore,
          attachmentCount: attachmentContents.length,
          ingestedAt: new Date().toISOString(),
        },
      };

      // Ingest to RAG
      const ingestResult = await this.retrievalService.ingestDocument(
        document,
        targetLibraryId,
        { userId }
      );

      // Log ingestion
      this.logIngestion({
        userId,
        libraryId: targetLibraryId,
        documentId: document.id,
        emailId: email.id,
        emailExternalId: email.externalId,
        platformAccountId,
        fromAddress: metadata.from,
        subject: metadata.subject,
        threadId: metadata.threadId,
        hasAttachments: email.attachments?.length > 0,
        attachmentCount: attachmentContents.length,
        reliabilityScore: reliability.score,
        matchScore,
      });

      // Track for duplicate detection
      this.trackIngestion(emailContent, userId, document.id);

      this.stats.successfulIngestions++;

      // Emit WebSocket event
      if (global.wsBroadcast) {
        global.wsBroadcast('rag:email_ingested', {
          documentId: document.id,
          libraryId: targetLibraryId,
          subject: metadata.subject,
          from: metadata.from,
          attachmentCount: attachmentContents.length,
        });
      }

      return this.buildResult(INGESTION_RESULT.SUCCESS, {
        document,
        libraryId: targetLibraryId,
        matchScore,
        reliabilityScore: reliability.score,
        attachmentsProcessed: attachmentContents.length,
        chunkCount: ingestResult.chunkCount,
        processingTimeMs: Date.now() - startTime,
      });
    } catch (error) {
      this.stats.failed++;
      logger.error(`EmailIngestion: Failed to ingest email: ${error.message}`);
      return this.buildResult(INGESTION_RESULT.FAILED, {
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      });
    }
  }

  /**
   * Extract content from email
   * @param {Object} email - Email object
   * @returns {string} Extracted content
   */
  extractEmailContent(email) {
    let content = '';

    // Add subject
    if (email.subject) {
      content += `Subject: ${email.subject}\n\n`;
    }

    // Prefer plain text, fallback to HTML stripped
    if (email.text) {
      content += email.text;
    } else if (email.html) {
      content += this.stripHtml(email.html);
    } else if (email.content) {
      content += email.content;
    }

    // Truncate if too long
    if (content.length > this.config.maxContentLength) {
      content = content.substring(0, this.config.maxContentLength);
      logger.warn(
        `EmailIngestion: Content truncated to ${this.config.maxContentLength} chars`
      );
    }

    return content.trim();
  }

  /**
   * Extract metadata from email
   * @param {Object} email - Email object
   * @returns {Object} Extracted metadata
   */
  extractEmailMetadata(email) {
    const from = email.from || email.sender?.email || 'unknown';
    const domain = this.extractDomain(from);

    return {
      from,
      fromName: email.sender?.name || email.fromName,
      fromDomain: domain,
      to: email.to,
      subject: email.subject,
      date: email.timestamp || email.date,
      messageId: email.externalId || email.messageId,
      threadId: email.threadId || email.inReplyTo,
      hasAttachments: !!(email.attachments?.length > 0 || email.hasAttachments),
      attachmentNames: email.attachments?.map((a) => a.filename) || [],
      platform: 'email',
      direction: email.direction || 'incoming',
    };
  }

  /**
   * Calculate reliability score for email
   * @param {Object} email - Email object
   * @param {Object} metadata - Extracted metadata
   * @returns {Object} Reliability info
   */
  calculateReliability(email, metadata) {
    let score = 0.5; // Base score
    const factors = [];

    // Check domain reliability
    const domain = metadata.fromDomain;
    if (domain) {
      // Check exact domain match
      if (EMAIL_DOMAIN_RELIABILITY[domain]) {
        const domainInfo = EMAIL_DOMAIN_RELIABILITY[domain];
        score = domainInfo.score;
        factors.push({
          factor: 'known_domain',
          value: domain,
          impact: domainInfo.score,
          category: domainInfo.category,
        });
      } else {
        // Check TLD
        const tld = domain.split('.').pop();
        if (EMAIL_DOMAIN_RELIABILITY[tld]) {
          const tldInfo = EMAIL_DOMAIN_RELIABILITY[tld];
          score = Math.max(score, tldInfo.score * 0.9);
          factors.push({
            factor: 'tld_category',
            value: tld,
            impact: tldInfo.score * 0.9,
            category: tldInfo.category,
          });
        }
      }
    }

    // Boost for attachments (usually more substantive)
    if (metadata.hasAttachments) {
      score = Math.min(1.0, score + 0.1);
      factors.push({ factor: 'has_attachments', impact: 0.1 });
    }

    // Boost for longer content
    const contentLength = email.text?.length || email.content?.length || 0;
    if (contentLength > 500) {
      score = Math.min(1.0, score + 0.05);
      factors.push({ factor: 'substantial_content', impact: 0.05 });
    }

    return {
      score: Math.round(score * 100) / 100,
      factors,
      reason:
        score < this.config.minReliabilityScore
          ? 'Low reliability based on sender domain and content'
          : null,
    };
  }

  /**
   * Check if email is spam or marketing
   * @param {Object} email - Email object
   * @param {Object} metadata - Extracted metadata
   * @returns {boolean} Is spam/marketing
   */
  isSpamOrMarketing(email, metadata) {
    const subject = (metadata.subject || '').toLowerCase();
    const from = (metadata.from || '').toLowerCase();

    // Common spam/marketing indicators
    const spamIndicators = [
      'unsubscribe',
      'click here',
      'limited time',
      'act now',
      'free gift',
      'winner',
      'congratulations',
      'no-reply@',
      'noreply@',
      'donotreply@',
      'marketing@',
      'newsletter@',
      'promo@',
    ];

    for (const indicator of spamIndicators) {
      if (subject.includes(indicator) || from.includes(indicator)) {
        return true;
      }
    }

    // Check for bulk sender patterns
    const bulkDomains = ['mailchimp.com', 'sendgrid.net', 'constantcontact.com'];
    if (bulkDomains.some((d) => from.includes(d))) {
      // Only skip if it looks like marketing
      if (
        subject.includes('sale') ||
        subject.includes('offer') ||
        subject.includes('deal')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Process email attachments
   * @param {Array} attachments - Attachment objects
   * @param {Object} context - Processing context
   * @returns {Promise<Array>} Processed attachment contents
   */
  async processAttachments(attachments, context) {
    const results = [];

    for (const attachment of attachments) {
      try {
        // Check file size
        if (attachment.size > this.config.maxAttachmentSize) {
          logger.warn(
            `EmailIngestion: Skipping large attachment ${attachment.filename} (${attachment.size} bytes)`
          );
          continue;
        }

        // Check file type
        const ext = path.extname(attachment.filename || '').toLowerCase().slice(1);
        if (!this.config.supportedAttachmentTypes.includes(ext)) {
          logger.debug(
            `EmailIngestion: Skipping unsupported attachment type: ${ext}`
          );
          continue;
        }

        // Extract content based on type
        let content = null;
        switch (ext) {
          case 'txt':
          case 'md':
          case 'csv':
            content = attachment.content?.toString('utf-8');
            break;
          case 'pdf':
            content = await this.extractPdfContent(attachment);
            break;
          case 'doc':
          case 'docx':
            content = await this.extractDocContent(attachment);
            break;
          default:
            logger.debug(`EmailIngestion: No extractor for ${ext}`);
        }

        if (content) {
          results.push({
            filename: attachment.filename,
            type: ext,
            content: content.substring(0, 50000), // Limit attachment content
          });
        }
      } catch (error) {
        logger.error(
          `EmailIngestion: Failed to process attachment ${attachment.filename}: ${error.message}`
        );
      }
    }

    return results;
  }

  /**
   * Extract content from PDF attachment
   * @param {Object} attachment - Attachment object
   * @returns {Promise<string|null>} Extracted text
   */
  async extractPdfContent(attachment) {
    try {
      const pdfParse = require('pdf-parse');
      const buffer =
        attachment.content instanceof Buffer
          ? attachment.content
          : Buffer.from(attachment.content, 'base64');
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      logger.error(`EmailIngestion: PDF extraction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract content from DOC/DOCX attachment
   * @param {Object} attachment - Attachment object
   * @returns {Promise<string|null>} Extracted text
   */
  async extractDocContent(attachment) {
    try {
      const mammoth = require('mammoth');
      const buffer =
        attachment.content instanceof Buffer
          ? attachment.content
          : Buffer.from(attachment.content, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      logger.error(`EmailIngestion: DOCX extraction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Build final content for RAG ingestion
   * @param {string} emailContent - Main email content
   * @param {Array} attachments - Processed attachments
   * @param {Object} metadata - Email metadata
   * @returns {string} Final content
   */
  buildFinalContent(emailContent, attachments, metadata) {
    let content = emailContent;

    // Add attachment contents
    if (attachments.length > 0) {
      content += '\n\n--- Attachments ---\n';
      for (const att of attachments) {
        content += `\n[${att.filename}]\n${att.content}\n`;
      }
    }

    return content;
  }

  /**
   * Check for duplicate content
   * @param {string} content - Content to check
   * @param {string} userId - User ID
   * @returns {Object|null} Duplicate info or null
   */
  checkDuplicate(content, userId) {
    const hash = this.hashContent(content);
    const key = `${userId}:${hash}`;

    if (this.recentIngestions.has(key)) {
      return this.recentIngestions.get(key);
    }

    return null;
  }

  /**
   * Track ingestion for duplicate detection
   * @param {string} content - Content
   * @param {string} userId - User ID
   * @param {string} documentId - Document ID
   */
  trackIngestion(content, userId, documentId) {
    const hash = this.hashContent(content);
    const key = `${userId}:${hash}`;

    this.recentIngestions.set(key, {
      documentId,
      timestamp: Date.now(),
    });

    // Cleanup old entries
    const cutoff = Date.now() - this.config.duplicateWindowHours * 60 * 60 * 1000;
    for (const [k, v] of this.recentIngestions.entries()) {
      if (v.timestamp < cutoff) {
        this.recentIngestions.delete(k);
      }
    }
  }

  /**
   * Log ingestion to database
   * @param {Object} data - Ingestion data
   */
  logIngestion(data) {
    const db = getDatabase();
    const id = uuidv4();

    db.prepare(
      `INSERT INTO email_ingestion_log (
        id, user_id, library_id, document_id, email_id, email_external_id,
        platform_account_id, from_address, subject, thread_id,
        has_attachments, attachment_count, reliability_score, match_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      data.userId,
      data.libraryId,
      data.documentId,
      data.emailId,
      data.emailExternalId || null,
      data.platformAccountId || null,
      data.fromAddress || null,
      data.subject || null,
      data.threadId || null,
      data.hasAttachments ? 1 : 0,
      data.attachmentCount || 0,
      data.reliabilityScore || null,
      data.matchScore || null
    );
  }

  /**
   * Build result object
   * @param {string} status - Result status
   * @param {Object} data - Result data
   * @returns {Object} Result object
   */
  buildResult(status, data = {}) {
    return {
      status,
      success: status === INGESTION_RESULT.SUCCESS,
      ...data,
    };
  }

  /**
   * Extract domain from email address
   * @param {string} email - Email address
   * @returns {string|null} Domain
   */
  extractDomain(email) {
    const match = email?.match(/@([^>]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Strip HTML tags
   * @param {string} html - HTML content
   * @returns {string} Plain text
   */
  stripHtml(html) {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Hash content for duplicate detection
   * @param {string} content - Content to hash
   * @returns {string} Hash
   */
  hashContent(content) {
    const crypto = require('crypto');
    // Use first 1000 chars for hash to handle slight variations
    const normalized = content.substring(0, 1000).toLowerCase().replace(/\s+/g, ' ');
    return crypto.createHash('md5').update(normalized).digest('hex');
  }

  /**
   * Get ingestion statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Get ingestion history
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Array} Ingestion history
   */
  getHistory(userId, options = {}) {
    const { limit = 50, offset = 0, libraryId } = options;

    const db = getDatabase();
    let query = 'SELECT * FROM email_ingestion_log WHERE user_id = ?';
    const params = [userId];

    if (libraryId) {
      query += ' AND library_id = ?';
      params.push(libraryId);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(query).all(...params);
  }
}

// Singleton instance
let instance = null;

function getEmailIngestion() {
  if (!instance) {
    instance = new EmailIngestion();
  }
  return instance;
}

module.exports = {
  EmailIngestion,
  getEmailIngestion,
  INGESTION_RESULT,
  EMAIL_DOMAIN_RELIABILITY,
};
