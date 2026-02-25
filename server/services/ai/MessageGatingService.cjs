/**
 * Message Gating Service
 * ======================
 * Multi-layer pre-processing gates that run BEFORE messages reach the AI.
 * Prevents echo storms, group spam, rate-limit floods, and empty messages.
 *
 * Gate order:
 *   1. Echo Gate - reject bot's own messages bouncing back
 *   2. Group Allowlist Gate - reject group messages not in allowlist
 *   3. Mention Gate - in allowed groups, require @mention or direct reply
 *   4. Rate Limit Gate - per-sender rate limiting
 *   5. Content Gate - reject empty or too-short messages
 *
 * Usage:
 *   const { getMessageGatingService } = require('./MessageGatingService.cjs');
 *   const gating = getMessageGatingService();
 *   const result = await gating.evaluate(message, context);
 *   if (!result.pass) { // message blocked by gate }
 */

const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');

// Lazy-load Redis
let _redisClient = null;
function getRedisClientSafe() {
  if (_redisClient === undefined) return null;
  if (_redisClient) return _redisClient;
  try {
    const { getRedisClient } = require('../redis.cjs');
    _redisClient = getRedisClient();
    return _redisClient;
  } catch (e) {
    _redisClient = undefined;
    return null;
  }
}

class MessageGatingService {
  constructor() {
    this.gates = ['echo', 'groupAllowlist', 'mention', 'rateLimit', 'content'];
    this.configCache = new Map(); // userId -> { config, ts }
    this.CONFIG_CACHE_TTL = 60000; // 1 minute
  }

  /**
   * Evaluate all gates for a message.
   * @param {Object} message - Unified message object
   * @param {Object} context - Processing context { userId, agentId, accountId }
   * @returns {Promise<{ pass: boolean, gate?: string, reason?: string }>}
   */
  async evaluate(message, context) {
    const config = this.getConfig(context.userId);

    for (const gate of this.gates) {
      const methodName = `check_${gate}`;
      if (typeof this[methodName] !== 'function') continue;

      try {
        const result = await this[methodName](message, context, config);
        if (!result.pass) {
          logger.debug(`[Gating] Message blocked by ${gate} gate: ${result.reason}`);
          return { pass: false, gate, reason: result.reason };
        }
      } catch (e) {
        logger.warn(`[Gating] Gate '${gate}' error: ${e.message}`);
        // Gate errors = pass (fail-open)
      }
    }

    return { pass: true };
  }

  /**
   * Get gating config for a user (cached).
   * @private
   */
  getConfig(userId) {
    // Check cache
    const cached = this.configCache.get(userId);
    if (cached && Date.now() - cached.ts < this.CONFIG_CACHE_TTL) {
      return cached.config;
    }

    // Default config (used when no DB row exists)
    const defaults = {
      echo_enabled: 1,
      group_allowlist_enabled: 1,
      mention_gate_enabled: 1,
      rate_limit_enabled: 1,
      rate_limit_max: 10,
      rate_limit_window_seconds: 60,
      content_min_length: 3,
      content_block_media_only: 0,
      bot_identifiers: '[]',
    };

    try {
      const db = getDatabase();
      const row = db.prepare('SELECT * FROM message_gating_config WHERE user_id = ?').get(userId);
      const config = row || defaults;
      this.configCache.set(userId, { config, ts: Date.now() });
      return config;
    } catch (e) {
      // Table may not exist yet
      return defaults;
    }
  }

  // =====================================================
  // GATE 1: Echo Detection
  // =====================================================

  /**
   * Detect bot's own messages bouncing back.
   */
  check_echo(message, context, config) {
    if (!config.echo_enabled) return { pass: true };

    // Check fromMe flag (WhatsApp Web.js sets this)
    if (message.fromMe === true) {
      return { pass: false, reason: 'echo:fromMe' };
    }

    // Check against known bot identifiers
    let botIds = [];
    try {
      botIds = JSON.parse(config.bot_identifiers || '[]');
    } catch (e) { /* ignore */ }

    if (botIds.length > 0) {
      const senderId = (message.from || message.sender?.id || '').toLowerCase();
      for (const botId of botIds) {
        if (senderId.includes(botId.toLowerCase())) {
          return { pass: false, reason: `echo:bot_identifier:${botId}` };
        }
      }
    }

    return { pass: true };
  }

  // =====================================================
  // GATE 2: Group Allowlist
  // =====================================================

