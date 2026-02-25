/**
 * Email Client
 * IMAP + SMTP email integration
 *
 * Supports:
 * - Fetching emails via IMAP
 * - Sending emails via SMTP
 * - Real-time email monitoring (IDLE)
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const { createPlatformLogger } = require('../services/logger.cjs');
const { getDatabase } = require('../services/database.cjs');
const redisService = require('../services/redis.cjs');

// Constants
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 10000;
const IDLE_TIMEOUT_MS = 300000; // 5 minutes

/**
 * Email Client Class
 * Manages IMAP + SMTP connection for a single email account
 */
class EmailClient extends EventEmitter {
  constructor(accountId, config, options = {}) {
    super();

    this.accountId = accountId;
    this.config = config; // { email, password, imap: {...}, smtp: {...} }
    this.userId = options.userId || null;
    this.autoIngestToRAG = options.autoIngestToRAG || false;

    this.imapClient = null;
    this.smtpClient = null;
    this.mailbox = null; // Stores INBOX info (uidnext, messages.total, etc.)
    this.status = 'disconnected';
    this.reconnectAttempts = 0;
    this.isMonitoring = false;
    this.idleTimeout = null;

    this.log = createPlatformLogger('email', accountId);
  }

  /**
   * Get current status
   */
  getStatus() {
    return this.status;
  }

  /**
   * Set status and emit event
   */
  setStatus(status) {
    const oldStatus = this.status;
    this.status = status;

    if (oldStatus !== status) {
      this.log.info(`Status changed: ${oldStatus} → ${status}`);
      this.emit('status_change', status, oldStatus);

      // Update database
      this.updateAccountStatus(status);

      // Broadcast via WebSocket
      if (global.wsBroadcast) {
        global.wsBroadcast('agent:status_changed', {
          accountId: this.accountId,
          platform: 'email',
          status
        });
      }
    }
  }

  /**
   * Connect to email servers (IMAP + SMTP)
   */
  async connect() {
    this.log.info('Connecting to email servers...');
    this.setStatus('connecting');

    try {
      // Connect IMAP
      await this.connectImap();

      // Setup SMTP transporter
      this.setupSmtp();

      this.setStatus('connected');
      this.reconnectAttempts = 0;

      // Update connection metadata
      await this.updateConnectionMetadata();

      // Start monitoring for new emails
      await this.startMonitoring();

      this.emit('ready');

    } catch (error) {
      this.log.error(`Connection failed: ${error.message}`);
      this.setStatus('error');
      this.updateAccountError(error.message);
      throw error;
    }
  }

  /**
   * Disconnect from email servers
   */
  async disconnect() {
    this.isMonitoring = false;

    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }

    if (this.imapClient) {
      try {
        this.imapClient.end();
      } catch (e) {
        // Ignore
      }
      this.imapClient = null;
      this.mailbox = null;
    }

    if (this.smtpClient) {
      this.smtpClient.close();
      this.smtpClient = null;
    }

