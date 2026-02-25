/**
 * Telegram Bot Client
 * Official Telegram Bot API integration
 *
 * Uses long polling for receiving messages
 * Supports sending text, media, inline keyboards, and more
 *
 * Requires:
 * - Bot Token from @BotFather
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const { createPlatformLogger } = require('../services/logger.cjs');
const { getDatabase } = require('../services/database.cjs');
const redisService = require('../services/redis.cjs');

// Telegram Bot API constants
const TG_API_BASE = 'https://api.telegram.org/bot';
const POLLING_TIMEOUT = 30; // seconds
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 5000;

// Message types
const MESSAGE_TYPES = {
  TEXT: 'text',
  PHOTO: 'photo',
  AUDIO: 'audio',
  VIDEO: 'video',
  DOCUMENT: 'document',
  VOICE: 'voice',
  VIDEO_NOTE: 'video_note',
  ANIMATION: 'animation',
  STICKER: 'sticker',
  LOCATION: 'location',
  CONTACT: 'contact',
  POLL: 'poll',
};

/**
 * Telegram Bot Client Class
 * Manages a single Telegram Bot session
 */
class TelegramBotClient extends EventEmitter {
  constructor(accountId, config = {}) {
    super();

    this.accountId = accountId;
    this.config = {
      botToken: config.botToken || null,
      webhookMode: config.webhookMode || 'polling', // 'polling' | 'webhook'
      webhookUrl: config.webhookUrl || null,
      webhookSecretToken: config.webhookSecretToken || null,
      ...config,
    };

    this.status = 'disconnected';
    this.log = createPlatformLogger('telegram-bot', accountId);
    this.axiosInstance = null;
    this.pollingActive = false;
    this.lastUpdateId = 0;
    this.reconnectAttempts = 0;
    this.botInfo = null;
  }

