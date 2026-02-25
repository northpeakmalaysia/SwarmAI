/**
 * System Log Service
 *
 * Unified log aggregation service for the System Logs Administration feature.
 * Aggregates logs from multiple sources:
 * - Winston log files (combined.log, error.log)
 * - SQLite tables (agent_logs, ai_usage, webhook_logs)
 * - Redis SuperBrain logs
 *
 * Features:
 * - Unified query interface with filtering and pagination
 * - Real-time log streaming via WebSocket
 * - Log statistics and analytics
 * - Export functionality (JSON/CSV)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');
const { getSuperBrainLogService } = require('./ai/SuperBrainLogService.cjs');

// Log types
const LOG_TYPES = {
  ALL: 'all',
  SYSTEM: 'system',     // Winston file logs
  API: 'api',           // AI usage logs
  AGENT: 'agent',       // Agent activity logs
  SUPERBRAIN: 'superbrain', // SuperBrain Redis logs
  WEBHOOK: 'webhook',   // Webhook logs
  ERROR: 'error',       // Error-only filter
};

// Log levels
const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

// Log file paths
const LOGS_DIR = path.join(__dirname, '..', 'data', 'logs');
const COMBINED_LOG = path.join(LOGS_DIR, 'combined.log');
const ERROR_LOG = path.join(LOGS_DIR, 'error.log');

// Default retention period (7 days)
const DEFAULT_RETENTION_DAYS = 7;

/**
 * Check if a table exists in the database
 * @param {Object} db - Database connection
 * @param {string} tableName - Table name to check
 * @returns {boolean} True if table exists
 */
function tableExists(db, tableName) {
  try {
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);
    return !!result;
  } catch {
    return false;
  }
}

class SystemLogService {
  constructor() {
    this.broadcast = null;
    this.superBrainLogService = getSuperBrainLogService();
  }

  /**
   * Set broadcast function for WebSocket notifications
   * @param {Function} broadcastFn - WebSocket broadcast function
   */
  setBroadcast(broadcastFn) {
    this.broadcast = broadcastFn;
  }

  /**
   * Query Winston log files
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Log entries
   */
  async queryFileLogs(options = {}) {
    const {
      level = null,
      search = null,
      startDate = null,
      endDate = null,
      limit = 100,
      errorOnly = false,
    } = options;

    const logs = [];
    const logFile = errorOnly ? ERROR_LOG : COMBINED_LOG;

    if (!fs.existsSync(logFile)) {
      return logs;
    }

    try {
      const fileContent = fs.readFileSync(logFile, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim());

      // Parse lines in reverse (newest first)
      for (let i = lines.length - 1; i >= 0 && logs.length < limit * 2; i--) {
        try {
          const entry = JSON.parse(lines[i]);

          // Build source string with file and function
          let source = entry.file || 'system';
          if (entry.function) {
            // Extract just filename from path for cleaner display
            const fileName = source.includes('/') ? source.split('/').pop() : source;
            source = `${fileName}:${entry.line || '?'}`;
          }

          // Normalize to unified format
          const log = {
            id: `file-${i}-${Date.now()}`,
            timestamp: entry.timestamp || new Date().toISOString(),
            type: 'system',
            level: entry.level || 'info',
            source: source,
            message: entry.message || '',
            metadata: {
              file: entry.file,
              function: entry.function,
              line: entry.line,
              location: entry.location,
              service: entry.service,
              platform: entry.platform,
              accountId: entry.accountId,
              errorMessage: entry.errorMessage,
              errorStack: entry.errorStack,
              errorName: entry.errorName,
              severity: entry.severity,
            },
          };

          // Apply filters
          if (level && log.level !== level) continue;
          if (search && !log.message.toLowerCase().includes(search.toLowerCase())) continue;

          if (startDate) {
            const logDate = new Date(log.timestamp);
            if (logDate < new Date(startDate)) continue;
          }

          if (endDate) {
            const logDate = new Date(log.timestamp);
            if (logDate > new Date(endDate)) continue;
          }

          logs.push(log);
        } catch {
          // Skip invalid JSON lines
        }
      }
    } catch (error) {
      logger.error(`Failed to read log file: ${error.message}`);
    }

    return logs;
  }