  /**
   * For group messages, only allow if group is in allowlist.
   */
  check_groupAllowlist(message, context, config) {
    if (!config.group_allowlist_enabled) return { pass: true };

    // Only applies to group messages
    const isGroup = message.isGroup || (message.from || '').includes('@g.us');
    if (!isGroup) return { pass: true };

    const groupId = message.groupId || message.from;
    const platform = message.platform || 'unknown';

    try {
      const db = getDatabase();
      const allowed = db.prepare(`
        SELECT id FROM message_gating_group_allowlist
        WHERE user_id = ? AND group_id = ? AND platform = ?
      `).get(context.userId, groupId, platform);

      if (!allowed) {
        return { pass: false, reason: `group_not_in_allowlist:${groupId}` };
      }

      // Store allowlist data for mention gate
      message._gating_group_allowlist = db.prepare(`
        SELECT bot_names FROM message_gating_group_allowlist
        WHERE user_id = ? AND group_id = ? AND platform = ?
      `).get(context.userId, groupId, platform);

      return { pass: true };
    } catch (e) {
      // Table may not exist - pass by default
      return { pass: true };
    }
  }

  // =====================================================
  // GATE 3: Mention Detection (for groups)
  // =====================================================

  /**
   * In allowed groups, only process messages that @mention the bot.
   */
  check_mention(message, context, config) {
    if (!config.mention_gate_enabled) return { pass: true };

    // Only applies to group messages
    const isGroup = message.isGroup || (message.from || '').includes('@g.us');
    if (!isGroup) return { pass: true };

    const content = (message.content || message.text || '').toLowerCase();

    // Check if message mentions the bot
    let botNames = [];
    try {
      const allowlistData = message._gating_group_allowlist;
      if (allowlistData?.bot_names) {
        botNames = JSON.parse(allowlistData.bot_names);
      }
    } catch (e) { /* ignore */ }

    // Also check general bot identifiers
    try {
      const generalBotIds = JSON.parse(config.bot_identifiers || '[]');
      botNames = [...botNames, ...generalBotIds];
    } catch (e) { /* ignore */ }

    // If no bot names configured, pass all group messages
    if (botNames.length === 0) return { pass: true };

    // Check for @mention
    for (const name of botNames) {
      if (content.includes(`@${name.toLowerCase()}`)) {
        return { pass: true };
      }
      if (content.includes(name.toLowerCase())) {
        return { pass: true };
      }
    }

    // Check if message is a direct reply to the bot (platform-specific metadata)
    if (message.metadata?.quotedMessage?.fromMe || message.metadata?.isReplyToBot) {
      return { pass: true };
    }

    return { pass: false, reason: 'group_no_mention' };
  }

  // =====================================================
  // GATE 4: Rate Limiting
  // =====================================================

  /**
   * Per-sender rate limiting via Redis.
   */
  async check_rateLimit(message, context, config) {
    if (!config.rate_limit_enabled) return { pass: true };

    const redis = getRedisClientSafe();
    if (!redis) return { pass: true }; // No Redis = no rate limiting

    const senderId = message.from || message.sender?.id || 'unknown';
    const key = `gate:rate:${context.userId}:${senderId}`;
    const maxMessages = config.rate_limit_max || 10;
    const windowSeconds = config.rate_limit_window_seconds || 60;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (count > maxMessages) {
        return { pass: false, reason: `rate_limit:${count}/${maxMessages} in ${windowSeconds}s` };
      }

      return { pass: true };
    } catch (e) {
      return { pass: true }; // Redis error = fail-open
    }
  }

  // =====================================================
  // GATE 5: Content Filtering
  // =====================================================

  /**
   * Block empty, too-short, or media-only messages.
   */
  check_content(message, context, config) {
    const content = (message.content || message.text || '').trim();
    const contentType = message.contentType || message.content_type || 'text';
    const minLength = config.content_min_length || 3;

    // Block empty messages
    if (!content && contentType === 'text') {
      return { pass: false, reason: 'content_empty' };
    }

    // Block too-short text messages
    if (content && content.length < minLength && contentType === 'text') {
      return { pass: false, reason: `content_too_short:${content.length}<${minLength}` };
    }

    // Optionally block media-only messages
    if (config.content_block_media_only && !content && contentType !== 'text') {
      return { pass: false, reason: `content_media_only:${contentType}` };
    }

    return { pass: true };
  }
}

// Singleton
let _instance = null;
function getMessageGatingService() {
  if (!_instance) {
    _instance = new MessageGatingService();
  }
  return _instance;
}

module.exports = {
  MessageGatingService,
  getMessageGatingService,
};
