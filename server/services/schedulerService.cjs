/**
 * Scheduler Service
 * Periodically checks for scheduled messages and sends them when due
 */

const { getDatabase } = require('./database.cjs');
const { createServiceLogger } = require('./logger.cjs');
const { AgentManager } = require('../agents/agentManager.cjs');
const { v4: uuidv4 } = require('uuid');

const logger = createServiceLogger('SchedulerService');

// Check interval (every 30 seconds)
const CHECK_INTERVAL_MS = 30 * 1000;

let intervalId = null;
let isProcessing = false;

/**
 * Process due scheduled messages
 */
async function processDueMessages() {
  if (isProcessing) {
    logger.debug('Already processing scheduled messages, skipping...');
    return;
  }

  isProcessing = true;

  try {
    const db = getDatabase();
    const now = new Date().toISOString();

    // Get all pending messages that are due
    const dueMessages = db.prepare(`
      SELECT sm.*, c.external_id, c.platform, c.agent_id as conv_agent_id
      FROM scheduled_messages sm
      JOIN conversations c ON sm.conversation_id = c.id
      WHERE sm.status = 'pending' AND sm.scheduled_at <= ?
      ORDER BY sm.scheduled_at ASC
      LIMIT 10
    `).all(now);

    if (dueMessages.length === 0) {
      return;
    }

    logger.info(`Processing ${dueMessages.length} due scheduled message(s)...`);

    for (const scheduled of dueMessages) {
      try {
        // Mark as processing
        db.prepare(`
          UPDATE scheduled_messages SET status = 'processing', updated_at = datetime('now') WHERE id = ?
        `).run(scheduled.id);

        // Get the agent for sending
        const agentId = scheduled.agent_id || scheduled.conv_agent_id;
        if (!agentId) {
          throw new Error('No agent ID found for scheduled message');
        }

        // Find platform account for this agent
        const platformAccount = db.prepare(`
          SELECT id FROM platform_accounts WHERE agent_id = ? AND platform = ?
        `).get(agentId, scheduled.platform);

        if (!platformAccount) {
          throw new Error(`No platform account found for agent ${agentId}`);
        }

        // Get the client and send the message
        const agentManager = AgentManager.getInstance();
        const client = agentManager.getClient(platformAccount.id);

        if (!client || client.getStatus() !== 'connected') {
          throw new Error('Platform client not connected');
        }

        // Extract recipient from external_id
        const recipient = scheduled.external_id;
        if (!recipient) {
          throw new Error('No recipient found in conversation');
        }

        // Send the message
        const result = await client.sendMessage(recipient, scheduled.content);

        // Create the actual message record
        const messageId = uuidv4();
        db.prepare(`
          INSERT INTO messages (
            id, conversation_id, direction, content_type, content, status, created_at
          ) VALUES (?, ?, 'outgoing', ?, ?, 'sent', datetime('now'))
        `).run(messageId, scheduled.conversation_id, scheduled.content_type, scheduled.content);

        // Update conversation
        db.prepare(`
          UPDATE conversations
          SET last_message_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(scheduled.conversation_id);

        // Mark scheduled message as sent
        db.prepare(`
          UPDATE scheduled_messages
          SET status = 'sent', sent_message_id = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(messageId, scheduled.id);

        logger.info(`✅ Sent scheduled message ${scheduled.id} to ${recipient}`);

        // Broadcast to WebSocket
        if (global.io) {
          global.io.to(`conversation:${scheduled.conversation_id}`).emit('message:new', {
            data: {
              message: {
                id: messageId,
                conversationId: scheduled.conversation_id,
                direction: 'outgoing',
                contentType: scheduled.content_type,
                content: scheduled.content,
                status: 'sent',
                createdAt: new Date().toISOString(),
              }
            }
          });
        }

      } catch (error) {
        logger.error(`Failed to send scheduled message ${scheduled.id}: ${error.message}`);

        // Mark as failed
        db.prepare(`
          UPDATE scheduled_messages
          SET status = 'failed', error_message = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(error.message, scheduled.id);
      }
    }
  } catch (error) {
    logger.error(`Scheduler error: ${error.message}`);
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the scheduler
 */
function startScheduler() {
  if (intervalId) {
    logger.warn('Scheduler already running');
    return;
  }

  logger.info('Starting message scheduler...');
  intervalId = setInterval(processDueMessages, CHECK_INTERVAL_MS);

  // Also run immediately on start
  processDueMessages();
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Message scheduler stopped');
  }
}

/**
 * Check if scheduler is running
 */
function isSchedulerRunning() {
  return intervalId !== null;
}

module.exports = {
  startScheduler,
  stopScheduler,
  isSchedulerRunning,
  processDueMessages,
};
