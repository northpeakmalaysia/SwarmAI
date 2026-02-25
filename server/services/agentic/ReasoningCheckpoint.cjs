/**
 * ReasoningCheckpoint — Phase 7: Checkpoint/Resume
 * ==================================================
 * Saves reasoning loop state after each iteration so crashed or
 * interrupted executions can be resumed from the last checkpoint.
 *
 * Each agent has at most ONE active checkpoint. Checkpoints auto-expire
 * after 1 hour (stale crash recovery data is useless).
 *
 * Usage:
 *   const { getReasoningCheckpoint } = require('./ReasoningCheckpoint.cjs');
 *   const cp = getReasoningCheckpoint();
 *   await cp.saveCheckpoint(agentId, userId, { ... });
 *   const state = cp.loadCheckpoint(agentId);
 */

const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const crypto = require('crypto');

const CHECKPOINT_TTL_MS = 60 * 60 * 1000; // 1 hour

class ReasoningCheckpoint {
  constructor() {
    this._ensuredTable = false;
  }

  /**
   * Ensure the table exists (safe to call repeatedly).
   */
  _ensureTable() {
    if (this._ensuredTable) return;
    try {
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS agentic_checkpoints (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          trigger TEXT,
          trigger_context TEXT,
          iteration INTEGER DEFAULT 0,
          messages TEXT,
          action_records TEXT,
          tokens_used INTEGER DEFAULT 0,
          tier TEXT,
          plan_id TEXT,
          status TEXT DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        )
      `);
      this._ensuredTable = true;
    } catch (err) {
      logger.warn(`[Checkpoint] Table ensure failed: ${err.message}`);
    }
  }

  /**
   * Save or update a checkpoint for the given agent.
   * Upserts: one active checkpoint per agent.
   */
  saveCheckpoint(agentId, userId, data) {
    try {
      this._ensureTable();
      const db = getDatabase();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + CHECKPOINT_TTL_MS).toISOString();

      // Delete any existing active checkpoint for this agent
      db.prepare(`DELETE FROM agentic_checkpoints WHERE agent_id = ? AND status = 'active'`).run(agentId);

      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO agentic_checkpoints
          (id, agent_id, user_id, trigger, trigger_context, iteration, messages,
           action_records, tokens_used, tier, plan_id, status, created_at, updated_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `).run(
        id,
        agentId,
        userId,
        data.trigger || null,
        data.triggerContext ? JSON.stringify(data.triggerContext) : null,
        data.iteration || 0,
        data.messages ? JSON.stringify(data.messages) : null,
        data.actionRecords ? JSON.stringify(data.actionRecords) : null,
        data.tokensUsed || 0,
        data.tier || null,
        data.planId || null,
        now,
        now,
        expiresAt
      );

      logger.debug(`[Checkpoint] Saved checkpoint for agent ${agentId} at iteration ${data.iteration}`);
      return id;
    } catch (err) {
      logger.warn(`[Checkpoint] Save failed for ${agentId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Load the active checkpoint for an agent.
   * Returns null if no valid (non-expired) checkpoint exists.
   */
  loadCheckpoint(agentId) {
    try {
      this._ensureTable();
      const db = getDatabase();
      const now = new Date().toISOString();

      const row = db.prepare(`
        SELECT * FROM agentic_checkpoints
        WHERE agent_id = ? AND status = 'active' AND expires_at > ?
        ORDER BY updated_at DESC LIMIT 1
      `).get(agentId, now);

      if (!row) return null;

      return {
        id: row.id,
        agentId: row.agent_id,
        userId: row.user_id,
        trigger: row.trigger,
        triggerContext: row.trigger_context ? JSON.parse(row.trigger_context) : {},
        iteration: row.iteration,
        messages: row.messages ? JSON.parse(row.messages) : [],
        actionRecords: row.action_records ? JSON.parse(row.action_records) : [],
        tokensUsed: row.tokens_used,
        tier: row.tier,
        planId: row.plan_id,
        createdAt: row.created_at,
      };
    } catch (err) {
      logger.warn(`[Checkpoint] Load failed for ${agentId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Mark the checkpoint as completed (execution finished normally).
   */
  completeCheckpoint(agentId) {
    try {
      this._ensureTable();
      const db = getDatabase();
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE agentic_checkpoints SET status = 'completed', updated_at = ?
        WHERE agent_id = ? AND status = 'active'
      `).run(now, agentId);
      logger.debug(`[Checkpoint] Completed checkpoint for agent ${agentId}`);
    } catch (err) {
      logger.warn(`[Checkpoint] Complete failed for ${agentId}: ${err.message}`);
    }
  }

  /**
   * Mark the checkpoint as failed.
   */
  failCheckpoint(agentId) {
    try {
      this._ensureTable();
      const db = getDatabase();
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE agentic_checkpoints SET status = 'failed', updated_at = ?
        WHERE agent_id = ? AND status = 'active'
      `).run(now, agentId);
    } catch (err) {
      logger.warn(`[Checkpoint] Fail-mark failed for ${agentId}: ${err.message}`);
    }
  }

  /**
   * Cleanup expired checkpoints.
   */
  cleanupExpired() {
    try {
      this._ensureTable();
      const db = getDatabase();
      const now = new Date().toISOString();
      const result = db.prepare(`DELETE FROM agentic_checkpoints WHERE expires_at < ?`).run(now);
      if (result.changes > 0) {
        logger.info(`[Checkpoint] Cleaned up ${result.changes} expired checkpoints`);
      }
    } catch (err) {
      logger.warn(`[Checkpoint] Cleanup failed: ${err.message}`);
    }
  }
}

// Singleton
let _instance = null;
function getReasoningCheckpoint() {
  if (!_instance) _instance = new ReasoningCheckpoint();
  return _instance;
}

module.exports = { ReasoningCheckpoint, getReasoningCheckpoint };
