/**
 * CLI Session Service
 * Manages CLI session lifecycle for agentic AI
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

// Valid CLI types
const CLI_TYPES = ['claude', 'gemini', 'opencode', 'bash'];

// Valid session statuses
const SESSION_STATUSES = ['active', 'completed', 'failed', 'expired'];

/**
 * Create a new CLI session
 * @param {string} userId - User ID
 * @param {string} workspaceId - Workspace ID
 * @param {string} cliType - CLI type (claude, gemini, opencode, bash)
 * @param {Object} options - Additional options
 * @returns {Object} Created session
 */
function createSession(userId, workspaceId, cliType, options = {}) {
  if (!CLI_TYPES.includes(cliType)) {
    throw new Error(`Invalid CLI type: ${cliType}. Must be one of: ${CLI_TYPES.join(', ')}`);
  }

  const db = getDatabase();
  const id = uuidv4();

  // Calculate expiry (default 24 hours, max 168 hours / 7 days)
  const expiresInHours = Math.min(options.expiresInHours || 24, 168);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO cli_sessions (
      id, user_id, workspace_id, agent_id, cli_type, status, metadata, expires_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    id,
    userId,
    workspaceId,
    options.agentId || null,
    cliType,
    options.metadata ? JSON.stringify(options.metadata) : null,
    expiresAt
  );

  const session = db.prepare('SELECT * FROM cli_sessions WHERE id = ?').get(id);

  logger.info(`CLI session created: ${id} (${cliType})`);

  return formatSession(session);
}

/**
 * Get a session by ID
 * @param {string} sessionId - Session ID
 * @returns {Object|null} Session or null
 */
function getSession(sessionId) {
  const db = getDatabase();
  const session = db.prepare('SELECT * FROM cli_sessions WHERE id = ?').get(sessionId);

  if (!session) return null;

  return formatSession(session);
}

/**
 * Get user's active sessions
 * @param {string} userId - User ID
 * @returns {Array} Sessions
 */
function getUserActiveSessions(userId) {
  const db = getDatabase();
  const sessions = db.prepare(`
    SELECT * FROM cli_sessions
    WHERE user_id = ? AND status = 'active'
    ORDER BY created_at DESC
  `).all(userId);

  return sessions.map(formatSession);
}

/**
 * Get all sessions for a workspace
 * @param {string} workspaceId - Workspace ID
 * @returns {Array} Sessions
 */
function getWorkspaceSessions(workspaceId) {
  const db = getDatabase();
  const sessions = db.prepare(`
    SELECT * FROM cli_sessions
    WHERE workspace_id = ?
    ORDER BY created_at DESC
  `).all(workspaceId);

  return sessions.map(formatSession);
}

/**
 * Update a session
 * @param {string} sessionId - Session ID
 * @param {Object} data - Update data
 */
function updateSession(sessionId, data) {
  const db = getDatabase();

  const updates = [];
  const params = [];

  if (data.lastPrompt !== undefined) {
    updates.push('last_prompt = ?');
    params.push(data.lastPrompt);
  }

  if (data.lastOutput !== undefined) {
    updates.push('last_output = ?');
    params.push(data.lastOutput);
  }

  if (data.contextSummary !== undefined) {
    updates.push('context_summary = ?');
    params.push(data.contextSummary);
  }

  if (data.status !== undefined) {
    if (!SESSION_STATUSES.includes(data.status)) {
      throw new Error(`Invalid status: ${data.status}`);
    }
    updates.push('status = ?');
    params.push(data.status);
  }

  if (data.metadata !== undefined) {
    updates.push('metadata = ?');
    params.push(JSON.stringify(data.metadata));
  }

  if (updates.length === 0) {
    return;
  }

  updates.push("updated_at = datetime('now')");
  params.push(sessionId);

  db.prepare(`UPDATE cli_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  logger.debug(`CLI session updated: ${sessionId}`);
}

/**
 * Delete a session
 * @param {string} sessionId - Session ID
 * @returns {boolean} Success
 */
function deleteSession(sessionId) {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM cli_sessions WHERE id = ?').run(sessionId);

  if (result.changes > 0) {
    logger.info(`CLI session deleted: ${sessionId}`);
    return true;
  }

  return false;
}

/**
 * Cleanup expired sessions
 * @returns {number} Number of deleted sessions
 */
function cleanupExpiredSessions() {
  const db = getDatabase();

  // Mark expired sessions
  db.prepare(`
    UPDATE cli_sessions
    SET status = 'expired', updated_at = datetime('now')
    WHERE status = 'active' AND expires_at < datetime('now')
  `).run();

  // Delete expired sessions older than 7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare(`
    DELETE FROM cli_sessions
    WHERE status = 'expired' AND updated_at < ?
  `).run(cutoff);

  if (result.changes > 0) {
    logger.info(`Cleaned up ${result.changes} expired CLI sessions`);
  }

  return result.changes;
}

/**
 * Delete old sessions
 * @param {number} olderThanDays - Delete sessions older than this many days
 * @returns {number} Number of deleted sessions
 */
function deleteOldSessions(olderThanDays = 30) {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

  const result = db.prepare(`
    DELETE FROM cli_sessions WHERE created_at < ?
  `).run(cutoff);

  if (result.changes > 0) {
    logger.info(`Deleted ${result.changes} old CLI sessions (older than ${olderThanDays} days)`);
  }

  return result.changes;
}

/**
 * Format session for API response
 * @param {Object} session - Raw session from database
 * @returns {Object} Formatted session
 */
function formatSession(session) {
  return {
    id: session.id,
    userId: session.user_id,
    workspaceId: session.workspace_id,
    agentId: session.agent_id,
    cliType: session.cli_type,
    status: session.status,
    lastPrompt: session.last_prompt,
    lastOutput: session.last_output,
    contextSummary: session.context_summary,
    metadata: session.metadata ? JSON.parse(session.metadata) : null,
    expiresAt: session.expires_at,
    createdAt: session.created_at,
    updatedAt: session.updated_at
  };
}

module.exports = {
  CLI_TYPES,
  SESSION_STATUSES,
  createSession,
  getSession,
  getUserActiveSessions,
  getWorkspaceSessions,
  updateSession,
  deleteSession,
  cleanupExpiredSessions,
  deleteOldSessions
};
