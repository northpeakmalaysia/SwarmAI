/**
 * Telegram User Client
 * MTProto-based client using gramjs for user account access
 *
 * Unlike Bot API, this connects as a real user account with full access
 * to private chats, groups, channels, etc.
 *
 * Requires:
 * - API ID and API Hash from my.telegram.org
 * - Phone number verification
 * - Optional 2FA password
 */

const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const { createPlatformLogger } = require('../services/logger.cjs');
const { getDatabase } = require('../services/database.cjs');

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE_MS = 1000;
const CONNECTION_TIMEOUT_MS = 30000;
const AUTO_RECONNECT_TIMEOUT_MS = 45000; // Timeout for auto-reconnect (no user interaction)
const SESSION_SAVE_INTERVAL_MS = 30 * 60 * 1000; // Save session every 30 minutes to keep it fresh

/**
 * Auth states for multi-step authentication
 */
const AUTH_STATES = {
  IDLE: 'idle',
  PHONE_REQUIRED: 'phone_required',
  CODE_REQUIRED: 'code_required',
  PASSWORD_REQUIRED: 'password_required',
  CONNECTED: 'connected',
  ERROR: 'error'
};

class TelegramUserClient extends EventEmitter {
  constructor(accountId, config = {}) {
    super();

    this.accountId = accountId;
    this.config = {
      apiId: parseInt(config.apiId),
      apiHash: config.apiHash,
      sessionString: config.sessionString || '',
      phoneNumber: config.phoneNumber || null,
      ...config,
    };

    this.status = 'disconnected';
    this.authState = AUTH_STATES.IDLE;
    this.log = createPlatformLogger('telegram-user', accountId);
    this.client = null;
    this.userInfo = null;
    this.reconnectAttempts = 0;
    this._sessionSaveInterval = null;

    // Auth resolvers (for async auth flow)
    this.phoneResolver = null;
    this.codeResolver = null;
    this.passwordResolver = null;

    // Initialize session
    this.session = new StringSession(this.config.sessionString);
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
      this.log.info(`Status: ${oldStatus} → ${status}`);
      this.emit('status_change', status, oldStatus);
      this.updateAccountStatus(status);

      if (global.wsBroadcast) {
        const db = getDatabase();
        const account = db.prepare('SELECT agent_id FROM platform_accounts WHERE id = ?').get(this.accountId);

        global.wsBroadcast('agent:status_changed', {
          accountId: this.accountId,
          agentId: account?.agent_id,
          platform: 'telegram-user',
          status
        });

        // Send auth state for UI
        global.wsBroadcast('telegram-user:auth_state', {
          accountId: this.accountId,
          authState: this.authState
        });
      }
    }
  }

  /**
   * Connect to Telegram MTProto servers
   * Emits auth events that UI must respond to
   * @param {Object} [options]
   * @param {boolean} [options.autoReconnect] - If true, apply timeout and fail fast if session can't auto-restore
   */
  async connect(options = {}) {
    if (this.client) {
      await this.disconnect();
    }

    const isAutoReconnect = options.autoReconnect || false;
    this.log.info(`Initializing Telegram User client (MTProto)${isAutoReconnect ? ' [auto-reconnect]' : ''}...`);
    this.setStatus('connecting');

    try {
      this.client = new TelegramClient(
        this.session,
        this.config.apiId,
        this.config.apiHash,
        {
          connectionRetries: MAX_RECONNECT_ATTEMPTS,
          timeout: CONNECTION_TIMEOUT_MS,
          useWSS: true, // WebSocket Secure — keeps session healthier (from WhatsBots)
        }
      );

      // Suppress gramJS internal log noise and route errors through our logger
      this.client.setLogLevel('none');
      this.client._errorHandler = (err) => {
        // Suppress known non-critical errors (TIMEOUT from _updateLoop ping)
        const msg = err?.message || String(err);
        if (msg === 'TIMEOUT') return;
        this.log.warn(`gramJS error: ${msg}`);
      };

      if (isAutoReconnect && !this.config.sessionString) {
        // No saved session — can't auto-reconnect without interactive auth
        throw new Error('No saved session — interactive re-authentication required');
      }

      if (isAutoReconnect) {
        // AUTO-RECONNECT: Use client.connect() which restores the MTProto session
        // without triggering the full auth flow (phone/code/password callbacks).
        // This is the WhatsBots approach — avoids hanging on expired sessions.
        this.log.info('Auto-reconnect: restoring session via client.connect()...');

        const connectPromise = this.client.connect();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(
            `Auto-reconnect timed out after ${AUTO_RECONNECT_TIMEOUT_MS / 1000}s`
          )), AUTO_RECONNECT_TIMEOUT_MS)
        );
        await Promise.race([connectPromise, timeoutPromise]);

        // Verify we're actually authorized (session still valid)
        const authorized = await this.client.isUserAuthorized();
        if (!authorized) {
          throw new Error('Session expired — re-authentication required');
        }
      } else {
        // INTERACTIVE: Full auth flow with phone/code/password callbacks
        await this.client.start({
          phoneNumber: async () => {
            if (this.config.phoneNumber) {
              return this.config.phoneNumber;
            }
            this.authState = AUTH_STATES.PHONE_REQUIRED;
            this.emit('auth:phone_required', { accountId: this.accountId });
            this.broadcastAuthState();
            return new Promise(resolve => { this.phoneResolver = resolve; });
          },
          phoneCode: async () => {
            this.authState = AUTH_STATES.CODE_REQUIRED;
            this.emit('auth:code_required', { accountId: this.accountId });
            this.broadcastAuthState();
            return new Promise(resolve => { this.codeResolver = resolve; });
          },
          password: async () => {
            this.authState = AUTH_STATES.PASSWORD_REQUIRED;
            this.emit('auth:password_required', { accountId: this.accountId });
            this.broadcastAuthState();
            return new Promise(resolve => { this.passwordResolver = resolve; });
          },
          onError: (err) => {
            this.log.error(`Auth error: ${err.message}`);
            this.authState = AUTH_STATES.ERROR;
            this.emit('auth:error', { accountId: this.accountId, error: err.message });
            this.broadcastAuthState();
          }
        });
      }

      // Setup event handlers
      this.setupEventHandlers();

      // Get user info
      const me = await this.client.getMe();
      this.userInfo = {
        id: me.id ? Number(me.id) : null,
        firstName: me.firstName || '',
        lastName: me.lastName,
        username: me.username,
        phone: me.phone,
        isBot: me.bot || false
      };

      // Save session
      await this.saveSession();
      await this.updateConnectionMetadata();

      // Periodically save session to keep it fresh across restarts
      this._sessionSaveInterval = setInterval(() => {
        this.saveSession().catch(e => this.log.warn(`Periodic session save failed: ${e.message}`));
      }, SESSION_SAVE_INTERVAL_MS);

      this.authState = AUTH_STATES.CONNECTED;
      this.setStatus('connected');
      this.emit('auth:success', { accountId: this.accountId, userInfo: this.userInfo });
      this.broadcastAuthState();

      this.log.info(`Connected as @${this.userInfo.username || this.userInfo.firstName}`);

      return true;
    } catch (error) {
      this.log.error(`Connection failed: ${error.message}`);
      this.authState = AUTH_STATES.ERROR;
      this.setStatus('error');
      this.updateAccountError(error.message);
      // Cleanup client on failure to avoid stale references
      if (this.client) {
        try { await this.client.disconnect(); } catch (_) {}
        this.client = null;
      }
      throw error;
    }
  }

  /**
   * Auth input methods (called via API/WebSocket)
   */
  providePhone(phone) {
    if (this.phoneResolver) {
      this.phoneResolver(phone);
      this.phoneResolver = null;
    }
  }

  provideCode(code) {
    if (this.codeResolver) {
      this.codeResolver(code);
      this.codeResolver = null;
    }
  }

  providePassword(password) {
    if (this.passwordResolver) {
      this.passwordResolver(password);
      this.passwordResolver = null;
    }
  }

  /**
   * Broadcast auth state via WebSocket
   */
  broadcastAuthState() {
    if (global.wsBroadcast) {
      global.wsBroadcast('telegram-user:auth_state', {
        accountId: this.accountId,
        authState: this.authState
      });
    }
  }

  /**
   * Disconnect from Telegram
   */
  async disconnect() {
    if (this._sessionSaveInterval) {
      clearInterval(this._sessionSaveInterval);
      this._sessionSaveInterval = null;
    }
    if (this.client) {
      const clientRef = this.client;
      this.client = null; // Clear reference first to prevent re-use
      this.userInfo = null;
      this.authState = AUTH_STATES.IDLE;

      try {
        await this.saveSession();
      } catch (e) {
        this.log.warn(`Session save on disconnect failed: ${e.message}`);
      }

      try {
        await clientRef.disconnect();
      } catch (e) {
        this.log.warn(`Disconnect error: ${e.message}`);
      }

      // Force destroy to stop internal update loops (gramJS parent class method)
      try {
        clientRef.destroy();
      } catch (_) {}

      this.setStatus('disconnected');
    }
  }

  /**
   * Setup event handlers for incoming messages
   */
  setupEventHandlers() {
    if (!this.client) return;

    this.client.addEventHandler(
      async (event) => {
        try {
          const message = event.message;
          if (message) {
            await this.processMessage(message);
          }
        } catch (err) {
          this.log.error(`Event handler error: ${err.message}`);
        }
      },
      new NewMessage({})
    );
  }

  /**
   * Process incoming message and emit unified format
   */
  async processMessage(message) {
    const contentType = this.getContentType(message);

    // Use chatId as `from` (same as WhatsApp) — ensures group messages
    // go to one conversation and replies route back to the correct chat.
    const chatId = message.chatId ? String(message.chatId) : null;
    const senderId = message.senderId ? String(message.senderId) : null;

    // Resolve sender entity for name/username (gramjs messages don't always carry .sender)
    let senderName = 'Unknown';
    let senderUsername = null;
    try {
      if (message.senderId && this.client) {
        const entity = await this.client.getEntity(message.senderId);
        senderName = entity.firstName || entity.title || 'Unknown';
        if (entity.lastName) senderName += ` ${entity.lastName}`;
        senderUsername = entity.username || null;
      }
    } catch (e) {
      // Fallback to inline sender data
      senderName = message.sender?.firstName || message.sender?.title || 'Unknown';
    }

    // Detect group/channel: message.isGroup is unreliable in NewMessage events
    // because message.chat may not be loaded yet. Instead, compare chatId vs senderId:
    // in 1:1 private chats they're equal; in groups/channels they differ.
    let isGroup = message.isGroup || false;
    let groupName = null;

    // If chatId differs from senderId, it's almost certainly a group/channel
    if (chatId && senderId && chatId !== senderId) {
      isGroup = true;
    }

    // Resolve chat entity for group name (also catches channels)
    if (chatId && this.client && (isGroup || !senderId)) {
      try {
        const chatEntity = await this.client.getEntity(message.chatId);
        // Api.Chat, Api.Channel have .title; Api.User has .firstName
        if (chatEntity.title) {
          groupName = chatEntity.title;
          isGroup = true; // Confirmed group/channel
        }
      } catch (_) {}
    }

    const unifiedMessage = {
      id: uuidv4(),
      externalId: String(message.id),
      platform: 'telegram-user',
      direction: message.out ? 'outgoing' : 'incoming',
      from: chatId || senderId,
      chatId,
      sender: {
        id: senderId,
        name: senderName,
        username: senderUsername
      },
      contentType,
      text: message.message || '',
      hasMedia: !!message.media,
      timestamp: new Date(message.date * 1000),
      isGroup,
      groupName,
      raw: message
    };

    this.log.info(`Processing telegram-user message from ${senderName} (chat: ${chatId}, sender: ${senderId}, group: ${isGroup}${groupName ? ', groupName: ' + groupName : ''})`);
    this.emit('message', unifiedMessage);
  }

  /**
   * Get content type from message
   */
  getContentType(message) {
    if (message.photo) return 'photo';
    if (message.video) return 'video';
    if (message.audio) return 'audio';
    if (message.voice) return 'voice';
    if (message.document) return 'document';
    if (message.sticker) return 'sticker';
    if (message.poll) return 'poll';
    return 'text';
  }

  /**
   * Execute an API call with flood-wait retry (from WhatsBots pattern).
   * Telegram returns FloodWaitError when rate-limited; we sleep the
   * required seconds then retry once.
   */
  async withFloodWait(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err.errorMessage === 'FLOOD' || err.seconds) {
        const waitSec = err.seconds || 5;
        this.log.warn(`Flood wait: sleeping ${waitSec}s before retry`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        return await fn();
      }
      throw err;
    }
  }

  /**
   * Send a message
   */
  async sendMessage(chatId, text, options = {}) {
    if (!this.client || this.status !== 'connected') {
      throw new Error('Telegram User client not connected');
    }

    // Strip platform prefix (e.g. "telegram-user:123" → "123") and convert to BigInt for gramjs
    const rawId = String(chatId).replace(/^telegram-(user|bot):/, '');
    const targetId = BigInt(rawId);

    this.log.info(`Sending message to ${rawId}`);

    const result = await this.withFloodWait(() =>
      this.client.sendMessage(targetId, {
        message: text,
        replyTo: options.replyToMessageId,
        parseMode: options.parseMode || 'html'
      })
    );

    return {
      id: result.id,
      timestamp: new Date(result.date * 1000)
    };
  }

  /**
   * Send chat action (typing indicator) via gramjs MTProto
   */
  async sendChatAction(chatId, action = 'typing') {
    if (!this.client || this.status !== 'connected') {
      return false;
    }

    try {
      const rawId = String(chatId).replace(/^telegram-(user|bot):/, '');
      const targetId = BigInt(rawId);

      await this.withFloodWait(() =>
        this.client.invoke(
          new Api.messages.SetTyping({
            peer: targetId,
            action: new Api.SendMessageTypingAction()
          })
        )
      );
      return true;
    } catch (e) {
      this.log.warn(`Failed to send chat action: ${e.message}`);
      return false;
    }
  }

  /**
   * Get dialogs (chats list)
   */
  async getDialogs(limit = 100) {
    if (!this.client) return [];

    const dialogs = await this.withFloodWait(() => this.client.getDialogs({ limit }));
    return dialogs.map(d => ({
      id: d.id ? String(d.id) : null,
      name: d.title || d.name || 'Unknown',
      type: d.isUser ? 'user' : d.isGroup ? 'group' : 'channel',
      unreadCount: d.unreadCount
    }));
  }

  /**
   * Download media from a message
   */
  async downloadMedia(message) {
    if (!this.client || !message.media) return null;
    return await this.client.downloadMedia(message.media);
  }

  /**
   * Get user info
   */
  getUserInfo() {
    return this.userInfo;
  }

  /**
   * Save session string to database
   */
  async saveSession() {
    if (!this.client) return;
    try {
      const sessionString = this.session.save();

      // Get current credentials and update sessionString
      const db = getDatabase();
      const account = db.prepare('SELECT credentials_encrypted FROM platform_accounts WHERE id = ?')
        .get(this.accountId);

      if (account?.credentials_encrypted) {
        const { decrypt, encrypt } = require('../agents/agentManager.cjs');
        let creds = {};
        try {
          creds = JSON.parse(decrypt(account.credentials_encrypted));
        } catch (e) {
          creds = {};
        }
        creds.sessionString = sessionString;

        db.prepare(`
          UPDATE platform_accounts
          SET credentials_encrypted = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(encrypt(JSON.stringify(creds)), this.accountId);

        this.log.info('Session saved');
      }
    } catch (e) {
      this.log.error(`Failed to save session: ${e.message}`);
    }
  }

  /**
   * Update connection metadata in database
   */
  async updateConnectionMetadata() {
    if (!this.userInfo) return;
    try {
      const db = getDatabase();
      const metadata = {
        userId: this.userInfo.id,
        username: this.userInfo.username,
        firstName: this.userInfo.firstName,
        lastName: this.userInfo.lastName,
        phone: this.userInfo.phone,
        connectedAt: new Date().toISOString()
      };

      db.prepare(`
        UPDATE platform_accounts
        SET connection_metadata = ?, last_connected_at = datetime('now'),
            last_error = NULL, error_count = 0, updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(metadata), this.accountId);
    } catch (e) {
      this.log.error(`Failed to update metadata: ${e.message}`);
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
    } catch (e) {
      this.log.error(`Failed to update status: ${e.message}`);
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
    } catch (e) {
      this.log.error(`Failed to update error: ${e.message}`);
    }
  }
}

module.exports = {
  TelegramUserClient,
  AUTH_STATES
};
