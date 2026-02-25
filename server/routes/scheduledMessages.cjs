/**
 * Scheduled Messages Routes
 * API endpoints for managing scheduled messages
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { createServiceLogger } = require('../services/logger.cjs');

const logger = createServiceLogger('ScheduledMessagesRoute');

/**
 * GET /api/scheduled-messages
 * List all scheduled messages for the current user
 */
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const { status, conversationId, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        sm.id,
        sm.conversation_id as conversationId,
        sm.user_id as userId,
        sm.agent_id as agentId,
        sm.content,
        sm.content_type as contentType,
        sm.scheduled_at as scheduledAt,
        sm.status,
        sm.error_message as errorMessage,
        sm.sent_message_id as sentMessageId,
        sm.created_at as createdAt,
        sm.updated_at as updatedAt,
        c.title as conversationTitle,
        c.platform
      FROM scheduled_messages sm
      JOIN conversations c ON sm.conversation_id = c.id
      WHERE sm.user_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ` AND sm.status = ?`;
      params.push(status);
    }

    if (conversationId) {
      query += ` AND sm.conversation_id = ?`;
      params.push(conversationId);
    }

    query += ` ORDER BY sm.scheduled_at ASC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const scheduledMessages = db.prepare(query).all(...params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM scheduled_messages sm
      WHERE sm.user_id = ?
    `;
    const countParams = [req.user.id];

    if (status) {
      countQuery += ` AND sm.status = ?`;
      countParams.push(status);
    }

    if (conversationId) {
      countQuery += ` AND sm.conversation_id = ?`;
      countParams.push(conversationId);
    }

    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({
      scheduledMessages,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + scheduledMessages.length < total,
      },
    });
  } catch (error) {
    logger.error(`Failed to list scheduled messages: ${error.message}`);
    res.status(500).json({ error: 'Failed to list scheduled messages' });
  }
});

/**
 * GET /api/scheduled-messages/:id
 * Get a single scheduled message
 */
router.get('/:id', async (req, res) => {
  try {
    const db = getDatabase();

    const scheduledMessage = db.prepare(`
      SELECT
        sm.id,
        sm.conversation_id as conversationId,
        sm.user_id as userId,
        sm.agent_id as agentId,
        sm.content,
        sm.content_type as contentType,
        sm.scheduled_at as scheduledAt,
        sm.status,
        sm.error_message as errorMessage,
        sm.sent_message_id as sentMessageId,
        sm.created_at as createdAt,
        sm.updated_at as updatedAt,
        c.title as conversationTitle,
        c.platform
      FROM scheduled_messages sm
      JOIN conversations c ON sm.conversation_id = c.id
      WHERE sm.id = ? AND sm.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!scheduledMessage) {
      return res.status(404).json({ error: 'Scheduled message not found' });
    }

    res.json({ scheduledMessage });
  } catch (error) {
    logger.error(`Failed to get scheduled message: ${error.message}`);
    res.status(500).json({ error: 'Failed to get scheduled message' });
  }
});

/**
 * POST /api/scheduled-messages
 * Schedule a new message
 */
router.post('/', async (req, res) => {
  try {
    const db = getDatabase();
    const { conversationId, content, contentType = 'text', scheduledAt, agentId } = req.body;

    // Validate required fields
    if (!conversationId || !content || !scheduledAt) {
      return res.status(400).json({ error: 'Missing required fields: conversationId, content, scheduledAt' });
    }

    // Validate scheduledAt is in the future
    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduledAt date format' });
    }

    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    // Verify conversation ownership
    const conversation = db.prepare(`
      SELECT id, agent_id FROM conversations WHERE id = ? AND user_id = ?
    `).get(conversationId, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Create scheduled message
    const id = uuidv4();
    const effectiveAgentId = agentId || conversation.agent_id;

    db.prepare(`
      INSERT INTO scheduled_messages (
        id, conversation_id, user_id, agent_id, content, content_type, scheduled_at, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
    `).run(id, conversationId, req.user.id, effectiveAgentId, content, contentType, scheduledAt);

    const scheduledMessage = db.prepare(`
      SELECT
        sm.id,
        sm.conversation_id as conversationId,
        sm.user_id as userId,
        sm.agent_id as agentId,
        sm.content,
        sm.content_type as contentType,
        sm.scheduled_at as scheduledAt,
        sm.status,
        sm.created_at as createdAt,
        sm.updated_at as updatedAt
      FROM scheduled_messages sm
      WHERE sm.id = ?
    `).get(id);

    logger.info(`Scheduled message created: ${id} for ${scheduledAt}`);

    res.status(201).json({ scheduledMessage });
  } catch (error) {
    logger.error(`Failed to create scheduled message: ${error.message}`);
    res.status(500).json({ error: 'Failed to create scheduled message' });
  }
});

/**
 * PUT /api/scheduled-messages/:id
 * Update a scheduled message (only pending messages can be updated)
 */
router.put('/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { content, contentType, scheduledAt } = req.body;

    // Check if message exists and is pending
    const existing = db.prepare(`
      SELECT id, status FROM scheduled_messages WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Scheduled message not found' });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending messages can be updated' });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }

    if (contentType !== undefined) {
      updates.push('content_type = ?');
      params.push(contentType);
    }

    if (scheduledAt !== undefined) {
      const scheduledDate = new Date(scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: 'Invalid scheduledAt date format' });
      }
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ error: 'Scheduled time must be in the future' });
      }
      updates.push('scheduled_at = ?');
      params.push(scheduledAt);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = datetime(\'now\')');
    params.push(req.params.id);

    db.prepare(`
      UPDATE scheduled_messages SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    // Fetch updated message
    const scheduledMessage = db.prepare(`
      SELECT
        sm.id,
        sm.conversation_id as conversationId,
        sm.user_id as userId,
        sm.agent_id as agentId,
        sm.content,
        sm.content_type as contentType,
        sm.scheduled_at as scheduledAt,
        sm.status,
        sm.created_at as createdAt,
        sm.updated_at as updatedAt
      FROM scheduled_messages sm
      WHERE sm.id = ?
    `).get(req.params.id);

    res.json({ scheduledMessage });
  } catch (error) {
    logger.error(`Failed to update scheduled message: ${error.message}`);
    res.status(500).json({ error: 'Failed to update scheduled message' });
  }
});

/**
 * DELETE /api/scheduled-messages/:id
 * Cancel/delete a scheduled message
 */
router.delete('/:id', async (req, res) => {
  try {
    const db = getDatabase();

    // Check if message exists
    const existing = db.prepare(`
      SELECT id, status FROM scheduled_messages WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Scheduled message not found' });
    }

    // Only allow deletion of pending messages
    if (existing.status !== 'pending') {
      // For non-pending, mark as cancelled instead of deleting
      db.prepare(`
        UPDATE scheduled_messages SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?
      `).run(req.params.id);
    } else {
      // Delete pending message
      db.prepare(`DELETE FROM scheduled_messages WHERE id = ?`).run(req.params.id);
    }

    logger.info(`Scheduled message cancelled/deleted: ${req.params.id}`);

    res.json({ success: true, message: 'Scheduled message cancelled' });
  } catch (error) {
    logger.error(`Failed to delete scheduled message: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete scheduled message' });
  }
});

module.exports = router;
