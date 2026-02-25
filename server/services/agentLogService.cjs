/**
 * Agent Log Service
 * Handles logging and querying of agent actions
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

// Valid action types
const ACTION_TYPES = [
  'message_received',
  'message_sent',
  'ai_completion',
  'tool_call',
  'handoff_initiated',
  'handoff_received',
  'rag_query',
  'flow_triggered',
  'consensus_vote',
  'broadcast_sent',
  'webhook_received',
  'error',
  'warning',
  'debug'
];

/**
 * Log an agent action
 * @param {Object} params - Log parameters
 * @returns {Object} Created log entry
 */
function logAction(params) {
  const {
    agentId,
    userId,
    conversationId,
    messageId,
    parentLogId,
    actionType,
    actionData,
    inputTokens = 0,
    outputTokens = 0,
    cost = 0,
    durationMs = 0,
    error
  } = params;

  if (!agentId || !userId || !actionType) {
    throw new Error('agentId, userId, and actionType are required');
  }

  if (!ACTION_TYPES.includes(actionType)) {
    throw new Error(`Invalid action type: ${actionType}`);
  }

  const db = getDatabase();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO agent_logs (
      id, agent_id, user_id, conversation_id, message_id, parent_log_id,
      action_type, action_data, input_tokens, output_tokens, cost, duration_ms, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    agentId,
    userId,
    conversationId || null,
    messageId || null,
    parentLogId || null,
    actionType,
    actionData ? JSON.stringify(actionData) : null,
    inputTokens,
    outputTokens,
    cost,
    durationMs,
    error || null
  );

  return {
    id,
    agentId,
    userId,
    conversationId,
    messageId,
    parentLogId,
    actionType,
    actionData,
    inputTokens,
    outputTokens,
    cost,
    durationMs,
    error,
    createdAt: new Date().toISOString()
  };
}

/**
 * Query logs with filters
 * @param {Object} options - Query options
 * @returns {Array} Log entries
 */
function query(options = {}) {
  const {
    agentId,
    conversationId,
    messageId,
    actionTypes,
    startDate,
    endDate,
    hasError,
    limit = 100,
    offset = 0
  } = options;

  const db = getDatabase();
  let sql = 'SELECT * FROM agent_logs WHERE 1=1';
  const params = [];

  if (agentId) {
    sql += ' AND agent_id = ?';
    params.push(agentId);
  }

  if (conversationId) {
    sql += ' AND conversation_id = ?';
    params.push(conversationId);
  }

  if (messageId) {
    sql += ' AND message_id = ?';
    params.push(messageId);
  }

  if (actionTypes && actionTypes.length > 0) {
    sql += ` AND action_type IN (${actionTypes.map(() => '?').join(',')})`;
    params.push(...actionTypes);
  }

  if (startDate) {
    sql += ' AND created_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    sql += ' AND created_at <= ?';
    params.push(endDate);
  }

  if (hasError === true) {
    sql += ' AND error IS NOT NULL';
  } else if (hasError === false) {
    sql += ' AND error IS NULL';
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const logs = db.prepare(sql).all(...params);

  return logs.map(log => ({
    ...log,
    actionData: log.action_data ? JSON.parse(log.action_data) : null,
    inputTokens: log.input_tokens,
    outputTokens: log.output_tokens,
    durationMs: log.duration_ms,
    createdAt: log.created_at,
    agentId: log.agent_id,
    userId: log.user_id,
    conversationId: log.conversation_id,
    messageId: log.message_id,
    parentLogId: log.parent_log_id,
    actionType: log.action_type
  }));
}

/**
 * Get a single log by ID
 * @param {string} id - Log ID
 * @returns {Object|null} Log entry
 */
function getById(id) {
  const db = getDatabase();
  const log = db.prepare('SELECT * FROM agent_logs WHERE id = ?').get(id);

  if (!log) return null;

  return {
    ...log,
    actionData: log.action_data ? JSON.parse(log.action_data) : null,
    inputTokens: log.input_tokens,
    outputTokens: log.output_tokens,
    durationMs: log.duration_ms,
    createdAt: log.created_at,
    agentId: log.agent_id,
    userId: log.user_id,
    conversationId: log.conversation_id,
    messageId: log.message_id,
    parentLogId: log.parent_log_id,
    actionType: log.action_type
  };
}

/**
 * Get child logs for a parent log
 * @param {string} parentId - Parent log ID
 * @returns {Array} Child log entries
 */
function getChildLogs(parentId) {
  const db = getDatabase();
  const logs = db.prepare(`
    SELECT * FROM agent_logs
    WHERE parent_log_id = ?
    ORDER BY created_at ASC
  `).all(parentId);

  return logs.map(log => ({
    ...log,
    actionData: log.action_data ? JSON.parse(log.action_data) : null,
    inputTokens: log.input_tokens,
    outputTokens: log.output_tokens,
    durationMs: log.duration_ms,
    createdAt: log.created_at,
    agentId: log.agent_id,
    userId: log.user_id,
    conversationId: log.conversation_id,
    messageId: log.message_id,
    parentLogId: log.parent_log_id,
    actionType: log.action_type
  }));
}

/**
 * Get logs by conversation
 * @param {string} conversationId - Conversation ID
 * @param {number} limit - Max results
 * @returns {Array} Log entries
 */
function getByConversation(conversationId, limit = 100) {
  return query({ conversationId, limit });
}

/**
 * Get agent statistics
 * @param {string} agentId - Agent ID
 * @param {string} period - 'day', 'week', or 'month'
 * @returns {Object} Stats object
 */
function getAgentStats(agentId, period = 'day') {
  const db = getDatabase();

  // Calculate date range
  let startDate;
  const now = new Date();
  switch (period) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default: // day
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const startDateStr = startDate.toISOString();

  // Get totals
  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_actions,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(cost), 0) as total_cost,
      COALESCE(AVG(duration_ms), 0) as avg_duration_ms
    FROM agent_logs
    WHERE agent_id = ? AND created_at >= ?
  `).get(agentId, startDateStr);

  // Get breakdown by action type
  const breakdown = db.prepare(`
    SELECT action_type, COUNT(*) as count
    FROM agent_logs
    WHERE agent_id = ? AND created_at >= ?
    GROUP BY action_type
  `).all(agentId, startDateStr);

  const byActionType = {};
  breakdown.forEach(row => {
    byActionType[row.action_type] = row.count;
  });

  return {
    agentId,
    period,
    startDate: startDateStr,
    endDate: now.toISOString(),
    totalActions: totals.total_actions,
    totalTokens: totals.total_input_tokens + totals.total_output_tokens,
    totalInputTokens: totals.total_input_tokens,
    totalOutputTokens: totals.total_output_tokens,
    totalCost: totals.total_cost,
    avgDurationMs: totals.avg_duration_ms,
    byActionType
  };
}

/**
 * Delete old logs
 * @param {number} olderThanDays - Delete logs older than this many days
 * @returns {number} Number of deleted logs
 */
function deleteOldLogs(olderThanDays = 30) {
  const db = getDatabase();
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

  const result = db.prepare('DELETE FROM agent_logs WHERE created_at < ?').run(cutoffDate);
  logger.info(`Deleted ${result.changes} old agent logs`);

  return result.changes;
}

module.exports = {
  ACTION_TYPES,
  logAction,
  query,
  getById,
  getChildLogs,
  getByConversation,
  getAgentStats,
  deleteOldLogs
};
