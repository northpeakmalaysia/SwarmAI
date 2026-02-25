/**
 * Rate Limit Service
 * Handles tiered rate limiting for AI API calls
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

// Rate limit tier configurations
const RATE_LIMIT_TIERS = {
  free: {
    name: 'Free',
    limits: {
      minute: 10,
      hour: 100,
      day: 500
    },
    monthlyBudget: 5.00,
    description: 'Free tier with basic limits'
  },
  basic: {
    name: 'Basic',
    limits: {
      minute: 30,
      hour: 500,
      day: 5000
    },
    monthlyBudget: 50.00,
    description: 'Basic tier for regular users'
  },
  pro: {
    name: 'Pro',
    limits: {
      minute: 100,
      hour: 2000,
      day: 20000
    },
    monthlyBudget: 200.00,
    description: 'Pro tier for power users'
  },
  enterprise: {
    name: 'Enterprise',
    limits: {
      minute: 500,
      hour: 10000,
      day: 100000
    },
    monthlyBudget: 1000.00,
    description: 'Enterprise tier with high limits'
  }
};

/**
 * Get or create rate limit record for user
 * @param {string} userId - User ID
 * @returns {Object} Rate limit record
 */
function getOrCreateUsage(userId) {
  const db = getDatabase();

  let usage = db.prepare('SELECT * FROM rate_limit_usage WHERE user_id = ?').get(userId);

  if (!usage) {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Get user's tier from users table
    const user = db.prepare('SELECT rate_limit_tier FROM users WHERE id = ?').get(userId);
    const tier = user?.rate_limit_tier || 'free';

    db.prepare(`
      INSERT INTO rate_limit_usage (
        id, user_id, tier, minute_count, minute_reset_at,
        hour_count, hour_reset_at, day_count, day_reset_at,
        month_cost, month_reset_at
      ) VALUES (?, ?, ?, 0, ?, 0, ?, 0, ?, 0, ?)
    `).run(id, userId, tier, now, now, now, now);

    usage = db.prepare('SELECT * FROM rate_limit_usage WHERE user_id = ?').get(userId);
  }

  return usage;
}

/**
 * Check if counters need reset based on time windows
 * @param {Object} usage - Current usage record
 * @returns {Object} Updated usage with reset flags
 */
function checkAndResetCounters(usage) {
  const db = getDatabase();
  const now = new Date();
  const updates = [];
  const params = [];

  // Check minute reset (1 minute window)
  if (new Date(usage.minute_reset_at) <= now) {
    updates.push('minute_count = 0', "minute_reset_at = datetime('now', '+1 minute')");
    usage.minute_count = 0;
  }

  // Check hour reset (1 hour window)
  if (new Date(usage.hour_reset_at) <= now) {
    updates.push('hour_count = 0', "hour_reset_at = datetime('now', '+1 hour')");
    usage.hour_count = 0;
  }

  // Check day reset (24 hour window)
  if (new Date(usage.day_reset_at) <= now) {
    updates.push('day_count = 0', "day_reset_at = datetime('now', '+1 day')");
    usage.day_count = 0;
  }

  // Check month reset (30 day window)
  if (new Date(usage.month_reset_at) <= now) {
    updates.push('month_cost = 0', "month_reset_at = datetime('now', '+30 day')");
    usage.month_cost = 0;
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    db.prepare(`UPDATE rate_limit_usage SET ${updates.join(', ')} WHERE user_id = ?`)
      .run(usage.user_id);
  }

  return usage;
}

/**
 * Check if a request would be allowed (without incrementing)
 * @param {string} userId - User ID
 * @returns {Object} { allowed, status }
 */
