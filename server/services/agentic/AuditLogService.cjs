/**
 * AuditLogService
 * ================
 * Transparent audit log for Agentic AI — captures everything the agent
 * receives, thinks, processes, and outputs.
 *
 * Stores entries in the existing `agentic_activity_log` table with
 * activity_type prefixed as `audit:{category}`.
 *
 * Includes a 48-hour TTL auto-cleanup (hourly sweep).
 */

const crypto = require('crypto');
const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');

const TTL_HOURS = 48;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Human-readable descriptions per category */
const CATEGORY_DESCRIPTIONS = {
  incoming:         (d) => `Received ${d.platform || 'message'} from ${d.sender || 'unknown'}${d.preview ? ': ' + d.preview.substring(0, 80) : ''}`,
  classification:   (d) => `Classified as "${d.tier || 'unknown'}" (${d.source || 'local'}, confidence: ${d.confidence || '?'}${d.classifierProvider ? ', via ' + d.classifierProvider : ''})`,
  reasoning_start:  (d) => `Started reasoning (trigger: ${d.trigger || 'unknown'}, tier: ${d.tier || 'unknown'})`,
  reasoning_think:  (d) => `Reasoning completed: ${d.iterations || '?'} iterations, ${d.tokensUsed || 0} tokens`,
  tool_call:        (d) => `Tool call: ${d.toolName || 'unknown'}(${d.paramsPreview || ''})`,
  tool_result:      (d) => `Tool ${d.toolName || 'unknown'}: ${d.success ? 'success' : 'failed'}${d.error ? ' — ' + d.error : ''}`,
  ai_request:       (d) => `AI request → ${d.provider || 'unknown'}/${d.model || 'unknown'} (${d.messageCount || '?'} messages)`,
  ai_response:      (d) => `AI response ← ${d.provider || 'unknown'}/${d.model || 'unknown'} (${d.tokens || '?'} tokens)`,
  local_agent_in:   (d) => `Local agent data from ${d.agentName || d.agentId || 'unknown'}: ${d.preview || ''}`,
  local_agent_out:  (d) => `Command → local agent ${d.agentName || d.agentId || 'unknown'}: ${d.command || 'unknown'}`,
  outgoing:         (d) => `Sent ${d.platform || 'message'} to ${d.recipient || 'unknown'}${d.preview ? ': ' + d.preview.substring(0, 80) : ''}`,
  error:            (d) => `Error: ${d.message || d.error || 'unknown error'}`,
};

class AuditLogService {
  constructor() {
    this._cleanupTimer = null;
  }

  /**
   * Write one audit entry.
   * @param {string} agenticId - Agent profile ID
   * @param {string} userId - User ID
   * @param {string} category - e.g. 'incoming', 'reasoning_start', 'tool_call'
   * @param {'INBOUND'|'INTERNAL'|'OUTBOUND'} direction
   * @param {object} data - Arbitrary data (stored as metadata JSON)
   */
  log(agenticId, userId, category, direction, data = {}) {
    try {
      const db = getDatabase();
      const id = crypto.randomUUID();
      const activityType = `audit:${category}`;
      const descFn = CATEGORY_DESCRIPTIONS[category];
      const description = descFn ? descFn(data) : `Audit: ${category}`;

      db.prepare(`
        INSERT INTO agentic_activity_log (
          id, agentic_id, user_id, activity_type, activity_description,
          trigger_type, status, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, datetime('now'))
      `).run(
        id,
        agenticId,
        userId,
        activityType,
        description.substring(0, 500),
        direction,
        JSON.stringify(data),
      );

      // Emit WebSocket event for real-time updates
      try {
        const io = require('../../index.cjs').io;
        if (io) {
          io.to(`user:${userId}`).emit('audit:new', {
            id,
            agenticId,
            category,
            direction,
            description: description.substring(0, 500),
            data,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (_) {
        // WebSocket emit is best-effort
      }
    } catch (e) {
      // Never fail — audit logging must be non-blocking
      logger.debug(`[AuditLog] Failed to log ${category}: ${e.message}`);
    }
  }

  /**
   * Single cleanup pass — deletes audit entries older than TTL_HOURS.
   * Only touches `audit:*` entries, never existing activity logs.
   */
  purgeExpired() {
    try {
      const db = getDatabase();
      const result = db.prepare(`
        DELETE FROM agentic_activity_log
        WHERE activity_type LIKE 'audit:%'
          AND created_at < datetime('now', '-${TTL_HOURS} hours')
      `).run();

      if (result.changes > 0) {
        logger.info(`[AuditLog] Purged ${result.changes} expired audit entries`);
      }
    } catch (e) {
      logger.debug(`[AuditLog] Purge failed: ${e.message}`);
    }
  }

  /**
   * Start hourly TTL cleanup timer.
   */
  startTTLCleanup() {
    if (this._cleanupTimer) return;

    // Initial purge on startup
    this.purgeExpired();

    this._cleanupTimer = setInterval(() => {
      this.purgeExpired();
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent process exit
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }

    logger.info(`[AuditLog] TTL cleanup started (every ${CLEANUP_INTERVAL_MS / 60000}min, TTL=${TTL_HOURS}h)`);
  }

  /**
   * Stop the cleanup timer.
   */
  stopTTLCleanup() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }
}

// Singleton
let _instance = null;

function getAuditLogService() {
  if (!_instance) {
    _instance = new AuditLogService();
  }
  return _instance;
}

module.exports = { AuditLogService, getAuditLogService };
