/**
 * Message Routes
 * Conversation and message management
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const { MessageRouter } = require('../agents/messageRouter.cjs');
const { createPagination } = require('../utils/responseHelpers.cjs');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Convert SQLite datetime (YYYY-MM-DD HH:MM:SS) to ISO format with Z suffix
 * SQLite datetime('now') returns UTC but without timezone indicator
 * JavaScript interprets datetime without 'T' and 'Z' as local time
 */
function toISOTimestamp(sqliteDateTime) {
  if (!sqliteDateTime) return null;
  // If already has 'T' or 'Z', assume it's already ISO format
  if (sqliteDateTime.includes('T') || sqliteDateTime.includes('Z')) {
    return sqliteDateTime;
  }
  // Convert "YYYY-MM-DD HH:MM:SS" to "YYYY-MM-DDTHH:MM:SSZ" (UTC)
  return sqliteDateTime.replace(' ', 'T') + 'Z';
}

/**
 * Transform conversation from database to API format
 */
function transformConversation(c) {
  if (!c) return null;
  return {
    id: c.id,
    userId: c.user_id,
    agentId: c.agent_id,
    platform: c.platform,
    externalId: c.external_id,
    contactId: c.contact_id,
    title: c.title,
    status: c.status,
    isGroup: !!c.is_group,
    metadata: c.metadata ? JSON.parse(c.metadata) : null,
    unreadCount: c.unread_count,
    createdAt: toISOTimestamp(c.created_at),
    updatedAt: toISOTimestamp(c.updated_at),
    contactName: c.contact_name,
    contactAvatar: c.contact_avatar || null,
    agentName: c.agent_name,
    messageCount: c.message_count || 0,
    lastMessage: c.last_message,
    lastMessageAt: toISOTimestamp(c.last_message_at)
  };
}

/**
 * Transform message from database to API format
 */
function transformMessage(m) {
  if (!m) return null;
  return {
    id: m.id,
    conversationId: m.conversation_id,
    direction: m.direction,
    contentType: m.content_type,
    content: m.content,
    mediaUrl: m.media_url,
    mediaMimeType: m.media_mime_type,
    externalId: m.external_id,
    senderId: m.sender_id,
    senderName: m.sender_name,
    senderAvatar: m.sender_avatar || null,
    replyToId: m.reply_to_id,
    status: m.status,
    aiGenerated: !!m.ai_generated,
    metadata: m.metadata ? JSON.parse(m.metadata) : null,
    createdAt: toISOTimestamp(m.created_at)
  };
}

/**
 * GET /api/messages/conversations
 * List all conversations for the current user
 */