    this.setStatus('disconnected');
    this.log.info('Disconnected from email servers');
  }

  /**
   * Connect to IMAP server
   */
  connectImap() {
    return new Promise((resolve, reject) => {
      const imapConfig = {
        user: this.config.email,
        password: this.config.password,
        host: this.config.imap.host,
        port: this.config.imap.port || 993,
        tls: this.config.imap.secure !== false,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 30000,
        authTimeout: 15000
      };

      this.imapClient = new Imap(imapConfig);

      this.imapClient.once('ready', () => {
        this.log.info('IMAP connected');
        resolve();
      });

      this.imapClient.once('error', (err) => {
        this.log.error(`IMAP error: ${err.message}`);
        reject(err);
      });

      this.imapClient.once('end', () => {
        this.log.info('IMAP connection ended');
        if (this.status === 'connected') {
          this.handleDisconnect();
        }
      });

      this.imapClient.connect();
    });
  }

  /**
   * Setup SMTP transporter
   */
  setupSmtp() {
    this.smtpClient = nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port || 587,
      secure: this.config.smtp.secure || false,
      auth: {
        user: this.config.email,
        pass: this.config.password
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    this.log.info('SMTP transporter configured');
  }

  /**
   * Start monitoring for new emails
   */
  async startMonitoring() {
    if (!this.imapClient) return;

    this.isMonitoring = true;
    this.log.info('Starting email monitoring...');

    try {
      // Open INBOX and store mailbox info
      this.mailbox = await new Promise((resolve, reject) => {
        this.imapClient.openBox('INBOX', false, (err, box) => {
          if (err) reject(err);
          else resolve(box);
        });
      });

      // Listen for new emails
      this.imapClient.on('mail', (numNewMsgs) => {
        this.log.info(`New emails received: ${numNewMsgs}`);
        // Update cached mailbox total
        if (this.mailbox?.messages) {
          this.mailbox.messages.total += numNewMsgs;
        }
        this.fetchNewEmails(numNewMsgs);
      });

      // Setup IDLE to keep connection alive
      this.scheduleIdle();

      this.log.info('Email monitoring started');

    } catch (error) {
      this.log.error(`Failed to start monitoring: ${error.message}`);
    }
  }

  /**
   * Schedule IDLE refresh
   */
  scheduleIdle() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }

    this.idleTimeout = setTimeout(() => {
      if (this.isMonitoring && this.imapClient && typeof this.imapClient.noop === 'function') {
        // NOOP to keep connection alive
        try {
          this.imapClient.noop((err) => {
            if (err) {
              this.log.error(`NOOP error: ${err.message}`);
            }
          });
        } catch (e) {
          this.log.error(`NOOP exception: ${e.message}`);
        }
        this.scheduleIdle();
      }
    }, IDLE_TIMEOUT_MS);
  }

  /**
   * Handle IMAP disconnect
   */
  async handleDisconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.log.error('Max reconnection attempts reached');
      this.setStatus('error');
      this.updateAccountError('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    this.log.info(`Attempting reconnection (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));

    try {
      await this.connect();
    } catch (error) {
      this.log.error(`Reconnection failed: ${error.message}`);
    }
  }

  /**
   * Fetch new emails
   */
  async fetchNewEmails(count = 10) {
    if (!this.imapClient || !this.mailbox) return [];

    // Calculate sequence range for last N messages
    const total = this.mailbox.messages?.total || 0;
    if (total === 0) return [];

    const startSeq = Math.max(1, total - count + 1);
    const seqRange = `${startSeq}:*`;

    return new Promise((resolve) => {
      const fetch = this.imapClient.seq.fetch(seqRange, {
        bodies: ['HEADER', 'TEXT', ''],
        struct: true
      });

      const emails = [];

      fetch.on('message', (msg, seqno) => {
        const email = { seqno };

        msg.on('body', (stream, info) => {
          let buffer = '';
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
          stream.once('end', async () => {
            if (info.which === '') {
              try {
                const parsed = await simpleParser(buffer);
                email.parsed = parsed;
              } catch (e) {
                // Ignore parse errors
              }
            }
          });
        });

        msg.once('attributes', (attrs) => {
          email.uid = attrs.uid;
          email.flags = attrs.flags;
          email.date = attrs.date;
        });

        msg.once('end', () => {
          if (email.parsed) {
            const unifiedMessage = this.convertToUnifiedMessage(email);
            emails.push(unifiedMessage);

            // Store message in Redis for fast retrieval (WhatsBots-style)
            if (redisService.isRedisAvailable()) {
              try {
                const redisMessage = {
                  id: unifiedMessage.externalId || email.uid,
                  from: unifiedMessage.sender?.email || unifiedMessage.from,
                  to: this.config.email,
                  fromName: unifiedMessage.sender?.name,
                  body: unifiedMessage.text || unifiedMessage.html,
                  timestamp: Math.floor(new Date(email.date || Date.now()).getTime() / 1000),
                  type: 'email',
                  hasMedia: unifiedMessage.hasMedia,
                  mediaType: 'email',
                  fromMe: false,
                  platform: 'email',
                  subject: unifiedMessage.subject,
                };

                redisService.storeMessage(this.accountId, redisMessage, null).catch(err => {
                  this.log.warn(`Failed to store email in Redis: ${err.message}`);
                });
                this.log.debug(`📦 Email stored in Redis: ${email.uid}`);
              } catch (redisErr) {
                this.log.warn(`Redis storage error: ${redisErr.message}`);
              }
            }

            this.emit('message', unifiedMessage);

            // Auto-ingest to RAG if enabled
            if (this.autoIngestToRAG && this.userId) {
              this.processForRAG(unifiedMessage).catch((err) => {
                this.log.error(`RAG ingestion failed: ${err.message}`);
              });
            }
          }
        });
      });

      fetch.once('error', (err) => {
        this.log.error(`Fetch error: ${err.message}`);
        resolve([]);
      });

      fetch.once('end', () => {
        this.log.info(`Fetched ${emails.length} emails`);
        resolve(emails);
      });
    });
  }

  /**
   * Send email
   */
  async sendEmail(to, subject, body, options = {}) {
    if (!this.smtpClient) {
      throw new Error('SMTP client not configured');
    }

    const mailOptions = {
      from: options.from || this.config.email,
      to,
      subject,
      text: options.isHtml ? undefined : body,
      html: options.isHtml ? body : undefined,
      attachments: options.attachments || [],
      replyTo: options.replyTo,
      cc: options.cc,
      bcc: options.bcc
    };

    this.log.info(`Sending email to: ${to}, subject: ${subject}`);

    const result = await this.smtpClient.sendMail(mailOptions);

    return {
      id: result.messageId,
      timestamp: new Date()
    };
  }

  /**
   * Get emails from folder
   */
  async getEmails(folder = 'INBOX', limit = 50) {
    if (!this.imapClient) {
      return [];
    }

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, true, (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        const fetchStart = Math.max(1, box.messages.total - limit + 1);
        const fetch = this.imapClient.seq.fetch(`${fetchStart}:*`, {
          bodies: '',
          struct: true
        });

        const emails = [];

        fetch.on('message', (msg, seqno) => {
          const email = { seqno };

          msg.on('body', (stream) => {
            let buffer = '';
            stream.on('data', (chunk) => {
              buffer += chunk.toString('utf8');
            });
            stream.once('end', async () => {
              try {
                email.parsed = await simpleParser(buffer);
              } catch (e) {
                // Ignore
              }
            });
          });

          msg.once('attributes', (attrs) => {
            email.uid = attrs.uid;
            email.flags = attrs.flags;
            email.date = attrs.date;
          });

          msg.once('end', () => {
            if (email.parsed) {
              emails.push(this.formatEmailSummary(email));
            }
          });
        });

        fetch.once('error', reject);
        fetch.once('end', () => resolve(emails.reverse()));
      });
    });
  }

  /**
   * Get folders
   */
  async getFolders() {
    if (!this.imapClient) {
      return [];
    }

    return new Promise((resolve, reject) => {
      this.imapClient.getBoxes((err, boxes) => {
        if (err) reject(err);
        else resolve(this.flattenFolders(boxes));
      });
    });
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Convert email to unified message format
   */
  convertToUnifiedMessage(email) {
    const parsed = email.parsed;

    return {
      id: uuidv4(),
      externalId: parsed.messageId || String(email.uid),
      platform: 'email',
      direction: 'incoming',
      from: parsed.from?.value?.[0]?.address || 'unknown',
      to: parsed.to?.value?.[0]?.address || this.config.email,
      sender: {
        id: parsed.from?.value?.[0]?.address,
        name: parsed.from?.value?.[0]?.name || parsed.from?.value?.[0]?.address,
        email: parsed.from?.value?.[0]?.address
      },
      contentType: 'text',
      subject: parsed.subject,
      text: parsed.text,
      html: parsed.html,
      hasAttachments: parsed.attachments?.length > 0,
      attachments: parsed.attachments?.map(a => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size
      })),
      timestamp: parsed.date || new Date(),
      isRead: email.flags?.includes('\\Seen'),
      raw: email
    };
  }

  /**
   * Format email for summary list
   */
  formatEmailSummary(email) {
    const parsed = email.parsed;

    return {
      id: String(email.uid),
      from: {
        name: parsed.from?.value?.[0]?.name || parsed.from?.value?.[0]?.address,
        email: parsed.from?.value?.[0]?.address
      },
      subject: parsed.subject,
      snippet: (parsed.text || '').substring(0, 200),
      date: parsed.date,
      isRead: email.flags?.includes('\\Seen'),
      hasAttachments: parsed.attachments?.length > 0
    };
  }

  /**
   * Flatten nested folder structure
   */
  flattenFolders(boxes, prefix = '') {
    const folders = [];

    for (const [name, box] of Object.entries(boxes)) {
      const fullName = prefix ? `${prefix}${box.delimiter}${name}` : name;
      folders.push({
        name: fullName,
        displayName: name,
        delimiter: box.delimiter,
        flags: box.attribs
      });

      if (box.children) {
        folders.push(...this.flattenFolders(box.children, fullName));
      }
    }

    return folders;
  }

  /**
   * Update account status in database
   */
  updateAccountStatus(status) {
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE platform_accounts
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(status, this.accountId);
    } catch (error) {
      this.log.error(`Failed to update account status: ${error.message}`);
    }
  }

  /**
   * Update account error in database
   */
  updateAccountError(errorMessage) {
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE platform_accounts
        SET last_error = ?, error_count = error_count + 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(errorMessage, this.accountId);
    } catch (error) {
      this.log.error(`Failed to update account error: ${error.message}`);
    }
  }

  /**
   * Process email for RAG ingestion
   * @param {Object} email - Unified message object
   * @returns {Promise<Object>} Ingestion result
   */
  async processForRAG(email) {
    if (!this.userId) {
      this.log.warn('Cannot process for RAG: userId not set');
      return { success: false, error: 'userId not set' };
    }

    try {
      const { getEmailIngestion } = require('../services/rag/EmailIngestion.cjs');
      const ingestion = getEmailIngestion();

      const result = await ingestion.ingestEmail(email, {
        userId: this.userId,
        platformAccountId: this.accountId,
      });

      if (result.success) {
        this.log.info(`Email ingested to RAG: ${result.document?.id}`);
        this.emit('email:ingested', result);
      } else {
        this.log.debug(`Email not ingested: ${result.status}`);
      }

      return result;
    } catch (error) {
      this.log.error(`RAG ingestion failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enable/disable auto RAG ingestion
   * @param {boolean} enabled - Enable auto ingest
   */
  setAutoIngestRAG(enabled) {
    this.autoIngestToRAG = enabled;
    this.log.info(`Auto RAG ingestion ${enabled ? 'enabled' : 'disabled'}`);

    // Update in database
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE platform_accounts
        SET auto_ingest_rag = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(enabled ? 1 : 0, this.accountId);
    } catch (error) {
      this.log.error(`Failed to update auto_ingest_rag: ${error.message}`);
    }
  }

  /**
   * Update connection metadata
   */
  async updateConnectionMetadata() {
    try {
      const db = getDatabase();
      const metadata = {
        email: this.config.email,
        imapHost: this.config.imap.host,
        smtpHost: this.config.smtp.host,
        connectedAt: new Date().toISOString()
      };

      db.prepare(`
        UPDATE platform_accounts
        SET connection_metadata = ?,
            last_connected_at = datetime('now'),
            last_error = NULL,
            error_count = 0,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(metadata), this.accountId);
    } catch (error) {
      this.log.error(`Failed to update connection metadata: ${error.message}`);
    }
  }
}

module.exports = {
  EmailClient
};
