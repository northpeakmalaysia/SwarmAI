/**
 * Metrics Service
 * ===============
 * Platform monitoring and observability for WhatsApp and other messaging platforms.
 *
 * Tracks:
 * - Message sent/received counts
 * - Processing latency
 * - Error rates by type
 * - Provider usage statistics
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

// Metric types
const METRIC_TYPES = {
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_FAILED: 'message_failed',
  MESSAGE_DUPLICATE: 'message_duplicate',
  CONNECTION_STATUS: 'connection_status',
  RATE_LIMIT_HIT: 'rate_limit_hit',
  CIRCUIT_OPEN: 'circuit_open',
  CIRCUIT_CLOSE: 'circuit_close',
  AI_PROCESSING: 'ai_processing',
  VISION_ANALYSIS: 'vision_analysis',
};

// In-memory counters for high-frequency metrics (flushed periodically)
const memoryCounters = {
  messages: { sent: 0, received: 0, failed: 0, duplicate: 0 },
  latency: { sum: 0, count: 0 },
  errors: {},
  lastFlush: Date.now(),
};

// Flush interval (1 minute)
const FLUSH_INTERVAL_MS = 60000;

class MetricsService {
  constructor() {
    this.flushInterval = null;
  }

  /**
   * Start periodic flush of in-memory counters to database
   */
  startPeriodicFlush() {
    if (this.flushInterval) return;

    this.flushInterval = setInterval(() => {
      this.flushCounters();
    }, FLUSH_INTERVAL_MS);

    logger.debug('MetricsService periodic flush started');
  }

  /**
   * Stop periodic flush
   */
  stopPeriodicFlush() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
      // Final flush
      this.flushCounters();
    }
  }

  /**
   * Flush in-memory counters to database
   */
  flushCounters() {
    const now = Date.now();
    const elapsed = now - memoryCounters.lastFlush;

    if (elapsed < 1000) return; // Skip if less than 1 second since last flush

    try {
      const db = getDatabase();

      // Aggregate message counts
      if (memoryCounters.messages.sent > 0 || memoryCounters.messages.received > 0) {
        db.prepare(`
          INSERT INTO platform_metrics (id, platform, metric_type, data, created_at)
          VALUES (?, 'aggregate', 'message_counts', ?, datetime('now'))
        `).run(
          uuidv4(),
          JSON.stringify({
            sent: memoryCounters.messages.sent,
            received: memoryCounters.messages.received,
            failed: memoryCounters.messages.failed,
            duplicate: memoryCounters.messages.duplicate,
            periodMs: elapsed,
          })
        );
      }

      // Aggregate latency
      if (memoryCounters.latency.count > 0) {
        const avgLatency = memoryCounters.latency.sum / memoryCounters.latency.count;
        db.prepare(`
          INSERT INTO platform_metrics (id, platform, metric_type, data, created_at)
          VALUES (?, 'aggregate', 'latency_avg', ?, datetime('now'))
        `).run(
          uuidv4(),
          JSON.stringify({
            avgMs: Math.round(avgLatency),
            count: memoryCounters.latency.count,
            periodMs: elapsed,
          })
        );
      }

      // Reset counters
      memoryCounters.messages = { sent: 0, received: 0, failed: 0, duplicate: 0 };
      memoryCounters.latency = { sum: 0, count: 0 };
      memoryCounters.errors = {};
      memoryCounters.lastFlush = now;

    } catch (error) {
      logger.warn(`Failed to flush metrics: ${error.message}`);
    }
  }

  /**
   * Record a message sent event
   * @param {string} platform - Platform name (whatsapp, whatsapp-business, telegram-bot, email)
   * @param {string} accountId - Platform account ID
   * @param {number} durationMs - Time to send in milliseconds
   * @param {Object} meta - Additional metadata
   */
  recordMessageSent(platform, accountId, durationMs = 0, meta = {}) {
    // Update in-memory counters
    memoryCounters.messages.sent++;
    if (durationMs > 0) {
      memoryCounters.latency.sum += durationMs;
      memoryCounters.latency.count++;
    }

    // Persist individual metric for detailed tracking
    this.persistMetric(platform, accountId, METRIC_TYPES.MESSAGE_SENT, {
      durationMs,
      ...meta,
    });
  }

  /**
   * Record a message received event
   * @param {string} platform - Platform name
   * @param {string} accountId - Platform account ID
   * @param {Object} meta - Additional metadata
   */
  recordMessageReceived(platform, accountId, meta = {}) {
    memoryCounters.messages.received++;

    this.persistMetric(platform, accountId, METRIC_TYPES.MESSAGE_RECEIVED, meta);
  }

  /**
   * Record a message processing error
   * @param {string} platform - Platform name
   * @param {string} accountId - Platform account ID
   * @param {string} errorType - Error classification (network, auth, timeout, etc.)
   * @param {string} errorMessage - Error message
   * @param {Object} meta - Additional metadata
   */
  recordError(platform, accountId, errorType, errorMessage, meta = {}) {
    memoryCounters.messages.failed++;
    memoryCounters.errors[errorType] = (memoryCounters.errors[errorType] || 0) + 1;

    this.persistMetric(platform, accountId, METRIC_TYPES.MESSAGE_FAILED, {
      errorType,
      errorMessage,
      ...meta,
    });

    logger.debug(`Metric recorded: ${platform} error [${errorType}]: ${errorMessage}`);
  }

  /**
   * Record a duplicate message detection
   * @param {string} platform - Platform name
   * @param {string} accountId - Platform account ID
   * @param {string} externalId - External message ID
   */
  recordDuplicate(platform, accountId, externalId) {
    memoryCounters.messages.duplicate++;

    this.persistMetric(platform, accountId, METRIC_TYPES.MESSAGE_DUPLICATE, {
      externalId,
    });
  }

  /**
   * Record rate limit hit
   * @param {string} platform - Platform name
   * @param {string} accountId - Platform account ID
   * @param {number} retryAfterMs - Retry after milliseconds
   */
  recordRateLimitHit(platform, accountId, retryAfterMs = 0) {
    this.persistMetric(platform, accountId, METRIC_TYPES.RATE_LIMIT_HIT, {
      retryAfterMs,
    });
  }

  /**
   * Record circuit breaker state change
   * @param {string} platform - Platform name
   * @param {string} accountId - Platform account ID
   * @param {string} state - Circuit state (open, closed, half_open)
   */
  recordCircuitState(platform, accountId, state) {
    const metricType = state === 'open' ? METRIC_TYPES.CIRCUIT_OPEN : METRIC_TYPES.CIRCUIT_CLOSE;

    this.persistMetric(platform, accountId, metricType, { state });
  }

  /**
   * Record AI processing metrics
   * @param {string} platform - Platform name
   * @param {string} accountId - Platform account ID
   * @param {Object} aiMeta - AI processing metadata (provider, model, tier, durationMs)
   */
  recordAIProcessing(platform, accountId, aiMeta = {}) {
    this.persistMetric(platform, accountId, METRIC_TYPES.AI_PROCESSING, aiMeta);
  }

  /**
   * Record vision analysis metrics
   * @param {string} platform - Platform name
   * @param {string} accountId - Platform account ID
   * @param {Object} visionMeta - Vision analysis metadata (type, provider, success, durationMs)
   */
  recordVisionAnalysis(platform, accountId, visionMeta = {}) {
    this.persistMetric(platform, accountId, METRIC_TYPES.VISION_ANALYSIS, visionMeta);
  }

  /**
   * Persist a metric to the database
   * @private
   */
  persistMetric(platform, accountId, metricType, data = {}) {
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO platform_metrics (id, platform, account_id, metric_type, data, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        platform,
        accountId || null,
        metricType,
        JSON.stringify(data)
      );
    } catch (error) {
      // Don't throw - metrics should not break message processing
      logger.debug(`Failed to persist metric: ${error.message}`);
    }
  }

  /**
   * Get aggregated statistics
   * @param {string} platform - Platform filter (optional)
   * @param {string} accountId - Account filter (optional)
   * @param {number} hours - Time range in hours (default: 24)
   * @returns {Object} Aggregated stats
   */
  getStats(platform = null, accountId = null, hours = 24) {
    try {
      const db = getDatabase();

      let whereClause = `WHERE created_at > datetime('now', '-${hours} hours')`;
      const params = [];

      if (platform) {
        whereClause += ' AND platform = ?';
        params.push(platform);
      }
      if (accountId) {
        whereClause += ' AND account_id = ?';
        params.push(accountId);
      }

      // Get counts by metric type
      const counts = db.prepare(`
        SELECT metric_type, COUNT(*) as count
        FROM platform_metrics
        ${whereClause}
        GROUP BY metric_type
      `).all(...params);

      // Get average latency for sent messages
      const latencyQuery = db.prepare(`
        SELECT
          AVG(json_extract(data, '$.durationMs')) as avg_latency,
          MAX(json_extract(data, '$.durationMs')) as max_latency,
          MIN(json_extract(data, '$.durationMs')) as min_latency
        FROM platform_metrics
        ${whereClause} AND metric_type = 'message_sent'
          AND json_extract(data, '$.durationMs') > 0
      `).get(...params);

      // Get error breakdown
      const errors = db.prepare(`
        SELECT
          json_extract(data, '$.errorType') as error_type,
          COUNT(*) as count
        FROM platform_metrics
        ${whereClause} AND metric_type = 'message_failed'
        GROUP BY json_extract(data, '$.errorType')
      `).all(...params);

      // Build response
      const countMap = {};
      for (const row of counts) {
        countMap[row.metric_type] = row.count;
      }

      return {
        timeRange: `${hours} hours`,
        messages: {
          sent: countMap[METRIC_TYPES.MESSAGE_SENT] || 0,
          received: countMap[METRIC_TYPES.MESSAGE_RECEIVED] || 0,
          failed: countMap[METRIC_TYPES.MESSAGE_FAILED] || 0,
          duplicate: countMap[METRIC_TYPES.MESSAGE_DUPLICATE] || 0,
        },
        latency: {
          avgMs: Math.round(latencyQuery?.avg_latency || 0),
          maxMs: latencyQuery?.max_latency || 0,
          minMs: latencyQuery?.min_latency || 0,
        },
        errors: errors.reduce((acc, row) => {
          acc[row.error_type || 'unknown'] = row.count;
          return acc;
        }, {}),
        rateLimitHits: countMap[METRIC_TYPES.RATE_LIMIT_HIT] || 0,
        circuitOpens: countMap[METRIC_TYPES.CIRCUIT_OPEN] || 0,
        aiProcessing: countMap[METRIC_TYPES.AI_PROCESSING] || 0,
        visionAnalysis: countMap[METRIC_TYPES.VISION_ANALYSIS] || 0,
      };

    } catch (error) {
      logger.error(`Failed to get metrics stats: ${error.message}`);
      return {
        error: error.message,
        messages: { sent: 0, received: 0, failed: 0, duplicate: 0 },
        latency: { avgMs: 0, maxMs: 0, minMs: 0 },
        errors: {},
      };
    }
  }

  /**
   * Clean up old metrics
   * @param {number} retentionDays - Days to retain (default: 7)
   * @returns {number} Rows deleted
   */
  cleanup(retentionDays = 7) {
    try {
      const db = getDatabase();
      const result = db.prepare(`
        DELETE FROM platform_metrics
        WHERE created_at < datetime('now', '-${retentionDays} days')
      `).run();

      logger.info(`Metrics cleanup: deleted ${result.changes} old records`);
      return result.changes;

    } catch (error) {
      logger.error(`Metrics cleanup failed: ${error.message}`);
      return 0;
    }
  }
}

// Singleton instance
let instance = null;

function getMetricsService() {
  if (!instance) {
    instance = new MetricsService();
    instance.startPeriodicFlush();
  }
  return instance;
}

module.exports = {
  MetricsService,
  getMetricsService,
  METRIC_TYPES,
};