router.get('/conversations', (req, res) => {
  try {
    const db = getDatabase();
    const { agentId, platform, limit = 50, offset = 0 } = req.query;

    // Count query for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM conversations c WHERE c.user_id = ?';
    const countParams = [req.user.id];
    if (agentId) {
      countQuery += ' AND c.agent_id = ?';
      countParams.push(agentId);
    }
    if (platform) {
      countQuery += ' AND c.platform = ?';
      countParams.push(platform);
    }
    const totalCount = db.prepare(countQuery).get(...countParams).count;

    let query = `
      SELECT
        c.*,
        cont.display_name as contact_name,
        cont.avatar as contact_avatar,
        a.name as agent_name,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
      FROM conversations c
      LEFT JOIN contacts cont ON c.contact_id = cont.id
      LEFT JOIN agents a ON c.agent_id = a.id
      WHERE c.user_id = ?
    `;

    const params = [req.user.id];

    if (agentId) {
      query += ' AND c.agent_id = ?';
      params.push(agentId);
    }

    if (platform) {
      query += ' AND c.platform = ?';
      params.push(platform);
    }

    query += ' ORDER BY c.updated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const conversations = db.prepare(query).all(...params);
    const transformed = conversations.map(transformConversation);

    res.json({
      conversations: transformed,
      pagination: createPagination(transformed, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to list conversations: ${error.message}`);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * GET /api/messages/conversations/:id
 * Get a single conversation with messages
 */
router.get('/conversations/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 100, offset = 0 } = req.query;

    const conversation = db.prepare(`
      SELECT
        c.*,
        cont.display_name as contact_name,
        a.name as agent_name
      FROM conversations c
      LEFT JOIN contacts cont ON c.contact_id = cont.id
      LEFT JOIN agents a ON c.agent_id = a.id
      WHERE c.id = ? AND c.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get messages
    const messages = db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.params.id, parseInt(limit), parseInt(offset));

    // Mark as read
    const messageRouter = MessageRouter.getInstance();
    messageRouter.markAsRead(req.params.id);

    res.json({
      conversation: transformConversation(conversation),
      messages: messages.reverse().map(transformMessage) // Chronological order
    });

  } catch (error) {
    logger.error(`Failed to get conversation: ${error.message}`);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * POST /api/messages/conversations/:id/send
 * Send a message in a conversation
 */
router.post('/conversations/:id/send', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const conversation = db.prepare(`
      SELECT * FROM conversations WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { content, contentType = 'text', subject } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Message content required' });
    }

    const messageRouter = MessageRouter.getInstance();

    const message = await messageRouter.sendReply(req.params.id, content, {
      contentType,
      subject // For email
    });

    res.status(201).json({ message });

  } catch (error) {
    logger.error(`Failed to send message: ${error.message}`);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * POST /api/messages/send
 * Send a message to a new or existing recipient
 */
router.post('/send', async (req, res) => {
  try {
    const { accountId, to, content, contentType = 'text', subject, media } = req.body;

    if (!accountId || !to || !content) {
      return res.status(400).json({ error: 'accountId, to, and content are required' });
    }

    const { AgentManager } = require('../agents/agentManager.cjs');
    const agentManager = AgentManager.getInstance();

    const result = await agentManager.sendMessage(accountId, to, content, {
      contentType,
      subject,
      media
    });

    res.status(201).json({ result });

  } catch (error) {
    logger.error(`Failed to send message: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/messages/conversations/:id/read
 * Mark conversation as read
 */
router.put('/conversations/:id/read', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const conversation = db.prepare(`
      SELECT id FROM conversations WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messageRouter = MessageRouter.getInstance();
    await messageRouter.markAsRead(req.params.id);

    res.json({ message: 'Marked as read' });

  } catch (error) {
    logger.error(`Failed to mark as read: ${error.message}`);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/**
 * PUT /api/messages/conversations/:id/archive
 * Archive a conversation
 */
router.put('/conversations/:id/archive', (req, res) => {
  try {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE conversations
      SET status = 'archived', updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ message: 'Conversation archived' });

  } catch (error) {
    logger.error(`Failed to archive conversation: ${error.message}`);
    res.status(500).json({ error: 'Failed to archive conversation' });
  }
});

/**
 * DELETE /api/messages/agent/:agentId
 * Delete all messages and conversations for a specific agent
 */
router.delete('/agent/:agentId', (req, res) => {
  try {
    const db = getDatabase();
    const { agentId } = req.params;

    // Get conversations for this agent and user
    const conversations = db.prepare(`
      SELECT id FROM conversations WHERE agent_id = ? AND user_id = ?
    `).all(agentId, req.user.id);

    const conversationIds = conversations.map(c => c.id);

    if (conversationIds.length === 0) {
      return res.json({
        message: 'No conversations found for this agent',
        deletedConversations: 0,
        deletedMessages: 0,
        deletedMedia: 0
      });
    }

    // Delete media cache entries first (FK constraint)
    const placeholders = conversationIds.map(() => '?').join(',');
    const mediaResult = db.prepare(`
      DELETE FROM media_cache
      WHERE message_id IN (
        SELECT id FROM messages WHERE conversation_id IN (${placeholders})
      )
    `).run(...conversationIds);

    // Delete messages (will cascade from conversations, but let's count them first)
    const messageCount = db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE conversation_id IN (${placeholders})
    `).get(...conversationIds);

    // Delete conversations (messages will cascade delete)
    const convResult = db.prepare(`
      DELETE FROM conversations WHERE agent_id = ? AND user_id = ?
    `).run(agentId, req.user.id);

    logger.info(`Deleted all messages for agent ${agentId}: ${convResult.changes} conversations, ${messageCount.count} messages, ${mediaResult.changes} media entries`);

    res.json({
      message: 'All messages deleted for agent',
      deletedConversations: convResult.changes,
      deletedMessages: messageCount.count,
      deletedMedia: mediaResult.changes
    });

  } catch (error) {
    logger.error(`Failed to delete messages for agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete messages' });
  }
});

/**
 * DELETE /api/messages/conversations/:id
 * Delete a conversation and its messages
 */
router.delete('/conversations/:id', (req, res) => {
  try {
    const db = getDatabase();

    // Messages will cascade delete
    const result = db.prepare(`
      DELETE FROM conversations WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ message: 'Conversation deleted' });

  } catch (error) {
    logger.error(`Failed to delete conversation: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

/**
 * GET /api/messages/contacts
 * List all contacts for the current user
 */
router.get('/contacts', (req, res) => {
  try {
    const db = getDatabase();

    const contacts = db.prepare(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM conversations WHERE contact_id = c.id) as conversation_count
      FROM contacts c
      WHERE c.user_id = ?
      ORDER BY c.display_name
    `).all(req.user.id);

    // Get identifiers for each contact
    const contactsWithIdentifiers = contacts.map(contact => {
      const identifiers = db.prepare(`
        SELECT identifier_type, identifier_value, platform
        FROM contact_identifiers
        WHERE contact_id = ?
      `).all(contact.id);

      return {
        ...contact,
        identifiers
      };
    });

    res.json({ contacts: contactsWithIdentifiers });

  } catch (error) {
    logger.error(`Failed to list contacts: ${error.message}`);
    res.status(500).json({ error: 'Failed to list contacts' });
  }
});

module.exports = router;
