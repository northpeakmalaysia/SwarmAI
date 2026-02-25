/**
 * IdempotencyService — Phase 7: Duplicate Prevention
 * ====================================================
 * Prevents duplicate execution of side-effect tools (send messages,
 * create tasks, etc.) during retries or checkpoint resume.
 *
 * Generates a SHA256 idempotency key from (agentId + toolName + params).
 * Results are cached for 5 minutes — after that, the same call can execute again.
 *
 * Usage:
 *   const { getIdempotencyService } = require('./IdempotencyService.cjs');
 *   const svc = getIdempotencyService();
 *   const cached = svc.checkDuplicate(agentId, toolName, params);
 *   if (cached) return cached;
 *   // ... execute ...
 *   svc.recordComplete(agentId, toolName, params, result);
 */

const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const crypto = require('crypto');

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Tools with external side effects that must NOT be executed twice.
 */
const SIDE_EFFECT_TOOLS = new Set([
  'sendWhatsApp', 'sendEmail', 'sendTelegram',
  'createTask', 'delegateTask', 'notifyMaster',
  'createSchedule', 'triggerFlow',
  'sendAgentMessage', 'broadcastTeam', 'handoffToAgent',
  'requestApproval', 'requestHumanInput',
]);

class IdempotencyService {
  constructor() {
    this._ensuredTable = false;
  }

  _ensureTable() {
    if (this._ensuredTable) return;
    try {
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS agentic_idempotency (
          key TEXT PRIMARY KEY,
          tool_name TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          result TEXT,
          status TEXT DEFAULT 'pending',
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        )
      `);
      this._ensuredTable = true;
    } catch (err) {
      logger.warn(`[Idempotency] Table ensure failed: ${err.message}`);
    }
  }

  /**
   * Check if a tool is a side-effect tool that needs idempotency protection.
   */
  isSideEffectTool(toolName) {
    return SIDE_EFFECT_TOOLS.has(toolName);
  }

  /**
   * Generate a deterministic idempotency key.
   */
  generateKey(agentId, toolName, params) {
    const payload = `${agentId}:${toolName}:${JSON.stringify(params || {})}`;
    return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 32);
  }

  /**
   * Check if this exact call was already executed recently.
   * Returns the cached result if found, null otherwise.
   */
  checkDuplicate(agentId, toolName, params) {
    if (!this.isSideEffectTool(toolName)) return null;

    try {
      this._ensureTable();
      const db = getDatabase();
      const key = this.generateKey(agentId, toolName, params);
      const now = new Date().toISOString();

      const row = db.prepare(`
        SELECT result, status FROM agentic_idempotency
        WHERE key = ? AND expires_at > ?
      `).get(key, now);

      if (!row) return null;

      if (row.status === 'pending') {
        // Another execution is in-flight — return a "in progress" marker
        logger.info(`[Idempotency] Duplicate detected (pending) for ${toolName} agent=${agentId}`);
        return { success: true, cached: true, message: `${toolName} is already in progress` };
      }

      if (row.status === 'completed' && row.result) {
        logger.info(`[Idempotency] Duplicate detected (cached) for ${toolName} agent=${agentId}`);
        try {
          return { ...JSON.parse(row.result), cached: true };
        } catch {
          return { success: true, cached: true, message: 'Cached result (unparseable)' };
        }
      }

      return null;
    } catch (err) {
      logger.warn(`[Idempotency] Check failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Record that execution has started (pending state).
   */
  recordPending(agentId, toolName, params) {
    if (!this.isSideEffectTool(toolName)) return;

    try {
      this._ensureTable();
      const db = getDatabase();
      const key = this.generateKey(agentId, toolName, params);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString();

      db.prepare(`
        INSERT OR REPLACE INTO agentic_idempotency (key, tool_name, agent_id, status, created_at, expires_at)
        VALUES (?, ?, ?, 'pending', ?, ?)
      `).run(key, toolName, agentId, now, expiresAt);
    } catch (err) {
      logger.warn(`[Idempotency] Record pending failed: ${err.message}`);
    }
  }

  /**
   * Record that execution completed successfully.
   */
  recordComplete(agentId, toolName, params, result) {
    if (!this.isSideEffectTool(toolName)) return;

    try {
      this._ensureTable();
      const db = getDatabase();
      const key = this.generateKey(agentId, toolName, params);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString();

      db.prepare(`
        INSERT OR REPLACE INTO agentic_idempotency (key, tool_name, agent_id, result, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, 'completed', ?, ?)
      `).run(key, toolName, agentId, JSON.stringify(result), now, expiresAt);
    } catch (err) {
      logger.warn(`[Idempotency] Record complete failed: ${err.message}`);
    }
  }

  /**
   * Cleanup expired idempotency records.
   */
  cleanupExpired() {
    try {
      this._ensureTable();
      const db = getDatabase();
      const now = new Date().toISOString();
      const result = db.prepare(`DELETE FROM agentic_idempotency WHERE expires_at < ?`).run(now);
      if (result.changes > 0) {
        logger.debug(`[Idempotency] Cleaned up ${result.changes} expired records`);
      }
    } catch (err) {
      logger.warn(`[Idempotency] Cleanup failed: ${err.message}`);
    }
  }
}

// Singleton
let _instance = null;
function getIdempotencyService() {
  if (!_instance) _instance = new IdempotencyService();
  return _instance;
}

module.exports = { IdempotencyService, getIdempotencyService, SIDE_EFFECT_TOOLS };
