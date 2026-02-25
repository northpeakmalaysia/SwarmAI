/**
 * Send Text Node
 *
 * Sends a text message through a specified channel (WhatsApp, Telegram, Email, Webhook).
 *
 * Platform-Specific Features:
 * - WhatsApp: mentions, link preview control, reactions, location
 * - Telegram: inline keyboards, reply markup, silent messages, web page preview control
 * - Email: attachments, CC/BCC, Reply-To, custom headers
 * - Webhook: custom HTTP methods, headers, request body customization
 *
 * NOTE: Requires platform clients to be injected via services parameter in FlowExecutionEngine
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SendTextNode extends BaseNodeExecutor {
  constructor() {
    super('messaging:sendText', 'messaging');
  }

  async execute(context) {
    const { node, services } = context;
    const data = node.data || {};

    // Get message content
    const message = this.resolveTemplate(
      this.getRequired(data, 'message'),
      context
    );

    // Get recipient
    const recipient = this.resolveTemplate(
      this.getRequired(data, 'recipient'),
      context
    );

    // Get channel/platform
    const channel = this.getOptional(data, 'channel', 'default');

    // Common options
    const options = {
      format: this.getOptional(data, 'format', 'text'), // text, markdown, html
      parseMode: this.getOptional(data, 'parseMode', null),
      replyToMessageId: this.getOptional(data, 'replyToMessageId', null),

      // WhatsApp-specific options
      mentions: this.getOptional(data, 'mentions', null), // Array of phone numbers to mention
      linkPreview: this.getOptional(data, 'linkPreview', true), // Enable/disable link preview

      // Telegram-specific options
      buttons: this.getOptional(data, 'buttons', null), // Inline keyboard buttons
      replyMarkup: this.getOptional(data, 'replyMarkup', null), // Full reply markup object
      silentMessage: this.getOptional(data, 'silentMessage', false), // Send without notification
      disableWebPagePreview: this.getOptional(data, 'disableWebPagePreview', false),

      // Email-specific options
      attachments: this.getOptional(data, 'attachments', null), // Array of attachment objects
      cc: this.getOptional(data, 'cc', null), // CC recipients (comma-separated or array)
      bcc: this.getOptional(data, 'bcc', null), // BCC recipients (comma-separated or array)
      replyTo: this.getOptional(data, 'replyTo', null), // Reply-To address
      customHeaders: this.getOptional(data, 'customHeaders', null), // Object with custom headers
    };

    try {
      let result;

      switch (channel.toLowerCase()) {
        case 'whatsapp':
          result = await this.sendWhatsApp(services, recipient, message, options);
          break;

        case 'telegram':
          result = await this.sendTelegram(services, recipient, message, options);
          break;

        case 'email':
          result = await this.sendEmail(services, recipient, message, options, data);
          break;

        case 'webhook':
          result = await this.sendWebhook(services, recipient, message, options, data);
          break;

        default:
          // Try to auto-detect channel from recipient format
          if (recipient.includes('@') && recipient.includes('.')) {
            result = await this.sendEmail(services, recipient, message, options, data);
          } else if (recipient.startsWith('+') || /^\d+$/.test(recipient)) {
            // Phone number format - try WhatsApp
            result = await this.sendWhatsApp(services, recipient, message, options);
          } else {
            return this.failure(
              `Unknown channel: ${channel}. Specify 'whatsapp', 'telegram', 'email', or 'webhook'.`,
              'UNKNOWN_CHANNEL'
            );
          }
      }

      return this.success({
        channel,
        recipient,
        messageLength: message.length,
        ...result,
        sentAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.failure(
        `Failed to send message: ${error.message}`,
        'SEND_ERROR',
        true // Usually network errors are recoverable
      );
    }
  }

  /**
   * Send WhatsApp message with platform-specific features
   */
  async sendWhatsApp(services, recipient, message, options) {
    const whatsapp = services?.whatsapp;

    if (!whatsapp) {
      throw new Error('WhatsApp service not available');
    }

    // Format phone number
    const phoneNumber = recipient.replace(/[^0-9]/g, '');

    // Build WhatsApp-specific options
    const whatsappOptions = {
      quotedMessageId: options.replyToMessageId,
    };

    // Add mentions if provided (WhatsApp Web.js mentions format)
    if (options.mentions && Array.isArray(options.mentions)) {
      whatsappOptions.mentions = options.mentions.map(m => m.replace(/[^0-9]/g, '') + '@c.us');
    }

    // Add link preview control
    if (options.linkPreview !== undefined) {
      whatsappOptions.linkPreview = options.linkPreview;
    }

    const result = await whatsapp.sendMessage(phoneNumber, message, whatsappOptions);

    return {
      messageId: result.id || result.messageId,
      status: 'sent',
      platform: 'whatsapp',
    };
  }

  /**
   * Send Telegram message with inline keyboards and advanced options
   */
  async sendTelegram(services, recipient, message, options) {
    const telegram = services?.telegram;

    if (!telegram) {
      throw new Error('Telegram service not available');
    }

    // Determine parse mode
    const parseMode = options.parseMode || (options.format === 'markdown' ? 'MarkdownV2' : 'HTML');

    // Build Telegram-specific options
    const telegramOptions = {
      parse_mode: parseMode,
      reply_to_message_id: options.replyToMessageId,
      disable_notification: options.silentMessage,
      disable_web_page_preview: options.disableWebPagePreview,
    };

    // Add reply markup (inline keyboard, reply keyboard, etc.)
    if (options.replyMarkup) {
      // Use provided reply markup object directly
      telegramOptions.reply_markup = options.replyMarkup;
    } else if (options.buttons && Array.isArray(options.buttons)) {
      // Convert simple buttons array to inline keyboard
      // Expected format: [{ text: 'Button', callback_data: 'action' }, ...]
      telegramOptions.reply_markup = {
        inline_keyboard: [options.buttons], // Single row
      };
    }

    const result = await telegram.sendMessage(recipient, message, telegramOptions);

    return {
      messageId: result.message_id,
      status: 'sent',
      platform: 'telegram',
    };
  }

  /**
   * Send email with attachments, CC/BCC, and custom headers
   */
  async sendEmail(services, recipient, message, options, data) {
    const email = services?.email;

    if (!email) {
      throw new Error('Email service not available');
    }

    // Get subject
    const subject = this.resolveTemplate(
      this.getOptional(data, 'subject', 'Message from SwarmAI'),
      { input: {}, variables: {}, previousResults: {} }
    );

    // Build email options
    const emailOptions = {
      to: recipient,
      subject,
      body: message,
      isHtml: options.format === 'html',
    };

    // Add CC (can be string or array)
    if (options.cc) {
      emailOptions.cc = Array.isArray(options.cc) ? options.cc.join(',') : options.cc;
    }

    // Add BCC (can be string or array)
    if (options.bcc) {
      emailOptions.bcc = Array.isArray(options.bcc) ? options.bcc.join(',') : options.bcc;
    }

    // Add Reply-To
    if (options.replyTo) {
      emailOptions.replyTo = options.replyTo;
    }

    // Add attachments
    // Expected format: [{ filename: 'file.pdf', path: '/path/to/file.pdf' }, ...]
    // Or: [{ filename: 'file.txt', content: 'text content' }, ...]
    if (options.attachments && Array.isArray(options.attachments)) {
      emailOptions.attachments = options.attachments;
    }

    // Add custom headers
    if (options.customHeaders && typeof options.customHeaders === 'object') {
      emailOptions.headers = options.customHeaders;
    }

    const result = await email.send(emailOptions);

    return {
      messageId: result.messageId,
      status: 'sent',
      platform: 'email',
    };
  }

  /**
   * Send webhook with custom HTTP method and headers
   */
  async sendWebhook(services, recipient, message, options, data) {
    const method = this.getOptional(data, 'webhookMethod', 'POST');
    const headers = this.getOptional(data, 'webhookHeaders', {});
    const bodyFormat = this.getOptional(data, 'webhookBodyFormat', 'json'); // json, form, raw

    // Build request body based on format
    let body;
    let contentType;

    switch (bodyFormat) {
      case 'json':
        body = JSON.stringify({
          message,
          format: options.format,
          timestamp: new Date().toISOString(),
        });
        contentType = 'application/json';
        break;

      case 'form':
        const params = new URLSearchParams();
        params.append('message', message);
        params.append('format', options.format);
        params.append('timestamp', new Date().toISOString());
        body = params.toString();
        contentType = 'application/x-www-form-urlencoded';
        break;

      case 'raw':
        body = message;
        contentType = 'text/plain';
        break;

      default:
        body = JSON.stringify({ message });
        contentType = 'application/json';
    }

    const response = await fetch(recipient, {
      method,
      headers: {
        'Content-Type': contentType,
        ...headers,
      },
      body: method !== 'GET' ? body : undefined,
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with status ${response.status}`);
    }

    return {
      status: 'sent',
      httpStatus: response.status,
      platform: 'webhook',
    };
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Required fields
    if (!data.message) {
      errors.push('Message content is required');
    }

    if (!data.recipient) {
      errors.push('Recipient is required');
    }

    // Channel validation
    const validChannels = ['whatsapp', 'telegram', 'email', 'webhook', 'default'];
    if (data.channel && !validChannels.includes(data.channel.toLowerCase())) {
      errors.push(`Invalid channel: ${data.channel}`);
    }

    // WhatsApp-specific validation
    if (data.channel === 'whatsapp') {
      if (data.mentions && !Array.isArray(data.mentions)) {
        errors.push('WhatsApp mentions must be an array of phone numbers');
      }
    }

    // Telegram-specific validation
    if (data.channel === 'telegram') {
      if (data.buttons && !Array.isArray(data.buttons)) {
        errors.push('Telegram buttons must be an array');
      }

      if (data.replyMarkup && typeof data.replyMarkup !== 'object') {
        errors.push('Telegram reply markup must be an object');
      }
    }

    // Email-specific validation
    if (data.channel === 'email') {
      if (!data.subject) {
        errors.push('Email subject is required');
      }

      if (data.cc && !Array.isArray(data.cc) && typeof data.cc !== 'string') {
        errors.push('Email CC must be a string or array');
      }

      if (data.bcc && !Array.isArray(data.bcc) && typeof data.bcc !== 'string') {
        errors.push('Email BCC must be a string or array');
      }

      if (data.attachments && !Array.isArray(data.attachments)) {
        errors.push('Email attachments must be an array');
      }

      if (data.customHeaders && typeof data.customHeaders !== 'object') {
        errors.push('Email custom headers must be an object');
      }
    }

    // Webhook-specific validation
    if (data.channel === 'webhook') {
      const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      if (data.webhookMethod && !validMethods.includes(data.webhookMethod.toUpperCase())) {
        errors.push(`Invalid webhook method: ${data.webhookMethod}`);
      }

      const validFormats = ['json', 'form', 'raw'];
      if (data.webhookBodyFormat && !validFormats.includes(data.webhookBodyFormat)) {
        errors.push(`Invalid webhook body format: ${data.webhookBodyFormat}`);
      }
    }

    return errors;
  }

  /**
   * Get metadata for FlowBuilder UI
   */
  static getMetadata() {
    return {
      type: 'messaging:sendText',
      category: 'messaging',
      name: 'Send Text Message',
      description: 'Send a text message via WhatsApp, Telegram, Email, or Webhook with platform-specific features',
      icon: 'message-square',
      properties: [
        // Required fields
        {
          name: 'channel',
          type: 'select',
          label: 'Channel',
          description: 'Communication channel to use',
          required: true,
          options: [
            { value: 'default', label: 'Auto-detect from recipient' },
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'telegram', label: 'Telegram' },
            { value: 'email', label: 'Email' },
            { value: 'webhook', label: 'HTTP Webhook' },
          ],
          default: 'default',
        },
        {
          name: 'recipient',
          type: 'string',
          label: 'Recipient',
          description: 'Phone number, email, chat ID, or webhook URL',
          required: true,
          placeholder: '+1234567890 or user@example.com',
        },
        {
          name: 'message',
          type: 'text',
          label: 'Message',
          description: 'Message content (supports {{templates}})',
          required: true,
          multiline: true,
          rows: 4,
        },

        // Common options
        {
          name: 'format',
          type: 'select',
          label: 'Message Format',
          description: 'Text formatting style',
          options: [
            { value: 'text', label: 'Plain Text' },
            { value: 'markdown', label: 'Markdown' },
            { value: 'html', label: 'HTML' },
          ],
          default: 'text',
        },
        {
          name: 'replyToMessageId',
          type: 'string',
          label: 'Reply To Message ID',
          description: 'Reply to a specific message (optional)',
          placeholder: 'message-id',
        },

        // WhatsApp-specific properties
        {
          name: 'mentions',
          type: 'array',
          label: 'Mentions (WhatsApp)',
          description: 'Array of phone numbers to mention (@user)',
          visibleWhen: 'channel === "whatsapp"',
          itemType: 'string',
          placeholder: '+1234567890',
        },
        {
          name: 'linkPreview',
          type: 'boolean',
          label: 'Link Preview (WhatsApp)',
          description: 'Show link preview in message',
          visibleWhen: 'channel === "whatsapp"',
          default: true,
        },

        // Telegram-specific properties
        {
          name: 'buttons',
          type: 'array',
          label: 'Inline Buttons (Telegram)',
          description: 'Inline keyboard buttons',
          visibleWhen: 'channel === "telegram"',
          itemType: 'object',
          placeholder: '[{ text: "Button", callback_data: "action" }]',
        },
        {
          name: 'replyMarkup',
          type: 'object',
          label: 'Reply Markup (Telegram)',
          description: 'Full reply markup object (advanced)',
          visibleWhen: 'channel === "telegram"',
          placeholder: '{ inline_keyboard: [[...]] }',
        },
        {
          name: 'silentMessage',
          type: 'boolean',
          label: 'Silent Message (Telegram)',
          description: 'Send without notification sound',
          visibleWhen: 'channel === "telegram"',
          default: false,
        },
        {
          name: 'disableWebPagePreview',
          type: 'boolean',
          label: 'Disable Web Preview (Telegram)',
          description: 'Disable link preview in message',
          visibleWhen: 'channel === "telegram"',
          default: false,
        },

        // Email-specific properties
        {
          name: 'subject',
          type: 'string',
          label: 'Subject (Email)',
          description: 'Email subject line',
          visibleWhen: 'channel === "email"',
          required: true,
          placeholder: 'Email subject',
        },
        {
          name: 'cc',
          type: 'string',
          label: 'CC (Email)',
          description: 'Carbon copy recipients (comma-separated)',
          visibleWhen: 'channel === "email"',
          placeholder: 'user1@example.com, user2@example.com',
        },
        {
          name: 'bcc',
          type: 'string',
          label: 'BCC (Email)',
          description: 'Blind carbon copy recipients (comma-separated)',
          visibleWhen: 'channel === "email"',
          placeholder: 'user1@example.com, user2@example.com',
        },
        {
          name: 'replyTo',
          type: 'string',
          label: 'Reply-To (Email)',
          description: 'Reply-To email address',
          visibleWhen: 'channel === "email"',
          placeholder: 'reply@example.com',
        },
        {
          name: 'attachments',
          type: 'array',
          label: 'Attachments (Email)',
          description: 'Email attachments',
          visibleWhen: 'channel === "email"',
          itemType: 'object',
          placeholder: '[{ filename: "file.pdf", path: "/path/to/file.pdf" }]',
        },
        {
          name: 'customHeaders',
          type: 'object',
          label: 'Custom Headers (Email)',
          description: 'Additional email headers',
          visibleWhen: 'channel === "email"',
          placeholder: '{ "X-Priority": "1" }',
        },

        // Webhook-specific properties
        {
          name: 'webhookMethod',
          type: 'select',
          label: 'HTTP Method (Webhook)',
          description: 'HTTP request method',
          visibleWhen: 'channel === "webhook"',
          options: [
            { value: 'GET', label: 'GET' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'PATCH', label: 'PATCH' },
            { value: 'DELETE', label: 'DELETE' },
          ],
          default: 'POST',
        },
        {
          name: 'webhookHeaders',
          type: 'object',
          label: 'Headers (Webhook)',
          description: 'Custom HTTP headers',
          visibleWhen: 'channel === "webhook"',
          placeholder: '{ "Authorization": "Bearer token" }',
        },
        {
          name: 'webhookBodyFormat',
          type: 'select',
          label: 'Body Format (Webhook)',
          description: 'Request body format',
          visibleWhen: 'channel === "webhook"',
          options: [
            { value: 'json', label: 'JSON' },
            { value: 'form', label: 'Form Data' },
            { value: 'raw', label: 'Raw Text' },
          ],
          default: 'json',
        },
      ],
      outputs: [
        {
          name: 'channel',
          type: 'string',
          description: 'Channel used to send message',
        },
        {
          name: 'recipient',
          type: 'string',
          description: 'Message recipient',
        },
        {
          name: 'messageId',
          type: 'string',
          description: 'Platform-specific message ID',
        },
        {
          name: 'status',
          type: 'string',
          description: 'Send status (sent, failed)',
        },
        {
          name: 'platform',
          type: 'string',
          description: 'Platform identifier',
        },
        {
          name: 'messageLength',
          type: 'number',
          description: 'Message length in characters',
        },
        {
          name: 'sentAt',
          type: 'string',
          description: 'ISO timestamp when message was sent',
        },
        {
          name: 'httpStatus',
          type: 'number',
          description: 'HTTP status code (webhook only)',
        },
      ],
    };
  }
}

module.exports = { SendTextNode };
