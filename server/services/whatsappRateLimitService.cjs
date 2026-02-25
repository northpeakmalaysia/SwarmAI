/**
 * WhatsApp Rate Limit Service
 * ============================
 * Rate limiting specifically for WhatsApp Business API compliance.
 *
 * WhatsApp/Meta API Limits:
 * - 80 messages per second (Business API tier)
 * - 1000 messages per phone per 24 hours (new business accounts)
 * - 250 template messages per minute
 *
 * Uses Redis for distributed rate limiting across instances.
 * Falls back to SQLite if Redis is unavailable.
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

// Lazy load Redis to avoid startup issues
let _redisClient = null;
function getRedisClient() {
  if (_redisClient === undefined) return null;
  if (_redisClient) return _redisClient;

  try {
    const { getRedisClient: getClient } = require('./redis.cjs');
    _redisClient = getClient();
    return _redisClient;
  } catch (error) {
    _redisClient = undefined; // Mark as unavailable
    return null;
  }
}

// Rate limit configurations
const RATE_LIMITS = {
  // Per-account limits
  account: {
    perSecond: 80,        // Meta's Business API limit
    perMinute: 1000,      // Reasonable burst limit
    perHour: 10000,       // Hourly cap
  },
  // Per-recipient limits (prevent spam to single user)
  recipient: {
    perMinute: 10,        // Max 10 messages to same recipient per minute
    perHour: 50,          // Max 50 messages to same recipient per hour
    perDay: 100,          // Max 100 messages to same recipient per day
  },
  // Template message limits
  template: {
    perMinute: 250,       // Meta's template limit
    perHour: 5000,        // Hourly cap
  },
};

// Window durations in seconds
const WINDOWS = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
};

/**
 * Custom error for rate limit exceeded
 */
class RateLimitError extends Error {
  constructor(message, retryAfterMs, limitType) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
    this.limitType = limitType;
  }
}

/**
 * Check rate limit using Redis (preferred)
 * @param {string} key - Rate limit key
 * @param {number} limit - Max requests allowed
 * @param {number} windowSeconds - Window duration
 * @returns {Promise<{allowed: boolean, current: number, remaining: number, retryAfterMs: number}>}
 */
async function checkRedisRateLimit(key, limit, windowSeconds) {
  const redis = getRedisClient();
  if (!redis) {
    return { allowed: true, current: 0, remaining: limit, retryAfterMs: 0, source: 'no-redis' };
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % windowSeconds);
    const fullKey = `wa:rate:${key}:${windowStart}`;

    // Increment and get current count
    const current = await redis.incr(fullKey);

    // Set TTL on first request in window
    if (current === 1) {
      await redis.expire(fullKey, windowSeconds + 10); // Extra 10s buffer
    }

    const remaining = Math.max(0, limit - current);
    const allowed = current <= limit;

    // Calculate retry after (time until window resets)
    const windowEnd = windowStart + windowSeconds;
    const retryAfterMs = allowed ? 0 : (windowEnd - now) * 1000;

    return {
      allowed,
      current,
      remaining,
      retryAfterMs,
      source: 'redis',
    };

  } catch (error) {
    logger.warn(`Redis rate limit check failed: ${error.message}`);
    // Fallback to allow (fail open)
    return { allowed: true, current: 0, remaining: limit, retryAfterMs: 0, source: 'redis-error' };
  }
}

/**
 * Check rate limit using SQLite (fallback)
 * @param {string} accountId - Account ID
 * @param {string} windowType - Window type (second, minute, hour, day)
 * @param {number} limit - Max requests allowed
 * @param {string} recipientPhone - Optional recipient phone
 * @returns {{allowed: boolean, current: number, remaining: number, retryAfterMs: number}}
 */
