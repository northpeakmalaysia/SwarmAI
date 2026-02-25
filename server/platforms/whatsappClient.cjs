/**
 * WhatsApp Client
 * WhatsBots-style WhatsApp Web.js integration
 *
 * Uses LocalAuth strategy for session persistence
 * Supports multiple agent instances via AgentManager
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const { createPlatformLogger } = require('../services/logger.cjs');
const { getDatabase } = require('../services/database.cjs');
const redisService = require('../services/redis.cjs');

// Lazy-load circuit breaker and metrics to avoid startup issues
let _circuitBreaker = null;
let _metricsService = null;

function getCircuitBreakerSafe() {
  if (_circuitBreaker === undefined) return null;
  if (_circuitBreaker) return _circuitBreaker;
  try {
    const { getCircuitBreaker } = require('../services/flow/middleware/CircuitBreaker.cjs');
    _circuitBreaker = getCircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      resetTimeout: 30000,
    });
    return _circuitBreaker;
  } catch (error) {
    _circuitBreaker = undefined;
    return null;
  }
}

function getMetricsServiceSafe() {
  if (!_metricsService) {
    try {
      const { getMetricsService } = require('../services/metricsService.cjs');
      _metricsService = getMetricsService();
    } catch (error) {
      // Metrics not available
    }
  }
  return _metricsService;
}

// Constants
const SESSION_DIR = path.join(__dirname, '..', 'data', 'whatsapp-sessions');
const QR_EXPIRY_MS = 120000; // 2 minutes
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 5000;

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

/**
 * Clean up stale Chrome/Chromium lock files
 * This prevents "profile appears to be in use" errors after container restart
 */
function cleanupChromeLocks(accountId) {
  const sessionPath = path.join(SESSION_DIR, `session-${accountId}`);

  if (!fs.existsSync(sessionPath)) {
    return { cleaned: false, reason: 'Session directory does not exist' };
  }

  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  const cleaned = [];

  // Clean lock files from the main session directory
  for (const lockFile of lockFiles) {
    const lockPath = path.join(sessionPath, lockFile);
    if (fs.existsSync(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
        cleaned.push(lockPath);
      } catch (err) {
        console.warn(`Failed to remove ${lockPath}: ${err.message}`);
      }
    }
  }

  // Also check in Default subdirectory (Chrome profile directory)
  const defaultPath = path.join(sessionPath, 'Default');
  if (fs.existsSync(defaultPath)) {
    for (const lockFile of lockFiles) {
      const lockPath = path.join(defaultPath, lockFile);
      if (fs.existsSync(lockPath)) {
        try {
          fs.unlinkSync(lockPath);
          cleaned.push(lockPath);
        } catch (err) {
          console.warn(`Failed to remove ${lockPath}: ${err.message}`);
        }
      }
    }
  }

  // Check for any directory that might have lock files (Chrome can create various profile dirs)
  try {
    const entries = fs.readdirSync(sessionPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        for (const lockFile of lockFiles) {
          const lockPath = path.join(sessionPath, entry.name, lockFile);
          if (fs.existsSync(lockPath)) {
            try {
              fs.unlinkSync(lockPath);
              cleaned.push(lockPath);
            } catch (err) {
              console.warn(`Failed to remove ${lockPath}: ${err.message}`);
            }
          }
        }
      }
    }
  } catch (err) {
    // Ignore directory read errors
  }

  return { cleaned: cleaned.length > 0, files: cleaned };
}

/**
 * Get Puppeteer Chrome path
 */
function getChromiumPath() {
  // Check environment variable first
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    if (fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
  }

  // Check Puppeteer cache directory (Docker installs Chrome here)
  const puppeteerCacheDir = '/opt/puppeteer-cache/chrome';
  if (fs.existsSync(puppeteerCacheDir)) {
    try {
      const versions = fs.readdirSync(puppeteerCacheDir);
      for (const version of versions) {
        const chromePath = path.join(puppeteerCacheDir, version, 'chrome-linux64', 'chrome');
        if (fs.existsSync(chromePath)) {
          return chromePath;
        }
      }
    } catch (e) {
      // Ignore errors reading cache directory
    }
  }

  // Check common paths
  const paths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/opt/google/chrome/chrome'
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return undefined; // Let Puppeteer use bundled Chromium
}

/**
 * WhatsApp Client Class
 * Manages a single WhatsApp Web session
 */
