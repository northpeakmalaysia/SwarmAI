/**
 * Send Media Node
 *
 * Sends media files (images, videos, audio, documents) through messaging platforms.
 *
 * Platform-Specific Features:
 * - WhatsApp: images, videos, audio, documents with captions
 * - Telegram: photos, videos, audio, documents, voice, animations
 * - Email: file attachments via email
 *
 * Supported Media Types:
 * - image (photo/image)
 * - video
 * - audio
 * - document (PDF, files)
 * - voice (Telegram only)
 * - animation/GIF (Telegram only)
 *
 * NOTE: Requires platform clients to be injected via services parameter in FlowExecutionEngine
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SendMediaNode extends BaseNodeExecutor {
  constructor() {
    super('messaging:sendMedia', 'messaging');
  }

  async execute(context) {
    const { node, services } = context;
    const data = node.data || {};

    // Get recipient
    const recipient = this.resolveTemplate(
      this.getRequired(data, 'recipient'),
      context
    );

    // Get media type
    const mediaType = this.getOptional(data, 'mediaType', 'image');

    // Get media source (URL or file path)
    const mediaSource = this.resolveTemplate(
      this.getRequired(data, 'mediaSource'),
      context
    );

    // Get optional caption
    const caption = this.resolveTemplate(
      this.getOptional(data, 'caption', ''),
      context
    );

    // Get channel/platform
    const channel = this.getOptional(data, 'channel', 'default');

    // Get additional options
    const options = {
      caption,
      parseMode: this.getOptional(data, 'parseMode', null),
      thumbnail: this.getOptional(data, 'thumbnail', null),
      filename: this.getOptional(data, 'filename', null),
      mimeType: this.getOptional(data, 'mimeType', null),
    };

    try {
      let result;

      switch (channel.toLowerCase()) {
        case 'whatsapp':
          result = await this.sendWhatsAppMedia(services, recipient, mediaType, mediaSource, options);
          break;

        case 'telegram':
          result = await this.sendTelegramMedia(services, recipient, mediaType, mediaSource, options);
          break;

        case 'email':
          result = await this.sendEmailMedia(services, recipient, mediaType, mediaSource, options, data);
          break;

        default:
          // Try to auto-detect channel from recipient format
          if (recipient.includes('@') && recipient.includes('.')) {
            result = await this.sendEmailMedia(services, recipient, mediaType, mediaSource, options, data);
          } else if (recipient.startsWith('+') || /^\d+$/.test(recipient)) {
            // Phone number format - try WhatsApp
            result = await this.sendWhatsAppMedia(services, recipient, mediaType, mediaSource, options);
          } else {
            return this.failure(
              `Unknown channel: ${channel}. Specify 'whatsapp', 'telegram', or 'email'.`,
              'UNKNOWN_CHANNEL'
            );
          }
      }

      return this.success({
        channel,
        recipient,
        mediaType,
        ...result,
        sentAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.failure(
        `Failed to send media: ${error.message}`,
        'SEND_ERROR',
        true // Usually network errors are recoverable
      );
    }
  }

  /**
   * Send WhatsApp media
   */
  async sendWhatsAppMedia(services, recipient, mediaType, mediaSource, options) {
    const whatsapp = services?.whatsapp;

    if (!whatsapp) {
      throw new Error('WhatsApp service not available');
    }

    // Format phone number
    const phoneNumber = recipient.replace(/[^0-9]/g, '');

    // Send media using WhatsApp client
    const result = await whatsapp.sendMedia(phoneNumber, mediaSource, options.caption, {
      filename: options.filename,
    });

    return {
      messageId: result.id || result.messageId,
      status: 'sent',
      platform: 'whatsapp',
    };
  }

  /**
   * Send Telegram media
   */
  async sendTelegramMedia(services, recipient, mediaType, mediaSource, options) {
    const telegram = services?.telegram;

    if (!telegram) {
      throw new Error('Telegram service not available');
    }

    // Map generic media types to Telegram-specific methods
    const telegramMediaType = this.mapToTelegramMediaType(mediaType);

    // Build Telegram-specific options
    const telegramOptions = {
      caption: options.caption,
      parse_mode: options.parseMode || 'HTML',
      thumb: options.thumbnail,
    };

    // Send media using appropriate Telegram method
    let result;

    switch (telegramMediaType) {
      case 'photo':
        result = await telegram.sendPhoto(recipient, mediaSource, telegramOptions);
        break;
      case 'video':
        result = await telegram.sendVideo(recipient, mediaSource, telegramOptions);
        break;
      case 'audio':
        result = await telegram.sendAudio(recipient, mediaSource, telegramOptions);
        break;
      case 'document':
        result = await telegram.sendDocument(recipient, mediaSource, telegramOptions);
        break;
      default:
        // Use generic sendMedia method
        result = await telegram.sendMedia(recipient, telegramMediaType, mediaSource, telegramOptions);
    }

    return {
      messageId: result.message_id,
      status: 'sent',
      platform: 'telegram',
    };
  }

  /**
   * Send Email media as attachment
   */
  async sendEmailMedia(services, recipient, mediaType, mediaSource, options, data) {
    const email = services?.email;

    if (!email) {
      throw new Error('Email service not available');
    }

    // Get email subject
    const subject = this.resolveTemplate(
      this.getOptional(data, 'subject', 'Media File'),
      { input: {}, variables: {}, previousResults: {} }
    );

    // Get email body
    const body = this.resolveTemplate(
      this.getOptional(data, 'body', options.caption || 'Please find the attached file.'),
      { input: {}, variables: {}, previousResults: {} }
    );

    // Build attachment object
    const attachments = [
      {
        filename: options.filename || this.getFilenameFromPath(mediaSource),
        path: mediaSource, // Can be file path or URL
        contentType: options.mimeType,
      },
    ];

    // Send email with attachment
    const result = await email.send({
      to: recipient,
      subject,
      body,
      isHtml: false,
      attachments,
    });

    return {
      messageId: result.messageId,
      status: 'sent',
      platform: 'email',
    };
  }

  /**
   * Map generic media type to Telegram-specific type
   */
  mapToTelegramMediaType(mediaType) {
    const mapping = {
      image: 'photo',
      photo: 'photo',
      video: 'video',
      audio: 'audio',
      voice: 'voice',
      document: 'document',
      file: 'document',
      animation: 'animation',
      gif: 'animation',
    };

    return mapping[mediaType.toLowerCase()] || 'document';
  }

  /**
   * Extract filename from file path or URL
   */
  getFilenameFromPath(path) {
    if (!path) return 'file';

    // Handle URLs
    if (path.startsWith('http://') || path.startsWith('https://')) {
      try {
        const url = new URL(path);
        const pathname = url.pathname;
        const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
        return filename || 'file';
      } catch {
        return 'file';
      }
    }

    // Handle file paths
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || 'file';
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Required fields
    if (!data.recipient) {
      errors.push('Recipient is required');
    }

    if (!data.mediaSource) {
      errors.push('Media source (file path or URL) is required');
    }

    // Channel validation
    const validChannels = ['whatsapp', 'telegram', 'email', 'default'];
    if (data.channel && !validChannels.includes(data.channel.toLowerCase())) {
      errors.push(`Invalid channel: ${data.channel}`);
    }

    // Media type validation
    const validMediaTypes = [
      'image', 'photo', 'video', 'audio', 'voice',
      'document', 'file', 'animation', 'gif'
    ];
    if (data.mediaType && !validMediaTypes.includes(data.mediaType.toLowerCase())) {
      errors.push(`Invalid media type: ${data.mediaType}`);
    }

    // Email-specific validation
    if (data.channel === 'email') {
      if (!data.subject) {
        errors.push('Email subject is required when channel is email');
      }
    }

    return errors;
  }

  /**
   * Get metadata for FlowBuilder UI
   */
  static getMetadata() {
    return {
      type: 'messaging:sendMedia',
      category: 'messaging',
      name: 'Send Media',
      description: 'Send media files (images, videos, audio, documents) via WhatsApp, Telegram, or Email',
      icon: 'image',
      properties: [
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
          ],
          default: 'default',
        },
        {
          name: 'recipient',
          type: 'string',
          label: 'Recipient',
          description: 'Phone number, email, or chat ID',
          required: true,
          placeholder: '+1234567890 or user@example.com',
        },
        {
          name: 'mediaType',
          type: 'select',
          label: 'Media Type',
          description: 'Type of media file',
          required: true,
          options: [
            { value: 'image', label: 'Image / Photo' },
            { value: 'video', label: 'Video' },
            { value: 'audio', label: 'Audio' },
            { value: 'voice', label: 'Voice Message (Telegram)' },
            { value: 'document', label: 'Document / File' },
            { value: 'animation', label: 'Animation / GIF (Telegram)' },
          ],
          default: 'image',
        },
        {
          name: 'mediaSource',
          type: 'string',
          label: 'Media Source',
          description: 'File path or URL to media file',
          required: true,
          placeholder: '/path/to/file.jpg or https://example.com/image.jpg',
        },
        {
          name: 'caption',
          type: 'text',
          label: 'Caption',
          description: 'Optional caption text (supports {{templates}})',
          multiline: true,
          rows: 3,
          placeholder: 'Image description...',
        },
        {
          name: 'filename',
          type: 'string',
          label: 'Filename',
          description: 'Custom filename (optional, auto-detected if not provided)',
          placeholder: 'document.pdf',
        },
        {
          name: 'parseMode',
          type: 'select',
          label: 'Parse Mode (Telegram)',
          description: 'Caption formatting mode',
          visibleWhen: 'channel === "telegram"',
          options: [
            { value: 'HTML', label: 'HTML' },
            { value: 'Markdown', label: 'Markdown' },
            { value: 'MarkdownV2', label: 'MarkdownV2' },
          ],
          default: 'HTML',
        },
        {
          name: 'thumbnail',
          type: 'string',
          label: 'Thumbnail (Telegram)',
          description: 'Thumbnail file path or URL',
          visibleWhen: 'channel === "telegram"',
          placeholder: '/path/to/thumb.jpg',
        },
        {
          name: 'mimeType',
          type: 'string',
          label: 'MIME Type (Email)',
          description: 'File MIME type (e.g., image/jpeg, application/pdf)',
          visibleWhen: 'channel === "email"',
          placeholder: 'image/jpeg',
        },
        {
          name: 'subject',
          type: 'string',
          label: 'Subject (Email)',
          description: 'Email subject line',
          visibleWhen: 'channel === "email"',
          required: true,
          placeholder: 'Media file attached',
        },
        {
          name: 'body',
          type: 'text',
          label: 'Body (Email)',
          description: 'Email body text',
          visibleWhen: 'channel === "email"',
          multiline: true,
          rows: 3,
          placeholder: 'Please find the attached file.',
        },
      ],
      outputs: [
        {
          name: 'channel',
          type: 'string',
          description: 'Channel used to send media',
        },
        {
          name: 'recipient',
          type: 'string',
          description: 'Media recipient',
        },
        {
          name: 'mediaType',
          type: 'string',
          description: 'Type of media sent',
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
          name: 'sentAt',
          type: 'string',
          description: 'ISO timestamp when media was sent',
        },
      ],
    };
  }
}

module.exports = { SendMediaNode };
