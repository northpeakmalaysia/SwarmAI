/**
 * Conversation Routes
 * Matches frontend expectations at /api/conversations
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const { MessageRouter } = require('../agents/messageRouter.cjs');
const { createPagination } = require('../utils/responseHelpers.cjs');
const { AgentManager } = require('../agents/agentManager.cjs');

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
 * Transform raw message row from database to API format
 */
function transformMessageRow(m) {
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
 * GET /api/conversations
 * List all conversations for the current user
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { agentId, platform, category, limit = 500, offset = 0 } = req.query;

    // Build count query for pagination
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
    if (category) {
      countQuery += ' AND c.category = ?';
      countParams.push(category);
    }

    const totalCount = db.prepare(countQuery).get(...countParams).count;

    let query = `
      SELECT
        c.id,
        c.user_id as userId,
        c.agent_id as agentId,
        c.platform,
        c.external_id as externalId,
        c.contact_id as contactId,
        c.title,
        c.status,
        c.category,
        c.is_group as isGroup,
        c.is_pinned as isPinned,
        c.is_muted as isMuted,
        c.is_archived as isArchived,
        c.metadata,
        c.unread_count as unreadCount,
        c.created_at as createdAt,
        c.updated_at as updatedAt,
        cont.display_name as contactName,
        cont.avatar as contactAvatar,
        a.name as agentName,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as messageCount,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as lastMessage,
        COALESCE(
          (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1),
          c.last_message_at
        ) as lastMessageAt
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

    if (category) {
      query += ' AND c.category = ?';
      params.push(category);
    }

    query += ' ORDER BY COALESCE(lastMessageAt, c.last_message_at, c.updated_at) DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const conversations = db.prepare(query).all(...params);

    // Parse metadata JSON and convert timestamps to ISO format
    const formattedConversations = conversations.map(c => ({
      ...c,
      metadata: c.metadata ? JSON.parse(c.metadata) : null,
      isGroup: !!c.isGroup,
      isPinned: !!c.isPinned,
      isMuted: !!c.isMuted,
      isArchived: !!c.isArchived,
      category: c.category || 'chat',
      createdAt: toISOTimestamp(c.createdAt),
      updatedAt: toISOTimestamp(c.updatedAt),
      lastMessageAt: toISOTimestamp(c.lastMessageAt)
    }));

    res.json({
      conversations: formattedConversations,
      pagination: createPagination(formattedConversations, {
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
 * GET /api/conversations/:id
 * Get a single conversation
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();

    const conversation = db.prepare(`
      SELECT
        c.id,
        c.user_id as userId,
        c.agent_id as agentId,
        c.platform,
        c.external_id as externalId,
        c.contact_id as contactId,
        c.title,
        c.status,
        c.category,
        c.is_group as isGroup,
        c.is_pinned as isPinned,
        c.is_muted as isMuted,
        c.is_archived as isArchived,
        c.metadata,
        c.unread_count as unreadCount,
        c.created_at as createdAt,
        c.updated_at as updatedAt,
        cont.display_name as contactName,
        cont.avatar as contactAvatar,
        a.name as agentName
      FROM conversations c
      LEFT JOIN contacts cont ON c.contact_id = cont.id
      LEFT JOIN agents a ON c.agent_id = a.id
      WHERE c.id = ? AND c.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      conversation: {
        ...conversation,
        metadata: conversation.metadata ? JSON.parse(conversation.metadata) : null,
        isGroup: !!conversation.isGroup,
        isPinned: !!conversation.isPinned,
        isMuted: !!conversation.isMuted,
        isArchived: !!conversation.isArchived,
        category: conversation.category || 'chat',
        createdAt: toISOTimestamp(conversation.createdAt),
        updatedAt: toISOTimestamp(conversation.updatedAt)
      }
    });

  } catch (error) {
    logger.error(`Failed to get conversation: ${error.message}`);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * Detect conversation category from external_id
 * @param {string} externalId - Platform-specific external ID
 * @returns {'chat' | 'news' | 'status'} - Detected category
 */
function detectCategory(externalId) {
  if (!externalId) return 'chat';

  // WhatsApp newsletter channels
  if (externalId.includes('@newsletter')) {
    return 'news';
  }

  // WhatsApp status broadcasts
  if (externalId.includes('@broadcast') || externalId === 'status@broadcast') {
    return 'status';
  }

  return 'chat';
}

/**
 * POST /api/conversations
 * Create a new conversation
 */
router.post('/', (req, res) => {
  try {
    const { title, agentId, platform, externalId, contactId, category } = req.body;

    const db = getDatabase();
    const conversationId = uuidv4();

    // Auto-detect category from externalId if not explicitly provided
    const detectedCategory = category || detectCategory(externalId);

    db.prepare(`
      INSERT INTO conversations (id, user_id, agent_id, platform, external_id, contact_id, title, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversationId,
      req.user.id,
      agentId || null,
      platform || 'internal',
      externalId || null,
      contactId || null,
      title || 'New Conversation',
      detectedCategory
    );

    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);

    res.status(201).json({ conversation });

  } catch (error) {
    logger.error(`Failed to create conversation: ${error.message}`);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * PATCH /api/conversations/:id
 * Update conversation properties (pin, mute, archive, title, status)
 */
router.patch('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { isPinned, isMuted, isArchived, title, status } = req.body;

    // Verify ownership
    const conversation = db.prepare(`
      SELECT id FROM conversations WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (typeof isPinned === 'boolean') {
      updates.push('is_pinned = ?');
      params.push(isPinned ? 1 : 0);
    }
    if (typeof isMuted === 'boolean') {
      updates.push('is_muted = ?');
      params.push(isMuted ? 1 : 0);
    }
    if (typeof isArchived === 'boolean') {
      updates.push('is_archived = ?');
      params.push(isArchived ? 1 : 0);
    }
    if (typeof title === 'string') {
      updates.push('title = ?');
      params.push(title);
    }
    if (typeof status === 'string' && ['active', 'archived', 'closed'].includes(status)) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id, req.user.id);

    db.prepare(`
      UPDATE conversations
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `).run(...params);

    // Fetch updated conversation
    const updated = db.prepare(`
      SELECT
        c.id,
        c.user_id as userId,
        c.agent_id as agentId,
        c.platform,
        c.external_id as externalId,
        c.contact_id as contactId,
        c.title,
        c.status,
        c.category,
        c.is_group as isGroup,
        c.is_pinned as isPinned,
        c.is_muted as isMuted,
        c.is_archived as isArchived,
        c.metadata,
        c.unread_count as unreadCount,
        c.created_at as createdAt,
        c.updated_at as updatedAt
      FROM conversations c
      WHERE c.id = ?
    `).get(req.params.id);

    logger.info(`Conversation ${req.params.id} updated by user ${req.user.id}`);

    res.json({
      conversation: {
        ...updated,
        metadata: updated.metadata ? JSON.parse(updated.metadata) : null,
        isGroup: !!updated.isGroup,
        isPinned: !!updated.isPinned,
        isMuted: !!updated.isMuted,
        isArchived: !!updated.isArchived,
        category: updated.category || 'chat',
        createdAt: toISOTimestamp(updated.createdAt),
        updatedAt: toISOTimestamp(updated.updatedAt)
      }
    });

  } catch (error) {
    logger.error(`Failed to update conversation: ${error.message}`);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

/**
 * DELETE /api/conversations/:id
 * Delete a conversation
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();

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
 * GET /api/conversations/:id/messages
 * Get messages for a conversation
 * For WhatsApp conversations: triggers lazy-load sync in background
 */
router.get('/:id/messages', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership and get conversation details (including platform info)
    const conversation = db.prepare(`
      SELECT c.id, c.platform, c.external_id, c.agent_id, c.user_id
      FROM conversations c
      WHERE c.id = ? AND c.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // For WhatsApp conversations: sync messages from WhatsApp
    if (conversation.platform === 'whatsapp' && conversation.external_id) {
      // Check how many messages we already have in DB
      const msgCount = db.prepare(
        'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?'
      ).get(conversation.id);
      const hasMessages = (msgCount?.count || 0) > 0;

      if (!hasMessages) {
        // SYNCHRONOUS sync: first load with 0 messages - wait for WhatsApp fetch
        try {
          const platformAccount = db.prepare(`
            SELECT id FROM platform_accounts
            WHERE agent_id = ? AND platform = 'whatsapp'
          `).get(conversation.agent_id);

          if (platformAccount) {
            const agentManager = AgentManager.getInstance();
            const client = agentManager.getClient(platformAccount.id);

            if (client && client.getStatus() === 'connected') {
              const result = await client.fetchMessagesForConversation(conversation.id, 100);
              if (result.synced && result.messagesSynced > 0) {
                logger.info(`First-load sync: ${result.messagesSynced} messages for conversation ${conversation.id}`);
              }
            }
          }
        } catch (syncErr) {
          logger.warn(`First-load sync error for conversation ${conversation.id}: ${syncErr.message}`);
        }
      } else {
        // BACKGROUND sync: already have messages, catch up new ones
        setImmediate(async () => {
          try {
            const platformAccount = db.prepare(`
              SELECT id FROM platform_accounts
              WHERE agent_id = ? AND platform = 'whatsapp'
            `).get(conversation.agent_id);

            if (platformAccount) {
              const agentManager = AgentManager.getInstance();
              const client = agentManager.getClient(platformAccount.id);

              if (client && client.getStatus() === 'connected') {
                const result = await client.fetchMessagesForConversation(conversation.id, 100);
                if (result.synced && result.messagesSynced > 0) {
                  logger.info(`Background sync: ${result.messagesSynced} new messages for conversation ${conversation.id}`);
                  if (global.io) {
                    const payload = {
                      conversationId: conversation.id,
                      messagesSynced: result.messagesSynced
                    };
                    global.io.to(`conversation:${conversation.id}`).emit('messages:synced', payload);
                    global.io.to(`agent:${conversation.agent_id}`).emit('messages:synced', payload);
                  }
                }
              }
            }
          } catch (syncErr) {
            logger.debug(`Background sync error for conversation ${conversation.id}: ${syncErr.message}`);
          }
        });
      }
    }

    const { limit = 50, before } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 50, 500); // Cap at 500, default 50 for faster load

    // Get total message count for this conversation
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?
    `).get(req.params.id);
    const totalMessages = countResult?.total || 0;

    // Build query - fetch newest messages first, with optional cursor
    let messagesQuery;
    let queryParams;

    if (before) {
      // Cursor-based pagination: get messages older than the cursor
      messagesQuery = `
        SELECT
          id,
          conversation_id as conversationId,
          direction,
          content_type as contentType,
          content,
          media_url as mediaUrl,
          media_mime_type as mediaMimeType,
          external_id as externalId,
          sender_id as senderId,
          sender_name as senderName,
          reply_to_id as replyToId,
          status,
          ai_generated as aiGenerated,
          metadata,
          created_at as createdAt
        FROM messages
        WHERE conversation_id = ? AND created_at < ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      queryParams = [req.params.id, before, parsedLimit];
    } else {
      // Initial load: get the newest messages
      messagesQuery = `
        SELECT
          id,
          conversation_id as conversationId,
          direction,
          content_type as contentType,
          content,
          media_url as mediaUrl,
          media_mime_type as mediaMimeType,
          external_id as externalId,
          sender_id as senderId,
          sender_name as senderName,
          reply_to_id as replyToId,
          status,
          ai_generated as aiGenerated,
          metadata,
          created_at as createdAt
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      queryParams = [req.params.id, parsedLimit];
    }

    const messages = db.prepare(messagesQuery).all(...queryParams);

    // Reverse to get chronological order (oldest first for display)
    messages.reverse();

    // Determine if there are more messages to load
    const oldestMessageTime = messages.length > 0 ? messages[0].createdAt : null;
    let hasMore = false;
    if (oldestMessageTime) {
      const olderCount = db.prepare(`
        SELECT COUNT(*) as count FROM messages
        WHERE conversation_id = ? AND created_at < ?
      `).get(req.params.id, oldestMessageTime);
      hasMore = (olderCount?.count || 0) > 0;
    }

    // Mark as read
    db.prepare(`
      UPDATE conversations SET unread_count = 0 WHERE id = ?
    `).run(req.params.id);

    res.json({
      messages: messages.map(m => ({
        ...m,
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
        aiGenerated: !!m.aiGenerated,
        createdAt: toISOTimestamp(m.createdAt)
      })),
      pagination: {
        total: totalMessages,
        hasMore,
        nextCursor: hasMore && messages.length > 0 ? messages[0].createdAt : null
      }
    });

  } catch (error) {
    logger.error(`Failed to get messages: ${error.message}`);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * POST /api/conversations/:id/sync-messages
 * Trigger synchronous message sync from WhatsApp for a conversation
 * Frontend doesn't need to know the platformAccountId - resolved internally
 */
router.post('/:id/sync-messages', async (req, res) => {
  try {
    const db = getDatabase();

    const conversation = db.prepare(`
      SELECT c.id, c.platform, c.external_id, c.agent_id, c.user_id
      FROM conversations c
      WHERE c.id = ? AND c.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.platform !== 'whatsapp') {
      return res.json({ success: true, messagesSynced: 0, totalMessages: 0, reason: 'Not a WhatsApp conversation' });
    }

    if (!conversation.external_id) {
      return res.json({ success: true, messagesSynced: 0, totalMessages: 0, reason: 'No external ID' });
    }

    // Find the WhatsApp client
    const platformAccount = db.prepare(`
      SELECT id FROM platform_accounts
      WHERE agent_id = ? AND platform = 'whatsapp'
    `).get(conversation.agent_id);

    if (!platformAccount) {
      return res.json({ success: false, messagesSynced: 0, totalMessages: 0, reason: 'No WhatsApp account found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(platformAccount.id);

    if (!client || client.getStatus() !== 'connected') {
      return res.json({ success: false, messagesSynced: 0, totalMessages: 0, reason: 'WhatsApp not connected' });
    }

    // Synchronous fetch
    const result = await client.fetchMessagesForConversation(conversation.id, 100);

    const totalMessages = db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?'
    ).get(conversation.id);

    if (result.synced && result.messagesSynced > 0) {
      logger.info(`Manual sync: ${result.messagesSynced} messages for conversation ${conversation.id}`);
      // Notify via WebSocket
      if (global.io) {
        const payload = { conversationId: conversation.id, messagesSynced: result.messagesSynced };
        global.io.to(`conversation:${conversation.id}`).emit('messages:synced', payload);
        global.io.to(`agent:${conversation.agent_id}`).emit('messages:synced', payload);
      }
    }

    res.json({
      success: true,
      messagesSynced: result.messagesSynced || 0,
      totalMessages: totalMessages?.count || 0,
    });

  } catch (error) {
    logger.error(`Failed to sync messages for conversation ${req.params.id}: ${error.message}`);
    res.status(500).json({ error: 'Failed to sync messages', reason: error.message });
  }
});

/**
 * POST /api/conversations/:id/messages
 * Send a message in a conversation
 */
router.post('/:id/messages', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const conversation = db.prepare(`
      SELECT * FROM conversations WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { content, contentType = 'text' } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Message content required' });
    }

    // Check if this conversation has an associated platform account
    if (conversation.agent_id && conversation.external_id) {
      // Try to send via platform
      try {
        const messageRouter = MessageRouter.getInstance();
        const rawMessage = await messageRouter.sendReply(req.params.id, content, { contentType });
        return res.status(201).json({ message: transformMessageRow(rawMessage) });
      } catch (sendErr) {
        logger.warn(`Platform send failed, saving locally: ${sendErr.message}`);
      }
    }

    // Save message locally (for internal conversations or when platform send fails)
    const messageId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO messages (id, conversation_id, direction, content_type, content, status, created_at)
      VALUES (?, ?, 'outgoing', ?, ?, 'sent', ?)
    `).run(messageId, req.params.id, contentType, content, now);

    // Update conversation
    db.prepare(`
      UPDATE conversations SET last_message_at = ?, updated_at = datetime('now') WHERE id = ?
    `).run(now, req.params.id);

    const rawMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);

    // Broadcast for real-time frontend updates
    if (global.wsBroadcast) {
      global.wsBroadcast('message:new', {
        message: {
          id: messageId,
          conversationId: req.params.id,
          direction: 'outgoing',
          contentType,
          content,
          senderId: 'self',
          senderName: 'You',
          platform: conversation.platform,
          createdAt: now,
          role: 'user',
          isFromAI: false,
          status: 'sent',
        },
        conversation: {
          id: req.params.id,
          agentId: conversation.agent_id,
        },
      }, conversation.agent_id);
    }

    res.status(201).json({ message: transformMessageRow(rawMessage) });

  } catch (error) {
    logger.error(`Failed to send message: ${error.message}`);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
