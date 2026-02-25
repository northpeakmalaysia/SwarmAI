/**
 * Send Telegram Node
 *
 * Dedicated Telegram messaging node with full Bot API features.
 *
 * Features:
 * - Text messages with Markdown/HTML formatting
 * - Media messages (photo, video, document, audio, voice, sticker)
 * - Location and venue sharing
 * - Contact sharing
 * - Inline keyboards
 * - Reply keyboards
 * - Message editing
 * - Silent messages
 * - Message scheduling
 * - Web preview control
 * - Reply to messages
 * - Poll creation
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SendTelegramNode extends BaseNodeExecutor {
  constructor() {
    super('messaging:sendTelegram', 'messaging');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'messaging:sendTelegram',
      label: 'Send Telegram',
      description: 'Send a message via Telegram Bot API with full features',
      icon: 'Send',
      category: 'messaging',
      color: 'blue',
      properties: {
        chatId: {
          type: 'text',
          label: 'Chat ID',
          description: 'Telegram chat ID, username (@username), or channel (@channel)',
          required: true,
          showVariablePicker: true
        },
        messageType: {
          type: 'select',
          label: 'Message Type',
          options: [
            { value: 'text', label: 'Text Message' },
            { value: 'photo', label: 'Photo' },
            { value: 'video', label: 'Video' },
            { value: 'document', label: 'Document' },
            { value: 'audio', label: 'Audio' },
            { value: 'voice', label: 'Voice Message' },
            { value: 'sticker', label: 'Sticker' },
            { value: 'location', label: 'Location' },
            { value: 'venue', label: 'Venue' },
            { value: 'contact', label: 'Contact' },
            { value: 'poll', label: 'Poll' },
            { value: 'edit', label: 'Edit Message' }
          ],
          default: 'text'
        },
        message: {
          type: 'textarea',
          label: 'Message',
          description: 'Message text (supports Markdown or HTML based on parseMode)',
          showVariablePicker: true,
          rows: 4,
          showWhen: { messageType: ['text', 'photo', 'video', 'document', 'audio', 'edit'] }
        },
        parseMode: {
          type: 'select',
          label: 'Parse Mode',
          options: [
            { value: 'MarkdownV2', label: 'Markdown V2' },
            { value: 'HTML', label: 'HTML' },
            { value: 'Markdown', label: 'Markdown (Legacy)' },
            { value: 'none', label: 'Plain Text' }
          ],
          default: 'MarkdownV2'
        },
        mediaUrl: {
          type: 'text',
          label: 'Media URL/File ID',
          description: 'URL, file path, or Telegram file_id',
          showVariablePicker: true,
          showWhen: { messageType: ['photo', 'video', 'document', 'audio', 'voice', 'sticker'] }
        },
        mediaCaption: {
          type: 'textarea',
          label: 'Caption',
          showVariablePicker: true,
          showWhen: { messageType: ['photo', 'video', 'document', 'audio'] },
          rows: 2
        },
        thumbnail: {
          type: 'text',
          label: 'Thumbnail URL',
          description: 'Custom thumbnail for videos/documents',
          showWhen: { messageType: ['video', 'document'] }
        },
        latitude: {
          type: 'number',
          label: 'Latitude',
          showWhen: { messageType: ['location', 'venue'] }
        },
        longitude: {
          type: 'number',
          label: 'Longitude',
          showWhen: { messageType: ['location', 'venue'] }
        },
        venueTitle: {
          type: 'text',
          label: 'Venue Title',
          showWhen: { messageType: 'venue' }
        },
        venueAddress: {
          type: 'text',
          label: 'Venue Address',
          showWhen: { messageType: 'venue' }
        },
        contactPhone: {
          type: 'text',
          label: 'Phone Number',
          showWhen: { messageType: 'contact' }
        },
        contactFirstName: {
          type: 'text',
          label: 'First Name',
          showWhen: { messageType: 'contact' }
        },
        contactLastName: {
          type: 'text',
          label: 'Last Name',
          showWhen: { messageType: 'contact' }
        },
        pollQuestion: {
          type: 'text',
          label: 'Poll Question',
          showWhen: { messageType: 'poll' }
        },
        pollOptions: {
          type: 'array',
          label: 'Poll Options',
          description: 'Poll answer options (2-10)',
          showWhen: { messageType: 'poll' },
          itemSchema: { type: 'text', label: 'Option' }
        },
        pollType: {
          type: 'select',
          label: 'Poll Type',
          options: [
            { value: 'regular', label: 'Regular Poll' },
            { value: 'quiz', label: 'Quiz (one correct answer)' }
          ],
          default: 'regular',
          showWhen: { messageType: 'poll' }
        },
        pollAllowsMultiple: {
          type: 'boolean',
          label: 'Allow Multiple Answers',
          default: false,
          showWhen: { messageType: 'poll', pollType: 'regular' }
        },
        pollCorrectOption: {
          type: 'number',
          label: 'Correct Option Index (0-based)',
          showWhen: { messageType: 'poll', pollType: 'quiz' }
        },
        editMessageId: {
          type: 'text',
          label: 'Message ID to Edit',
          showWhen: { messageType: 'edit' }
        },
        inlineKeyboard: {
          type: 'json',
          label: 'Inline Keyboard',
          description: 'Inline keyboard buttons array: [[{text, callback_data/url}]]',
          placeholder: '[[{"text": "Click", "callback_data": "action"}]]'
        },
        replyKeyboard: {
          type: 'json',
          label: 'Reply Keyboard',
          description: 'Reply keyboard buttons array: [[{text}]]',
          placeholder: '[[{"text": "Option 1"}, {"text": "Option 2"}]]'
        },
        removeKeyboard: {
          type: 'boolean',
          label: 'Remove Reply Keyboard',
          description: 'Remove any existing reply keyboard',
          default: false
        },
        forceReply: {
          type: 'boolean',
          label: 'Force Reply',
          description: 'Force user to reply to this message',
          default: false
        },
        replyToMessageId: {
          type: 'text',
          label: 'Reply To Message ID',
          description: 'Reply to a specific message',
          showVariablePicker: true
        },
        disableNotification: {
          type: 'boolean',
          label: 'Silent Message',
          description: 'Send without notification sound',
          default: false
        },
        protectContent: {
          type: 'boolean',
          label: 'Protect Content',
          description: 'Protect message from forwarding/saving',
          default: false
        },
        disableWebPagePreview: {
          type: 'boolean',
          label: 'Disable Link Preview',
          default: false
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Result In',
          placeholder: 'telegramResult'
        }
      },
      outputs: {
        default: { label: 'Sent', type: 'default' },
        failed: { label: 'Failed', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        chatId: '',
        messageType: 'text',
        message: '',
        parseMode: 'MarkdownV2',
        disableNotification: false,
        protectContent: false,
        disableWebPagePreview: false,
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

    if (!data.chatId) {
      errors.push('Chat ID is required');
    }

    if (data.messageType === 'text' && !data.message) {
      errors.push('Message content is required');
    }

    if (['photo', 'video', 'document', 'audio', 'voice', 'sticker'].includes(data.messageType)) {
      if (!data.mediaUrl) {
        errors.push('Media URL is required');
      }
    }

    if (['location', 'venue'].includes(data.messageType)) {
      if (!data.latitude || !data.longitude) {
        errors.push('Latitude and longitude are required');
      }
    }

    if (data.messageType === 'venue' && !data.venueTitle) {
      errors.push('Venue title is required');
    }

    if (data.messageType === 'contact') {
      if (!data.contactPhone || !data.contactFirstName) {
        errors.push('Phone number and first name are required for contacts');
      }
    }

    if (data.messageType === 'poll') {
      if (!data.pollQuestion) {
        errors.push('Poll question is required');
      }
      if (!data.pollOptions || data.pollOptions.length < 2) {
        errors.push('At least 2 poll options are required');
      }
    }

    if (data.messageType === 'edit' && !data.editMessageId) {
      errors.push('Message ID is required for editing');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const data = context.node.data;
    const resolvedChatId = this.resolveTemplate(data.chatId, context);
    const resolvedMessage = data.message ? this.resolveTemplate(data.message, context) : '';

    if (!resolvedChatId) {
      return this.failure('Chat ID is required', 'MISSING_CHAT_ID');
    }

    try {
      const telegram = context.services?.telegram;

      if (!telegram) {
        return this.failure('Telegram service not available', 'SERVICE_UNAVAILABLE', ['failed']);
      }

      let result;

      // Build common options
      const commonOptions = this.buildCommonOptions(data, context);

      switch (data.messageType) {
        case 'text':
          result = await this.sendTextMessage(telegram, resolvedChatId, resolvedMessage, commonOptions);
          break;

        case 'photo':
          result = await this.sendPhoto(telegram, resolvedChatId, data, commonOptions, context);
          break;

        case 'video':
          result = await this.sendVideo(telegram, resolvedChatId, data, commonOptions, context);
          break;

        case 'document':
          result = await this.sendDocument(telegram, resolvedChatId, data, commonOptions, context);
          break;

        case 'audio':
          result = await this.sendAudio(telegram, resolvedChatId, data, commonOptions, context);
          break;

        case 'voice':
          result = await this.sendVoice(telegram, resolvedChatId, data, commonOptions, context);
          break;

        case 'sticker':
          result = await this.sendSticker(telegram, resolvedChatId, data, commonOptions, context);
          break;

        case 'location':
          result = await this.sendLocation(telegram, resolvedChatId, data, commonOptions);
          break;

        case 'venue':
          result = await this.sendVenue(telegram, resolvedChatId, data, commonOptions);
          break;

        case 'contact':
          result = await this.sendContact(telegram, resolvedChatId, data, commonOptions);
          break;

        case 'poll':
          result = await this.sendPoll(telegram, resolvedChatId, data, commonOptions);
          break;

        case 'edit':
          result = await this.editMessage(telegram, resolvedChatId, resolvedMessage, data, commonOptions);
          break;

        default:
          return this.failure(`Unknown message type: ${data.messageType}`, 'INVALID_TYPE');
      }

      // Build output
      const output = {
        chatId: resolvedChatId,
        messageType: data.messageType,
        messageId: result.message_id,
        date: result.date,
        status: 'sent',
        sentAt: new Date().toISOString()
      };

      // Store in variable if specified
      if (data.storeInVariable) {
        context.variables[data.storeInVariable] = output;
      }

      return this.success(output);

    } catch (error) {
      context.logger.error(`Telegram send failed: ${error.message}`);
      return this.failure(error.message, 'SEND_ERROR', true, ['failed']);
    }
  }

  /**
   * Build common Telegram API options
   * @private
   */
  buildCommonOptions(data, context) {
    const options = {};

    if (data.parseMode && data.parseMode !== 'none') {
      options.parse_mode = data.parseMode;
    }

    if (data.replyToMessageId) {
      options.reply_to_message_id = this.resolveTemplate(data.replyToMessageId, context);
    }

    if (data.disableNotification) {
      options.disable_notification = true;
    }

    if (data.protectContent) {
      options.protect_content = true;
    }

    if (data.disableWebPagePreview) {
      options.disable_web_page_preview = true;
    }

    // Reply markup
    if (data.inlineKeyboard) {
      options.reply_markup = {
        inline_keyboard: typeof data.inlineKeyboard === 'string'
          ? JSON.parse(data.inlineKeyboard)
          : data.inlineKeyboard
      };
    } else if (data.replyKeyboard) {
      options.reply_markup = {
        keyboard: typeof data.replyKeyboard === 'string'
          ? JSON.parse(data.replyKeyboard)
          : data.replyKeyboard,
        resize_keyboard: true,
        one_time_keyboard: true
      };
    } else if (data.removeKeyboard) {
      options.reply_markup = { remove_keyboard: true };
    } else if (data.forceReply) {
      options.reply_markup = { force_reply: true };
    }

    return options;
  }

  /**
   * Send text message
   * @private
   */
  async sendTextMessage(telegram, chatId, text, options) {
    return await telegram.sendMessage(chatId, text, options);
  }

  /**
   * Send photo
   * @private
   */
  async sendPhoto(telegram, chatId, data, options, context) {
    const photo = this.resolveTemplate(data.mediaUrl, context);
    const caption = data.mediaCaption ? this.resolveTemplate(data.mediaCaption, context) : undefined;

    return await telegram.sendPhoto(chatId, photo, {
      ...options,
      caption
    });
  }

  /**
   * Send video
   * @private
   */
  async sendVideo(telegram, chatId, data, options, context) {
    const video = this.resolveTemplate(data.mediaUrl, context);
    const caption = data.mediaCaption ? this.resolveTemplate(data.mediaCaption, context) : undefined;

    return await telegram.sendVideo(chatId, video, {
      ...options,
      caption,
      thumb: data.thumbnail
    });
  }

  /**
   * Send document
   * @private
   */
  async sendDocument(telegram, chatId, data, options, context) {
    const document = this.resolveTemplate(data.mediaUrl, context);
    const caption = data.mediaCaption ? this.resolveTemplate(data.mediaCaption, context) : undefined;

    return await telegram.sendDocument(chatId, document, {
      ...options,
      caption,
      thumb: data.thumbnail
    });
  }

  /**
   * Send audio
   * @private
   */
  async sendAudio(telegram, chatId, data, options, context) {
    const audio = this.resolveTemplate(data.mediaUrl, context);
    const caption = data.mediaCaption ? this.resolveTemplate(data.mediaCaption, context) : undefined;

    return await telegram.sendAudio(chatId, audio, {
      ...options,
      caption
    });
  }

  /**
   * Send voice message
   * @private
   */
  async sendVoice(telegram, chatId, data, options, context) {
    const voice = this.resolveTemplate(data.mediaUrl, context);

    return await telegram.sendVoice(chatId, voice, options);
  }

  /**
   * Send sticker
   * @private
   */
  async sendSticker(telegram, chatId, data, options, context) {
    const sticker = this.resolveTemplate(data.mediaUrl, context);

    return await telegram.sendSticker(chatId, sticker, options);
  }

  /**
   * Send location
   * @private
   */
  async sendLocation(telegram, chatId, data, options) {
    return await telegram.sendLocation(chatId, data.latitude, data.longitude, options);
  }

  /**
   * Send venue
   * @private
   */
  async sendVenue(telegram, chatId, data, options) {
    return await telegram.sendVenue(chatId, data.latitude, data.longitude, data.venueTitle, data.venueAddress, options);
  }

  /**
   * Send contact
   * @private
   */
  async sendContact(telegram, chatId, data, options) {
    return await telegram.sendContact(chatId, data.contactPhone, data.contactFirstName, {
      ...options,
      last_name: data.contactLastName
    });
  }

  /**
   * Send poll
   * @private
   */
  async sendPoll(telegram, chatId, data, options) {
    const pollOptions = {
      ...options,
      type: data.pollType || 'regular',
      allows_multiple_answers: data.pollAllowsMultiple || false
    };

    if (data.pollType === 'quiz' && data.pollCorrectOption !== undefined) {
      pollOptions.correct_option_id = data.pollCorrectOption;
    }

    return await telegram.sendPoll(chatId, data.pollQuestion, data.pollOptions, pollOptions);
  }

  /**
   * Edit message
   * @private
   */
  async editMessage(telegram, chatId, text, data, options) {
    return await telegram.editMessageText(text, {
      chat_id: chatId,
      message_id: data.editMessageId,
      ...options
    });
  }
}

module.exports = { SendTelegramNode };
