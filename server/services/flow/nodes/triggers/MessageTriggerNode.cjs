/**
 * Message Trigger Node
 * ====================
 * Starts flow execution when a message is received from a messaging platform
 * (WhatsApp, Telegram, Email, HTTP API, etc.)
 *
 * Supports filtering by:
 * - Platform (whatsapp, telegram-bot, email, etc.)
 * - Content (contains, startsWith, endsWith, pattern, exactMatch)
 * - Sender (from, fromAny, notFrom)
 * - Attachments (hasAttachment, attachmentType)
 * - Message type (isGroup)
 *
 * Output:
 * {
 *   triggered: true,
 *   timestamp: string,
 *   platform: string,
 *   message: { id, content, from, conversationId, contentType, mediaUrl, receivedAt },
 *   sender: string,
 *   matched: true,
 *   matchedFilters: string[]
 * }
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

const SUPPORTED_PLATFORMS = [
  'whatsapp',
  'whatsapp-business',
  'telegram-bot',
  'telegram-user',
  'email',
  'http-api',
  'any'
];

const SUPPORTED_ATTACHMENT_TYPES = [
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contact',
  'voice',
  'any'
];

/**
 * Check if a message matches the filter criteria
 * @param {Object} message - Message object
 * @param {Object} filters - Filter configuration
 * @returns {{ matches: boolean, reason?: string, matchedFilters?: string[] }}
 */
function matchesFilter(message, filters) {
  const content = (message.content || '').toLowerCase();
  const from = (message.from || '').toLowerCase();
  const matchedFilters = [];

  // Platform filter
  if (filters.platform && filters.platform !== 'any') {
    if (message.platform !== filters.platform) {
      return { matches: false, reason: `Platform mismatch: expected ${filters.platform}, got ${message.platform}` };
    }
    matchedFilters.push('platform');
  }

  // Content: contains
  if (filters.contains) {
    if (!content.includes(filters.contains.toLowerCase())) {
      return { matches: false, reason: `Content does not contain '${filters.contains}'` };
    }
    matchedFilters.push('contains');
  }

  // Content: starts with
  if (filters.startsWith) {
    if (!content.startsWith(filters.startsWith.toLowerCase())) {
      return { matches: false, reason: `Content does not start with '${filters.startsWith}'` };
    }
    matchedFilters.push('startsWith');
  }

  // Content: ends with
  if (filters.endsWith) {
    if (!content.endsWith(filters.endsWith.toLowerCase())) {
      return { matches: false, reason: `Content does not end with '${filters.endsWith}'` };
    }
    matchedFilters.push('endsWith');
  }

  // Content: exact match
  if (filters.exactMatch) {
    if (content !== filters.exactMatch.toLowerCase()) {
      return { matches: false, reason: `Content does not exactly match '${filters.exactMatch}'` };
    }
    matchedFilters.push('exactMatch');
  }

  // Content: regex pattern
  if (filters.pattern) {
    try {
      const regex = new RegExp(filters.pattern, 'i');
      if (!regex.test(message.content || '')) {
        return { matches: false, reason: `Content does not match pattern '${filters.pattern}'` };
      }
      matchedFilters.push('pattern');
    } catch {
      return { matches: false, reason: `Invalid regex pattern '${filters.pattern}'` };
    }
  }

  // Sender: exact match
  if (filters.from) {
    if (from !== filters.from.toLowerCase()) {
      return { matches: false, reason: `Message not from '${filters.from}'` };
    }
    matchedFilters.push('from');
  }

  // Sender: in list
  if (filters.fromAny && Array.isArray(filters.fromAny) && filters.fromAny.length > 0) {
    const fromAnyLower = filters.fromAny.map(s => s.toLowerCase());
    if (!fromAnyLower.includes(from)) {
      return { matches: false, reason: `Message not from any of: ${filters.fromAny.join(', ')}` };
    }
    matchedFilters.push('fromAny');
  }

  // Sender: exclude
  if (filters.notFrom) {
    if (from === filters.notFrom.toLowerCase()) {
      return { matches: false, reason: `Message from excluded sender '${filters.notFrom}'` };
    }
    matchedFilters.push('notFrom');
  }

  // Attachments: has any
  if (filters.hasAttachment === true) {
    const hasMedia = message.contentType && message.contentType !== 'text';
    if (!hasMedia) {
      return { matches: false, reason: 'Message has no attachments' };
    }
    matchedFilters.push('hasAttachment');
  }

  // Attachments: specific type
  if (filters.attachmentType && filters.attachmentType !== 'any') {
    if (message.contentType !== filters.attachmentType) {
      return { matches: false, reason: `No attachment of type '${filters.attachmentType}'` };
    }
    matchedFilters.push('attachmentType');
  }

  // Group message filter
  if (filters.isGroup !== undefined) {
    if (Boolean(message.isGroup) !== Boolean(filters.isGroup)) {
      return { matches: false, reason: filters.isGroup ? 'Message is not from a group' : 'Message is from a group' };
    }
    matchedFilters.push('isGroup');
  }

  return { matches: true, matchedFilters };
}

/**
 * Message trigger executor for messaging-platform-initiated flow executions
 */
class MessageTriggerNode extends BaseNodeExecutor {
  constructor() {
    super('trigger:message', 'trigger');
  }

