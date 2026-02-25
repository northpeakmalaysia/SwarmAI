/**
 * WhatsApp Business Client
 * Official Meta Business API integration
 *
 * Requires:
 * - Business Phone Number registered with Meta
 * - Access Token from Facebook Developer Console
 * - Phone Number ID from WhatsApp Business API
 * - Business Account ID
 *
 * Webhook setup required for incoming messages
 */

const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const { createPlatformLogger } = require('../services/logger.cjs');
const { getDatabase } = require('../services/database.cjs');

// Lazy-load services to avoid startup issues
let _circuitBreaker = null;
let _metricsService = null;
let _rateLimitService = null;

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

function getRateLimitServiceSafe() {
  if (!_rateLimitService) {
    try {
      _rateLimitService = require('../services/whatsappRateLimitService.cjs');
    } catch (error) {
      // Rate limit service not available
    }
  }
  return _rateLimitService;
}

// WhatsApp Business API constants
const WA_API_VERSION = 'v18.0';
const WA_API_BASE = `https://graph.facebook.com/${WA_API_VERSION}`;

// Message types
const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
  DOCUMENT: 'document',
  STICKER: 'sticker',
  LOCATION: 'location',
  CONTACTS: 'contacts',
  INTERACTIVE: 'interactive',
  TEMPLATE: 'template',
  REACTION: 'reaction',
};

/**
 * WhatsApp Business Client Class
 * Manages WhatsApp Business API communication
 */
