/**
 * Message Router
 * Routes incoming messages to appropriate handlers
 * Handles message persistence and notifications
 *
 * Now integrates with UnifiedMessageService for:
 * - Media caching with TTL
 * - FlowBuilder trigger evaluation
 * - Enhanced message processing
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');

// Lazy load to avoid circular dependency
let unifiedMessageService = null;
function getUnifiedMessageService() {
  if (!unifiedMessageService) {
    try {
      const module = require('../services/unifiedMessageService.cjs');
      unifiedMessageService = module.unifiedMessageService;
    } catch (error) {
      logger.warn('UnifiedMessageService not available');
    }
  }
  return unifiedMessageService;
}

/**
 * Message Router Class
 * Singleton - handles all incoming messages
 */
class MessageRouter {
  constructor() {
    this.agentManager = null;
    this.broadcast = null;
    this.messageHandlers = new Map();
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!MessageRouter.instance) {
      MessageRouter.instance = new MessageRouter();
    }
    return MessageRouter.instance;
  }

  /**
   * Initialize the message router
   */
  initialize(agentManager, broadcast) {
    this.agentManager = agentManager;
    this.broadcast = broadcast;

    // Listen for messages from all clients
    agentManager.on('message', (message) => {
      this.handleIncomingMessage(message).catch(err => {
        logger.error(`Failed to handle message: ${err.message}`);
      });
    });

    // Listen for QR events
    agentManager.on('qr', (data) => {
      if (broadcast) {
        broadcast('whatsapp:qr', data, data.agentId);
      }
    });

    // Listen for status changes
    agentManager.on('status_change', (data) => {
      if (broadcast) {
        broadcast('platform:status', data, data.agentId);
      }
    });

    logger.info('Message Router initialized');
  }

  /**
   * Register a custom message handler
   */
  registerHandler(platform, handler) {
    this.messageHandlers.set(platform, handler);
  }

  /**
   * Handle incoming message
   * Delegates to UnifiedMessageService for enhanced processing (media caching, flow triggers)
   * Falls back to legacy processing if unified service is not available
   */
  async handleIncomingMessage(message) {
    const db = getDatabase();

    // Try to use unified message service for enhanced processing
    const unifiedService = getUnifiedMessageService();
    if (unifiedService && unifiedService.initialized) {
      try {
        // Delegate to unified service
        const result = await unifiedService.processIncomingMessage(message, {
          agentId: message.agentId,
          accountId: message.accountId
        });

        // Call custom handler if registered
        const handler = this.messageHandlers.get(message.platform);
        if (handler) {
          const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?')
            .get(result.conversationId);
          const contact = conversation?.contact_id
            ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(conversation.contact_id)
            : null;
          await handler(message, conversation, contact);
        }

        return result;
      } catch (error) {
        logger.warn(`UnifiedMessageService failed, falling back to legacy: ${error.message}`);
        // Fall through to legacy processing
      }
    }

    // Legacy message processing (fallback)
    try {
      logger.info(`Processing ${message.platform} message from ${message.sender?.id || 'unknown'}`);

      // 1. Find or create conversation
      const conversation = await this.getOrCreateConversation(message);

      // 2. Find or create contact
      const contact = await this.getOrCreateContact(message, conversation);

      // 3. Save message to database
      const savedMessage = await this.saveMessage(message, conversation.id);

      // 4. Update conversation
      await this.updateConversation(conversation.id, savedMessage);

      // 5. Broadcast to WebSocket clients
      if (this.broadcast) {
        this.broadcast('message:new', {
          message: savedMessage,
          conversation,
          contact
        }, message.agentId);
      }

      // 6. Call custom handler if registered
      const handler = this.messageHandlers.get(message.platform);
      if (handler) {
        await handler(message, conversation, contact);
      }

      // 7. Emit event for further processing (AI response, etc.)
      this.emit('message:processed', {
        message: savedMessage,
        conversation,
        contact,
        agentId: message.agentId
      });

      return savedMessage;

    } catch (error) {
      logger.error(`Message processing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get or create conversation
   */
  async getOrCreateConversation(message) {
    const db = getDatabase();

    // Build external ID based on platform
    let externalId;
    if (message.platform === 'whatsapp') {
      externalId = message.isGroup
        ? `whatsapp-group:${message.from}`
        : `whatsapp:${message.from}`;
    } else if (message.platform === 'email') {
      externalId = `email:${message.from}`;
    } else {
      externalId = `${message.platform}:${message.from}`;
    }

    // Check for existing conversation
    let conversation = db.prepare(`
      SELECT * FROM conversations WHERE external_id = ?
    `).get(externalId);

    if (conversation) {
      return conversation;
    }

    // Get user_id from platform account
    const account = db.prepare(`
      SELECT user_id, agent_id FROM platform_accounts WHERE id = ?
    `).get(message.accountId);

    if (!account) {
      throw new Error(`Platform account not found: ${message.accountId}`);
    }

    // Create new conversation - detect category from external ID
    const conversationId = uuidv4();
    // For groups, use the group name; for 1:1 chats, use the sender name
    const title = message.isGroup && message.groupName
      ? message.groupName
      : (message.sender?.name || message.from || 'Unknown');

    // Detect category from externalId
    let category = 'chat';
    if (externalId && externalId.includes('@newsletter')) {
      category = 'news';
    } else if (externalId && (externalId.includes('@broadcast') || externalId === 'status@broadcast')) {
      category = 'status';
    }

    db.prepare(`
      INSERT INTO conversations (id, user_id, agent_id, platform, external_id, title, is_group, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversationId,
      account.user_id,
      account.agent_id,
      message.platform,
      externalId,
      title,
      message.isGroup ? 1 : 0,
      category
    );

    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);

    logger.info(`Created conversation: ${conversationId} for ${externalId}`);

    return conversation;
  }

  /**
   * Get or create contact
   */
  async getOrCreateContact(message, conversation) {
    const db = getDatabase();

    if (!message.sender) {
      return null;
    }

    const identifierType = message.platform === 'email' ? 'email' : 'phone';
    const identifierValue = message.sender.email || message.sender.phone || message.sender.id;

    if (!identifierValue) {
      return null;
    }

    // Check for existing contact by identifier
    let contact = db.prepare(`
      SELECT c.* FROM contacts c
      JOIN contact_identifiers ci ON ci.contact_id = c.id
      WHERE ci.identifier_value = ? AND c.user_id = ?
    `).get(identifierValue, conversation.user_id);

    if (contact) {
      // Update conversation with contact_id if not set
      if (!conversation.contact_id) {
        db.prepare('UPDATE conversations SET contact_id = ? WHERE id = ?')
          .run(contact.id, conversation.id);
      }
      return contact;
    }

    // Create new contact
    const contactId = uuidv4();
    const displayName = message.sender.name || identifierValue;

    db.prepare(`
      INSERT INTO contacts (id, user_id, display_name)
      VALUES (?, ?, ?)
    `).run(contactId, conversation.user_id, displayName);

    // Add identifier
    db.prepare(`
      INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, platform, is_primary)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(uuidv4(), contactId, identifierType, identifierValue, message.platform);

    // Link to conversation
    db.prepare('UPDATE conversations SET contact_id = ? WHERE id = ?')
      .run(contactId, conversation.id);

    contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);

    logger.info(`Created contact: ${displayName} (${contactId})`);

    return contact;
  }

  /**
   * Save message to database
   */
  async saveMessage(message, conversationId) {
    const db = getDatabase();

    const messageId = message.id || uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (
        id, conversation_id, direction, content_type, content,
        media_url, media_mime_type, external_id, sender_id, sender_name, metadata, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      messageId,
      conversationId,
      message.direction || 'incoming',
      message.contentType || 'text',
      message.text || message.content || message.html || null,
      message.mediaUrl || null,
      message.mimeType || null,
      message.externalId || null,
      message.sender?.id || null,
      message.sender?.name || null,
      message.metadata ? JSON.stringify(message.metadata) : null,
      now
    );

    return {
      id: messageId,
      conversationId,
      direction: message.direction || 'incoming',
      contentType: message.contentType || 'text',
      content: message.text || message.content || message.html,
      mediaUrl: message.mediaUrl,
      mediaMimeType: message.mimeType,
      externalId: message.externalId,
      senderId: message.sender?.id,
      senderName: message.sender?.name,
      platform: message.platform,
      createdAt: now
    };
  }

  /**
   * Update conversation after new message
   */
  async updateConversation(conversationId, message) {
    const db = getDatabase();

    db.prepare(`
      UPDATE conversations
      SET last_message_at = ?,
          unread_count = unread_count + 1,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(new Date().toISOString(), conversationId);
  }

  /**
   * Mark messages as read
   */
  async markAsRead(conversationId) {
    const db = getDatabase();

    db.prepare(`
      UPDATE conversations
      SET unread_count = 0,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(conversationId);

    db.prepare(`
      UPDATE messages
      SET status = 'read'
      WHERE conversation_id = ? AND direction = 'incoming' AND status != 'read'
    `).run(conversationId);
  }

  /**
   * Send a reply message
   */
  async sendReply(conversationId, content, options = {}) {
    const db = getDatabase();

    // Get conversation
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?')
      .get(conversationId);

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Get platform account
    const account = db.prepare(`
      SELECT pa.id as account_id, pa.platform
      FROM platform_accounts pa
      JOIN conversations c ON c.agent_id = pa.agent_id AND c.platform = pa.platform
      WHERE c.id = ?
    `).get(conversationId);

    if (!account) {
      throw new Error(`No platform account found for conversation: ${conversationId}`);
    }

    // Extract recipient from external_id
    const recipient = this.extractRecipient(conversation.external_id, conversation.platform);

    // Send via agent manager
    const result = await this.agentManager.sendMessage(
      account.account_id,
      recipient,
      content,
      options
    );

    // Save outgoing message
    const messageId = uuidv4();
    db.prepare(`
      INSERT INTO messages (id, conversation_id, direction, content_type, content, external_id, status)
      VALUES (?, ?, 'outgoing', ?, ?, ?, 'sent')
    `).run(messageId, conversationId, options.contentType || 'text', content, result.id);

    // Update conversation
    db.prepare(`
      UPDATE conversations
      SET last_message_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(conversationId);

    const savedMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);

    // Broadcast as message:new for real-time frontend updates
    if (this.broadcast) {
      this.broadcast('message:new', {
        message: {
          id: savedMessage.id,
          conversationId: savedMessage.conversation_id || conversationId,
          direction: savedMessage.direction || 'outgoing',
          contentType: savedMessage.content_type || 'text',
          content: savedMessage.content,
          senderId: 'self',
          senderName: 'You',
          platform: conversation.platform,
          createdAt: savedMessage.created_at,
          role: 'user',
          isFromAI: false,
          status: savedMessage.status || 'sent',
        },
        conversation: {
          id: conversationId,
          agentId: conversation.agent_id,
        },
      }, conversation.agent_id);
    }

    return savedMessage;
  }

  /**
   * Extract recipient from external_id
   */
  extractRecipient(externalId, platform) {
    // Format: platform:identifier
    const parts = externalId.split(':');
    if (parts.length > 1) {
      return parts.slice(1).join(':');
    }
    return externalId;
  }
}

// Add EventEmitter functionality
const EventEmitter = require('events');
Object.setPrototypeOf(MessageRouter.prototype, EventEmitter.prototype);

module.exports = {
  MessageRouter
};