function checkSqliteRateLimit(accountId, windowType, limit, recipientPhone = null) {
  try {
    const db = getDatabase();
    const windowSeconds = WINDOWS[windowType];
    const now = Math.floor(Date.now() / 1000);
    const windowStart = new Date((now - (now % windowSeconds)) * 1000).toISOString();

    // Find or create rate limit record
    let record = db.prepare(`
      SELECT id, count FROM whatsapp_rate_limits
      WHERE account_id = ?
        AND window_type = ?
        AND window_start = ?
        AND (recipient_phone = ? OR (recipient_phone IS NULL AND ? IS NULL))
    `).get(accountId, windowType, windowStart, recipientPhone, recipientPhone);

    if (!record) {
      // Create new record
      const id = uuidv4();
      db.prepare(`
        INSERT INTO whatsapp_rate_limits (id, account_id, recipient_phone, window_type, count, window_start)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(id, accountId, recipientPhone, windowType, windowStart);

      return {
        allowed: true,
        current: 1,
        remaining: limit - 1,
        retryAfterMs: 0,
        source: 'sqlite',
      };
    }

    // Increment count
    const newCount = record.count + 1;
    db.prepare(`UPDATE whatsapp_rate_limits SET count = ? WHERE id = ?`).run(newCount, record.id);

    const remaining = Math.max(0, limit - newCount);
    const allowed = newCount <= limit;

    // Calculate retry after
    const windowEnd = (now - (now % windowSeconds)) + windowSeconds;
    const retryAfterMs = allowed ? 0 : (windowEnd - now) * 1000;

    return {
      allowed,
      current: newCount,
      remaining,
      retryAfterMs,
      source: 'sqlite',
    };

  } catch (error) {
    logger.warn(`SQLite rate limit check failed: ${error.message}`);
    return { allowed: true, current: 0, remaining: limit, retryAfterMs: 0, source: 'sqlite-error' };
  }
}

/**
 * Check WhatsApp rate limits before sending a message
 * @param {string} accountId - WhatsApp account ID
 * @param {string} recipientPhone - Recipient phone number
 * @param {string} messageType - Message type (text, media, template)
 * @returns {Promise<{allowed: boolean, limitType: string|null, retryAfterMs: number}>}
 */
async function checkWhatsAppRateLimit(accountId, recipientPhone, messageType = 'text') {
  const checks = [];

  // 1. Check account-level per-second limit
  const secondResult = await checkRedisRateLimit(
    `account:${accountId}:second`,
    RATE_LIMITS.account.perSecond,
    WINDOWS.second
  );
  if (!secondResult.allowed) {
    return {
      allowed: false,
      limitType: 'account_per_second',
      retryAfterMs: secondResult.retryAfterMs,
      current: secondResult.current,
      limit: RATE_LIMITS.account.perSecond,
    };
  }
  checks.push(secondResult);

  // 2. Check account-level per-minute limit
  const minuteResult = await checkRedisRateLimit(
    `account:${accountId}:minute`,
    RATE_LIMITS.account.perMinute,
    WINDOWS.minute
  );
  if (!minuteResult.allowed) {
    return {
      allowed: false,
      limitType: 'account_per_minute',
      retryAfterMs: minuteResult.retryAfterMs,
      current: minuteResult.current,
      limit: RATE_LIMITS.account.perMinute,
    };
  }
  checks.push(minuteResult);

  // 3. Check recipient-level limits (if recipient provided)
  if (recipientPhone) {
    const recipientMinuteResult = await checkRedisRateLimit(
      `recipient:${accountId}:${recipientPhone}:minute`,
      RATE_LIMITS.recipient.perMinute,
      WINDOWS.minute
    );
    if (!recipientMinuteResult.allowed) {
      return {
        allowed: false,
        limitType: 'recipient_per_minute',
        retryAfterMs: recipientMinuteResult.retryAfterMs,
        current: recipientMinuteResult.current,
        limit: RATE_LIMITS.recipient.perMinute,
      };
    }
    checks.push(recipientMinuteResult);

    const recipientHourResult = await checkRedisRateLimit(
      `recipient:${accountId}:${recipientPhone}:hour`,
      RATE_LIMITS.recipient.perHour,
      WINDOWS.hour
    );
    if (!recipientHourResult.allowed) {
      return {
        allowed: false,
        limitType: 'recipient_per_hour',
        retryAfterMs: recipientHourResult.retryAfterMs,
        current: recipientHourResult.current,
        limit: RATE_LIMITS.recipient.perHour,
      };
    }
    checks.push(recipientHourResult);
  }

  // 4. Check template-specific limits
  if (messageType === 'template') {
    const templateResult = await checkRedisRateLimit(
      `template:${accountId}:minute`,
      RATE_LIMITS.template.perMinute,
      WINDOWS.minute
    );
    if (!templateResult.allowed) {
      return {
        allowed: false,
        limitType: 'template_per_minute',
        retryAfterMs: templateResult.retryAfterMs,
        current: templateResult.current,
        limit: RATE_LIMITS.template.perMinute,
      };
    }
    checks.push(templateResult);
  }

  // All checks passed
  return {
    allowed: true,
    limitType: null,
    retryAfterMs: 0,
    source: checks[0]?.source || 'unknown',
  };
}

/**
 * Get current rate limit status for an account
 * @param {string} accountId - WhatsApp account ID
 * @returns {Promise<Object>} Rate limit status
 */
async function getRateLimitStatus(accountId) {
  const redis = getRedisClient();
  const status = {
    accountId,
    limits: {},
  };

  // Get current counts from Redis
  if (redis) {
    try {
      const now = Math.floor(Date.now() / 1000);

      for (const [window, seconds] of Object.entries(WINDOWS)) {
        const windowStart = now - (now % seconds);
        const key = `wa:rate:account:${accountId}:${window}:${windowStart}`;
        const count = await redis.get(key);

        status.limits[`per_${window}`] = {
          current: parseInt(count) || 0,
          limit: RATE_LIMITS.account[`per${window.charAt(0).toUpperCase() + window.slice(1)}`] || 0,
        };
      }
    } catch (error) {
      logger.warn(`Failed to get rate limit status: ${error.message}`);
    }
  }

  return status;
}

/**
 * Clean up old rate limit records from SQLite
 * @param {number} hoursToKeep - Hours to retain (default: 24)
 * @returns {number} Rows deleted
 */
function cleanupOldRecords(hoursToKeep = 24) {
  try {
    const db = getDatabase();
    const result = db.prepare(`
      DELETE FROM whatsapp_rate_limits
      WHERE created_at < datetime('now', '-${hoursToKeep} hours')
    `).run();

    if (result.changes > 0) {
      logger.debug(`Cleaned up ${result.changes} old rate limit records`);
    }

    return result.changes;

  } catch (error) {
    logger.warn(`Rate limit cleanup failed: ${error.message}`);
    return 0;
  }
}

module.exports = {
  checkWhatsAppRateLimit,
  getRateLimitStatus,
  cleanupOldRecords,
  RateLimitError,
  RATE_LIMITS,
  WINDOWS,
};