async function checkRateLimit(userId) {
  let usage = getOrCreateUsage(userId);
  usage = checkAndResetCounters(usage);

  const tier = RATE_LIMIT_TIERS[usage.tier] || RATE_LIMIT_TIERS.free;
  const limits = tier.limits;

  const status = {
    tier: usage.tier,
    limits: {
      minute: { limit: limits.minute, used: usage.minute_count, remaining: limits.minute - usage.minute_count },
      hour: { limit: limits.hour, used: usage.hour_count, remaining: limits.hour - usage.hour_count },
      day: { limit: limits.day, used: usage.day_count, remaining: limits.day - usage.day_count }
    },
    budget: {
      limit: tier.monthlyBudget,
      used: usage.month_cost,
      remaining: tier.monthlyBudget - usage.month_cost
    },
    resetTimes: {
      minute: usage.minute_reset_at,
      hour: usage.hour_reset_at,
      day: usage.day_reset_at,
      month: usage.month_reset_at
    }
  };

  // Check if any limit exceeded
  const allowed =
    usage.minute_count < limits.minute &&
    usage.hour_count < limits.hour &&
    usage.day_count < limits.day &&
    usage.month_cost < tier.monthlyBudget;

  return { allowed, status };
}

/**
 * Increment usage counters
 * @param {string} userId - User ID
 * @param {number} cost - Cost of this request
 * @returns {Object} Updated status
 */
async function incrementUsage(userId, cost = 0) {
  const db = getDatabase();

  let usage = getOrCreateUsage(userId);
  usage = checkAndResetCounters(usage);

  db.prepare(`
    UPDATE rate_limit_usage
    SET minute_count = minute_count + 1,
        hour_count = hour_count + 1,
        day_count = day_count + 1,
        month_cost = month_cost + ?,
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(cost, userId);

  return checkRateLimit(userId);
}

/**
 * Get current rate limit status
 * @param {string} userId - User ID
 * @returns {Object} Status object
 */
async function getStatus(userId) {
  const { status } = await checkRateLimit(userId);
  return status;
}

/**
 * Get rate limit history
 * @param {string} userId - User ID
 * @param {number} days - Number of days of history
 * @returns {Array} History entries
 */
async function getHistory(userId, days = 7) {
  const db = getDatabase();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const history = db.prepare(`
    SELECT * FROM rate_limit_history
    WHERE user_id = ? AND created_at >= ?
    ORDER BY created_at DESC
  `).all(userId, startDate);

  return history.map(h => ({
    ...h,
    requestsCount: h.requests_count,
    tokensUsed: h.tokens_used,
    periodStart: h.period_start,
    periodEnd: h.period_end,
    periodType: h.period_type,
    createdAt: h.created_at
  }));
}

/**
 * Reset rate limits for a user (admin function)
 * @param {string} userId - User ID
 */
async function resetLimits(userId) {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE rate_limit_usage
    SET minute_count = 0, minute_reset_at = datetime('now', '+1 minute'),
        hour_count = 0, hour_reset_at = datetime('now', '+1 hour'),
        day_count = 0, day_reset_at = datetime('now', '+1 day'),
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(userId);

  logger.info(`Rate limits reset for user ${userId}`);
}

/**
 * Set user's rate limit tier (admin function)
 * @param {string} userId - User ID
 * @param {string} tier - New tier
 */
async function setUserTier(userId, tier) {
  if (!RATE_LIMIT_TIERS[tier]) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  const db = getDatabase();

  // Update user's tier
  db.prepare('UPDATE users SET rate_limit_tier = ? WHERE id = ?').run(tier, userId);

  // Update rate limit usage record
  db.prepare(`
    UPDATE rate_limit_usage
    SET tier = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(tier, userId);

  logger.info(`User ${userId} tier updated to ${tier}`);
}

/**
 * Record history entry for analytics
 * @param {string} userId - User ID
 * @param {Object} data - History data
 */
function recordHistory(userId, data) {
  const db = getDatabase();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO rate_limit_history (
      id, user_id, tier, requests_count, tokens_used, cost,
      period_start, period_end, period_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    data.tier,
    data.requestsCount || 0,
    data.tokensUsed || 0,
    data.cost || 0,
    data.periodStart,
    data.periodEnd,
    data.periodType
  );
}

module.exports = {
  RATE_LIMIT_TIERS,
  checkRateLimit,
  incrementUsage,
  getStatus,
  getHistory,
  resetLimits,
  setUserTier,
  recordHistory
};
