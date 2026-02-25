/**
 * Send WhatsApp Node
 *
 * Dedicated WhatsApp messaging node with full platform-specific features.
 * Supports Web.js and Business API clients.
 *
 * Features:
 * - Text messages with formatting (bold, italic, monospace)
 * - Media messages (image, video, document, audio)
 * - Location sharing
 * - Contact cards (vCard)
 * - Reactions to messages
 * - Message quotes/replies
 * - @mentions
 * - Link preview control
 * - Buttons (Business API)
 * - List messages (Business API)
 * - Template messages (Business API)
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SendWhatsAppNode extends BaseNodeExecutor {
  constructor() {
    super('messaging:sendWhatsApp', 'messaging');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'messaging:sendWhatsApp',
      label: 'Send WhatsApp',
      description: 'Send a message via WhatsApp with full platform features',
      icon: 'MessageCircle',
      category: 'messaging',
      color: 'green',
      properties: {
        recipient: {
          type: 'text',
          label: 'Recipient',
          description: 'Phone number with country code (e.g., +1234567890)',
          required: true,
          showVariablePicker: true,
          placeholder: '+1234567890'
        },
        messageType: {
          type: 'select',
          label: 'Message Type',
          options: [
            { value: 'text', label: 'Text Message' },
            { value: 'media', label: 'Media (Image/Video/Document)' },
            { value: 'location', label: 'Location' },
            { value: 'contact', label: 'Contact Card (vCard)' },
            { value: 'template', label: 'Template (Business API)' },
            { value: 'list', label: 'List Message (Business API)' },
            { value: 'buttons', label: 'Buttons Message (Business API)' }
          ],
          default: 'text'
        },
        message: {
          type: 'textarea',
          label: 'Message',
          description: 'Message content with WhatsApp formatting (*bold*, _italic_, ~strikethrough~, ```code```)',
          showVariablePicker: true,
          rows: 4,
          showWhen: { messageType: ['text', 'media'] }
        },
        mediaUrl: {
          type: 'text',
          label: 'Media URL',
          description: 'URL or file path of the media to send',
          showVariablePicker: true,
          showWhen: { messageType: 'media' }
        },
        mediaType: {
          type: 'select',
          label: 'Media Type',
          options: [
            { value: 'image', label: 'Image' },
            { value: 'video', label: 'Video' },
            { value: 'document', label: 'Document' },
            { value: 'audio', label: 'Audio' },
            { value: 'sticker', label: 'Sticker' }
          ],
          default: 'image',
          showWhen: { messageType: 'media' }
        },
        filename: {
          type: 'text',
          label: 'Filename',
          description: 'Display filename for documents',
          showWhen: { messageType: 'media', mediaType: 'document' }
        },
        latitude: {
          type: 'number',
          label: 'Latitude',
          showWhen: { messageType: 'location' }
        },
        longitude: {
          type: 'number',
          label: 'Longitude',
          showWhen: { messageType: 'location' }
        },
        locationName: {
          type: 'text',
          label: 'Location Name',
          showWhen: { messageType: 'location' }
        },
        locationAddress: {
          type: 'text',
          label: 'Address',
          showWhen: { messageType: 'location' }
        },
        contactName: {
          type: 'text',
          label: 'Contact Name',
          showWhen: { messageType: 'contact' }
        },
        contactPhone: {
          type: 'text',
          label: 'Contact Phone',
          showWhen: { messageType: 'contact' }
        },
        contactEmail: {
          type: 'text',
          label: 'Contact Email',
          showWhen: { messageType: 'contact' }
        },
        templateName: {
          type: 'text',
          label: 'Template Name',
          description: 'Approved WhatsApp Business template name',
          showWhen: { messageType: 'template' }
        },
        templateLanguage: {
          type: 'text',
          label: 'Template Language',
          description: 'Template language code (e.g., en_US)',
          default: 'en_US',
          showWhen: { messageType: 'template' }
        },
        templateParams: {
          type: 'json',
          label: 'Template Parameters',
          description: 'Parameters to fill in the template',
          showWhen: { messageType: 'template' }
        },
        listTitle: {
          type: 'text',
          label: 'List Title',
          showWhen: { messageType: 'list' }
        },
        listButtonText: {
          type: 'text',
          label: 'Button Text',
          default: 'View Options',
          showWhen: { messageType: 'list' }
        },
        listSections: {
          type: 'json',
          label: 'List Sections',
          description: 'Array of sections with rows: [{title, rows: [{id, title, description}]}]',
          showWhen: { messageType: 'list' }
        },
        buttons: {
          type: 'array',
          label: 'Buttons',
          description: 'Quick reply buttons (max 3)',
          showWhen: { messageType: 'buttons' },
          itemSchema: {
            type: 'object',
            properties: {
              id: { type: 'text', label: 'Button ID' },
              text: { type: 'text', label: 'Button Text' }
            }
          }
        },
        replyToMessageId: {
          type: 'text',
          label: 'Reply To Message ID',
          description: 'Quote/reply to a specific message',
          showVariablePicker: true
        },
        mentions: {
          type: 'array',
          label: 'Mentions',
          description: 'Phone numbers to @mention in the message',
          itemSchema: { type: 'text', placeholder: '+1234567890' }
        },
        linkPreview: {
          type: 'boolean',
          label: 'Show Link Preview',
          description: 'Enable rich link preview for URLs',
          default: true
        },
        useBusinessApi: {
          type: 'boolean',
          label: 'Use Business API',
          description: 'Use WhatsApp Business API instead of Web.js',
          default: false
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Result In',
          placeholder: 'whatsappResult'
        }
      },
      outputs: {
        default: { label: 'Sent', type: 'default' },
        failed: { label: 'Failed', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        recipient: '',
        messageType: 'text',
        message: '',
        mediaUrl: '',
        mediaType: 'image',
        linkPreview: true,
        useBusinessApi: false,
        storeInVariable: ''
      })
    };
  }

  /**
   * Validate node configuration
   */
  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.recipient) {
      errors.push('Recipient phone number is required');
    }

    if (data.messageType === 'text' && !data.message) {
      errors.push('Message content is required for text messages');
    }

    if (data.messageType === 'media' && !data.mediaUrl) {
      errors.push('Media URL is required for media messages');
    }

    if (data.messageType === 'location' && (!data.latitude || !data.longitude)) {
      errors.push('Latitude and longitude are required for location messages');
    }

    if (data.messageType === 'contact' && !data.contactName) {
      errors.push('Contact name is required for contact cards');
    }

    if (data.messageType === 'template' && !data.templateName) {
      errors.push('Template name is required for template messages');
    }

    if (data.messageType === 'list' && (!data.listSections || data.listSections.length === 0)) {
      errors.push('List sections are required for list messages');
    }

    if (data.messageType === 'buttons' && (!data.buttons || data.buttons.length === 0)) {
      errors.push('At least one button is required for button messages');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      recipient,
      messageType,
      message,
      mediaUrl,
      mediaType,
      filename,
      latitude,
      longitude,
      locationName,
      locationAddress,
      contactName,
      contactPhone,
      contactEmail,
      templateName,
      templateLanguage,
      templateParams,
      listTitle,
      listButtonText,
      listSections,
      buttons,
      replyToMessageId,
      mentions,
      linkPreview,
      useBusinessApi,
      storeInVariable
    } = context.node.data;

    const resolvedRecipient = this.resolveTemplate(recipient, context);
    const resolvedMessage = message ? this.resolveTemplate(message, context) : '';

    if (!resolvedRecipient) {
      return this.failure('Recipient phone number is required', 'MISSING_RECIPIENT');
    }

    try {
      // Get appropriate WhatsApp client
      const whatsapp = useBusinessApi
        ? context.services?.whatsappBusiness
        : context.services?.whatsapp;

      if (!whatsapp) {
        const clientType = useBusinessApi ? 'WhatsApp Business API' : 'WhatsApp Web.js';
        return this.failure(`${clientType} service not available`, 'SERVICE_UNAVAILABLE', ['failed']);
      }

      // Format phone number
      const phoneNumber = this.formatPhoneNumber(resolvedRecipient);
      let result;

      switch (messageType) {
        case 'text':
          result = await this.sendTextMessage(whatsapp, phoneNumber, resolvedMessage, {
            replyToMessageId,
            mentions,
            linkPreview
          });
          break;

        case 'media':
          result = await this.sendMediaMessage(whatsapp, phoneNumber, {
            url: this.resolveTemplate(mediaUrl, context),
            type: mediaType,
            caption: resolvedMessage,
            filename: this.resolveTemplate(filename || '', context),
            replyToMessageId
          });
          break;

        case 'location':
          result = await this.sendLocationMessage(whatsapp, phoneNumber, {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            name: locationName,
            address: locationAddress
          });
          break;

        case 'contact':
          result = await this.sendContactCard(whatsapp, phoneNumber, {
            name: contactName,
            phone: contactPhone,
            email: contactEmail
          });
          break;

        case 'template':
          result = await this.sendTemplateMessage(whatsapp, phoneNumber, {
            name: templateName,
            language: templateLanguage || 'en_US',
            params: templateParams
          });
          break;

        case 'list':
          result = await this.sendListMessage(whatsapp, phoneNumber, {
            title: listTitle,
            text: resolvedMessage,
            buttonText: listButtonText || 'View Options',
            sections: listSections
          });
          break;

        case 'buttons':
          result = await this.sendButtonsMessage(whatsapp, phoneNumber, {
            text: resolvedMessage,
            buttons: buttons
          });
          break;

        default:
          return this.failure(`Unknown message type: ${messageType}`, 'INVALID_TYPE');
      }

      // Build output
      const output = {
        recipient: resolvedRecipient,
        phoneNumber,
        messageType,
        messageId: result.messageId || result.id,
        status: 'sent',
        sentAt: new Date().toISOString(),
        ...result
      };

      // Store in variable if specified
      if (storeInVariable) {
        context.variables[storeInVariable] = output;
      }

      return this.success(output);

    } catch (error) {
      context.logger.error(`WhatsApp send failed: ${error.message}`);
      return this.failure(error.message, 'SEND_ERROR', true, ['failed']);
    }
  }

  /**
   * Format phone number for WhatsApp
   * @private
   */
  formatPhoneNumber(phone) {
    // Remove all non-numeric characters except leading +
    let formatted = phone.replace(/[^\d+]/g, '');
    // Remove leading + for WhatsApp ID
    if (formatted.startsWith('+')) {
      formatted = formatted.substring(1);
    }
    return formatted;
  }

  /**
   * Send text message
   * @private
   */
  async sendTextMessage(whatsapp, phone, text, options) {
    const messageOptions = {};

    if (options.replyToMessageId) {
      messageOptions.quotedMessageId = options.replyToMessageId;
    }

    if (options.mentions && options.mentions.length > 0) {
      messageOptions.mentions = options.mentions.map(m =>
        this.formatPhoneNumber(m) + '@c.us'
      );
    }

    if (options.linkPreview !== undefined) {
      messageOptions.linkPreview = options.linkPreview;
    }

    return await whatsapp.sendMessage(phone, text, messageOptions);
  }

  /**
   * Send media message
   * @private
   */
  async sendMediaMessage(whatsapp, phone, options) {
    const messageOptions = {
      caption: options.caption
    };

    if (options.replyToMessageId) {
      messageOptions.quotedMessageId = options.replyToMessageId;
    }

    if (options.filename) {
      messageOptions.filename = options.filename;
    }

    // Handle different media types
    switch (options.type) {
      case 'image':
        return await whatsapp.sendImage(phone, options.url, messageOptions);
      case 'video':
        return await whatsapp.sendVideo(phone, options.url, messageOptions);
      case 'document':
        return await whatsapp.sendDocument(phone, options.url, messageOptions);
      case 'audio':
        return await whatsapp.sendAudio(phone, options.url, messageOptions);
      case 'sticker':
        return await whatsapp.sendSticker(phone, options.url);
      default:
        return await whatsapp.sendMedia(phone, options.url, messageOptions);
    }
  }

  /**
   * Send location message
   * @private
   */
  async sendLocationMessage(whatsapp, phone, location) {
    return await whatsapp.sendLocation(phone, {
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name,
      address: location.address
    });
  }

  /**
   * Send contact card (vCard)
   * @private
   */
  async sendContactCard(whatsapp, phone, contact) {
    const vcard = this.buildVCard(contact);
    return await whatsapp.sendContact(phone, vcard);
  }

  /**
   * Build vCard string
   * @private
   */
  buildVCard(contact) {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${contact.name}`
    ];

    if (contact.phone) {
      lines.push(`TEL;TYPE=CELL:${contact.phone}`);
    }

    if (contact.email) {
      lines.push(`EMAIL:${contact.email}`);
    }

    lines.push('END:VCARD');
    return lines.join('\n');
  }

  /**
   * Send template message (Business API)
   * @private
   */
  async sendTemplateMessage(whatsapp, phone, template) {
    return await whatsapp.sendTemplate(phone, {
      name: template.name,
      language: { code: template.language },
      components: template.params
    });
  }

  /**
   * Send list message (Business API)
   * @private
   */
  async sendListMessage(whatsapp, phone, list) {
    return await whatsapp.sendList(phone, {
      title: list.title,
      text: list.text,
      buttonText: list.buttonText,
      sections: list.sections
    });
  }

  /**
   * Send buttons message (Business API)
   * @private
   */
  async sendButtonsMessage(whatsapp, phone, msg) {
    return await whatsapp.sendButtons(phone, {
      text: msg.text,
      buttons: msg.buttons.map((btn, i) => ({
        id: btn.id || `btn_${i}`,
        text: btn.text
      }))
    });
  }
}

module.exports = { SendWhatsAppNode };