  /**
   * Get bot info
   */
  getBotInfo() {
    return this.botInfo;
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
          platform: 'telegram-bot',
          status,
        });

        // Also broadcast platform_status for frontend
        if (agentId) {
          global.wsBroadcast('agent:platform_status', {
            agentId,
            accountId: this.accountId,
            platform: 'telegram-bot',
            connected: status === 'connected',
            status
          });
        }
      }
    }
  }

  /**
   * Connect to Telegram Bot API
   */
  async connect() {
    if (!this.config.botToken) {
      throw new Error('Bot token is required');
    }

    this.log.info('Initializing Telegram Bot client...');
    this.setStatus('connecting');

    // Create axios instance
    this.axiosInstance = axios.create({
      baseURL: `${TG_API_BASE}${this.config.botToken}`,
      timeout: (POLLING_TIMEOUT + 10) * 1000,
    });

    // Verify token by getting bot info
    try {
      const response = await this.axiosInstance.get('/getMe');

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to get bot info');
      }

      this.botInfo = response.data.result;

      this.log.info(`Connected as: @${this.botInfo.username} (${this.botInfo.first_name})`);

      // Update connection metadata
      await this.updateConnectionMetadata({
        botId: this.botInfo.id,
        username: this.botInfo.username,
        firstName: this.botInfo.first_name,
        canJoinGroups: this.botInfo.can_join_groups,
        canReadAllGroupMessages: this.botInfo.can_read_all_group_messages,
        supportsInlineQueries: this.botInfo.supports_inline_queries,
      });

      this.setStatus('connected');
      this.reconnectAttempts = 0;

      // Start polling or webhook based on config
      if (this.config.webhookMode === 'webhook' && this.config.webhookUrl) {
        await this.setupWebhook();
      } else {
        this.startPolling();
      }

      // Auto-register default bot commands
      this.registerDefaultCommands().catch(err => {
        this.log.warn(`Failed to register default commands: ${err.message}`);
      });

      this.emit('ready', this.botInfo);

      return true;
    } catch (error) {
      this.log.error(`Failed to connect: ${error.message}`);

      if (error.response) {
        this.log.error(`API Error: ${JSON.stringify(error.response.data)}`);
        this.updateAccountError(error.response.data?.description || error.message);
      } else {
        this.updateAccountError(error.message);
      }

      this.setStatus('error');
      throw error;
    }
  }

  /**
   * Disconnect from Telegram Bot API
   */
  async disconnect() {
    this.stopPolling();
    this.axiosInstance = null;
    this.setStatus('disconnected');
    this.log.info('Telegram Bot client disconnected');
  }

  /**
   * Start long polling for updates
   */
  startPolling() {
    if (this.pollingActive) return;

    this.pollingActive = true;
    this.log.info('Starting long polling...');
    this.poll();
  }

  /**
   * Stop polling
   */
  stopPolling() {
    this.pollingActive = false;
    this.log.info('Polling stopped');
  }

  /**
   * Poll for updates
   */
  async poll() {
    if (!this.pollingActive || !this.axiosInstance) return;

    try {
      const response = await this.axiosInstance.get('/getUpdates', {
        params: {
          offset: this.lastUpdateId + 1,
          timeout: POLLING_TIMEOUT,
          allowed_updates: ['message', 'edited_message', 'callback_query', 'inline_query', 'poll', 'poll_answer'],
        },
      });

      if (response.data.ok && response.data.result.length > 0) {
        for (const update of response.data.result) {
          this.lastUpdateId = update.update_id;
          this.processUpdate(update);
        }
      }

      // Reset reconnect attempts on successful poll
      this.reconnectAttempts = 0;
    } catch (error) {
      this.log.error(`Polling error: ${error.message}`);

      // Handle connection errors
      if (this.pollingActive) {
        this.reconnectAttempts++;

        if (this.reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
          this.log.info(
            `Retrying in ${RECONNECT_DELAY_MS}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
          );
          await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
        } else {
          this.log.error('Max reconnection attempts reached');
          this.setStatus('error');
          this.updateAccountError('Max reconnection attempts reached');
          this.pollingActive = false;
          this.emit('disconnected', 'Max reconnection attempts reached');
          return;
        }
      }
    }

    // Continue polling
    if (this.pollingActive) {
      setImmediate(() => this.poll());
    }
  }

  /**
   * Process incoming update
   */
  processUpdate(update) {
    if (update.message) {
      this.processMessage(update.message);
    } else if (update.edited_message) {
      this.processMessage(update.edited_message, true);
    } else if (update.callback_query) {
      this.processCallbackQuery(update.callback_query);
    } else if (update.inline_query) {
      this.processInlineQuery(update.inline_query);
    } else if (update.poll) {
      this.processPollUpdate(update.poll);
    } else if (update.poll_answer) {
      this.processPollAnswer(update.poll_answer);
    }
  }

  /**
   * Process poll update (poll state changed)
   */
  processPollUpdate(poll) {
    this.log.info(`Poll update: ${poll.id} (${poll.total_voter_count} votes)`);

    this.emit('poll_update', {
      pollId: poll.id,
      question: poll.question,
      options: poll.options.map(opt => ({
        text: opt.text,
        voterCount: opt.voter_count
      })),
      totalVoterCount: poll.total_voter_count,
      isClosed: poll.is_closed,
      isAnonymous: poll.is_anonymous
    });
  }

  /**
   * Process poll answer (non-anonymous poll vote)
   */
  processPollAnswer(answer) {
    this.log.info(`Poll answer from user ${answer.user.id}`);

    this.emit('poll_answer', {
      pollId: answer.poll_id,
      user: {
        id: answer.user.id,
        firstName: answer.user.first_name,
        lastName: answer.user.last_name,
        username: answer.user.username
      },
      optionIds: answer.option_ids // Array of selected option indices
    });
  }

  /**
   * Process incoming message
   */
  processMessage(message, isEdited = false) {
    const contentType = this.getContentType(message);
    const text = message.text || message.caption || '';

    this.log.info(
      `📩 ${isEdited ? 'Edited ' : ''}Message from: ${message.from?.first_name || 'Unknown'} (${
        message.from?.id
      })`
    );
    this.log.info(`   Type: ${contentType}, Text: ${text.substring(0, 100)}`);

    // Parse command if message starts with /
    const isCommand = text.startsWith('/');
    let commandData = null;

    if (isCommand) {
      const parts = text.split(/\s+/);
      const commandPart = parts[0].substring(1); // Remove leading /
      const [command, botUsername] = commandPart.split('@');

      // If bot username is specified, check it matches
      if (botUsername && this.botInfo?.username &&
          botUsername.toLowerCase() !== this.botInfo.username.toLowerCase()) {
        // Command is for a different bot - still process but mark as not for us
        commandData = null;
      } else {
        commandData = {
          command: command.toLowerCase(),
          args: parts.slice(1),
          rawArgs: text.substring(parts[0].length).trim(),
          botMentioned: !!botUsername
        };
      }
    }

    // Get media file ID for caching
    const mediaFileId = this.getMediaFileId(message);

    const unifiedMessage = {
      id: uuidv4(),
      externalId: `${message.message_id}`,
      platform: 'telegram-bot',
      direction: 'incoming',
      from: `${message.chat.id}`,
      to: `${this.botInfo?.id}`,
      chatId: `${message.chat.id}`,
      sender: {
        id: `${message.from?.id}`,
        name:
          [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') ||
          message.from?.username ||
          'Unknown',
        username: message.from?.username,
        isBot: message.from?.is_bot,
      },
      chat: {
        id: `${message.chat.id}`,
        type: message.chat.type, // 'private', 'group', 'supergroup', 'channel'
        title: message.chat.title,
      },
      contentType,
      text: text || undefined,
      hasMedia: this.hasMedia(message),
      mediaFileId,
      timestamp: new Date(message.date * 1000),
      isGroup: message.chat.type !== 'private',
      groupName: message.chat.type !== 'private' ? (message.chat.title || null) : null,
      isEdited,
      isCommand,
      command: commandData,
      replyToMessage: message.reply_to_message
        ? {
            id: message.reply_to_message.message_id,
            text: message.reply_to_message.text || message.reply_to_message.caption,
          }
        : undefined,
      raw: message,
    };

    // Store message in Redis for fast retrieval (WhatsBots-style)
    if (redisService.isRedisAvailable()) {
      try {
        const redisMessage = {
          id: `${message.message_id}`,
          from: `${message.chat.id}`, // Use chat ID for consistency
          to: `${this.botInfo?.id}`,
          fromName: unifiedMessage.sender.name,
          body: text,
          timestamp: message.date,
          type: contentType,
          hasMedia: unifiedMessage.hasMedia,
          mediaType: contentType,
          fromMe: false,
          platform: 'telegram',
        };

        redisService.storeMessage(this.accountId, redisMessage, null).catch(err => {
          this.log.warn(`Failed to store message in Redis: ${err.message}`);
        });
        this.log.debug(`📦 Message stored in Redis: ${message.message_id}`);
      } catch (redisErr) {
        this.log.warn(`Redis storage error: ${redisErr.message}`);
      }
    }

    this.emit('message', unifiedMessage);

    // Emit separate command event if this is a command for us
    if (commandData) {
      this.emit('command', {
        ...unifiedMessage,
        commandName: commandData.command,
        commandArgs: commandData.args,
        commandRawArgs: commandData.rawArgs
      });
    }

    // Cache media asynchronously if message has media
    if (unifiedMessage.hasMedia && mediaFileId) {
      this.cacheMediaAsync(unifiedMessage.id, mediaFileId, message).catch(err => {
        this.log.warn(`Media cache failed: ${err.message}`);
      });
    }
  }

  /**
   * Process callback query (inline button click)
   */
  processCallbackQuery(callbackQuery) {
    this.log.info(`🔘 Callback query from: ${callbackQuery.from?.first_name || 'Unknown'}`);
    this.log.info(`   Data: ${callbackQuery.data}`);

    this.emit('callback_query', {
      id: callbackQuery.id,
      from: callbackQuery.from,
      message: callbackQuery.message,
      chatInstance: callbackQuery.chat_instance,
      data: callbackQuery.data,
    });
  }

  /**
   * Process inline query
   */
  processInlineQuery(inlineQuery) {
    this.log.info(`🔍 Inline query from: ${inlineQuery.from?.first_name || 'Unknown'}`);
    this.log.info(`   Query: ${inlineQuery.query}`);

    this.emit('inline_query', {
      id: inlineQuery.id,
      from: inlineQuery.from,
      query: inlineQuery.query,
      offset: inlineQuery.offset,
    });
  }

  /**
   * Send a text message
   */
  async sendMessage(chatId, text, options = {}) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('Telegram Bot client is not connected');
    }

    // Strip platform prefix (e.g. "telegram-bot:123" → "123")
    const rawChatId = String(chatId).replace(/^telegram-(bot|user):/, '');
    this.log.info(`Sending message to ${rawChatId}`);

    const payload = {
      chat_id: rawChatId,
      text,
      parse_mode: options.parseMode || 'HTML',
      disable_web_page_preview: options.disablePreview || false,
      disable_notification: options.silent || false,
      reply_to_message_id: options.replyToMessageId,
      reply_markup: options.replyMarkup,
    };

    try {
      const response = await this.axiosInstance.post('/sendMessage', payload);

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to send message');
      }

      return {
        id: response.data.result.message_id,
        timestamp: new Date(response.data.result.date * 1000),
      };
    } catch (error) {
      this.log.error(`Failed to send message: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Send photo
   */
  async sendPhoto(chatId, photo, options = {}) {
    return this.sendMedia(chatId, 'photo', photo, options);
  }

  /**
   * Send document
   */
  async sendDocument(chatId, document, options = {}) {
    return this.sendMedia(chatId, 'document', document, options);
  }

  /**
   * Send audio
   */
  async sendAudio(chatId, audio, options = {}) {
    return this.sendMedia(chatId, 'audio', audio, options);
  }

  /**
   * Send video
   */
  async sendVideo(chatId, video, options = {}) {
    return this.sendMedia(chatId, 'video', video, options);
  }

  /**
   * Generic media sender
   */
  async sendMedia(chatId, mediaType, media, options = {}) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('Telegram Bot client is not connected');
    }

    // Strip platform prefix
    const rawChatId = String(chatId).replace(/^telegram-(bot|user):/, '');
    this.log.info(`Sending ${mediaType} to ${rawChatId}`);

    const methodMap = {
      photo: 'sendPhoto',
      document: 'sendDocument',
      audio: 'sendAudio',
      video: 'sendVideo',
      voice: 'sendVoice',
      animation: 'sendAnimation',
      sticker: 'sendSticker',
    };

    const method = methodMap[mediaType] || 'sendDocument';

    const payload = {
      chat_id: rawChatId,
      [mediaType]: media, // Can be file_id, URL, or file path
      caption: options.caption,
      parse_mode: options.parseMode || 'HTML',
      disable_notification: options.silent || false,
      reply_to_message_id: options.replyToMessageId,
      reply_markup: options.replyMarkup,
    };

    try {
      const response = await this.axiosInstance.post(`/${method}`, payload);

      if (!response.data.ok) {
        throw new Error(response.data.description || `Failed to send ${mediaType}`);
      }

      return {
        id: response.data.result.message_id,
        timestamp: new Date(response.data.result.date * 1000),
      };
    } catch (error) {
      this.log.error(`Failed to send ${mediaType}: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Send location
   */
  async sendLocation(chatId, latitude, longitude, options = {}) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('Telegram Bot client is not connected');
    }

    const payload = {
      chat_id: chatId,
      latitude,
      longitude,
      disable_notification: options.silent || false,
      reply_to_message_id: options.replyToMessageId,
      reply_markup: options.replyMarkup,
    };

    try {
      const response = await this.axiosInstance.post('/sendLocation', payload);

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to send location');
      }

      return {
        id: response.data.result.message_id,
        timestamp: new Date(response.data.result.date * 1000),
      };
    } catch (error) {
      this.log.error(`Failed to send location: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Send chat action (typing, uploading, etc.)
   */
  async sendChatAction(chatId, action = 'typing') {
    if (!this.axiosInstance || this.status !== 'connected') {
      return false;
    }

    // Strip platform prefix
    const rawChatId = String(chatId).replace(/^telegram-(bot|user):/, '');

    try {
      await this.axiosInstance.post('/sendChatAction', {
        chat_id: rawChatId,
        action, // 'typing', 'upload_photo', 'upload_document', etc.
      });
      return true;
    } catch (error) {
      this.log.error(`Failed to send chat action: ${error.message}`);
      return false;
    }
  }

  /**
   * Answer callback query
   */
  async answerCallbackQuery(callbackQueryId, options = {}) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('Telegram Bot client is not connected');
    }

    const payload = {
      callback_query_id: callbackQueryId,
      text: options.text,
      show_alert: options.showAlert || false,
      url: options.url,
      cache_time: options.cacheTime || 0,
    };

    try {
      const response = await this.axiosInstance.post('/answerCallbackQuery', payload);
      return response.data.ok;
    } catch (error) {
      this.log.error(`Failed to answer callback query: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Edit message text
   */
  async editMessageText(chatId, messageId, text, options = {}) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('Telegram Bot client is not connected');
    }

    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options.parseMode || 'HTML',
      disable_web_page_preview: options.disablePreview || false,
      reply_markup: options.replyMarkup,
    };

    try {
      const response = await this.axiosInstance.post('/editMessageText', payload);

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to edit message');
      }

      return response.data.result;
    } catch (error) {
      this.log.error(`Failed to edit message: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Delete message
   */
  async deleteMessage(chatId, messageId) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('Telegram Bot client is not connected');
    }

    try {
      const response = await this.axiosInstance.post('/deleteMessage', {
        chat_id: chatId,
        message_id: messageId,
      });
      return response.data.ok;
    } catch (error) {
      this.log.error(`Failed to delete message: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Get chat information
   */
  async getChat(chatId) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('Telegram Bot client is not connected');
    }

    try {
      const response = await this.axiosInstance.get('/getChat', {
        params: { chat_id: chatId },
      });

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to get chat');
      }

      return response.data.result;
    } catch (error) {
      this.log.error(`Failed to get chat: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Get chat member count
   */
  async getChatMemberCount(chatId) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('Telegram Bot client is not connected');
    }

    try {
      const response = await this.axiosInstance.get('/getChatMemberCount', {
        params: { chat_id: chatId },
      });

      return response.data.result;
    } catch (error) {
      this.log.error(`Failed to get member count: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Set webhook (alternative to polling)
   */
  async setWebhook(url, options = {}) {
    if (!this.axiosInstance) {
      throw new Error('Telegram Bot client is not initialized');
    }

    const payload = {
      url,
      max_connections: options.maxConnections || 40,
      allowed_updates: options.allowedUpdates || [
        'message',
        'edited_message',
        'callback_query',
        'inline_query',
      ],
      secret_token: options.secretToken,
    };

    try {
      const response = await this.axiosInstance.post('/setWebhook', payload);
      return response.data.ok;
    } catch (error) {
      this.log.error(`Failed to set webhook: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook() {
    if (!this.axiosInstance) {
      throw new Error('Telegram Bot client is not initialized');
    }

    try {
      const response = await this.axiosInstance.post('/deleteWebhook');
      return response.data.ok;
    } catch (error) {
      this.log.error(`Failed to delete webhook: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Process webhook update (call from webhook handler)
   */
  processWebhookUpdate(update) {
    this.processUpdate(update);
  }

  // ============================================
  // Webhook Management Methods
  // ============================================

  /**
   * Setup webhook for receiving updates
   */
  async setupWebhook() {
    const webhookUrl = this.config.webhookUrl;
    if (!webhookUrl) {
      throw new Error('Webhook URL required for webhook mode');
    }

    // Generate secret token if not provided
    if (!this.config.webhookSecretToken) {
      this.config.webhookSecretToken = this.generateSecretToken();
    }

    await this.setWebhook(webhookUrl, {
      secretToken: this.config.webhookSecretToken,
      allowedUpdates: ['message', 'edited_message', 'callback_query', 'inline_query', 'poll', 'poll_answer']
    });

    this.log.info(`Webhook set: ${webhookUrl}`);
    return true;
  }

  /**
   * Generate a random secret token for webhook validation
   */
  generateSecretToken() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Switch from webhook to polling mode
   */
  async switchToPolling() {
    await this.deleteWebhook();
    this.config.webhookMode = 'polling';
    this.config.webhookUrl = null;
    this.startPolling();
    this.log.info('Switched to polling mode');

    // Update metadata in DB
    this.updateWebhookMetadata('polling', null);
  }

  /**
   * Switch from polling to webhook mode
   */
  async switchToWebhook(url, secretToken = null) {
    this.stopPolling();
    this.config.webhookUrl = url;
    this.config.webhookSecretToken = secretToken || this.generateSecretToken();
    this.config.webhookMode = 'webhook';
    await this.setupWebhook();
    this.log.info('Switched to webhook mode');

    // Update metadata in DB
    this.updateWebhookMetadata('webhook', url);

    return this.config.webhookSecretToken;
  }

  /**
   * Validate webhook secret token
   */
  validateWebhookSecret(requestSecretToken) {
    return requestSecretToken === this.config.webhookSecretToken;
  }

  /**
   * Update webhook metadata in database
   */
  updateWebhookMetadata(mode, url) {
    try {
      const db = getDatabase();
      const account = db.prepare('SELECT connection_metadata FROM platform_accounts WHERE id = ?').get(this.accountId);
      let metadata = {};
      try {
        metadata = account?.connection_metadata ? JSON.parse(account.connection_metadata) : {};
      } catch (e) {
        metadata = {};
      }

      metadata.webhookMode = mode;
      metadata.webhookUrl = url;

      db.prepare(`
        UPDATE platform_accounts
        SET connection_metadata = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(metadata), this.accountId);
    } catch (error) {
      this.log.error(`Failed to update webhook metadata: ${error.message}`);
    }
  }

  /**
   * Get webhook secret token (for API response)
   */
  getWebhookSecretToken() {
    return this.config.webhookSecretToken;
  }

  // ============================================
  // Bot Commands Methods
  // ============================================

  /**
   * Set bot commands visible in Telegram UI
   * @param {Array<{command: string, description: string}>} commands
   * @param {Object} scope - Command scope (optional)
   */
  async setMyCommands(commands, scope = null) {
    if (!this.axiosInstance) {
      throw new Error('Client not initialized');
    }

    const payload = {
      commands: commands.map(cmd => ({
        command: cmd.command.replace(/^\//, ''), // Remove leading slash if present
        description: cmd.description
      }))
    };

    if (scope) {
      payload.scope = scope;
    }

    try {
      const response = await this.axiosInstance.post('/setMyCommands', payload);
      if (!response.data.ok) {
        throw new Error(response.data.description);
      }
      this.log.info(`Set ${commands.length} bot commands`);
      return true;
    } catch (error) {
      this.log.error(`Failed to set commands: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Get current bot commands
   */
  async getMyCommands(scope = null) {
    if (!this.axiosInstance) {
      throw new Error('Client not initialized');
    }

    const params = scope ? { scope: JSON.stringify(scope) } : {};

    try {
      const response = await this.axiosInstance.get('/getMyCommands', { params });
      if (!response.data.ok) {
        throw new Error(response.data.description);
      }
      return response.data.result;
    } catch (error) {
      this.log.error(`Failed to get commands: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Delete bot commands
   */
  async deleteMyCommands(scope = null) {
    if (!this.axiosInstance) {
      throw new Error('Client not initialized');
    }

    const payload = scope ? { scope } : {};

    try {
      const response = await this.axiosInstance.post('/deleteMyCommands', payload);
      return response.data.ok;
    } catch (error) {
      this.log.error(`Failed to delete commands: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Register default commands on connect
   */
  async registerDefaultCommands() {
    const defaultCommands = [
      { command: 'start', description: 'Start the conversation' },
      { command: 'help', description: 'Get help information' },
      { command: 'status', description: 'Check bot status' }
    ];

    // Get custom commands from connection metadata
    try {
      const db = getDatabase();
      const account = db.prepare('SELECT connection_metadata FROM platform_accounts WHERE id = ?')
        .get(this.accountId);

      if (account?.connection_metadata) {
        const metadata = JSON.parse(account.connection_metadata);
        if (metadata.customCommands && Array.isArray(metadata.customCommands)) {
          await this.setMyCommands([...defaultCommands, ...metadata.customCommands]);
          return;
        }
      }
    } catch (e) {
      this.log.warn(`Failed to load custom commands: ${e.message}`);
    }

    await this.setMyCommands(defaultCommands);
  }

  // ============================================
  // Media Caching Methods
  // ============================================

  /**
   * Get file info from Telegram
   * @param {string} fileId - Telegram file_id
   * @returns {Object} File info including file_path
   */
  async getFile(fileId) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('Telegram Bot client is not connected');
    }

    try {
      const response = await this.axiosInstance.get('/getFile', {
        params: { file_id: fileId }
      });

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to get file');
      }

      return response.data.result;
    } catch (error) {
      this.log.error(`Failed to get file: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Download file from Telegram servers
   * @param {string} fileId - Telegram file_id
   * @returns {Promise<{buffer: Buffer, filePath: string, fileSize: number}>}
   */
  async downloadFile(fileId) {
    const fileInfo = await this.getFile(fileId);
    const filePath = fileInfo.file_path;

    // Construct download URL
    const downloadUrl = `https://api.telegram.org/file/bot${this.config.botToken}/${filePath}`;

    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    return {
      buffer: Buffer.from(response.data),
      filePath,
      fileSize: fileInfo.file_size,
      fileId
    };
  }

  /**
   * Get media file_id from message
   * @param {Object} message - Telegram message object
   * @returns {string|null} file_id or null
   */
  getMediaFileId(message) {
    if (message.photo && message.photo.length > 0) {
      // Get largest photo (last in array)
      return message.photo[message.photo.length - 1].file_id;
    }
    if (message.audio) return message.audio.file_id;
    if (message.voice) return message.voice.file_id;
    if (message.video) return message.video.file_id;
    if (message.video_note) return message.video_note.file_id;
    if (message.document) return message.document.file_id;
    if (message.sticker) return message.sticker.file_id;
    if (message.animation) return message.animation.file_id;
    return null;
  }

  /**
   * Cache media asynchronously
   * @param {string} messageId - Our internal message ID
   * @param {string} fileId - Telegram file_id
   * @param {Object} rawMessage - Original Telegram message
   */
  async cacheMediaAsync(messageId, fileId, rawMessage) {
    try {
      const db = getDatabase();

      // Get user_id for TTL settings
      const account = db.prepare('SELECT user_id FROM platform_accounts WHERE id = ?').get(this.accountId);
      if (!account) return;

      // Download file
      const fileData = await this.downloadFile(fileId);

      // Determine MIME type
      const mimeType = this.getMimeTypeFromMessage(rawMessage);

      // Get extension from MIME type
      const ext = this.getExtensionFromMime(mimeType);

      // Ensure media directory exists
      const fs = require('fs');
      const path = require('path');
      const mediaDir = path.join(__dirname, '..', 'data', 'media');
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }

      // Save file
      const filename = `${messageId}${ext}`;
      const localPath = path.join(mediaDir, filename);
      fs.writeFileSync(localPath, fileData.buffer);

      // Calculate TTL (default 7 days)
      const ttlDays = 7;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + ttlDays);

      // Create media_cache record
      const cacheId = uuidv4();
      db.prepare(`
        INSERT INTO media_cache (id, message_id, user_id, original_url, local_path, mime_type, file_size, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(cacheId, messageId, account.user_id, `telegram:${fileId}`, localPath, mimeType, fileData.fileSize, expiresAt.toISOString());

      this.log.info(`Cached media ${messageId} (${fileData.fileSize} bytes)`);
    } catch (error) {
      this.log.warn(`Failed to cache media: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get MIME type from message content
   */
  getMimeTypeFromMessage(message) {
    if (message.photo) return 'image/jpeg';
    if (message.audio) return message.audio.mime_type || 'audio/mpeg';
    if (message.voice) return 'audio/ogg';
    if (message.video) return message.video.mime_type || 'video/mp4';
    if (message.video_note) return 'video/mp4';
    if (message.document) return message.document.mime_type || 'application/octet-stream';
    if (message.sticker) return message.sticker.is_animated ? 'application/x-tgsticker' : 'image/webp';
    if (message.animation) return 'video/mp4';
    return 'application/octet-stream';
  }

  /**
   * Get file extension from MIME type
   */
  getExtensionFromMime(mimeType) {
    const mimeToExt = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'audio/wav': '.wav',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'application/pdf': '.pdf',
      'application/x-tgsticker': '.tgs',
      'application/octet-stream': '.bin'
    };
    return mimeToExt[mimeType] || '.bin';
  }

  // ============================================
  // Poll Methods
  // ============================================

  /**
   * Send a poll to a chat
   * @param {string} chatId - Chat to send poll to
   * @param {string} question - Poll question
   * @param {string[]} options - Poll options (2-10 items)
   * @param {Object} pollOptions - Additional options
   */
  async sendPoll(chatId, question, options, pollOptions = {}) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('Telegram Bot client is not connected');
    }

    if (options.length < 2 || options.length > 10) {
      throw new Error('Poll must have 2-10 options');
    }

    const payload = {
      chat_id: chatId,
      question,
      options,
      is_anonymous: pollOptions.isAnonymous !== false, // Default true
      type: pollOptions.type || 'regular', // 'regular' or 'quiz'
      allows_multiple_answers: pollOptions.allowsMultipleAnswers || false,
      correct_option_id: pollOptions.correctOptionId, // For quiz type
      explanation: pollOptions.explanation, // For quiz type
      open_period: pollOptions.openPeriod, // Seconds (5-600)
      close_date: pollOptions.closeDate, // Unix timestamp
      is_closed: pollOptions.isClosed || false,
      disable_notification: pollOptions.silent || false,
      reply_to_message_id: pollOptions.replyToMessageId
    };

    // Remove undefined values
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    try {
      const response = await this.axiosInstance.post('/sendPoll', payload);

      if (!response.data.ok) {
        throw new Error(response.data.description);
      }

      const result = response.data.result;
      return {
        messageId: result.message_id,
        pollId: result.poll.id,
        question: result.poll.question,
        options: result.poll.options,
        totalVoterCount: result.poll.total_voter_count
      };
    } catch (error) {
      this.log.error(`Failed to send poll: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Stop a poll and get final results
   * @param {string} chatId - Chat containing the poll
   * @param {number} messageId - Message ID of the poll
   */
  async stopPoll(chatId, messageId) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('Telegram Bot client is not connected');
    }

    try {
      const response = await this.axiosInstance.post('/stopPoll', {
        chat_id: chatId,
        message_id: messageId
      });

      if (!response.data.ok) {
        throw new Error(response.data.description);
      }

      const poll = response.data.result;
      return {
        id: poll.id,
        question: poll.question,
        options: poll.options.map(opt => ({
          text: opt.text,
          voterCount: opt.voter_count
        })),
        totalVoterCount: poll.total_voter_count,
        isClosed: poll.is_closed
      };
    } catch (error) {
      this.log.error(`Failed to stop poll: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Get content type from message
   */
  getContentType(message) {
    if (message.text) return 'text';
    if (message.photo) return 'photo';
    if (message.audio) return 'audio';
    if (message.voice) return 'voice';
    if (message.video) return 'video';
    if (message.video_note) return 'video_note';
    if (message.document) return 'document';
    if (message.sticker) return 'sticker';
    if (message.animation) return 'animation';
    if (message.location) return 'location';
    if (message.contact) return 'contact';
    if (message.poll) return 'poll';
    if (message.venue) return 'venue';
    return 'unknown';
  }

  /**
   * Check if message has media
   */
  hasMedia(message) {
    return !!(
      message.photo ||
      message.audio ||
      message.voice ||
      message.video ||
      message.video_note ||
      message.document ||
      message.sticker ||
      message.animation
    );
  }

  /**
   * Create inline keyboard markup
   */
  createInlineKeyboard(buttons) {
    return {
      inline_keyboard: buttons,
    };
  }

  /**
   * Create reply keyboard markup
   */
  createReplyKeyboard(buttons, options = {}) {
    return {
      keyboard: buttons,
      resize_keyboard: options.resize !== false,
      one_time_keyboard: options.oneTime || false,
      selective: options.selective || false,
    };
  }

  /**
   * Remove reply keyboard
   */
  removeReplyKeyboard(selective = false) {
    return {
      remove_keyboard: true,
      selective,
    };
  }

  /**
   * Handle API error and return normalized error
   */
  handleApiError(error) {
    if (error.response?.data) {
      const apiError = error.response.data;
      const err = new Error(apiError.description || 'Telegram API error');
      err.code = apiError.error_code;
      return err;
    }
    return error;
  }

  /**
   * Update account status in database
   */
  updateAccountStatus(status) {
    try {
      const db = getDatabase();
      db.prepare(
        `
        UPDATE platform_accounts
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(status, this.accountId);
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
      db.prepare(
        `
        UPDATE platform_accounts
        SET last_error = ?, error_count = error_count + 1, updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(errorMessage, this.accountId);
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
        botId: info.botId,
        username: info.username,
        firstName: info.firstName,
        canJoinGroups: info.canJoinGroups,
        connectedAt: new Date().toISOString(),
      };

      db.prepare(
        `
        UPDATE platform_accounts
        SET connection_metadata = ?,
            last_connected_at = datetime('now'),
            last_error = NULL,
            error_count = 0,
            updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(JSON.stringify(metadata), this.accountId);
    } catch (error) {
      this.log.error(`Failed to update connection metadata: ${error.message}`);
    }
  }
}

module.exports = {
  TelegramBotClient,
  MESSAGE_TYPES,
};