class WhatsAppBusinessClient extends EventEmitter {
  constructor(accountId, config = {}) {
    super();

    this.accountId = accountId;
    this.config = {
      accessToken: config.accessToken || null,
      phoneNumberId: config.phoneNumberId || null,
      businessAccountId: config.businessAccountId || null,
      webhookVerifyToken: config.webhookVerifyToken || null,
      ...config,
    };

    this.status = 'disconnected';
    this.log = createPlatformLogger('whatsapp-business', accountId);
    this.axiosInstance = null;
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
          platform: 'whatsapp-business',
          status,
        });
      }
    }
  }

  /**
   * Connect to WhatsApp Business API
   */
  async connect() {
    if (!this.config.accessToken || !this.config.phoneNumberId) {
      throw new Error('Access token and phone number ID are required');
    }

    this.log.info('Initializing WhatsApp Business API client...');
    this.setStatus('connecting');

    // Create axios instance
    this.axiosInstance = axios.create({
      baseURL: WA_API_BASE,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Verify credentials by getting phone number info
    try {
      const response = await this.axiosInstance.get(`/${this.config.phoneNumberId}`);

      this.log.info(`Connected to WhatsApp Business API`);
      this.log.info(`Phone Number: ${response.data.display_phone_number}`);
      this.log.info(`Quality Rating: ${response.data.quality_rating}`);

      // Update connection metadata
      await this.updateConnectionMetadata({
        phoneNumber: response.data.display_phone_number,
        verifiedName: response.data.verified_name,
        qualityRating: response.data.quality_rating,
        codeVerificationStatus: response.data.code_verification_status,
      });

      this.setStatus('connected');

      this.emit('ready', {
        phoneNumber: response.data.display_phone_number,
        verifiedName: response.data.verified_name,
      });

      return true;
    } catch (error) {
      this.log.error(`Failed to connect: ${error.message}`);

      if (error.response) {
        this.log.error(`API Error: ${JSON.stringify(error.response.data)}`);
        this.updateAccountError(error.response.data?.error?.message || error.message);
      } else {
        this.updateAccountError(error.message);
      }

      this.setStatus('error');
      throw error;
    }
  }

  /**
   * Disconnect (cleanup)
   */
  async disconnect() {
    this.axiosInstance = null;
    this.setStatus('disconnected');
    this.log.info('WhatsApp Business client disconnected');
  }

  /**
   * Send a text message
   */
  async sendMessage(recipientPhone, text, options = {}) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('WhatsApp Business client is not connected');
    }

    const startTime = Date.now();
    const metrics = getMetricsServiceSafe();
    const circuitBreaker = getCircuitBreakerSafe();
    const rateLimitService = getRateLimitServiceSafe();

    const normalizedPhone = this.normalizePhoneNumber(recipientPhone);

    // Check rate limits before sending
    if (rateLimitService) {
      const rateCheck = await rateLimitService.checkWhatsAppRateLimit(
        this.accountId,
        normalizedPhone,
        'text'
      );
      if (!rateCheck.allowed) {
        metrics?.recordRateLimitHit('whatsapp-business', this.accountId, rateCheck.retryAfterMs);
        const error = new rateLimitService.RateLimitError(
          `Rate limit exceeded: ${rateCheck.limitType}`,
          rateCheck.retryAfterMs,
          rateCheck.limitType
        );
        throw error;
      }
    }

    this.log.info(`Sending message to ${normalizedPhone}`);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'text',
      text: {
        preview_url: options.previewUrl !== false,
        body: text,
      },
    };

    const circuitKey = `whatsapp-business:${this.accountId}:send`;

    const sendOperation = async () => {
      const response = await this.axiosInstance.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );
      return response;
    };

    try {
      let response;

      if (circuitBreaker) {
        if (!circuitBreaker.canExecute(circuitKey)) {
          metrics?.recordCircuitState('whatsapp-business', this.accountId, 'open');
          throw new Error('Circuit breaker open');
        }
        response = await circuitBreaker.execute(circuitKey, sendOperation);
        circuitBreaker.recordSuccess(circuitKey);
      } else {
        response = await sendOperation();
      }

      // Record success metrics
      const duration = Date.now() - startTime;
      metrics?.recordMessageSent('whatsapp-business', this.accountId, duration, {
        recipientPhone: normalizedPhone,
        messageType: 'text',
      });

      return {
        id: response.data.messages[0].id,
        timestamp: new Date(),
      };
    } catch (error) {
      if (circuitBreaker) {
        circuitBreaker.recordFailure(circuitKey, error);
      }
      metrics?.recordError('whatsapp-business', this.accountId, 'send_failed', error.message);

      this.log.error(`Failed to send message: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Send media message (image, video, audio, document)
   */
  async sendMedia(recipientPhone, mediaType, mediaUrlOrId, options = {}) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('WhatsApp Business client is not connected');
    }

    const startTime = Date.now();
    const metrics = getMetricsServiceSafe();
    const circuitBreaker = getCircuitBreakerSafe();
    const rateLimitService = getRateLimitServiceSafe();

    const normalizedPhone = this.normalizePhoneNumber(recipientPhone);

    // Check rate limits
    if (rateLimitService) {
      const rateCheck = await rateLimitService.checkWhatsAppRateLimit(
        this.accountId,
        normalizedPhone,
        'media'
      );
      if (!rateCheck.allowed) {
        metrics?.recordRateLimitHit('whatsapp-business', this.accountId, rateCheck.retryAfterMs);
        throw new rateLimitService.RateLimitError(
          `Rate limit exceeded: ${rateCheck.limitType}`,
          rateCheck.retryAfterMs,
          rateCheck.limitType
        );
      }
    }

    this.log.info(`Sending ${mediaType} to ${normalizedPhone}`);

    const mediaPayload = {};

    // Determine if it's a URL or media ID
    if (mediaUrlOrId.startsWith('http://') || mediaUrlOrId.startsWith('https://')) {
      mediaPayload.link = mediaUrlOrId;
    } else {
      mediaPayload.id = mediaUrlOrId;
    }

    if (options.caption) {
      mediaPayload.caption = options.caption;
    }

    if (options.filename) {
      mediaPayload.filename = options.filename;
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: mediaType,
      [mediaType]: mediaPayload,
    };

    const circuitKey = `whatsapp-business:${this.accountId}:send`;

    const sendOperation = async () => {
      const response = await this.axiosInstance.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );
      return response;
    };

    try {
      let response;

      if (circuitBreaker && circuitBreaker.canExecute(circuitKey)) {
        response = await circuitBreaker.execute(circuitKey, sendOperation);
        circuitBreaker.recordSuccess(circuitKey);
      } else if (circuitBreaker && !circuitBreaker.canExecute(circuitKey)) {
        metrics?.recordCircuitState('whatsapp-business', this.accountId, 'open');
        throw new Error('Circuit breaker open');
      } else {
        response = await sendOperation();
      }

      // Record success metrics
      const duration = Date.now() - startTime;
      metrics?.recordMessageSent('whatsapp-business', this.accountId, duration, {
        recipientPhone: normalizedPhone,
        messageType: mediaType,
      });

      return {
        id: response.data.messages[0].id,
        timestamp: new Date(),
      };
    } catch (error) {
      if (circuitBreaker) {
        circuitBreaker.recordFailure(circuitKey, error);
      }
      metrics?.recordError('whatsapp-business', this.accountId, 'send_media_failed', error.message);

      this.log.error(`Failed to send media: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Send template message (for initiating conversations)
   */
  async sendTemplate(recipientPhone, templateName, languageCode = 'en', components = []) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('WhatsApp Business client is not connected');
    }

    const normalizedPhone = this.normalizePhoneNumber(recipientPhone);

    this.log.info(`Sending template "${templateName}" to ${normalizedPhone}`);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components,
      },
    };

    try {
      const response = await this.axiosInstance.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );

      return {
        id: response.data.messages[0].id,
        timestamp: new Date(),
      };
    } catch (error) {
      this.log.error(`Failed to send template: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Send interactive message (buttons, list)
   */
  async sendInteractive(recipientPhone, interactiveType, interactiveData) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('WhatsApp Business client is not connected');
    }

    const normalizedPhone = this.normalizePhoneNumber(recipientPhone);

    this.log.info(`Sending interactive ${interactiveType} to ${normalizedPhone}`);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'interactive',
      interactive: {
        type: interactiveType, // 'button', 'list', 'product', 'product_list'
        ...interactiveData,
      },
    };

    try {
      const response = await this.axiosInstance.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );

      return {
        id: response.data.messages[0].id,
        timestamp: new Date(),
      };
    } catch (error) {
      this.log.error(`Failed to send interactive: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Send reaction to a message
   */
  async sendReaction(recipientPhone, messageId, emoji) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('WhatsApp Business client is not connected');
    }

    const normalizedPhone = this.normalizePhoneNumber(recipientPhone);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji,
      },
    };

    try {
      const response = await this.axiosInstance.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );

      return {
        id: response.data.messages[0].id,
        timestamp: new Date(),
      };
    } catch (error) {
      this.log.error(`Failed to send reaction: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('WhatsApp Business client is not connected');
    }

    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };

    try {
      await this.axiosInstance.post(`/${this.config.phoneNumberId}/messages`, payload);
      return true;
    } catch (error) {
      this.log.error(`Failed to mark as read: ${error.message}`);
      return false;
    }
  }

  /**
   * Upload media to WhatsApp
   */
  async uploadMedia(filePath, mimeType) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('WhatsApp Business client is not connected');
    }

    const FormData = require('form-data');
    const fs = require('fs');

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', fs.createReadStream(filePath));
    form.append('type', mimeType);

    try {
      const response = await axios.post(
        `${WA_API_BASE}/${this.config.phoneNumberId}/media`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${this.config.accessToken}`,
          },
        }
      );

      return {
        mediaId: response.data.id,
      };
    } catch (error) {
      this.log.error(`Failed to upload media: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Get media URL from media ID
   */
  async getMediaUrl(mediaId) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('WhatsApp Business client is not connected');
    }

    try {
      const response = await this.axiosInstance.get(`/${mediaId}`);
      return response.data.url;
    } catch (error) {
      this.log.error(`Failed to get media URL: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Get business profile
   */
  async getBusinessProfile() {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('WhatsApp Business client is not connected');
    }

    try {
      const response = await this.axiosInstance.get(
        `/${this.config.phoneNumberId}/whatsapp_business_profile`,
        {
          params: {
            fields: 'about,address,description,email,profile_picture_url,websites,vertical',
          },
        }
      );

      return response.data.data[0];
    } catch (error) {
      this.log.error(`Failed to get business profile: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Update business profile
   */
  async updateBusinessProfile(profileData) {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('WhatsApp Business client is not connected');
    }

    const payload = {
      messaging_product: 'whatsapp',
      ...profileData,
    };

    try {
      await this.axiosInstance.post(
        `/${this.config.phoneNumberId}/whatsapp_business_profile`,
        payload
      );

      return true;
    } catch (error) {
      this.log.error(`Failed to update business profile: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Get message templates
   */
  async getTemplates() {
    if (!this.axiosInstance || this.status !== 'connected') {
      throw new Error('WhatsApp Business client is not connected');
    }

    if (!this.config.businessAccountId) {
      throw new Error('Business Account ID is required for template operations');
    }

    try {
      const response = await this.axiosInstance.get(
        `/${this.config.businessAccountId}/message_templates`,
        {
          params: {
            limit: 100,
          },
        }
      );

      return response.data.data;
    } catch (error) {
      this.log.error(`Failed to get templates: ${error.message}`);
      throw this.handleApiError(error);
    }
  }

  /**
   * Process incoming webhook
   * Call this from webhook route handler
   */
  processWebhook(body) {
    if (!body.object || body.object !== 'whatsapp_business_account') {
      this.log.warn('Invalid webhook object');
      return null;
    }

    const results = [];

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'messages') {
          const value = change.value;

          // Process messages
          for (const message of value.messages || []) {
            const contact = value.contacts?.find((c) => c.wa_id === message.from);

            const unifiedMessage = {
              id: uuidv4(),
              externalId: message.id,
              platform: 'whatsapp-business',
              direction: 'incoming',
              from: message.from,
              to: value.metadata.display_phone_number,
              sender: {
                id: message.from,
                name: contact?.profile?.name || message.from,
                phone: message.from,
              },
              contentType: this.getContentType(message),
              text: message.text?.body || undefined,
              hasMedia: this.hasMedia(message),
              timestamp: new Date(parseInt(message.timestamp) * 1000),
              isGroup: false,
              raw: message,
            };

            this.log.info(
              `📩 Message from: ${contact?.profile?.name || message.from} (${message.from})`
            );

            this.emit('message', unifiedMessage);
            results.push(unifiedMessage);
          }

          // Process status updates
          for (const status of value.statuses || []) {
            this.emit('status_update', {
              messageId: status.id,
              recipientId: status.recipient_id,
              status: status.status, // 'sent', 'delivered', 'read', 'failed'
              timestamp: new Date(parseInt(status.timestamp) * 1000),
              errors: status.errors,
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Verify webhook challenge (for Meta verification)
   */
  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.config.webhookVerifyToken) {
      this.log.info('Webhook verified successfully');
      return challenge;
    }

    this.log.warn('Webhook verification failed');
    return null;
  }

  /**
   * Validate webhook signature (HMAC-SHA256)
   * Meta signs webhook payloads with the app secret
   * @param {string} rawBody - Raw request body string
   * @param {string} signature - X-Hub-Signature-256 header value
   * @param {string} appSecret - App secret from Meta Developer Console
   * @returns {{valid: boolean, reason: string|null}}
   */
  static validateWebhookSignature(rawBody, signature, appSecret) {
    if (!signature) {
      return { valid: false, reason: 'Missing X-Hub-Signature-256 header' };
    }

    if (!appSecret) {
      // If no app secret configured, skip validation but warn
      return { valid: true, reason: 'App secret not configured - skipping validation' };
    }

    // Signature format: "sha256=<hex_digest>"
    const signatureParts = signature.split('=');
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
      return { valid: false, reason: 'Invalid signature format' };
    }

    const providedSignature = signatureParts[1];

    // Calculate expected signature
    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest('hex');

    // Timing-safe comparison to prevent timing attacks
    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(providedSignature),
        Buffer.from(expectedSignature)
      );

      return {
        valid: isValid,
        reason: isValid ? null : 'Signature mismatch',
      };
    } catch (error) {
      // Length mismatch causes timingSafeEqual to throw
      return { valid: false, reason: 'Signature length mismatch' };
    }
  }

  /**
   * Instance method wrapper for signature validation
   * Uses appSecret from config if available
   */
  validateSignature(rawBody, signature) {
    const appSecret = this.config.appSecret || null;
    return WhatsAppBusinessClient.validateWebhookSignature(rawBody, signature, appSecret);
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Normalize phone number (remove + and formatting)
   */
  normalizePhoneNumber(phone) {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');

    // Remove leading zeros
    cleaned = cleaned.replace(/^0+/, '');

    // Add country code if appears to be local (starts with common local patterns)
    // This is a basic heuristic - adjust based on your target markets
    if (cleaned.length < 10) {
      this.log.warn(`Phone number appears too short: ${cleaned}`);
    }

    return cleaned;
  }

  /**
   * Get content type from message
   */
  getContentType(message) {
    if (message.text) return 'text';
    if (message.image) return 'image';
    if (message.audio) return 'audio';
    if (message.video) return 'video';
    if (message.document) return 'document';
    if (message.sticker) return 'sticker';
    if (message.location) return 'location';
    if (message.contacts) return 'contacts';
    if (message.interactive) return 'interactive';
    if (message.button) return 'button';
    if (message.reaction) return 'reaction';
    return 'unknown';
  }

  /**
   * Check if message has media
   */
  hasMedia(message) {
    return !!(
      message.image ||
      message.audio ||
      message.video ||
      message.document ||
      message.sticker
    );
  }

  /**
   * Handle API error and return normalized error
   */
  handleApiError(error) {
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      const err = new Error(apiError.message || 'WhatsApp Business API error');
      err.code = apiError.code;
      err.type = apiError.type;
      err.fbtrace_id = apiError.fbtrace_id;
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
        phoneNumber: info.phoneNumber,
        verifiedName: info.verifiedName,
        qualityRating: info.qualityRating,
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
  WhatsAppBusinessClient,
  MESSAGE_TYPES,
  WA_API_VERSION,
};