class WhatsAppClient extends EventEmitter {
  constructor(accountId, config = {}) {
    super();

    this.accountId = accountId;
    this.config = {
      headless: true,
      puppeteerArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
      ...config
    };

    this.client = null;
    this.status = 'disconnected';
    this.currentQR = null;
    this.reconnectAttempts = 0;
    this.isReady = false;  // Track if WhatsApp stores are fully loaded
    this.log = createPlatformLogger('whatsapp', accountId);
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
        // Get agent ID for this account
        const db = getDatabase();
        const account = db.prepare('SELECT agent_id FROM platform_accounts WHERE id = ?').get(this.accountId);
        const agentId = account?.agent_id;

        // Broadcast status changed event
        global.wsBroadcast('agent:status_changed', {
          accountId: this.accountId,
          agentId,
          platform: 'whatsapp',
          status
        });

        // Also broadcast platform_status for frontend QRCodeDisplay
        if (agentId) {
          global.wsBroadcast('agent:platform_status', {
            agentId,
            accountId: this.accountId,
            platform: 'whatsapp',
            connected: status === 'connected',
            status
          });

          // Broadcast QR success event when connected
          if (status === 'connected') {
            global.wsBroadcast('agent:qr', {
              agentId,
              status: 'success'
            });
          }
        }
      }
    }
  }

  /**
   * Connect to WhatsApp Web
   */
  async connect() {
    if (this.client) {
      this.log.warn('Client already exists, disconnecting first...');
      await this.disconnect();
    }

    this.log.info('Initializing WhatsApp client...');
    this.setStatus('connecting');

    // Clean up stale Chrome lock files before starting
    // This prevents "profile appears to be in use" errors after container restart
    const cleanupResult = cleanupChromeLocks(this.accountId);
    if (cleanupResult.cleaned) {
      this.log.info(`Cleaned up stale Chrome lock files: ${cleanupResult.files.join(', ')}`);
    }

    const chromiumPath = getChromiumPath();
    if (chromiumPath) {
      this.log.info(`Using Chromium at: ${chromiumPath}`);
    }

    // Create client with LocalAuth strategy (WhatsBots pattern)
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.accountId,
        dataPath: SESSION_DIR
      }),
      puppeteer: {
        headless: this.config.headless,
        args: this.config.puppeteerArgs,
        ...(chromiumPath ? { executablePath: chromiumPath } : {})
      }
    });

    // Setup event handlers
    this.setupEventHandlers();

    // Initialize client
    try {
      await this.client.initialize();
      this.log.info('WhatsApp client initialized');
    } catch (error) {
      this.log.error(`Failed to initialize: ${error.message}`);
      this.setStatus('error');
      this.updateAccountError(error.message);
      throw error;
    }
  }

  /**
   * Disconnect from WhatsApp Web
   * @param {boolean} graceful - If true, attempt graceful cleanup
   */
  async disconnect(graceful = false) {
    if (!this.client) return;

    this.log.info(`Disconnecting WhatsApp client (graceful: ${graceful})...`);

    try {
      if (graceful) {
        // Give time for pending operations
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Try to logout cleanly first (preserves session for next connect)
        try {
          // Note: logout() disconnects but keeps session files
          // destroy() fully cleans up browser instance
          await this.client.destroy();
          this.log.info('WhatsApp client gracefully destroyed');
        } catch (logoutError) {
          this.log.warn(`Graceful logout failed: ${logoutError.message}`);
          // Fall through to destroy
        }
      } else {
        await this.client.destroy();
        this.log.info('WhatsApp client destroyed');
      }
    } catch (error) {
      this.log.error(`Error during disconnect: ${error.message}`);
    } finally {
      this.client = null;
      this.isReady = false;
      this.setStatus('disconnected');
      this.removeAllListeners();
    }
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    if (!this.client) return;

    // QR code event
    this.client.on('qr', async (qr) => {
      this.log.info('QR code received');
      this.currentQR = qr;
      this.setStatus('qr_pending');

      // Save QR to database
      await this.saveQRCode(qr);

      // Generate QR image
      const qrImage = await qrcode.toDataURL(qr);

      this.emit('qr', { qr, qrImage });

      // Broadcast QR to frontend
      if (global.wsBroadcast) {
        const db = getDatabase();
        const account = db.prepare('SELECT agent_id FROM platform_accounts WHERE id = ?').get(this.accountId);
        const agentId = account?.agent_id;

        if (agentId) {
          // Use agent:qr event which frontend listens for
          global.wsBroadcast('agent:qr', {
            agentId,
            status: 'ready',
            qrData: qrImage
          });
          this.log.info(`QR code broadcast for agent ${agentId}`);
        }
      }
    });

    // Authenticated event - session was successfully authenticated
    // This fires after QR scan or when restoring from saved session
    this.client.on('authenticated', () => {
      this.log.info('Authenticated - session validated');
      this.currentQR = null;

      // Set status to connected since authentication succeeded
      // Note: 'ready' event may be delayed or not fire in some cases
      this.setStatus('connected');

      // Broadcast success to frontend
      if (global.wsBroadcast) {
        const db = getDatabase();
        const account = db.prepare('SELECT agent_id FROM platform_accounts WHERE id = ?').get(this.accountId);
        const agentId = account?.agent_id;

        if (agentId) {
          // Broadcast QR success event to close QR display
          global.wsBroadcast('agent:qr', {
            agentId,
            status: 'success'
          });

          // Broadcast platform status as connected
          global.wsBroadcast('agent:platform_status', {
            agentId,
            accountId: this.accountId,
            platform: 'whatsapp',
            connected: true,
            status: 'connected'
          });
        }
      }

      // NOTE: Do NOT sync here - wait for the 'ready' event
      // The WhatsApp internal stores (window.WWebJS) are not ready until 'ready' fires
      // Syncing here would cause "Cannot read properties of undefined (reading 'update')" errors
      this.log.info('Authentication complete, waiting for ready event to sync...');

      this.emit('authenticated');
      this.emit('ready');
    });

    // Ready event - WhatsApp stores are now fully loaded
    this.client.on('ready', async () => {
      this.log.info('WhatsApp client is ready - internal stores loaded');
      this.isReady = true;  // Mark as ready - getChats() is now safe to call
      this.setStatus('connected');
      this.reconnectAttempts = 0;

      // Guard against client being destroyed during reconnection race condition
      if (!this.client) {
        this.log.warn('Client was destroyed before ready handler could complete');
        return;
      }

      // Get client info
      const info = await this.client.info;
      this.log.info(`Connected as: ${info?.pushname || 'Unknown'} (${info?.wid?.user || 'Unknown'})`);

      // Check for duplicate phone number (prevent same phone on multiple agents)
      const wid = info?.wid?.user;
      if (wid) {
        const db = getDatabase();
        const duplicate = db.prepare(`
          SELECT pa.id, a.name as agent_name
          FROM platform_accounts pa
          JOIN agents a ON pa.agent_id = a.id
          WHERE pa.id != ? AND pa.platform = 'whatsapp'
          AND json_extract(pa.connection_metadata, '$.wid') = ?
        `).get(this.accountId, wid);

        if (duplicate) {
          this.log.error(`Phone +${wid} already connected to agent "${duplicate.agent_name}"`);
          this.setStatus('error', `Phone number +${wid} is already connected to agent "${duplicate.agent_name}". Please disconnect the other agent first.`);
          // Emit error event for UI notification
          this.emit('error', {
            code: 'DUPLICATE_PHONE',
            message: `Phone number +${wid} is already connected to another agent`,
            existingAgent: duplicate.agent_name
          });
          // Disconnect this session to prevent conflicts
          await this.disconnect();
          return;
        }
      }

      // Update connection metadata
      await this.updateConnectionMetadata(info);

      // Auto-sync chats and contacts with retry logic
      // Now safe to call since we're in the 'ready' event
      const attemptSync = async (attempt = 1, maxAttempts = 3) => {
        try {
          const result = await this.syncToDatabase();
          if (!result.synced && attempt < maxAttempts) {
            this.log.info(`Sync attempt ${attempt} incomplete, retrying in 5 seconds...`);
            setTimeout(() => attemptSync(attempt + 1, maxAttempts), 5000);
          } else if (result.synced) {
            this.log.info(`Sync completed: ${result.contactsSynced} contacts, ${result.conversationsSynced} conversations`);
          }
        } catch (err) {
          if (attempt < maxAttempts) {
            this.log.warn(`Sync attempt ${attempt} failed: ${err.message}, retrying in 5 seconds...`);
            setTimeout(() => attemptSync(attempt + 1, maxAttempts), 5000);
          } else {
            this.log.error(`Auto-sync failed after ${maxAttempts} attempts: ${err.message}`);
          }
        }
      };
      // Start sync - client is ready so it should work
      attemptSync();

      this.emit('ready', info);
    });

    // Message event
    this.client.on('message', async (message) => {
      const isGroup = message.from.endsWith('@g.us');

      // For group messages, get the actual sender (message.author)
      // For private messages, sender is the same as message.from
      let senderId, senderName, senderPhone, profilePicture;
      let groupName = undefined;

      // Debug: log message structure (safe extraction, no circular refs)
      const _dbg = {
        id: message.id?._serialized,
        from: message.from,
        to: message.to,
        author: message.author,
        fromMe: message.fromMe,
        body: (message.body || '').substring(0, 100),
        type: message.type,
        timestamp: message.timestamp,
        hasMedia: message.hasMedia,
        isGroup,
        fromServer: message.id?.fromMe,
        idRemote: message.id?.remote,
      };
      this.log.warn(`📩 WA Message Debug: ${JSON.stringify(_dbg, null, 2)}`);

      if (isGroup && message.author) {
        // Group message - author is the actual sender
        senderId = message.author;
        senderPhone = message.author.replace('@c.us', '');
        // Use getBestSenderInfo for cached contact lookup with profile pic
        const senderInfo = await this.getBestSenderInfo(message);
        senderName = senderInfo.name !== 'Unknown' ? senderInfo.name : senderPhone;
        profilePicture = senderInfo.profilePicture;

        // Get group name for conversation title
        try {
          const chat = await message.getChat();
          groupName = chat?.name || 'Group Chat';
        } catch (err) {
          groupName = 'Group Chat';
          this.log.warn(`Could not get group name for ${message.from}: ${err.message}`);
        }
      } else {
        // Private message - use getBestSenderInfo for cached lookup
        senderId = message.from;

        // Resolve phone: for @lid, try to get actual phone number
        if (message.from.endsWith('@lid')) {
          const resolvedPhone = await this.resolvePhoneFromLid(message.from);
          senderPhone = resolvedPhone || message.from.replace('@lid', '');
        } else {
          senderPhone = message.from.replace('@c.us', '').replace('@g.us', '');
        }

        const senderInfo = await this.getBestSenderInfo(message);
        senderName = senderInfo.name !== 'Unknown' ? senderInfo.name : senderPhone;
        profilePicture = senderInfo.profilePicture;
      }

      this.log.info(`📩 Message from: ${senderName} (${senderId})${isGroup ? ' in group ' + (groupName || message.from) : ''}`);
      this.log.info(`   Type: ${message.type}, Body: ${(message.body || '').substring(0, 100)}, HasMedia: ${message.hasMedia}`);

      // Update profile pic for chat in background (non-blocking)
      if (!isGroup) {
        this.updateProfilePicForChat(message.from).catch(() => {});
      }

      // Download media if present
      let mediaUrl = undefined;
      let mimeType = undefined;
      let mediaData = undefined;

      if (message.hasMedia) {
        try {
          this.log.info(`   📥 Downloading media...`);
          const media = await message.downloadMedia();
          if (media) {
            mimeType = media.mimetype;
            // Create a data URL from the base64 data
            mediaUrl = `data:${media.mimetype};base64,${media.data}`;
            mediaData = {
              filename: media.filename,
              mimetype: media.mimetype,
              data: media.data
            };
            this.log.info(`   ✅ Media downloaded: ${media.mimetype}, ${media.data?.length || 0} bytes`);
          }
        } catch (mediaErr) {
          this.log.warn(`   ⚠️ Failed to download media: ${mediaErr.message}`);
        }
      }

      // Store message in Redis for fast retrieval (WhatsBots-style)
      if (redisService.isRedisAvailable()) {
        try {
          const redisMessage = {
            id: message.id._serialized,
            from: message.from,
            to: message.to,
            fromName: senderName,
            body: message.body,
            timestamp: message.timestamp,
            type: message.type,
            hasMedia: message.hasMedia,
            mediaType: message.type,
            author: message.author, // Group message actual sender
            fromMe: message.fromMe,
          };

          await redisService.storeMessage(this.accountId, redisMessage, mediaData);
          this.log.debug(`📦 Message stored in Redis: ${message.id._serialized}`);
        } catch (redisErr) {
          this.log.warn(`Failed to store message in Redis: ${redisErr.message}`);
        }
      }

      // Extract link preview data if available
      let linkPreview = null;
      if (message.links && message.links.length > 0) {
        linkPreview = {
          url: message.links[0].link,
          title: message.title || null,
          description: message.description || null,
          // Try to get thumbnail from raw data if available
          thumbnail: message._data?.thumbnail || message._data?.jpegThumbnail || null,
          matchedText: message._data?.matchedText || null,
          canonicalUrl: message._data?.canonicalUrl || null
        };
        this.log.debug(`   🔗 Link preview: ${linkPreview.title || linkPreview.url}`);
      }

      // Extract quoted/replied-to message context
      let quotedMessage = null;
      if (message.hasQuotedMsg) {
        try {
          const quoted = await message.getQuotedMessage();
          if (quoted) {
            quotedMessage = {
              id: quoted.id?._serialized,
              from: quoted.from,
              author: quoted.author,
              body: (quoted.body || '').substring(0, 500),
              timestamp: quoted.timestamp,
              type: quoted.type,
              fromMe: quoted.fromMe,
            };
            this.log.debug(`   ↩️ Reply to: "${(quoted.body || '').substring(0, 80)}"`);
          }
        } catch (quoteErr) {
          this.log.warn(`   ⚠️ Failed to get quoted message: ${quoteErr.message}`);
        }
      }

      // Emit unified message
      // Use fromMe to set correct direction - multi-device can sync own messages through 'message' event
      this.emit('message', {
        id: uuidv4(),
        externalId: message.id._serialized,
        platform: 'whatsapp',
        direction: message.fromMe ? 'outgoing' : 'incoming',
        from: message.from,
        to: message.to,
        sender: {
          id: senderId,
          name: senderName,
          phone: senderPhone,
          profilePicture: profilePicture
        },
        contentType: this.getContentType(message),
        text: message.body || undefined,
        hasMedia: message.hasMedia,
        mediaUrl: mediaUrl,
        mimeType: mimeType,
        mediaData: mediaData,
        timestamp: new Date(message.timestamp * 1000),
        isGroup: isGroup,
        groupId: isGroup ? message.from : undefined,
        groupName: groupName,
        linkPreview: linkPreview,
        quotedMessage: quotedMessage,
        raw: message
      });
    });

    // Message create event (includes outgoing)
    this.client.on('message_create', async (message) => {
      if (message.fromMe) {
        this.log.info(`📤 Message sent to: ${message.to}`);

        // Store outgoing message in Redis
        if (redisService.isRedisAvailable()) {
          try {
            let mediaData = null;
            if (message.hasMedia) {
              try {
                const media = await message.downloadMedia();
                if (media) {
                  mediaData = {
                    filename: media.filename,
                    mimetype: media.mimetype,
                    data: media.data
                  };
                }
              } catch (e) {
                // Media download failed - that's ok
              }
            }

            const redisMessage = {
              id: message.id._serialized,
              from: message.from,
              to: message.to,
              fromName: 'Me',
              body: message.body,
              timestamp: message.timestamp,
              type: message.type,
              hasMedia: message.hasMedia,
              mediaType: message.type,
              fromMe: true,
            };

            await redisService.storeMessage(this.accountId, redisMessage, mediaData);
            this.log.debug(`📦 Outgoing message stored in Redis: ${message.id._serialized}`);
          } catch (redisErr) {
            this.log.warn(`Failed to store outgoing message in Redis: ${redisErr.message}`);
          }
        }
      }
    });

    // Message acknowledgement (read receipts)
    // ack values: ACK_ERROR=-1, ACK_PENDING=0, ACK_SERVER=1, ACK_DEVICE=2, ACK_READ=3, ACK_PLAYED=4
    this.client.on('message_ack', async (message, ack) => {
      try {
        const statusMap = {
          0: 'pending',
          1: 'sent',
          2: 'delivered',
          3: 'read',
          4: 'read', // played (for voice messages)
        };
        const status = statusMap[ack] || 'sent';

        // Only process outgoing messages from this account
        if (message.fromMe) {
          const db = getDatabase();

          // Find the message by external_id
          const dbMessage = db.prepare(`
            SELECT m.id, m.conversation_id, c.agent_id
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE m.external_id = ? AND c.user_id = ?
          `).get(message.id?._serialized || message.id, this.userId);

          if (dbMessage) {
            // Update status in database with timestamp
            db.prepare(`UPDATE messages SET status = ?, status_updated_at = datetime('now') WHERE id = ?`).run(status, dbMessage.id);

            // Broadcast to WebSocket
            if (global.io) {
              const payload = {
                messageId: dbMessage.id,
                status,
                conversationId: dbMessage.conversation_id,
              };
              // Broadcast to conversation room
              global.io.to(`conversation:${dbMessage.conversation_id}`).emit('message:status_updated', payload);
              // Also broadcast to agent room
              if (dbMessage.agent_id) {
                global.io.to(`agent:${dbMessage.agent_id}`).emit('message:status_updated', payload);
              }
            }

            this.log.debug(`📬 Message ${dbMessage.id} status updated to: ${status}`);
          }
        }
      } catch (err) {
        this.log.debug(`Failed to update message ack: ${err.message}`);
      }
    });

    // Disconnected event
    this.client.on('disconnected', async (reason) => {
      this.log.warn(`Disconnected: ${reason}`);
      this.setStatus('disconnected');

      // Attempt reconnection
      if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts++;
        this.log.info(`Attempting reconnection (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

        await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));

        try {
          await this.connect();
        } catch (error) {
          this.log.error(`Reconnection failed: ${error.message}`);
        }
      } else {
        this.log.error('Max reconnection attempts reached');
        this.setStatus('error');
        this.updateAccountError('Max reconnection attempts reached');
      }

      this.emit('disconnected', reason);
    });

    // Auth failure
    this.client.on('auth_failure', (message) => {
      this.log.error(`Auth failure: ${message}`);
      this.setStatus('error');
      this.updateAccountError(`Authentication failed: ${message}`);
      this.emit('auth_failure', message);
    });

    // Error
    this.client.on('error', (error) => {
      this.log.error(`Client error: ${error.message}`);
      this.emit('error', error);
    });

    // Loading screen (progress indicator)
    this.client.on('loading_screen', (percent, message) => {
      this.log.info(`Loading: ${percent}% - ${message}`);
    });

    // State change
    this.client.on('change_state', (state) => {
      this.log.info(`State changed: ${state}`);
    });
  }

  /**
   * Send a text message
   */
  /**
   * Send typing indicator to a chat.
   * @param {string} chatId - Chat ID to send typing to
   * @param {number} durationMs - How long to show typing (default: 1500ms)
   */
  async sendTyping(chatId, durationMs = 1500) {
    if (!this.client || this.status !== 'connected') return;
    try {
      const normalizedChatId = this.normalizePhoneNumber(chatId);
      const chat = await this.client.getChatById(normalizedChatId);
      if (chat) {
        await chat.sendStateTyping();
        if (durationMs > 0) {
          await new Promise(resolve => setTimeout(resolve, durationMs));
          await chat.clearState();
        }
      }
    } catch (e) {
      // Non-critical - just log and continue
      this.log.debug(`Typing indicator failed: ${e.message}`);
    }
  }

  async sendMessage(chatId, text, options = {}) {
    if (!this.client || this.status !== 'connected') {
      throw new Error('WhatsApp client is not connected');
    }

    const startTime = Date.now();
    const metrics = getMetricsServiceSafe();
    const circuitBreaker = getCircuitBreakerSafe();

    // Normalize chat ID
    const normalizedChatId = this.normalizePhoneNumber(chatId);

    this.log.info(`Sending message to ${normalizedChatId}`);

    // Use circuit breaker if available
    const circuitKey = `whatsapp:${this.accountId}:send`;

    const sendOperation = async () => {
      const sentMessage = await this.client.sendMessage(normalizedChatId, text, options);
      return sentMessage;
    };

    try {
      let sentMessage;

      if (circuitBreaker) {
        // Check if circuit is open
        if (!circuitBreaker.canExecute(circuitKey)) {
          const status = circuitBreaker.getStatus(circuitKey);
          metrics?.recordError('whatsapp', this.accountId, 'circuit_open', 'Circuit breaker is open');
          metrics?.recordCircuitState('whatsapp', this.accountId, 'open');
          throw new Error(`Circuit breaker open. Retry after ${status.nextAttempt || 'unknown'}ms`);
        }

        sentMessage = await circuitBreaker.execute(circuitKey, sendOperation);
        circuitBreaker.recordSuccess(circuitKey);
      } else {
        sentMessage = await sendOperation();
      }

      // Record success metrics
      const duration = Date.now() - startTime;
      metrics?.recordMessageSent('whatsapp', this.accountId, duration, {
        chatId: normalizedChatId,
        hasMedia: false,
      });

      return {
        id: sentMessage.id._serialized,
        timestamp: new Date()
      };

    } catch (error) {
      // Record failure
      if (circuitBreaker) {
        circuitBreaker.recordFailure(circuitKey, error);
      }
      metrics?.recordError('whatsapp', this.accountId, 'send_failed', error.message);

      throw error;
    }
  }

  /**
   * Send media message
   */
  async sendMedia(chatId, mediaPath, caption = '', options = {}) {
    if (!this.client || this.status !== 'connected') {
      throw new Error('WhatsApp client is not connected');
    }

    const startTime = Date.now();
    const metrics = getMetricsServiceSafe();
    const circuitBreaker = getCircuitBreakerSafe();

    const normalizedChatId = this.normalizePhoneNumber(chatId);
    let media;

    if (mediaPath.startsWith('http://') || mediaPath.startsWith('https://')) {
      media = await MessageMedia.fromUrl(mediaPath);
    } else if (fs.existsSync(mediaPath)) {
      media = MessageMedia.fromFilePath(mediaPath);
    } else {
      throw new Error('Invalid media path');
    }

    const circuitKey = `whatsapp:${this.accountId}:send`;

    const sendOperation = async () => {
      const sentMessage = await this.client.sendMessage(normalizedChatId, media, {
        caption,
        ...options
      });
      return sentMessage;
    };

    try {
      let sentMessage;

      if (circuitBreaker && circuitBreaker.canExecute(circuitKey)) {
        sentMessage = await circuitBreaker.execute(circuitKey, sendOperation);
        circuitBreaker.recordSuccess(circuitKey);
      } else if (circuitBreaker && !circuitBreaker.canExecute(circuitKey)) {
        metrics?.recordError('whatsapp', this.accountId, 'circuit_open', 'Circuit breaker is open');
        throw new Error('Circuit breaker open');
      } else {
        sentMessage = await sendOperation();
      }

      // Record success metrics
      const duration = Date.now() - startTime;
      metrics?.recordMessageSent('whatsapp', this.accountId, duration, {
        chatId: normalizedChatId,
        hasMedia: true,
        mimeType: media.mimetype,
      });

      return {
        id: sentMessage.id._serialized,
        timestamp: new Date()
      };

    } catch (error) {
      if (circuitBreaker) {
        circuitBreaker.recordFailure(circuitKey, error);
      }
      metrics?.recordError('whatsapp', this.accountId, 'send_media_failed', error.message);

      throw error;
    }
  }

  /**
   * Get all chats
   * Note: Only call this after the 'ready' event - the internal WhatsApp stores
   * (window.WWebJS.getChatModel) are not available until then
   */
  async getChats() {
    if (!this.client || this.status !== 'connected') {
      return [];
    }

    if (!this.isReady) {
      this.log.warn('getChats called before client is ready - stores may not be available');
      return [];
    }

    const chats = await this.client.getChats();
    return chats.map(chat => ({
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage?.body,
      timestamp: chat.timestamp
    }));
  }

  /**
   * Get contacts
   */
  async getContacts() {
    if (!this.client || this.status !== 'connected') {
      return [];
    }

    let contacts = [];
    try {
      contacts = await this.client.getContacts();
    } catch (err) {
      this.log.error(`Failed to get contacts from WhatsApp: ${err.message}`);
      return [];
    }

    return contacts
      .filter(c => c && c.id && !c.isGroup && !c.isBusiness)
      .map(contact => ({
        id: contact.id._serialized,
        name: contact.name || contact.pushname || contact.number,
        number: contact.number,
        isBlocked: contact.isBlocked
      }));
  }

  /**
   * Get best sender info with profile picture
   * Uses Redis cache for performance, similar to old WhatsBots getBestSenderInfo
   * Priority: saved contact name > pushname > phone number
   *
   * @param {Object} message - WhatsApp message object
   * @returns {Object} { name, profilePicture }
   */
  async getBestSenderInfo(message) {
    try {
      const senderId = message.author || message.from;
      if (!senderId) return { name: 'Unknown', profilePicture: null };

      let profilePicture = null;
      let name = 'Unknown';

      // Check Redis cache first if available
      if (redisService.isRedisAvailable()) {
        const cachedContact = await redisService.getContact(this.accountId, senderId);
        if (cachedContact) {
          // Get name from cache (priority: saved name > pushname > phone)
          name = cachedContact.name || cachedContact.pushname || senderId;
          profilePicture = cachedContact.profilePicture || null;

          // If we have name but no profile picture, try to fetch it
          if (!profilePicture && this.client) {
            try {
              profilePicture = await this.client.getProfilePicUrl(senderId);
              // Update cache with profile picture
              if (profilePicture) {
                cachedContact.profilePicture = profilePicture;
                await redisService.storeContact(this.accountId, senderId, cachedContact);
              }
            } catch (err) {
              // Profile pic not available
            }
          }

          return { name, profilePicture };
        }
      }

      // Try to get contact from WhatsApp
      if (this.client) {
        try {
          const contact = await this.client.getContactById(senderId);
          if (contact) {
            // Try to get profile picture
            try {
              profilePicture = await this.client.getProfilePicUrl(senderId);
            } catch (err) {
              // Profile picture not available
            }

            // Priority: saved name > pushname > phone
            name = contact.name || contact.pushname || senderId;

            // Cache the contact with profile picture for future use
            if (redisService.isRedisAvailable()) {
              const contactData = {
                id: senderId,
                name: contact.name,
                pushname: contact.pushname,
                number: contact.number,
                profilePicture: profilePicture
              };
              await redisService.storeContact(this.accountId, senderId, contactData);
            }
          }
        } catch (err) {
          // Contact not available - use phone number
          name = senderId.replace('@c.us', '').replace('@g.us', '');
        }
      }

      return { name, profilePicture };
    } catch (err) {
      this.log.warn(`getBestSenderInfo error: ${err.message}`);
      return { name: 'Unknown', profilePicture: null };
    }
  }

  /**
   * Update profile picture for a chat/contact
   * Called on new messages and chat selection
   */
  async updateProfilePicForChat(chatId) {
    if (!this.client || this.status !== 'connected') return null;

    // Skip newsletters - they don't have contacts/profile pics in the traditional sense
    if (chatId.endsWith('@newsletter')) return null;

    try {
      const chat = await this.client.getChatById(chatId);
      if (!chat) return null;

      const contact = await chat.getContact();
      if (!contact) return null;

      const profilePicUrl = await contact.getProfilePicUrl();
      if (!profilePicUrl) return null;

      // Store in Redis
      if (redisService.isRedisAvailable()) {
        const cachedPic = await redisService.getProfilePic(this.accountId, chatId);

        // Update if changed or new
        if (profilePicUrl !== cachedPic) {
          await redisService.storeProfilePic(this.accountId, chatId, profilePicUrl);

          // Broadcast update via WebSocket
          if (global.io) {
            global.io.emit('profilePicUpdate', {
              accountId: this.accountId,
              chatId,
              profilePicUrl
            });
          }

          this.log.info(`Updated profile pic for chat ${chatId}`);
        }
      }

      return profilePicUrl;
    } catch (err) {
      this.log.warn(`Failed to update profile pic for ${chatId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Shared helper: Find existing contact by phone or merge by name, or create new.
   * Prevents duplicate contacts when WhatsApp returns multiple numbers (real + LID) for same person.
   *
   * @param {Object} db - Database instance
   * @param {string} userId - User ID
   * @param {string} phone - WhatsApp phone/LID number
   * @param {string} displayName - Contact display name
   * @param {string|null} profilePicUrl - Profile picture URL
   * @returns {{ contactId: string, action: 'created' | 'existing' | 'merged' }}
   */
  _findOrCreateContact(db, userId, phone, displayName, profilePicUrl) {
    // 1. Check if contact already exists by this exact phone number
    const existingByPhone = db.prepare(`
      SELECT c.id, c.avatar FROM contacts c
      JOIN contact_identifiers ci ON ci.contact_id = c.id
      WHERE c.user_id = ? AND ci.identifier_type = 'whatsapp' AND ci.identifier_value = ?
    `).get(userId, phone);

    if (existingByPhone) {
      // Update avatar if available
      if (profilePicUrl) {
        db.prepare(`
          UPDATE contacts SET avatar = ?, updated_at = datetime('now') WHERE id = ?
        `).run(profilePicUrl, existingByPhone.id);
      }
      return { contactId: existingByPhone.id, action: 'existing' };
    }

    // 2. If displayName is a real name (not just a phone number), try to find by name match
    //    This merges contacts when WhatsApp returns the same person with different numbers/LIDs
    const isPhoneAsName = /^\+?\d[\d\s\-()]{5,}$/.test(displayName.trim());
    if (!isPhoneAsName && displayName.length >= 2) {
      const existingByName = db.prepare(`
        SELECT c.id, c.avatar FROM contacts c
        JOIN contact_identifiers ci ON ci.contact_id = c.id
        WHERE c.user_id = ? AND c.display_name = ? AND ci.identifier_type = 'whatsapp'
        LIMIT 1
      `).get(userId, displayName);

      if (existingByName) {
        // Found contact with same name and at least one WhatsApp identifier -> merge
        // Add this phone as additional identifier (if not already present)
        const alreadyHasIdentifier = db.prepare(`
          SELECT 1 FROM contact_identifiers
          WHERE contact_id = ? AND identifier_type = 'whatsapp' AND identifier_value = ?
        `).get(existingByName.id, phone);

        if (!alreadyHasIdentifier) {
          db.prepare(`
            INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, is_primary, created_at)
            VALUES (?, ?, 'whatsapp', ?, 0, datetime('now'))
          `).run(uuidv4(), existingByName.id, phone);
        }

        // Update avatar if we have a newer one
        if (profilePicUrl) {
          db.prepare(`
            UPDATE contacts SET avatar = ?, updated_at = datetime('now') WHERE id = ?
          `).run(profilePicUrl, existingByName.id);
        }
        return { contactId: existingByName.id, action: 'merged' };
      }
    }

    // 3. No match found - create new contact
    const contactId = uuidv4();
    db.prepare(`
      INSERT INTO contacts (id, user_id, display_name, avatar, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(contactId, userId, displayName, profilePicUrl);

    db.prepare(`
      INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, is_primary, created_at)
      VALUES (?, ?, 'whatsapp', ?, 1, datetime('now'))
    `).run(uuidv4(), contactId, phone);

    return { contactId, action: 'created' };
  }

  /**
   * Resolve a @lid (Linked ID) to a phone number via WhatsApp contact lookup.
   * WhatsApp migrated some contacts from @c.us (phone-based) to @lid (opaque internal ID).
   * This method tries to resolve the phone number so we can match existing conversations.
   *
   * @param {string} chatId - The WhatsApp chat ID (e.g., "75896518094893@lid")
   * @returns {string|null} The resolved phone number, or null if resolution failed
   */
  async resolvePhoneFromLid(chatId) {
    if (!chatId || !chatId.endsWith('@lid')) return null;
    if (!this.client) return null;

    try {
      const contact = await this.client.getContactById(chatId);
      if (contact && contact.number) {
        this.log.debug(`Resolved @lid → phone: ${chatId} → ${contact.number}`);
        return contact.number;
      }
      // Some contacts expose id._serialized in @c.us format
      if (contact && contact.id?._serialized?.endsWith('@c.us')) {
        const phone = contact.id._serialized.replace('@c.us', '');
        this.log.debug(`Resolved @lid → phone (via id): ${chatId} → ${phone}`);
        return phone;
      }
    } catch (err) {
      this.log.debug(`Could not resolve @lid phone for ${chatId}: ${err.message}`);
    }
    return null;
  }

  /**
   * Find existing conversation by @lid chatId, falling back to phone@c.us match.
   * If found via phone match, updates the old conversation's external_id to the new @lid.
   *
   * @param {object} db - Database instance
   * @param {string} userId - User ID
   * @param {string} chatId - The current WhatsApp chat ID (may be @lid or @c.us)
   * @param {string|null} resolvedPhone - Phone number resolved from @lid (or null)
   * @returns {object|null} The conversation row, or null if not found
   */
  findConversationWithLidFallback(db, userId, agentId, chatId, resolvedPhone) {
    // 1. Try exact match first, scoped to this agent
    let conversation = db.prepare(`
      SELECT id, external_id FROM conversations
      WHERE user_id = ? AND agent_id = ? AND platform = 'whatsapp' AND external_id = ?
    `).get(userId, agentId, chatId);

    if (conversation) return conversation;

    // 2. If this is a @lid ID and we have a resolved phone, try matching by phone@c.us (same agent)
    if (chatId.endsWith('@lid') && resolvedPhone) {
      const phoneCusId = `${resolvedPhone}@c.us`;
      conversation = db.prepare(`
        SELECT id, external_id FROM conversations
        WHERE user_id = ? AND agent_id = ? AND platform = 'whatsapp' AND external_id = ?
      `).get(userId, agentId, phoneCusId);

      if (conversation) {
        // Migrate: update the old conversation's external_id to the new @lid format
        this.log.info(`Migrating conversation ${conversation.id}: ${phoneCusId} → ${chatId}`);
        db.prepare(`
          UPDATE conversations SET external_id = ?, updated_at = datetime('now') WHERE id = ?
        `).run(chatId, conversation.id);
        conversation.external_id = chatId;
        return conversation;
      }
    }

    // 3. If this is a @c.us ID, also check if a @lid conversation exists for same phone (same agent)
    if (chatId.endsWith('@c.us')) {
      const phone = chatId.replace('@c.us', '');
      const lidConversations = db.prepare(`
        SELECT c.id, c.external_id FROM conversations c
        WHERE c.user_id = ? AND c.agent_id = ? AND c.platform = 'whatsapp' AND c.external_id LIKE '%@lid'
      `).all(userId, agentId);

      if (lidConversations.length > 0 && lidConversations.length < 100) {
        for (const lidConv of lidConversations) {
          const contactMatch = db.prepare(`
            SELECT 1 FROM conversations conv
            JOIN contacts ct ON ct.id = conv.contact_id
            JOIN contact_identifiers ci ON ci.contact_id = ct.id
            WHERE conv.id = ? AND ci.identifier_type = 'whatsapp' AND ci.identifier_value = ?
          `).get(lidConv.id, phone);

          if (contactMatch) {
            this.log.info(`Found @lid conversation for phone ${phone}: ${lidConv.external_id} → ${chatId}`);
            db.prepare(`
              UPDATE conversations SET external_id = ?, updated_at = datetime('now') WHERE id = ?
            `).run(chatId, lidConv.id);
            lidConv.external_id = chatId;
            return lidConv;
          }
        }
      }
    }

    return null;
  }

  /**
   * Sync WhatsApp chats and contacts to SwarmAI database
   * Called automatically when WhatsApp connects
   */
  async syncToDatabase() {
    if (!this.client || this.status !== 'connected') {
      this.log.warn('Cannot sync: WhatsApp not connected');
      return { synced: false };
    }

    if (!this.isReady) {
      this.log.warn('Cannot sync: WhatsApp stores not ready yet (wait for ready event)');
      return { synced: false, error: 'Client not ready' };
    }

    const db = getDatabase();

    // Get user ID from platform account
    const account = db.prepare('SELECT user_id, agent_id FROM platform_accounts WHERE id = ?').get(this.accountId);
    if (!account) {
      this.log.error('Cannot sync: Platform account not found');
      return { synced: false };
    }

    const userId = account.user_id;
    const agentId = account.agent_id;
    let contactsSynced = 0;
    let conversationsSynced = 0;

    this.log.info('Starting auto-sync of WhatsApp data...');

    try {
      // 1. Sync contacts
      let waContacts = [];
      try {
        waContacts = await this.client.getContacts();
      } catch (err) {
        this.log.error(`Failed to get contacts during auto-sync: ${err.message}`);
        // Continue with empty contacts - don't abort the entire sync
      }
      this.log.info(`WhatsApp returned ${waContacts.length} total contacts`);

      const validContacts = waContacts.filter(c => c && c.id && !c.isGroup && c.number);
      this.log.info(`Valid contacts (non-group with number): ${validContacts.length}`);

      let contactsExisting = 0;
      let contactsMerged = 0;
      let contactErrors = 0;
      for (const waContact of validContacts) {
        try {
          const phone = waContact.number;
          if (!phone) {
            contactErrors++;
            continue;
          }

          // Sanitize and validate contact name
          const sanitizeContactName = (name) => {
            if (!name || typeof name !== 'string') return null;
            const cleaned = name.trim().replace(/[\x00-\x1F\x7F]/g, '');
            const hasValidChars = /[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF\u4E00-\u9FFF\uAC00-\uD7AF]{2,}/u.test(cleaned);
            if (!hasValidChars || cleaned.length < 2) return null;
            return cleaned;
          };

          const rawName = waContact.name || waContact.pushname;
          const validatedName = sanitizeContactName(rawName);
          const displayName = validatedName || `+${phone}`;

          let profilePicUrl = null;
          try {
            profilePicUrl = await waContact.getProfilePicUrl();
          } catch (picErr) {
            // Profile pic not available - that's ok
          }

          // Use shared dedup helper (checks by phone, then merges by name)
          const result = this._findOrCreateContact(db, userId, phone, displayName, profilePicUrl);
          if (result.action === 'created') contactsSynced++;
          else if (result.action === 'merged') contactsMerged++;
          else contactsExisting++;
        } catch (err) {
          contactErrors++;
          if (contactErrors <= 5) {
            this.log.warn(`Contact sync error: ${err.message}`);
          }
        }
      }
      if (contactErrors > 0) {
        this.log.warn(`Contact sync had ${contactErrors} errors`);
      }

      this.log.info(`Contacts: ${contactsSynced} new, ${contactsMerged} merged, ${contactsExisting} existing (total: ${validContacts.length})`);

      // 2. Sync chats (create conversations)
      let waChats = [];
      try {
        waChats = await this.client.getChats();
        this.log.info(`WhatsApp returned ${waChats.length} chats`);
      } catch (chatError) {
        this.log.warn(`Failed to get chats (client may not be ready): ${chatError.message}`);
        // Return partial success - contacts synced but chats failed
        return { synced: false, contactsSynced, conversationsSynced: 0, error: 'Chat sync pending' };
      }

      let conversationsExisting = 0;
      let conversationsSkipped = 0;
      for (const waChat of waChats) {
        try {
          const chatId = waChat.id._serialized;
          const isGroup = waChat.isGroup;

          // Skip chats without valid identifiers
          if (!chatId || chatId === '@c.us' || chatId === '@g.us') {
            conversationsSkipped++;
            continue;
          }

          // For 1:1 chats, get contact name + phone number for a better title
          let chatName = waChat.name;
          let contactId = null;

          // Resolve phone: for @c.us just strip suffix, for @lid resolve via WhatsApp API
          let phone;
          if (chatId.endsWith('@lid')) {
            phone = await this.resolvePhoneFromLid(chatId);
          } else {
            phone = chatId.replace('@c.us', '').replace('@g.us', '');
          }

          if (!isGroup) {
            if (phone) {
              // Look up contact info from our synced contacts
              const contact = db.prepare(`
                SELECT c.id, c.display_name FROM contacts c
                JOIN contact_identifiers ci ON ci.contact_id = c.id
                WHERE c.user_id = ? AND ci.identifier_type = 'whatsapp' AND ci.identifier_value = ?
              `).get(userId, phone);

              if (contact) {
                contactId = contact.id;
                chatName = contact.display_name ? `${contact.display_name} (+${phone})` : `+${phone}`;
              } else {
                chatName = `+${phone}`;
              }
            } else {
              // @lid with no phone resolution - use chat name or fallback
              chatName = chatName || waChat.name || 'Unknown Contact';
            }
          } else {
            // For groups, use the group name or fallback
            chatName = chatName || 'Group Chat';

            // Create or find contact for this group
            // This allows groups to be searchable in the Contacts tab
            const existingGroupContact = db.prepare(`
              SELECT c.id, c.display_name FROM contacts c
              JOIN contact_identifiers ci ON ci.contact_id = c.id
              WHERE c.user_id = ? AND ci.identifier_type = 'whatsapp' AND ci.identifier_value = ?
            `).get(userId, chatId);

            if (existingGroupContact) {
              contactId = existingGroupContact.id;
              // Only update if new name is valid and actually different
              // Avoid overwriting good names with 'Group Chat' fallback or empty values
              const currentName = existingGroupContact.display_name;
              const rawGroupName = waChat.name; // Use raw name before fallback
              if (rawGroupName && rawGroupName !== 'undefined' && rawGroupName !== currentName) {
                db.prepare(`
                  UPDATE contacts SET display_name = ?, updated_at = datetime('now') WHERE id = ?
                `).run(rawGroupName, contactId);
                this.log.debug(`Updated group name: ${currentName} → ${rawGroupName}`);
              }
            } else {
              // Create contact for this group
              contactId = uuidv4();

              // Try to get group profile picture
              let groupPicUrl = null;
              try {
                groupPicUrl = await waChat.getProfilePicUrl();
              } catch (picErr) {
                // Profile pic not available - that's ok
              }

              db.prepare(`
                INSERT INTO contacts (id, user_id, display_name, avatar, contact_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'group', datetime('now'), datetime('now'))
              `).run(contactId, userId, chatName, groupPicUrl);

              // Add WhatsApp group identifier
              db.prepare(`
                INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, is_primary, created_at)
                VALUES (?, ?, 'whatsapp', ?, 1, datetime('now'))
              `).run(uuidv4(), contactId, chatId);

              this.log.debug(`Created group contact: ${chatName} (${chatId})`);
            }
          }

          // Check if conversation exists (with @lid fallback matching)
          let conversation = this.findConversationWithLidFallback(db, userId, agentId, chatId, phone);

          // Use WhatsApp chat timestamp as last_message_at
          const chatLastMsgAt = waChat.timestamp
            ? new Date(waChat.timestamp * 1000).toISOString()
            : null;

          if (!conversation) {
            // Create conversation - detect category from chatId
            const conversationId = uuidv4();
            let category = 'chat';
            if (chatId.includes('@newsletter')) {
              category = 'news';
            } else if (chatId.includes('@broadcast') || chatId === 'status@broadcast') {
              category = 'status';
            }

            db.prepare(`
              INSERT INTO conversations (id, user_id, agent_id, platform, external_id, title, is_group, contact_id, category, last_message_at, created_at, updated_at)
              VALUES (?, ?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `).run(conversationId, userId, agentId, chatId, chatName, isGroup ? 1 : 0, contactId, category, chatLastMsgAt);

            conversationsSynced++;
          } else {
            // Update last_message_at from WhatsApp if we don't have messages yet
            if (chatLastMsgAt) {
              db.prepare(`
                UPDATE conversations
                SET last_message_at = COALESCE(
                  (SELECT created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1),
                  ?
                ),
                updated_at = datetime('now')
                WHERE id = ? AND last_message_at IS NULL
              `).run(conversation.id, chatLastMsgAt, conversation.id);
            }
            conversationsExisting++;
          }
        } catch (err) {
          // Skip individual chat errors
          this.log.debug(`Chat sync error: ${err.message}`);
        }
      }

      if (conversationsSkipped > 0) {
        this.log.info(`Skipped ${conversationsSkipped} invalid chats`);
      }

      this.log.info(`Conversations: ${conversationsSynced} new, ${conversationsExisting} existing (total: ${waChats.length})`);

      // 3. Link existing unlinked conversations to contacts
      // This fixes conversations created before the sync was fixed
      let conversationsLinked = 0;
      const unlinkedConversations = db.prepare(`
        SELECT id, external_id, title
        FROM conversations
        WHERE user_id = ? AND platform = 'whatsapp' AND contact_id IS NULL AND is_group = 0
      `).all(userId);

      for (const conv of unlinkedConversations) {
        try {
          // Extract phone from external_id (format: 60123456789@c.us)
          const phone = conv.external_id?.replace('@c.us', '');
          if (!phone) continue;

          // Find contact by phone
          const contact = db.prepare(`
            SELECT c.id, c.display_name FROM contacts c
            JOIN contact_identifiers ci ON ci.contact_id = c.id
            WHERE c.user_id = ? AND ci.identifier_type = 'whatsapp' AND ci.identifier_value = ?
          `).get(userId, phone);

          if (contact) {
            // Update conversation with contact_id and better title
            const newTitle = contact.display_name ? `${contact.display_name} (+${phone})` : `+${phone}`;
            db.prepare(`
              UPDATE conversations
              SET contact_id = ?, title = ?, updated_at = datetime('now')
              WHERE id = ?
            `).run(contact.id, newTitle, conv.id);
            conversationsLinked++;
          }
        } catch (err) {
          this.log.debug(`Link conversation error: ${err.message}`);
        }
      }

      if (conversationsLinked > 0) {
        this.log.info(`Linked ${conversationsLinked} existing conversations to contacts`);
      }

      // Broadcast sync complete via WebSocket
      if (global.wsBroadcast) {
        global.wsBroadcast('whatsapp:sync_complete', {
          accountId: this.accountId,
          agentId,
          contactsSynced,
          conversationsSynced
        });
      }

      // Skip bulk message sync - WhatsApp Web.js only returns messages for chats
      // already loaded in browser memory (almost always empty after restart).
      // Messages are loaded on-demand via lazy-load when user opens a chat.
      let messagesSynced = 0;
      this.log.info('Skipping bulk message sync (messages loaded on-demand via lazy-load when chats are opened)');

      // Broadcast sync complete via WebSocket
      if (global.wsBroadcast) {
        global.wsBroadcast('whatsapp:sync_complete', {
          accountId: this.accountId,
          agentId,
          contactsSynced,
          conversationsSynced,
          messagesSynced
        });
      }

      return { synced: true, contactsSynced, conversationsSynced, messagesSynced };

    } catch (error) {
      this.log.error(`Sync failed: ${error.message}`);
      return { synced: false, error: error.message };
    }
  }

  /**
   * Sync WhatsApp data to database with detailed progress tracking
   * This method emits progress events for each step (contacts, chats, messages)
   *
   * @param {Function} onProgress - Callback function to receive progress updates
   * Progress object format:
   * {
   *   step: 'contacts' | 'chats' | 'messages',
   *   current: number,
   *   total: number,
   *   message: string,
   *   subStep?: { current: number, total: number, chatName: string } // For messages within a chat
   * }
   *
   * @returns {Object} Sync result with detailed stats
   */
  async syncToDatabaseWithProgress(onProgress = () => {}) {
    if (!this.client || this.status !== 'connected') {
      this.log.warn('Cannot sync: WhatsApp not connected');
      return { synced: false, error: 'WhatsApp not connected' };
    }

    if (!this.isReady) {
      this.log.warn('Cannot sync: WhatsApp stores not ready yet');
      return { synced: false, error: 'Client not ready' };
    }

    const db = getDatabase();

    // Get user ID from platform account
    const account = db.prepare('SELECT user_id, agent_id FROM platform_accounts WHERE id = ?').get(this.accountId);
    if (!account) {
      this.log.error('Cannot sync: Platform account not found');
      return { synced: false, error: 'Platform account not found' };
    }

    const userId = account.user_id;
    const agentId = account.agent_id;

    let contactsSynced = 0;
    let contactsExisting = 0;
    let contactErrors = 0;
    let conversationsSynced = 0;
    let conversationsExisting = 0;
    let conversationsSkipped = 0;
    let messagesSynced = 0;

    this.log.info('Starting sync with detailed progress tracking...');

    try {
      // ============================================
      // STEP 1: Get and count contacts
      // ============================================
      onProgress({
        step: 'contacts',
        phase: 'fetching',
        current: 0,
        total: 0,
        message: 'Fetching contacts from WhatsApp...'
      });

      let waContacts = [];
      try {
        waContacts = await this.client.getContacts();
      } catch (err) {
        this.log.error(`Failed to get contacts: ${err.message}`);
        // Continue with empty contacts instead of aborting - chat sync can still proceed
        waContacts = [];
      }

      const validContacts = waContacts.filter(c => c && c.id && !c.isGroup && c.number);
      const totalContacts = validContacts.length;

      this.log.info(`Found ${totalContacts} valid contacts to sync`);

      onProgress({
        step: 'contacts',
        phase: 'syncing',
        current: 0,
        total: totalContacts,
        message: `Starting contact sync (${totalContacts} contacts)...`
      });

      // ============================================
      // STEP 2: Sync contacts with progress (dedup by phone + name)
      // ============================================
      let contactsMerged = 0;
      for (let i = 0; i < validContacts.length; i++) {
        const waContact = validContacts[i];

        try {
          const phone = waContact.number;
          if (!phone) {
            contactErrors++;
            continue;
          }

          // Sanitize and validate contact name
          const sanitizeContactName = (name) => {
            if (!name || typeof name !== 'string') return null;
            const cleaned = name.trim().replace(/[\x00-\x1F\x7F]/g, '');
            const hasValidChars = /[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF\u4E00-\u9FFF\uAC00-\uD7AF]{2,}/u.test(cleaned);
            if (!hasValidChars || cleaned.length < 2) return null;
            return cleaned;
          };

          const rawName = waContact.name || waContact.pushname;
          const validatedName = sanitizeContactName(rawName);
          const displayName = validatedName || `+${phone}`;

          let profilePicUrl = null;
          try {
            profilePicUrl = await waContact.getProfilePicUrl();
          } catch (picErr) {
            // Profile pic not available - that's ok
          }

          // Use shared dedup helper (checks by phone, then merges by name)
          const result = this._findOrCreateContact(db, userId, phone, displayName, profilePicUrl);
          if (result.action === 'created') contactsSynced++;
          else if (result.action === 'merged') contactsMerged++;
          else contactsExisting++;
        } catch (err) {
          contactErrors++;
          if (contactErrors <= 5) {
            this.log.warn(`Contact sync error: ${err.message}`);
          }
        }

        // Emit progress every 10 contacts or on last one
        if ((i + 1) % 10 === 0 || i === validContacts.length - 1) {
          onProgress({
            step: 'contacts',
            phase: 'syncing',
            current: i + 1,
            total: totalContacts,
            message: `Syncing contact ${i + 1}/${totalContacts}`,
            stats: { synced: contactsSynced, merged: contactsMerged, existing: contactsExisting, errors: contactErrors }
          });
        }
      }

      this.log.info(`Contacts: ${contactsSynced} new, ${contactsMerged} merged, ${contactsExisting} existing, ${contactErrors} errors`);

      // ============================================
      // STEP 3: Get chats with retry
      // ============================================
      onProgress({
        step: 'chats',
        phase: 'fetching',
        current: 0,
        total: 0,
        message: 'Fetching chat list from WhatsApp...'
      });

      let waChats = [];
      let chatFetchAttempts = 0;
      const maxChatFetchAttempts = 3;

      while (chatFetchAttempts < maxChatFetchAttempts) {
        try {
          chatFetchAttempts++;
          waChats = await this.client.getChats();
          this.log.info(`WhatsApp returned ${waChats.length} chats (attempt ${chatFetchAttempts})`);
          break;
        } catch (chatError) {
          this.log.warn(`Failed to get chats (attempt ${chatFetchAttempts}): ${chatError.message}`);
          if (chatFetchAttempts >= maxChatFetchAttempts) {
            onProgress({
              step: 'chats',
              phase: 'error',
              current: 0,
              total: 0,
              message: `Failed to get chat list after ${maxChatFetchAttempts} attempts: ${chatError.message}`
            });
            return {
              synced: false,
              contactsSynced,
              conversationsSynced: 0,
              messagesSynced: 0,
              error: `Chat sync failed: ${chatError.message}`
            };
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Filter out invalid chats
      const validChats = waChats.filter(c => {
        const chatId = c.id._serialized;
        return chatId && chatId !== '@c.us' && chatId !== '@g.us';
      });
      const totalChats = validChats.length;

      this.log.info(`Found ${totalChats} valid chats to sync`);

      onProgress({
        step: 'chats',
        phase: 'syncing',
        current: 0,
        total: totalChats,
        message: `Starting chat sync (${totalChats} chats)...`
      });

      // ============================================
      // STEP 4: Sync chats with progress
      // ============================================
      for (let i = 0; i < validChats.length; i++) {
        const waChat = validChats[i];

        try {
          const chatId = waChat.id._serialized;
          const isGroup = waChat.isGroup;

          // For 1:1 chats, get contact name
          let chatName = waChat.name;
          let contactId = null;

          // Resolve phone: for @c.us just strip suffix, for @lid resolve via WhatsApp API
          let phone;
          if (chatId.endsWith('@lid')) {
            phone = await this.resolvePhoneFromLid(chatId);
          } else {
            phone = chatId.replace('@c.us', '').replace('@g.us', '');
          }

          if (!isGroup) {
            if (phone) {
              const contact = db.prepare(`
                SELECT c.id, c.display_name FROM contacts c
                JOIN contact_identifiers ci ON ci.contact_id = c.id
                WHERE c.user_id = ? AND ci.identifier_type = 'whatsapp' AND ci.identifier_value = ?
              `).get(userId, phone);

              if (contact) {
                contactId = contact.id;
                chatName = contact.display_name ? `${contact.display_name} (+${phone})` : `+${phone}`;
              } else {
                chatName = `+${phone}`;
              }
            } else {
              chatName = chatName || waChat.name || 'Unknown Contact';
            }
          } else {
            chatName = chatName || 'Group Chat';
          }

          // Check if conversation exists (with @lid fallback matching)
          let conversation = this.findConversationWithLidFallback(db, userId, agentId, chatId, phone);

          // Use WhatsApp chat timestamp as last_message_at
          const chatLastMsgAt = waChat.timestamp
            ? new Date(waChat.timestamp * 1000).toISOString()
            : null;

          if (!conversation) {
            // Create conversation
            const conversationId = uuidv4();
            let category = 'chat';
            if (chatId.includes('@newsletter')) {
              category = 'news';
            } else if (chatId.includes('@broadcast') || chatId === 'status@broadcast') {
              category = 'status';
            }

            db.prepare(`
              INSERT INTO conversations (id, user_id, agent_id, platform, external_id, title, is_group, contact_id, category, last_message_at, created_at, updated_at)
              VALUES (?, ?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `).run(conversationId, userId, agentId, chatId, chatName, isGroup ? 1 : 0, contactId, category, chatLastMsgAt);

            conversationsSynced++;
          } else {
            // Update last_message_at from WhatsApp if we don't have messages yet
            if (chatLastMsgAt) {
              db.prepare(`
                UPDATE conversations
                SET last_message_at = COALESCE(
                  (SELECT created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1),
                  ?
                ),
                updated_at = datetime('now')
                WHERE id = ? AND last_message_at IS NULL
              `).run(conversation.id, chatLastMsgAt, conversation.id);
            }
            conversationsExisting++;
          }
        } catch (err) {
          conversationsSkipped++;
          this.log.debug(`Chat sync error: ${err.message}`);
        }

        // Emit progress every 5 chats or on last one
        if ((i + 1) % 5 === 0 || i === validChats.length - 1) {
          onProgress({
            step: 'chats',
            phase: 'syncing',
            current: i + 1,
            total: totalChats,
            message: `Syncing chat ${i + 1}/${totalChats}`,
            stats: { synced: conversationsSynced, existing: conversationsExisting, skipped: conversationsSkipped }
          });
        }
      }

      this.log.info(`Conversations: ${conversationsSynced} new, ${conversationsExisting} existing, ${conversationsSkipped} skipped`);

      // ============================================
      // STEP 5: Link unlinked conversations
      // ============================================
      let conversationsLinked = 0;
      const unlinkedConversations = db.prepare(`
        SELECT id, external_id, title
        FROM conversations
        WHERE user_id = ? AND platform = 'whatsapp' AND contact_id IS NULL AND is_group = 0
      `).all(userId);

      for (const conv of unlinkedConversations) {
        try {
          const phone = conv.external_id?.replace('@c.us', '');
          if (!phone) continue;

          const contact = db.prepare(`
            SELECT c.id, c.display_name FROM contacts c
            JOIN contact_identifiers ci ON ci.contact_id = c.id
            WHERE c.user_id = ? AND ci.identifier_type = 'whatsapp' AND ci.identifier_value = ?
          `).get(userId, phone);

          if (contact) {
            const newTitle = contact.display_name ? `${contact.display_name} (+${phone})` : `+${phone}`;
            db.prepare(`
              UPDATE conversations
              SET contact_id = ?, title = ?, updated_at = datetime('now')
              WHERE id = ?
            `).run(contact.id, newTitle, conv.id);
            conversationsLinked++;
          }
        } catch (err) {
          this.log.debug(`Link conversation error: ${err.message}`);
        }
      }

      if (conversationsLinked > 0) {
        this.log.info(`Linked ${conversationsLinked} existing conversations to contacts`);
      }

      // ============================================
      // STEP 6: Skip bulk message sync
      // ============================================
      // WhatsApp Web.js only returns messages for chats already loaded in browser memory.
      // Messages are loaded on-demand via lazy-load when user opens a chat.
      this.log.info('Skipping bulk message sync (messages loaded on-demand via lazy-load when chats are opened)');
      let messagesSynced = 0;

      // ============================================
      // STEP 7: Complete
      // ============================================
      onProgress({
        step: 'complete',
        phase: 'done',
        current: 1,
        total: 1,
        message: 'Sync completed successfully!',
        stats: {
          contactsSynced,
          contactsExisting,
          contactErrors,
          conversationsSynced,
          conversationsExisting,
          conversationsSkipped,
          conversationsLinked,
          messagesSynced
        }
      });

      // Broadcast sync complete via WebSocket
      if (global.wsBroadcast) {
        global.wsBroadcast('whatsapp:sync_complete', {
          accountId: this.accountId,
          agentId,
          contactsSynced,
          conversationsSynced,
          messagesSynced
        });
      }

      return {
        synced: true,
        contactsSynced,
        contactsExisting,
        contactErrors,
        conversationsSynced,
        conversationsExisting,
        conversationsSkipped,
        conversationsLinked,
        messagesSynced
      };

    } catch (error) {
      this.log.error(`Sync failed: ${error.message}`);
      onProgress({
        step: 'error',
        phase: 'error',
        current: 0,
        total: 0,
        message: `Sync failed: ${error.message}`
      });
      return { synced: false, error: error.message };
    }
  }

  /**
   * Sync messages for a single chat
   * Used by both background sync and on-demand sync
   * Downloads media for image/video/audio/document messages
   * @param {Object} waChat - WhatsApp chat object
   * @param {string} conversationId - Database conversation ID
   * @param {string} userId - User ID
   * @param {number} limit - Max messages to fetch
   * @param {boolean} downloadMedia - Whether to download media (default: true)
   * @returns {number} Number of messages synced
   */
  async syncMessagesForChat(waChat, conversationId, userId, limit = 100, downloadMedia = true) {
    const db = getDatabase();
    let synced = 0;

    try {
      // Fetch messages from WhatsApp
      const messages = await waChat.fetchMessages({ limit });

      if (messages.length === 0) {
        this.log.debug(`  fetchMessages returned 0 messages for conversation ${conversationId} (limit: ${limit})`);
      } else {
        this.log.debug(`  fetchMessages returned ${messages.length} messages for conversation ${conversationId}`);
      }

      for (const msg of messages) {
        try {
          const externalId = msg.id._serialized;

          // Check if message already exists
          const existing = db.prepare(`
            SELECT id FROM messages WHERE external_id = ? AND conversation_id = ?
          `).get(externalId, conversationId);

          if (existing) continue;

          // Get sender info (priority: saved name > pushname > phone)
          const contact = await msg.getContact().catch(() => null);
          const senderName = contact?.name || contact?.pushname || msg.from?.replace('@c.us', '') || 'Unknown';
          const senderId = msg.from;

          // Determine direction
          const direction = msg.fromMe ? 'outgoing' : 'incoming';

          // Get content type
          const contentType = this.getContentType(msg);

          // Skip notification-type messages (e2e_notification, gp2, etc.) - not useful for users
          if (['e2e_notification', 'notification_template', 'gp2', 'notification'].includes(msg.type)) continue;

          // Generate descriptive content for special message types with empty body
          let messageBody = msg.body || '';
          if (!messageBody) {
            if (msg.type === 'call_log') {
              messageBody = 'Phone call';
            } else if (msg.type === 'revoked') {
              messageBody = 'This message was deleted';
            }
          }

          // Download media if present and enabled
          let mediaUrl = null;
          let mimeType = null;

          if (downloadMedia && msg.hasMedia) {
            try {
              this.log.debug(`   📥 Downloading media for message ${externalId.substring(0, 20)}...`);
              const media = await msg.downloadMedia();
              if (media && media.data) {
                mimeType = media.mimetype;
                mediaUrl = `data:${media.mimetype};base64,${media.data}`;
                this.log.debug(`   ✅ Media downloaded: ${media.mimetype}, ${media.data.length} bytes`);
              }
            } catch (mediaErr) {
              this.log.debug(`   ⚠️ Failed to download media: ${mediaErr.message}`);
              // Continue without media - still save the message
            }
          }

          // Insert message with media (use INSERT OR IGNORE as safety net for deduplication)
          // Store timestamp as ISO 8601 with 'Z' UTC suffix so frontend can convert to local timezone
          const messageId = uuidv4();
          const createdAtUtc = new Date(msg.timestamp * 1000).toISOString();
          const insertResult = db.prepare(`
            INSERT OR IGNORE INTO messages (id, conversation_id, direction, content_type, content, media_url, media_mime_type, external_id, sender_id, sender_name, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', ?)
          `).run(
            messageId,
            conversationId,
            direction,
            contentType,
            messageBody,
            mediaUrl,
            mimeType,
            externalId,
            senderId,
            senderName,
            createdAtUtc
          );

          // Only count if actually inserted (not ignored due to duplicate)
          if (insertResult.changes > 0) {
            synced++;
          }
        } catch (msgErr) {
          // Skip individual message errors
          this.log.debug(`Message sync error: ${msgErr.message}`);
        }
      }

      // Update conversation's last_message_at with ISO UTC timestamp
      if (messages.length > 0) {
        const latestTimestamp = Math.max(...messages.map(m => m.timestamp || 0));
        if (latestTimestamp) {
          const lastMsgUtc = new Date(latestTimestamp * 1000).toISOString();
          db.prepare(`
            UPDATE conversations
            SET last_message_at = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(lastMsgUtc, conversationId);
        }
      }

    } catch (err) {
      this.log.warn(`syncMessagesForChat error for conversation ${conversationId}: ${err.message}`);
    }

    return synced;
  }

  /**
   * Fetch messages for a specific conversation (on-demand sync)
   * Called when user opens a conversation
   * @param {string} conversationId - Database conversation ID
   * @param {number} limit - Max messages to fetch
   * @returns {Object} Sync result
   */
  async fetchMessagesForConversation(conversationId, limit = 100) {
    if (!this.client || this.status !== 'connected' || !this.isReady) {
      return { synced: false, error: 'WhatsApp not ready' };
    }

    const db = getDatabase();

    // Get conversation details
    const conversation = db.prepare(`
      SELECT id, external_id, user_id FROM conversations WHERE id = ?
    `).get(conversationId);

    if (!conversation || !conversation.external_id) {
      return { synced: false, error: 'Conversation not found' };
    }

    const externalId = conversation.external_id;

    // Validate external_id format - must be a valid WhatsApp chat ID
    if (!externalId.endsWith('@c.us') && !externalId.endsWith('@g.us') && !externalId.endsWith('@lid')) {
      this.log.debug(`Skipping lazy-load for non-standard chat ID: ${externalId}`);
      return { synced: false, error: 'Not a standard WhatsApp chat' };
    }

    try {
      // Get WhatsApp chat by ID - may throw minified errors for invalid/archived chats
      let waChat;
      try {
        waChat = await this.client.getChatById(externalId);
      } catch (chatErr) {
        this.log.debug(`getChatById failed for ${externalId}: ${chatErr.message || chatErr}`);
        return { synced: false, error: `Chat not accessible: ${externalId}` };
      }

      if (!waChat) {
        return { synced: false, error: 'WhatsApp chat not found' };
      }

      const messagesSynced = await this.syncMessagesForChat(waChat, conversationId, conversation.user_id, limit);

      if (messagesSynced > 0) {
        this.log.info(`On-demand sync: ${messagesSynced} messages for conversation ${conversationId} (${externalId})`);
      }

      return { synced: true, messagesSynced };
    } catch (error) {
      this.log.warn(`fetchMessagesForConversation error for ${externalId}: ${error.message || error}`);
      return { synced: false, error: error.message };
    }
  }

  /**
   * Sync only contacts from WhatsApp to database
   * This is a non-destructive incremental sync (creates new, updates existing)
   *
   * @param {Function} onProgress - Callback function to receive progress updates
   * @returns {Object} Sync result with stats
   */
  async syncContactsOnly(onProgress = () => {}) {
    if (!this.client || this.status !== 'connected') {
      this.log.warn('Cannot sync contacts: WhatsApp not connected');
      return { synced: false, error: 'WhatsApp not connected' };
    }

    if (!this.isReady) {
      this.log.warn('Cannot sync contacts: WhatsApp stores not ready yet');
      return { synced: false, error: 'Client not ready' };
    }

    const db = getDatabase();

    // Get user ID from platform account
    const account = db.prepare('SELECT user_id, agent_id FROM platform_accounts WHERE id = ?').get(this.accountId);
    if (!account) {
      this.log.error('Cannot sync: Platform account not found');
      return { synced: false, error: 'Platform account not found' };
    }

    const userId = account.user_id;
    let contactsSynced = 0;
    let contactsExisting = 0;
    let contactErrors = 0;

    this.log.info('Starting contacts-only sync...');

    try {
      // Fetch contacts from WhatsApp
      onProgress({
        phase: 'fetching',
        current: 0,
        total: 0,
        message: 'Fetching contacts from WhatsApp...'
      });

      let waContacts = [];
      try {
        waContacts = await this.client.getContacts();
      } catch (err) {
        this.log.error(`Failed to get contacts: ${err.message}`);
        // Continue with empty contacts instead of aborting
        waContacts = [];
      }

      const validContacts = waContacts.filter(c => c && c.id && !c.isGroup && c.number);
      const totalContacts = validContacts.length;

      this.log.info(`Found ${totalContacts} valid contacts to sync`);

      onProgress({
        phase: 'syncing',
        current: 0,
        total: totalContacts,
        message: `Starting contact sync (${totalContacts} contacts)...`
      });

      // Sync each contact (dedup by phone + name)
      let contactsMerged = 0;
      for (let i = 0; i < validContacts.length; i++) {
        const waContact = validContacts[i];

        try {
          const phone = waContact.number;
          if (!phone) {
            contactErrors++;
            continue;
          }

          // Sanitize and validate contact name
          const sanitizeContactName = (name) => {
            if (!name || typeof name !== 'string') return null;
            const cleaned = name.trim().replace(/[\x00-\x1F\x7F]/g, '');
            const hasValidChars = /[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF\u4E00-\u9FFF\uAC00-\uD7AF]{2,}/u.test(cleaned);
            if (!hasValidChars || cleaned.length < 2) return null;
            return cleaned;
          };

          const rawName = waContact.name || waContact.pushname;
          const validatedName = sanitizeContactName(rawName);
          const displayName = validatedName || `+${phone}`;

          let profilePicUrl = null;
          try {
            profilePicUrl = await waContact.getProfilePicUrl();
          } catch (picErr) {
            // Profile pic not available - that's ok
          }

          // Use shared dedup helper (checks by phone, then merges by name)
          const result = this._findOrCreateContact(db, userId, phone, displayName, profilePicUrl);
          if (result.action === 'created') contactsSynced++;
          else if (result.action === 'merged') contactsMerged++;
          else contactsExisting++;
        } catch (err) {
          contactErrors++;
          if (contactErrors <= 5) {
            this.log.warn(`Contact sync error: ${err.message}`);
          }
        }

        // Emit progress every 10 contacts or on last one
        if ((i + 1) % 10 === 0 || i === validContacts.length - 1) {
          onProgress({
            phase: 'syncing',
            current: i + 1,
            total: totalContacts,
            message: `Syncing contact ${i + 1}/${totalContacts}`,
            stats: { synced: contactsSynced, merged: contactsMerged, existing: contactsExisting, errors: contactErrors }
          });
        }
      }

      this.log.info(`Contacts: ${contactsSynced} new, ${contactsMerged} merged, ${contactsExisting} existing, ${contactErrors} errors`);

      return {
        synced: true,
        contactsSynced,
        contactsMerged,
        contactsExisting,
        contactErrors
      };

    } catch (error) {
      this.log.error(`Contact sync failed: ${error.message}`);
      return { synced: false, error: error.message };
    }
  }

  /**
   * Sync only chats and messages from WhatsApp to database
   * This is a non-destructive incremental sync (creates new, updates existing)
   *
   * @param {Function} onProgress - Callback function to receive progress updates
   * @returns {Object} Sync result with stats
   */
  async syncChatsAndMessages(onProgress = () => {}) {
    if (!this.client || this.status !== 'connected') {
      this.log.warn('Cannot sync chats: WhatsApp not connected');
      return { synced: false, error: 'WhatsApp not connected' };
    }

    if (!this.isReady) {
      this.log.warn('Cannot sync chats: WhatsApp stores not ready yet');
      return { synced: false, error: 'Client not ready' };
    }

    const db = getDatabase();

    // Get user ID from platform account
    const account = db.prepare('SELECT user_id, agent_id FROM platform_accounts WHERE id = ?').get(this.accountId);
    if (!account) {
      this.log.error('Cannot sync: Platform account not found');
      return { synced: false, error: 'Platform account not found' };
    }

    const userId = account.user_id;
    const agentId = account.agent_id;

    let conversationsSynced = 0;
    let conversationsExisting = 0;
    let conversationsSkipped = 0;
    let messagesSynced = 0;

    this.log.info('Starting chats and messages sync...');

    try {
      // Get chats with retry
      onProgress({
        phase: 'fetching',
        current: 0,
        total: 0,
        message: 'Fetching chat list from WhatsApp...'
      });

      let waChats = [];
      let chatFetchAttempts = 0;
      const maxChatFetchAttempts = 3;

      while (chatFetchAttempts < maxChatFetchAttempts) {
        try {
          chatFetchAttempts++;
          waChats = await this.client.getChats();
          this.log.info(`WhatsApp returned ${waChats.length} chats (attempt ${chatFetchAttempts})`);
          break;
        } catch (chatError) {
          this.log.warn(`Failed to get chats (attempt ${chatFetchAttempts}): ${chatError.message}`);
          if (chatFetchAttempts >= maxChatFetchAttempts) {
            onProgress({
              phase: 'error',
              current: 0,
              total: 0,
              message: `Failed to get chat list after ${maxChatFetchAttempts} attempts: ${chatError.message}`
            });
            return {
              synced: false,
              conversationsSynced: 0,
              messagesSynced: 0,
              error: `Chat sync failed: ${chatError.message}`
            };
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Filter out invalid chats
      const validChats = waChats.filter(c => {
        const chatId = c.id._serialized;
        return chatId && chatId !== '@c.us' && chatId !== '@g.us';
      });
      const totalChats = validChats.length;

      this.log.info(`Found ${totalChats} valid chats to sync`);

      onProgress({
        phase: 'syncing_chats',
        current: 0,
        total: totalChats,
        message: `Starting chat sync (${totalChats} chats)...`
      });

      // Sync chats
      for (let i = 0; i < validChats.length; i++) {
        const waChat = validChats[i];

        try {
          const chatId = waChat.id._serialized;
          const isGroup = waChat.isGroup;

          // For 1:1 chats, get contact name
          let chatName = waChat.name;
          let contactId = null;

          // Resolve phone: for @c.us just strip suffix, for @lid resolve via WhatsApp API
          let phone;
          if (chatId.endsWith('@lid')) {
            phone = await this.resolvePhoneFromLid(chatId);
          } else {
            phone = chatId.replace('@c.us', '').replace('@g.us', '');
          }

          if (!isGroup) {
            if (phone) {
              const contact = db.prepare(`
                SELECT c.id, c.display_name FROM contacts c
                JOIN contact_identifiers ci ON ci.contact_id = c.id
                WHERE c.user_id = ? AND ci.identifier_type = 'whatsapp' AND ci.identifier_value = ?
              `).get(userId, phone);

              if (contact) {
                contactId = contact.id;
                chatName = contact.display_name ? `${contact.display_name} (+${phone})` : `+${phone}`;
              } else {
                chatName = `+${phone}`;
              }
            } else {
              chatName = chatName || waChat.name || 'Unknown Contact';
            }
          } else {
            chatName = chatName || 'Group Chat';
          }

          // Check if conversation exists (with @lid fallback matching)
          let conversation = this.findConversationWithLidFallback(db, userId, agentId, chatId, phone);

          // Use WhatsApp chat timestamp as last_message_at (even if we can't fetch messages)
          const chatLastMsgAt = waChat.timestamp
            ? new Date(waChat.timestamp * 1000).toISOString()
            : null;

          if (!conversation) {
            // Create conversation
            const conversationId = uuidv4();
            let category = 'chat';
            if (chatId.includes('@newsletter')) {
              category = 'news';
            } else if (chatId.includes('@broadcast') || chatId === 'status@broadcast') {
              category = 'status';
            }

            db.prepare(`
              INSERT INTO conversations (id, user_id, agent_id, platform, external_id, title, is_group, contact_id, category, last_message_at, created_at, updated_at)
              VALUES (?, ?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `).run(conversationId, userId, agentId, chatId, chatName, isGroup ? 1 : 0, contactId, category, chatLastMsgAt);

            conversationsSynced++;
          } else {
            // Update last_message_at from WhatsApp if we don't have messages yet
            if (chatLastMsgAt) {
              db.prepare(`
                UPDATE conversations
                SET last_message_at = COALESCE(
                  (SELECT created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1),
                  ?
                ),
                updated_at = datetime('now')
                WHERE id = ? AND last_message_at IS NULL
              `).run(conversation.id, chatLastMsgAt, conversation.id);
            }
            conversationsExisting++;
          }
        } catch (err) {
          conversationsSkipped++;
          this.log.debug(`Chat sync error: ${err.message}`);
        }

        // Emit progress every 5 chats or on last one
        if ((i + 1) % 5 === 0 || i === validChats.length - 1) {
          onProgress({
            phase: 'syncing_chats',
            current: i + 1,
            total: totalChats,
            message: `Syncing chat ${i + 1}/${totalChats}`,
            stats: { synced: conversationsSynced, existing: conversationsExisting, skipped: conversationsSkipped }
          });
        }
      }

      this.log.info(`Conversations: ${conversationsSynced} new, ${conversationsExisting} existing, ${conversationsSkipped} skipped`);

      // Link unlinked conversations
      let conversationsLinked = 0;
      const unlinkedConversations = db.prepare(`
        SELECT id, external_id, title
        FROM conversations
        WHERE user_id = ? AND platform = 'whatsapp' AND contact_id IS NULL AND is_group = 0
      `).all(userId);

      for (const conv of unlinkedConversations) {
        try {
          const phone = conv.external_id?.replace('@c.us', '');
          if (!phone) continue;

          const contact = db.prepare(`
            SELECT c.id, c.display_name FROM contacts c
            JOIN contact_identifiers ci ON ci.contact_id = c.id
            WHERE c.user_id = ? AND ci.identifier_type = 'whatsapp' AND ci.identifier_value = ?
          `).get(userId, phone);

          if (contact) {
            const newTitle = contact.display_name ? `${contact.display_name} (+${phone})` : `+${phone}`;
            db.prepare(`
              UPDATE conversations
              SET contact_id = ?, title = ?, updated_at = datetime('now')
              WHERE id = ?
            `).run(contact.id, newTitle, conv.id);
            conversationsLinked++;
          }
        } catch (err) {
          this.log.debug(`Link conversation error: ${err.message}`);
        }
      }

      if (conversationsLinked > 0) {
        this.log.info(`Linked ${conversationsLinked} existing conversations to contacts`);
      }

      // Skip bulk message sync - WhatsApp Web.js only returns messages for chats
      // already loaded in browser memory (almost always empty after restart).
      // Messages are loaded on-demand via lazy-load when user opens a chat.
      this.log.info('Skipping bulk message sync (messages loaded on-demand via lazy-load when chats are opened)');

      return {
        synced: true,
        conversationsSynced,
        conversationsExisting,
        conversationsSkipped,
        conversationsLinked,
        messagesSynced
      };

    } catch (error) {
      this.log.error(`Chat sync failed: ${error.message}`);
      return { synced: false, error: error.message };
    }
  }

  /**
   * Get current QR code
   */
  async getQRCode() {
    const db = getDatabase();
    const qr = db.prepare(`
      SELECT qr_data, expires_at
      FROM whatsapp_qr_codes
      WHERE platform_account_id = ?
      AND expires_at > datetime('now')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(this.accountId);

    if (qr) {
      const qrImage = await qrcode.toDataURL(qr.qr_data);
      return {
        qr: qr.qr_data,
        qrImage,
        expiresAt: new Date(qr.expires_at)
      };
    }

    return null;
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Normalize phone number to WhatsApp format
   */
  normalizePhoneNumber(phone) {
    if (phone.endsWith('@c.us') || phone.endsWith('@g.us') || phone.endsWith('@lid')) {
      return phone;
    }

    // Remove non-numeric characters
    let cleaned = phone.replace(/\D/g, '');

    // Add country code if missing (assume Malaysia if starts with 0)
    if (cleaned.startsWith('0')) {
      cleaned = '60' + cleaned.substring(1);
    }

    return cleaned + '@c.us';
  }

  /**
   * Get content type from message
   */
  getContentType(message) {
    if (message.location) return 'location';
    if (message.type === 'vcard') return 'contact';
    if (message.type === 'sticker') return 'sticker';
    if (message.type === 'ptt') return 'voice';
    if (message.type === 'audio') return 'audio';
    if (message.type === 'video') return 'video';
    if (message.type === 'image') return 'image';
    if (message.type === 'document') return 'document';
    if (message.type === 'call_log') return 'system';
    if (message.type === 'revoked') return 'system';
    if (['e2e_notification', 'notification_template', 'gp2', 'notification'].includes(message.type)) return 'system';
    return 'text';
  }

  /**
   * Save QR code to database
   */
  async saveQRCode(qrData) {
    try {
      const db = getDatabase();
      const id = uuidv4();
      const expiresAt = new Date(Date.now() + QR_EXPIRY_MS).toISOString();

      // Delete old QR codes for this account
      db.prepare('DELETE FROM whatsapp_qr_codes WHERE platform_account_id = ?')
        .run(this.accountId);

      // Insert new QR code
      db.prepare(`
        INSERT INTO whatsapp_qr_codes (id, platform_account_id, qr_data, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(id, this.accountId, qrData, expiresAt);

    } catch (error) {
      this.log.error(`Failed to save QR code: ${error.message}`);
    }
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
   * Update connection metadata
   */
  async updateConnectionMetadata(info) {
    try {
      const db = getDatabase();
      const metadata = {
        wid: info?.wid?.user,
        pushname: info?.pushname,
        platform: info?.platform,
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

/**
 * Clean all stale Chrome locks at startup
 * Call this during server initialization to prevent locked sessions
 */
function cleanupAllChromeLocks() {
  if (!fs.existsSync(SESSION_DIR)) {
    return { cleaned: false, sessions: [] };
  }

  const results = [];

  try {
    const entries = fs.readdirSync(SESSION_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('session-')) {
        const accountId = entry.name.replace('session-', '');
        const result = cleanupChromeLocks(accountId);
        if (result.cleaned) {
          results.push({ accountId, files: result.files });
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to scan session directory: ${err.message}`);
  }

  if (results.length > 0) {
    console.log(`[whatsapp] Cleaned stale Chrome locks for ${results.length} session(s)`);
  }

  return { cleaned: results.length > 0, sessions: results };
}

// Run cleanup on module load (server startup)
cleanupAllChromeLocks();

module.exports = {
  WhatsAppClient,
  cleanupChromeLocks,
  cleanupAllChromeLocks
};
