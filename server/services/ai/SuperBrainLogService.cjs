/**
 * SuperBrain Log Service
 *
 * Real-time activity logging for SuperBrain message processing.
 * Uses Redis for storage with 12-hour TTL (auto-expiration).
 *
 * Features:
 * - Comprehensive logging of message processing
 * - Provider execution tracking
 * - Tool usage logging
 * - Real-time WebSocket broadcasting
 * - Automatic cleanup via Redis TTL
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../logger.cjs');
const { getRedisClient, isRedisAvailable } = require('../redis.cjs');

// Log TTL: 12 hours in seconds
const LOG_TTL_SECONDS = 12 * 60 * 60;

// Maximum logs to return in a single query
const MAX_QUERY_LIMIT = 200;

// Maximum logs to keep in user's sorted set reference
const MAX_LOG_REFERENCES = 1000;

class SuperBrainLogService {
  constructor() {
    this.broadcast = null;
  }

  /**
   * Set broadcast function for WebSocket notifications
   * @param {Function} broadcastFn - WebSocket broadcast function
   */
  setBroadcast(broadcastFn) {
    this.broadcast = broadcastFn;
  }

  /**
   * Create a new log entry
   * @param {Object} entry - Log entry data
   * @returns {Promise<string|null>} Log entry ID or null if Redis unavailable
   */
  async createLogEntry(entry) {
    const redis = getRedisClient();

    if (!redis || !isRedisAvailable()) {
      logger.debug('Redis not available - skipping SuperBrain log');
      return null;
    }

    const logId = uuidv4();
    const timestamp = Date.now();

    const logEntry = {
      id: logId,
      timestamp,
      ...entry,
    };

    try {
      const logKey = `superbrain:log:${logId}`;
      const userSetKey = `superbrain:logs:${entry.userId}`;

      // Store log entry with TTL
      await redis.setex(logKey, LOG_TTL_SECONDS, JSON.stringify(logEntry));

      // Add to user's sorted set (score = timestamp for ordering)
      await redis.zadd(userSetKey, timestamp, logId);

      // Trim old references from sorted set (keep last MAX_LOG_REFERENCES)
      const setSize = await redis.zcard(userSetKey);
      if (setSize > MAX_LOG_REFERENCES) {
        const removeCount = setSize - MAX_LOG_REFERENCES;
        await redis.zremrangebyrank(userSetKey, 0, removeCount - 1);
      }

      // Set TTL on the sorted set key too
      await redis.expire(userSetKey, LOG_TTL_SECONDS);

      // Broadcast via WebSocket
      if (this.broadcast) {
        this.broadcast('superbrain:log:new', logEntry, entry.agentId);
      }

      logger.debug(`SuperBrain log created: ${logId}`);
      return logId;

    } catch (error) {
      logger.error(`Failed to create SuperBrain log: ${error.message}`);
      return null;
    }
  }

  /**
   * Get logs for a user with pagination and filtering
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} { logs: [], total: number, hasMore: boolean }
   */
  async getLogs(userId, options = {}) {
    const redis = getRedisClient();

    if (!redis || !isRedisAvailable()) {
      return { logs: [], total: 0, hasMore: false };
    }

    const {
      limit = 50,
      offset = 0,
      status = null,      // 'success' | 'error'
      provider = null,
      tier = null,
      intent = null,
      startTime = null,
      endTime = null,
    } = options;

    try {
      const userSetKey = `superbrain:logs:${userId}`;

      // Get log IDs from sorted set (newest first)
      const minScore = startTime || '-inf';
      const maxScore = endTime || '+inf';

      const logIds = await redis.zrevrangebyscore(
        userSetKey,
        maxScore,
        minScore,
        'LIMIT',
        0,
        MAX_LOG_REFERENCES // Fetch more for filtering
      );

      if (!logIds || logIds.length === 0) {
        return { logs: [], total: 0, hasMore: false };
      }

      // Fetch log entries in batches
      const logs = [];
      const pipeline = redis.pipeline();

      for (const logId of logIds) {
        pipeline.get(`superbrain:log:${logId}`);
      }

      const results = await pipeline.exec();

      for (const [err, data] of results) {
        if (err || !data) continue;

        try {
          const log = JSON.parse(data);

          // Apply filters
          if (status) {
            const isSuccess = log.result?.success;
            if (status === 'success' && !isSuccess) continue;
            if (status === 'error' && isSuccess) continue;
          }

          if (provider && log.execution?.providerUsed !== provider) continue;
          if (tier && log.classification?.tier !== tier) continue;
          if (intent && log.classification?.intent !== intent) continue;

          logs.push(log);
        } catch {
          // Skip invalid JSON
        }
      }

      // Apply pagination
      const total = logs.length;
      const paginatedLogs = logs.slice(offset, offset + Math.min(limit, MAX_QUERY_LIMIT));

      return {
        logs: paginatedLogs,
        total,
        hasMore: offset + paginatedLogs.length < total,
      };

    } catch (error) {
      logger.error(`Failed to fetch SuperBrain logs: ${error.message}`);
      return { logs: [], total: 0, hasMore: false };
    }
  }

  /**
   * Get a single log entry
   * @param {string} logId - Log entry ID
   * @returns {Promise<Object|null>} Log entry or null
   */
  async getLogEntry(logId) {
    const redis = getRedisClient();

    if (!redis || !isRedisAvailable()) {
      return null;
    }

    try {
      const data = await redis.get(`superbrain:log:${logId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Failed to fetch log entry: ${error.message}`);
      return null;
    }
  }

  /**
   * Get log statistics for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Statistics object
   */
  async getLogStats(userId) {
    const { logs } = await this.getLogs(userId, { limit: MAX_LOG_REFERENCES });

    const stats = {
      total: logs.length,
      byStatus: { success: 0, error: 0 },
      byTier: { trivial: 0, simple: 0, moderate: 0, complex: 0, critical: 0 },
      byProvider: {},
      byIntent: { SKIP: 0, PASSIVE: 0, ACTIVE: 0 },
      byResultType: {},
      avgDuration: 0,
      toolsUsed: {},
      timeRange: {
        oldest: null,
        newest: null,
      },
    };

    if (logs.length === 0) {
      return stats;
    }

    let totalDuration = 0;

    for (const log of logs) {
      // Status
      if (log.result?.success) {
        stats.byStatus.success++;
      } else {
        stats.byStatus.error++;
      }

      // Tier
      const tier = log.classification?.tier;
      if (tier && stats.byTier.hasOwnProperty(tier)) {
        stats.byTier[tier]++;
      }

      // Provider
      const provider = log.execution?.providerUsed;
      if (provider) {
        stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1;
      }

      // Intent
      const intent = log.classification?.intent;
      if (intent && stats.byIntent.hasOwnProperty(intent)) {
        stats.byIntent[intent]++;
      }

      // Result type
      const resultType = log.result?.type;
      if (resultType) {
        stats.byResultType[resultType] = (stats.byResultType[resultType] || 0) + 1;
      }

      // Duration
      if (log.duration?.total) {
        totalDuration += log.duration.total;
      }

      // Tools
      if (log.tools && Array.isArray(log.tools)) {
        for (const tool of log.tools) {
          if (tool.name) {
            stats.toolsUsed[tool.name] = (stats.toolsUsed[tool.name] || 0) + 1;
          }
        }
      }

      // Time range
      if (log.timestamp) {
        if (!stats.timeRange.oldest || log.timestamp < stats.timeRange.oldest) {
          stats.timeRange.oldest = log.timestamp;
        }
        if (!stats.timeRange.newest || log.timestamp > stats.timeRange.newest) {
          stats.timeRange.newest = log.timestamp;
        }
      }
    }

    stats.avgDuration = logs.length > 0 ? Math.round(totalDuration / logs.length) : 0;

    return stats;
  }

  /**
   * Clear all logs for a user (admin action)
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of logs cleared
   */
  async clearLogs(userId) {
    const redis = getRedisClient();

    if (!redis || !isRedisAvailable()) {
      return 0;
    }

    try {
      const userSetKey = `superbrain:logs:${userId}`;

      // Get all log IDs
      const logIds = await redis.zrange(userSetKey, 0, -1);

      if (!logIds || logIds.length === 0) {
        return 0;
      }

      // Delete log entries
      const pipeline = redis.pipeline();
      for (const logId of logIds) {
        pipeline.del(`superbrain:log:${logId}`);
      }
      pipeline.del(userSetKey);

      await pipeline.exec();

      logger.info(`Cleared ${logIds.length} SuperBrain logs for user ${userId}`);
      return logIds.length;

    } catch (error) {
      logger.error(`Failed to clear logs: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get Redis connection status
   * @returns {boolean}
   */
  isAvailable() {
    return isRedisAvailable();
  }
}

// Singleton instance
let instance = null;

function getSuperBrainLogService() {
  if (!instance) {
    instance = new SuperBrainLogService();
  }
  return instance;
}

module.exports = {
  SuperBrainLogService,
  getSuperBrainLogService,
  LOG_TTL_SECONDS,
};
