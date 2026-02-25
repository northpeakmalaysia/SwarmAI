/**
 * Delivery Queue Service (Dead Letter Queue + Send Retry)
 * =======================================================
 * Persists outbound messages to SQLite before attempting send.
 * On failure, retries with exponential backoff. After max retries → dead letter.
 *
 * Backoff schedule: 3s → 15s → 60s → 300s (5min) — max 5 retries.
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

// Backoff delays in milliseconds
const BACKOFF_SCHEDULE = [3000, 15000, 60000, 300000, 300000];
const DEFAULT_MAX_RETRIES = 5;
const RETRY_SWEEP_INTERVAL = 30000; // 30s
const PURGE_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const PURGE_SENT_OLDER_THAN_DAYS = 7;

let _instance = null;

class DeliveryQueueService {
  constructor() {
    this.agentManager = null;
    this.retryTimer = null;
    this.purgeTimer = null;
    this.initialized = false;
  }

  /**
   * Initialize with agentManager reference and start retry sweep + crash recovery.
   */
  initialize(agentManager) {
    if (this.initialized) return;
    this.agentManager = agentManager;
    this.initialized = true;

    // Recover messages stuck from a previous crash
    this.recoverPending();

    // Start periodic retry sweep
    this.retryTimer = setInterval(() => this.processRetries(), RETRY_SWEEP_INTERVAL);

    // Start periodic purge of old sent entries
    this.purgeTimer = setInterval(() => this.purgeOld(), PURGE_INTERVAL);
    // Run initial purge after 60s to not slow startup
    setTimeout(() => this.purgeOld(), 60000);

    logger.info('[DeliveryQueue] initialized');
  }

  /**
   * Enqueue a message: persist to DB first, then attempt immediate send.
   * Returns { queued, deliveryId, sent }
   */
  async enqueue({ accountId, recipient, platform, content, contentType, options, source, sourceContext, conversationId, messageId, agentId, userId }) {
    const db = getDatabase();
    const deliveryId = uuidv4();

    db.prepare(`
      INSERT INTO delivery_queue (id, account_id, recipient, platform, content, content_type, options, status, source, source_context, conversation_id, message_id, agent_id, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
    `).run(
      deliveryId,
      accountId,
      recipient,
      platform || 'whatsapp',
      content,
      contentType || 'text',
      JSON.stringify(options || {}),
      source || 'unknown',
      sourceContext || null,
      conversationId || null,
      messageId || null,
      agentId || null,
      userId || null
    );

    logger.info(`[DeliveryQueue] enqueued ${deliveryId} → ${recipient} (source=${source})`);

    // Attempt immediate delivery
    const sent = await this.attemptDelivery(deliveryId);
    return { queued: true, deliveryId, sent };
  }

  /**
   * Attempt to deliver a single message by id.
   * On success → status='sent'. On failure → increment retry + schedule next.
   */
  async attemptDelivery(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM delivery_queue WHERE id = ?').get(id);
    if (!row) {
      logger.warn(`[DeliveryQueue] attemptDelivery: id ${id} not found`);
      return false;
    }

    if (row.status === 'sent' || row.status === 'dead') return false;

    // Mark as sending
    db.prepare(`UPDATE delivery_queue SET status = 'sending', updated_at = datetime('now') WHERE id = ?`).run(id);

    try {
      if (!this.agentManager) {
        throw new Error('agentManager not available');
      }

      const options = JSON.parse(row.options || '{}');
      await this.agentManager.sendMessage(row.account_id, row.recipient, row.content, options);

      // Success
      db.prepare(`
        UPDATE delivery_queue SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
      `).run(id);

      // Also update the linked message status in messages table (if any)
      if (row.message_id) {
        db.prepare(`UPDATE messages SET status = 'sent' WHERE id = ? AND status = 'pending'`).run(row.message_id);
      }

      // Audit: log outgoing message
      try {
        const { getAuditLogService } = require('./agentic/AuditLogService.cjs');
        if (row.agent_id) {
          getAuditLogService().log(row.agent_id, row.user_id, 'outgoing', 'OUTBOUND', {
            platform: row.platform || 'unknown',
            recipient: row.recipient,
            preview: (row.content || '').substring(0, 200),
            deliveryId: id,
            contentType: row.content_type,
          });
        }
      } catch (_) {}

      logger.info(`[DeliveryQueue] delivered ${id}`);
      return true;
    } catch (err) {
      const newRetryCount = row.retry_count + 1;
      const maxRetries = row.max_retries || DEFAULT_MAX_RETRIES;

      if (newRetryCount >= maxRetries) {
        // Exhausted — move to dead letter
        db.prepare(`
          UPDATE delivery_queue SET status = 'dead', last_error = ?, retry_count = ?, dead_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
        `).run(err.message, newRetryCount, id);
        logger.error(`[DeliveryQueue] DEAD LETTER ${id} after ${newRetryCount} retries: ${err.message}`);
        return false;
      }

      // Schedule retry with backoff
      const delayMs = BACKOFF_SCHEDULE[Math.min(newRetryCount - 1, BACKOFF_SCHEDULE.length - 1)];
      const nextRetryAt = new Date(Date.now() + delayMs).toISOString().replace('T', ' ').substring(0, 19);

      db.prepare(`
        UPDATE delivery_queue SET status = 'retrying', last_error = ?, retry_count = ?, next_retry_at = ?, updated_at = datetime('now') WHERE id = ?
      `).run(err.message, newRetryCount, nextRetryAt, id);
      logger.warn(`[DeliveryQueue] retry scheduled for ${id} (attempt ${newRetryCount}/${maxRetries}, next at ${nextRetryAt}): ${err.message}`);
      return false;
    }
  }

  /**
   * Sweep for retryable messages whose next_retry_at has passed.
   */
  processRetries() {
    const db = getDatabase();
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const rows = db.prepare(`
      SELECT id FROM delivery_queue WHERE status = 'retrying' AND next_retry_at <= ? ORDER BY next_retry_at ASC LIMIT 20
    `).all(now);

    if (rows.length === 0) return;

    logger.info(`[DeliveryQueue] retry sweep: ${rows.length} message(s) due`);

    for (const row of rows) {
      this.attemptDelivery(row.id).catch(err => {
        logger.error(`[DeliveryQueue] retry sweep error for ${row.id}: ${err.message}`);
      });
    }
  }

  /**
   * On startup, recover messages stuck in 'pending' or 'sending' from a previous crash.
   */
  recoverPending() {
    const db = getDatabase();
    const stuck = db.prepare(`
      SELECT id FROM delivery_queue WHERE status IN ('pending', 'sending')
    `).all();

    if (stuck.length === 0) return;

    logger.info(`[DeliveryQueue] recovering ${stuck.length} stuck message(s)`);

    // Reset to 'retrying' with immediate retry
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    db.prepare(`
      UPDATE delivery_queue SET status = 'retrying', next_retry_at = ?, updated_at = datetime('now') WHERE status IN ('pending', 'sending')
    `).run(now);
  }

  /**
   * Get queue stats grouped by status.
   */
  getStats(userId) {
    const db = getDatabase();
    if (userId) {
      const rows = db.prepare('SELECT status, COUNT(*) as count FROM delivery_queue WHERE user_id = ? GROUP BY status').all(userId);
      const stats = {};
      for (const r of rows) stats[r.status] = r.count;
      return stats;
    }
    const rows = db.prepare('SELECT status, COUNT(*) as count FROM delivery_queue GROUP BY status').all();
    const stats = {};
    for (const r of rows) stats[r.status] = r.count;
    return stats;
  }

  /**
   * Get dead letter entries for dashboard inspection.
   */
  getDeadLetters(limit = 50, userId) {
    const db = getDatabase();
    if (userId) {
      return db.prepare('SELECT * FROM delivery_queue WHERE status = ? AND user_id = ? ORDER BY dead_at DESC LIMIT ?').all('dead', userId, limit);
    }
    return db.prepare('SELECT * FROM delivery_queue WHERE status = ? ORDER BY dead_at DESC LIMIT ?').all('dead', limit);
  }

  /**
   * Manual replay of a dead letter.
   */
  async retryDeadLetter(id, userId) {
    const db = getDatabase();
    const row = userId
      ? db.prepare('SELECT * FROM delivery_queue WHERE id = ? AND status = ? AND user_id = ?').get(id, 'dead', userId)
      : db.prepare('SELECT * FROM delivery_queue WHERE id = ? AND status = ?').get(id, 'dead');
    if (!row) throw new Error(`Dead letter ${id} not found`);

    // Reset for retry
    db.prepare(`
      UPDATE delivery_queue SET status = 'retrying', retry_count = 0, max_retries = ?, next_retry_at = datetime('now'), dead_at = NULL, updated_at = datetime('now') WHERE id = ?
    `).run(DEFAULT_MAX_RETRIES, id);

    logger.info(`[DeliveryQueue] replaying dead letter ${id}`);
    return this.attemptDelivery(id);
  }

  /**
   * Purge old sent entries to prevent table bloat.
   */
  purgeOld() {
    const db = getDatabase();
    const result = db.prepare(`
      DELETE FROM delivery_queue WHERE status = 'sent' AND sent_at <= datetime('now', '-${PURGE_SENT_OLDER_THAN_DAYS} days')
    `).run();
    if (result.changes > 0) {
      logger.info(`[DeliveryQueue] purged ${result.changes} old sent entries (>${PURGE_SENT_OLDER_THAN_DAYS} days)`);
    }
  }

  shutdown() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
    this.initialized = false;
    logger.info('[DeliveryQueue] shut down');
  }
}

function getDeliveryQueueService() {
  if (!_instance) {
    _instance = new DeliveryQueueService();
  }
  return _instance;
}

module.exports = { getDeliveryQueueService, DeliveryQueueService };