  /**
   * Query agent_logs table
   * @param {Object} options - Query options
   * @returns {Array} Log entries
   */
  queryAgentLogs(options = {}) {
    const {
      userId = null,
      agentId = null,
      startDate = null,
      endDate = null,
      hasError = null,
      limit = 100,
      offset = 0,
    } = options;

    try {
      const db = getDatabase();

      // Check if table exists first
      if (!tableExists(db, 'agent_logs')) {
        return [];
      }
      let sql = `
        SELECT
          al.id,
          al.created_at as timestamp,
          al.action_type as actionType,
          al.action_data as actionData,
          al.error,
          al.input_tokens as inputTokens,
          al.output_tokens as outputTokens,
          al.cost,
          al.duration_ms as durationMs,
          al.agent_id as agentId,
          al.user_id as userId,
          a.name as agentName
        FROM agent_logs al
        LEFT JOIN agents a ON a.id = al.agent_id
        WHERE 1=1
      `;
      const params = [];

      if (userId) {
        sql += ' AND al.user_id = ?';
        params.push(userId);
      }

      if (agentId) {
        sql += ' AND al.agent_id = ?';
        params.push(agentId);
      }

      if (startDate) {
        sql += ' AND al.created_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        sql += ' AND al.created_at <= ?';
        params.push(endDate);
      }

      if (hasError === true) {
        sql += ' AND al.error IS NOT NULL';
      } else if (hasError === false) {
        sql += ' AND al.error IS NULL';
      }

      sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = db.prepare(sql).all(...params);

      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        type: 'agent',
        level: row.error ? 'error' : 'info',
        source: row.agentName || `Agent ${row.agentId?.substring(0, 8) || 'unknown'}`,
        message: `${row.actionType}: ${row.error || 'completed'}`,
        metadata: {
          actionType: row.actionType,
          actionData: row.actionData ? JSON.parse(row.actionData) : null,
          error: row.error,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          cost: row.cost,
          durationMs: row.durationMs,
          agentId: row.agentId,
          userId: row.userId,
        },
      }));
    } catch {
      // Table might not exist
      return [];
    }
  }

  /**
   * Query ai_usage table
   * @param {Object} options - Query options
   * @returns {Array} Log entries
   */
  queryAIUsageLogs(options = {}) {
    const {
      userId = null,
      provider = null,
      model = null,
      startDate = null,
      endDate = null,
      limit = 100,
      offset = 0,
    } = options;

    try {
      const db = getDatabase();

      // Check if table exists first
      if (!tableExists(db, 'ai_usage')) {
        return [];
      }
      let sql = `
        SELECT
          id,
          created_at as timestamp,
          provider,
          model,
          input_tokens as inputTokens,
          output_tokens as outputTokens,
          cost,
          user_id as userId,
          agent_id as agentId,
          conversation_id as conversationId
        FROM ai_usage
        WHERE 1=1
      `;
      const params = [];

      if (userId) {
        sql += ' AND user_id = ?';
        params.push(userId);
      }

      if (provider) {
        sql += ' AND provider = ?';
        params.push(provider);
      }

      if (model) {
        sql += ' AND model LIKE ?';
        params.push(`%${model}%`);
      }

      if (startDate) {
        sql += ' AND created_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        sql += ' AND created_at <= ?';
        params.push(endDate);
      }

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = db.prepare(sql).all(...params);

      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        type: 'api',
        level: 'info',
        source: row.provider || 'AI Provider',
        message: `${row.model || 'Unknown model'} - ${row.inputTokens + row.outputTokens} tokens`,
        metadata: {
          provider: row.provider,
          model: row.model,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          cost: row.cost,
          userId: row.userId,
          agentId: row.agentId,
          conversationId: row.conversationId,
        },
      }));
    } catch {
      // Table might not exist
      return [];
    }
  }

  /**
   * Query webhook_logs table
   * @param {Object} options - Query options
   * @returns {Array} Log entries
   */
  queryWebhookLogs(options = {}) {
    const {
      webhookId = null,
      startDate = null,
      endDate = null,
      limit = 100,
      offset = 0,
    } = options;

    const db = getDatabase();

    // Check if table exists first
    if (!tableExists(db, 'webhook_logs')) {
      return [];
    }

    let sql = `
      SELECT
        wl.id,
        wl.created_at as timestamp,
        wl.webhook_id as webhookId,
        wl.request,
        wl.response,
        wl.status_code as statusCode,
        wl.duration,
        hw.name as webhookName,
        hw.url as webhookUrl
      FROM webhook_logs wl
      LEFT JOIN http_webhooks hw ON hw.id = wl.webhook_id
      WHERE 1=1
    `;
    const params = [];

    if (webhookId) {
      sql += ' AND wl.webhook_id = ?';
      params.push(webhookId);
    }

    if (startDate) {
      sql += ' AND wl.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND wl.created_at <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY wl.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    try {
      const rows = db.prepare(sql).all(...params);

      return rows.map(row => {
        const isError = row.statusCode && row.statusCode >= 400;
        return {
          id: row.id,
          timestamp: row.timestamp,
          type: 'webhook',
          level: isError ? 'error' : 'info',
          source: row.webhookName || 'Webhook',
          message: `${row.webhookUrl || 'Unknown URL'} - ${row.statusCode || 'N/A'} (${row.duration || 0}ms)`,
          metadata: {
            webhookId: row.webhookId,
            webhookName: row.webhookName,
            webhookUrl: row.webhookUrl,
            request: row.request ? JSON.parse(row.request) : null,
            response: row.response ? JSON.parse(row.response) : null,
            statusCode: row.statusCode,
            duration: row.duration,
          },
        };
      });
    } catch {
      // Table might not exist or have data
      return [];
    }
  }

  /**
   * Query SuperBrain logs from Redis
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Log entries
   */
  async querySuperBrainLogs(options = {}) {
    const {
      userId = null,
      provider = null,
      tier = null,
      status = null,
      startTime = null,
      endTime = null,
      limit = 100,
    } = options;

    // If no userId, we can't query SuperBrain logs (they're user-scoped)
    if (!userId) {
      return [];
    }

    try {
      const result = await this.superBrainLogService.getLogs(userId, {
        limit,
        status,
        provider,
        tier,
        startTime,
        endTime,
      });

      return (result.logs || []).map(log => ({
        id: log.id,
        timestamp: new Date(log.timestamp).toISOString(),
        type: 'superbrain',
        level: log.result?.success ? 'info' : 'error',
        source: log.execution?.providerUsed || 'SuperBrain',
        message: `${log.classification?.tier || 'unknown'} task - ${log.result?.success ? 'success' : 'failed'}`,
        metadata: {
          classification: log.classification,
          execution: log.execution,
          result: log.result,
          duration: log.duration,
          tools: log.tools,
          agentId: log.agentId,
          userId: log.userId,
        },
      }));
    } catch (error) {
      logger.error(`Failed to query SuperBrain logs: ${error.message}`);
      return [];
    }
  }

  /**
   * Unified log query - aggregates from all sources
   * @param {Object} options - Query options
   * @returns {Promise<Object>} { logs, total, hasMore }
   */
  async getLogs(options = {}) {
    const {
      type = LOG_TYPES.ALL,
      level = null,
      search = null,
      userId = null,
      provider = null,
      startDate = null,
      endDate = null,
      page = 1,
      limit = 50,
    } = options;

    const allLogs = [];
    const offset = (page - 1) * limit;
    const queryLimit = limit * 2; // Fetch extra for filtering

    try {
      // Determine which sources to query based on type
      const shouldQuerySystem = type === LOG_TYPES.ALL || type === LOG_TYPES.SYSTEM || type === LOG_TYPES.ERROR;
      const shouldQueryAgent = type === LOG_TYPES.ALL || type === LOG_TYPES.AGENT;
      const shouldQueryAPI = type === LOG_TYPES.ALL || type === LOG_TYPES.API;
      const shouldQuerySuperBrain = type === LOG_TYPES.ALL || type === LOG_TYPES.SUPERBRAIN;
      const shouldQueryWebhook = type === LOG_TYPES.ALL || type === LOG_TYPES.WEBHOOK;

      // Query each source in parallel
      const [fileLogs, agentLogs, apiLogs, superbrainLogs, webhookLogs] = await Promise.all([
        shouldQuerySystem ? this.queryFileLogs({ level, search, startDate, endDate, limit: queryLimit, errorOnly: type === LOG_TYPES.ERROR }) : [],
        shouldQueryAgent ? this.queryAgentLogs({ userId, startDate, endDate, limit: queryLimit, hasError: level === 'error' ? true : null }) : [],
        shouldQueryAPI ? this.queryAIUsageLogs({ userId, provider, startDate, endDate, limit: queryLimit }) : [],
        shouldQuerySuperBrain ? this.querySuperBrainLogs({ userId, provider, startDate: startDate ? new Date(startDate).getTime() : null, endDate: endDate ? new Date(endDate).getTime() : null, limit: queryLimit }) : [],
        shouldQueryWebhook ? this.queryWebhookLogs({ startDate, endDate, limit: queryLimit }) : [],
      ]);

      // Merge all logs
      allLogs.push(...fileLogs, ...agentLogs, ...apiLogs, ...superbrainLogs, ...webhookLogs);

      // Apply additional filters
      let filteredLogs = allLogs;

      if (level && level !== 'all') {
        filteredLogs = filteredLogs.filter(log => log.level === level);
      }

      if (search) {
        const searchLower = search.toLowerCase();
        filteredLogs = filteredLogs.filter(log =>
          log.message.toLowerCase().includes(searchLower) ||
          log.source.toLowerCase().includes(searchLower)
        );
      }

      // Sort by timestamp (newest first)
      filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply pagination
      const total = filteredLogs.length;
      const paginatedLogs = filteredLogs.slice(offset, offset + limit);

      return {
        logs: paginatedLogs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + paginatedLogs.length < total,
      };
    } catch (error) {
      logger.error(`Failed to get logs: ${error.message}`);
      return { logs: [], total: 0, page, limit, totalPages: 0, hasMore: false };
    }
  }

  /**
   * Get log statistics
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Statistics
   */
  async getStats(options = {}) {
    const { startDate = null, endDate = null, userId = null } = options;
    const db = getDatabase();

    // Calculate default date range (last 7 days)
    const now = new Date();
    const defaultStart = new Date(now.getTime() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const start = startDate || defaultStart.toISOString();
    const end = endDate || now.toISOString();

    try {
      // Count system logs (from file)
      const fileLogs = await this.queryFileLogs({ startDate: start, endDate: end, limit: 10000 });
      const systemTotal = fileLogs.length;
      const systemErrors = fileLogs.filter(l => l.level === 'error').length;
      const systemWarnings = fileLogs.filter(l => l.level === 'warn').length;

      // Count agent logs (check if table exists first)
      let agentTotal = 0;
      let agentErrors = 0;
      if (tableExists(db, 'agent_logs')) {
        try {
          let agentQuery = `SELECT COUNT(*) as total FROM agent_logs WHERE created_at >= ? AND created_at <= ?`;
          let agentErrorQuery = `SELECT COUNT(*) as total FROM agent_logs WHERE error IS NOT NULL AND created_at >= ? AND created_at <= ?`;
          const agentParams = [start, end];

          if (userId) {
            agentQuery += ' AND user_id = ?';
            agentErrorQuery += ' AND user_id = ?';
            agentParams.push(userId);
          }

          agentTotal = db.prepare(agentQuery).get(...agentParams)?.total || 0;
          agentErrors = db.prepare(agentErrorQuery).get(...agentParams)?.total || 0;
        } catch {
          // Query failed, use defaults
        }
      }

      // Count AI usage (check if table exists first)
      let aiStats = { total: 0, tokens: 0, cost: 0 };
      if (tableExists(db, 'ai_usage')) {
        try {
          let aiQuery = `SELECT COUNT(*) as total, COALESCE(SUM(input_tokens + output_tokens), 0) as tokens, COALESCE(SUM(cost), 0) as cost FROM ai_usage WHERE created_at >= ? AND created_at <= ?`;
          const aiParams = [start, end];

          if (userId) {
            aiQuery += ' AND user_id = ?';
            aiParams.push(userId);
          }

          aiStats = db.prepare(aiQuery).get(...aiParams) || { total: 0, tokens: 0, cost: 0 };
        } catch {
          // Query failed, use defaults
        }
      }

      // Count webhook logs (check if table exists first)
      let webhookTotal = 0;
      let webhookErrors = 0;
      if (tableExists(db, 'webhook_logs')) {
        try {
          webhookTotal = db.prepare(`SELECT COUNT(*) as total FROM webhook_logs WHERE created_at >= ? AND created_at <= ?`).get(start, end)?.total || 0;
          webhookErrors = db.prepare(`SELECT COUNT(*) as total FROM webhook_logs WHERE status_code >= 400 AND created_at >= ? AND created_at <= ?`).get(start, end)?.total || 0;
        } catch {
          // Query failed, use defaults
        }
      }

      // Get top providers (check if ai_usage table exists first)
      let topProviders = [];
      if (tableExists(db, 'ai_usage')) {
        try {
          let providersQuery = `SELECT provider, COUNT(*) as count FROM ai_usage WHERE created_at >= ? AND created_at <= ?`;
          const providersParams = [start, end];

          if (userId) {
            providersQuery += ' AND user_id = ?';
            providersParams.push(userId);
          }

          providersQuery += ' GROUP BY provider ORDER BY count DESC LIMIT 5';
          topProviders = db.prepare(providersQuery).all(...providersParams);
        } catch {
          // Query failed, use defaults
        }
      }

      // Calculate totals
      const totalLogs = systemTotal + agentTotal + aiStats.total + webhookTotal;
      const totalErrors = systemErrors + agentErrors + webhookErrors;

      return {
        summary: {
          total: totalLogs,
          errors: totalErrors,
          warnings: systemWarnings,
          apiRequests: aiStats.total,
        },
        byType: {
          system: systemTotal,
          agent: agentTotal,
          api: aiStats.total,
          webhook: webhookTotal,
        },
        aiUsage: {
          totalRequests: aiStats.total,
          totalTokens: aiStats.tokens,
          totalCost: aiStats.cost,
        },
        topProviders: topProviders.map(p => ({ provider: p.provider, count: p.count })),
        timeRange: {
          start,
          end,
        },
      };
    } catch (error) {
      logger.error(`Failed to get log stats: ${error.message}`);
      return {
        summary: { total: 0, errors: 0, warnings: 0, apiRequests: 0 },
        byType: { system: 0, agent: 0, api: 0, webhook: 0 },
        aiUsage: { totalRequests: 0, totalTokens: 0, totalCost: 0 },
        topProviders: [],
        timeRange: { start, end },
      };
    }
  }

  /**
   * Export logs to JSON or CSV
   * @param {Object} options - Export options
   * @returns {Promise<Object>} { data, contentType, filename }
   */
  async exportLogs(options = {}) {
    const { format = 'json', ...queryOptions } = options;

    // Get all logs (up to 10000)
    const { logs } = await this.getLogs({ ...queryOptions, limit: 10000, page: 1 });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'csv') {
      // Convert to CSV
      const headers = ['Timestamp', 'Type', 'Level', 'Source', 'Message'];
      const rows = logs.map(log => [
        log.timestamp,
        log.type,
        log.level,
        log.source,
        `"${(log.message || '').replace(/"/g, '""')}"`,
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

      return {
        data: csv,
        contentType: 'text/csv',
        filename: `system-logs-${timestamp}.csv`,
      };
    }

    // Default to JSON
    return {
      data: JSON.stringify(logs, null, 2),
      contentType: 'application/json',
      filename: `system-logs-${timestamp}.json`,
    };
  }

  /**
   * Clean up old logs based on retention policy
   * @param {number} retentionDays - Days to retain logs
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupOldLogs(retentionDays = DEFAULT_RETENTION_DAYS) {
    const db = getDatabase();
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    try {
      // Clean agent_logs (check if table exists first)
      let agentResult = { changes: 0 };
      if (tableExists(db, 'agent_logs')) {
        agentResult = db.prepare('DELETE FROM agent_logs WHERE created_at < ?').run(cutoffDate);
      }

      // Clean ai_usage (check if table exists first)
      let aiResult = { changes: 0 };
      if (tableExists(db, 'ai_usage')) {
        aiResult = db.prepare('DELETE FROM ai_usage WHERE created_at < ?').run(cutoffDate);
      }

      // Clean webhook_logs (check if table exists first)
      let webhookResult = { changes: 0 };
      if (tableExists(db, 'webhook_logs')) {
        webhookResult = db.prepare('DELETE FROM webhook_logs WHERE created_at < ?').run(cutoffDate);
      }

      logger.info(`Log cleanup completed: agent_logs=${agentResult.changes}, ai_usage=${aiResult.changes}, webhook_logs=${webhookResult.changes}`);

      return {
        success: true,
        deleted: {
          agentLogs: agentResult.changes,
          aiUsage: aiResult.changes,
          webhookLogs: webhookResult.changes,
        },
        cutoffDate,
      };
    } catch (error) {
      logger.error(`Failed to cleanup logs: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stream new logs via WebSocket
   * @param {string} event - Log event name
   * @param {Object} logEntry - Log entry data
   */
  broadcastLog(event, logEntry) {
    if (this.broadcast) {
      this.broadcast('system:log:new', {
        event,
        log: {
          id: `live-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'system',
          level: 'info',
          source: 'System',
          message: event,
          metadata: logEntry,
        },
      });
    }
  }
}

// Singleton instance
let instance = null;

function getSystemLogService() {
  if (!instance) {
    instance = new SystemLogService();
  }
  return instance;
}

module.exports = {
  SystemLogService,
  getSystemLogService,
  LOG_TYPES,
  LOG_LEVELS,
  DEFAULT_RETENTION_DAYS,
};