  /**
   * Execute the message trigger
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async execute(context) {
    const { node, input, logger } = context;
    const { data } = node;

    // Get configuration
    const platform = data.platform || 'any';
    const filters = data.filters || {};

    // Extract message from input
    const message = input.message || {};

    // Basic validation
    if (!message || Object.keys(message).length === 0) {
      return this.failure('No message data provided', 'NO_MESSAGE_DATA', false);
    }

    logger.info(`Message trigger evaluating: platform=${message.platform}, from=${message.from}`);

    // Add platform filter if specified at node level
    if (platform !== 'any') {
      filters.platform = platform;
    }

    // Apply filters
    const hasFilters = Object.keys(filters).length > 0;
    let matchedFilters = [];

    if (hasFilters) {
      const filterResult = matchesFilter(message, filters);
      if (!filterResult.matches) {
        logger.debug(`Message filtered: ${filterResult.reason}`);
        // Return skip result - the message just didn't match, not a failure
        return this.skip(`Message filtered: ${filterResult.reason}`);
      }
      matchedFilters = filterResult.matchedFilters || [];
    }

    // Extract sender information
    const sender = message.from || message.sender?.id || 'unknown';
    const messageTimestamp = message.timestamp || message.receivedAt || new Date().toISOString();

    logger.info(`Message trigger matched: ${message.id}, filters: ${matchedFilters.join(', ') || 'none'}`);

    // Return trigger result
    return this.success({
      triggered: true,
      timestamp: new Date().toISOString(),
      platform: message.platform,
      message: {
        id: message.id,
        content: message.content,
        from: message.from,
        to: message.to,
        conversationId: message.conversationId,
        contentType: message.contentType || 'text',
        mediaUrl: message.mediaUrl,
        subject: message.subject,
        metadata: message.metadata,
        receivedAt: messageTimestamp
      },
      sender,
      matched: true,
      matchedFilters: hasFilters ? matchedFilters : undefined
    });
  }

  /**
   * Validate the message trigger configuration
   * @param {Object} node - Node configuration
   * @returns {string[]} Validation errors
   */
  validate(node) {
    const errors = [];
    const { data } = node;

    // Validate platform
    if (data.platform && !SUPPORTED_PLATFORMS.includes(data.platform)) {
      errors.push(`Invalid platform: '${data.platform}'. Supported: ${SUPPORTED_PLATFORMS.join(', ')}`);
    }

    // Validate filters
    const filters = data.filters;
    if (filters && typeof filters === 'object') {
      // Validate regex pattern
      if (filters.pattern) {
        try {
          new RegExp(filters.pattern);
        } catch {
          errors.push(`Invalid regex pattern: '${filters.pattern}'`);
        }
      }

      // Validate fromAny is an array
      if (filters.fromAny !== undefined && !Array.isArray(filters.fromAny)) {
        errors.push('Filter "fromAny" must be an array');
      }

      // Validate attachment type
      if (filters.attachmentType && !SUPPORTED_ATTACHMENT_TYPES.includes(filters.attachmentType)) {
        errors.push(`Invalid attachment type: '${filters.attachmentType}'. Supported: ${SUPPORTED_ATTACHMENT_TYPES.join(', ')}`);
      }

      // Validate isGroup is boolean
      if (filters.isGroup !== undefined && typeof filters.isGroup !== 'boolean') {
        errors.push('Filter "isGroup" must be a boolean');
      }
    } else if (filters !== undefined && filters !== null && typeof filters !== 'object') {
      errors.push('Filters must be an object');
    }

    return errors;
  }

  /**
   * Get node metadata for FlowBuilder UI
   */
  static getMetadata() {
    return {
      type: 'trigger:message',
      category: 'trigger',
      name: 'Message Trigger',
      description: 'Start flow when a message is received from a messaging platform',
      icon: 'MessageSquare',
      color: '#10b981', // emerald
      inputs: [],
      outputs: [
        { id: 'default', label: 'Message Received' }
      ],
      properties: [
        {
          key: 'platform',
          label: 'Platform',
          type: 'select',
          default: 'any',
          options: SUPPORTED_PLATFORMS.map(p => ({ value: p, label: p === 'any' ? 'Any Platform' : p }))
        },
        {
          key: 'filters.contains',
          label: 'Content Contains',
          type: 'text',
          placeholder: 'Text to match...'
        },
        {
          key: 'filters.startsWith',
          label: 'Content Starts With',
          type: 'text',
          placeholder: 'Prefix to match...'
        },
        {
          key: 'filters.pattern',
          label: 'Regex Pattern',
          type: 'text',
          placeholder: 'Regular expression...'
        },
        {
          key: 'filters.from',
          label: 'From Sender',
          type: 'text',
          placeholder: 'Sender ID or phone...'
        },
        {
          key: 'filters.hasAttachment',
          label: 'Has Attachment',
          type: 'checkbox',
          default: false
        },
        {
          key: 'filters.attachmentType',
          label: 'Attachment Type',
          type: 'select',
          default: 'any',
          options: SUPPORTED_ATTACHMENT_TYPES.map(t => ({ value: t, label: t })),
          showIf: 'filters.hasAttachment'
        },
        {
          key: 'filters.isGroup',
          label: 'Group Message Only',
          type: 'checkbox',
          default: false
        }
      ]
    };
  }
}

module.exports = { MessageTriggerNode, matchesFilter, SUPPORTED_PLATFORMS, SUPPORTED_ATTACHMENT_TYPES };
