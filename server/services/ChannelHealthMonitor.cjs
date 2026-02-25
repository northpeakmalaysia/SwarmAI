/**
 * Channel Health Monitor Service
 * ===============================
 * Phase 3a: Per-platform health monitoring.
 * Phase 3b: Disconnect alerting — notify master via alternative channel.
 *
 * Subscribes to AgentManager events (status_change, error) for real-time tracking.
 * Runs periodic health checks (every 60s) computing per-account health scores.
 * Provides API-ready health summaries for the dashboard.
 *
 * Health score (0-100):
 *   100 = connected, no errors, recent messages flowing
 *   70  = connected but high error rate or stale
 *   40  = disconnected recently or many errors
 *   0   = disconnected, dead, or critical failures
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

// Health check interval (60 seconds)
const HEALTH_CHECK_INTERVAL_MS = 60 * 1000;

// Event retention (7 days)
const EVENT_RETENTION_DAYS = 7;

// Cleanup interval (6 hours)
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Disconnect alert cooldown per account (15 minutes)
const DISCONNECT_ALERT_COOLDOWN_MS = 15 * 60 * 1000;

class ChannelHealthMonitor {
  constructor() {
    this._agentManager = null;
    this._broadcast = null;
    this._healthCheckInterval = null;
    this._cleanupInterval = null;
    this._initialized = false;

    // In-memory health cache (accountId -> healthSnapshot)
    this._healthCache = new Map();

    // Disconnect alert cooldown (accountId -> last alert timestamp)
    this._disconnectAlertCooldown = new Map();
  }

  /**
   * Initialize the health monitor
   * @param {Object} opts
   * @param {Object} opts.agentManager - AgentManager instance
   * @param {Function} opts.broadcast - WebSocket broadcast function
   */
  initialize({ agentManager, broadcast }) {
    if (this._initialized) return;

    this._agentManager = agentManager;
    this._broadcast = broadcast;

    // Ensure database table exists
    this._ensureTable();

    // Subscribe to AgentManager events
    this._subscribeEvents();

    // Start periodic health check
    this._healthCheckInterval = setInterval(() => {
      this._runHealthCheck();
    }, HEALTH_CHECK_INTERVAL_MS);

    // Start periodic cleanup
    this._cleanupInterval = setInterval(() => {
      this._cleanupOldEvents();
    }, CLEANUP_INTERVAL_MS);

    // Run initial health check
    this._runHealthCheck();

    this._initialized = true;
    logger.info('[ChannelHealth] initialized — monitoring platform health every 60s');
  }

  /**
   * Stop the health monitor
   */
  stop() {
    if (this._healthCheckInterval) {
      clearInterval(this._healthCheckInterval);
      this._healthCheckInterval = null;
    }
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this._initialized = false;
    logger.info('[ChannelHealth] stopped');
  }

  // ──────────────────────────────────────────────
  // Database
  // ──────────────────────────────────────────────

  _ensureTable() {
    try {
      const db = getDatabase();

      // Connection events log
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_connection_events (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          old_status TEXT,
          new_status TEXT,
          error_message TEXT,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_pce_account ON platform_connection_events(account_id, created_at)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_pce_type ON platform_connection_events(event_type, created_at)`);

      // Platform health snapshot (computed, updated every check cycle)
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_health (
          account_id TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          agent_id TEXT,
          status TEXT NOT NULL DEFAULT 'unknown',
          health_score INTEGER DEFAULT 0,
          last_message_sent_at TEXT,
          last_message_received_at TEXT,
          last_error TEXT,
          error_count_1h INTEGER DEFAULT 0,
          error_count_24h INTEGER DEFAULT 0,
          uptime_pct_24h REAL DEFAULT 0,
          avg_delivery_latency_ms INTEGER DEFAULT 0,
          dead_letter_count INTEGER DEFAULT 0,
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      logger.debug('[ChannelHealth] tables ensured');
    } catch (err) {
      logger.warn(`[ChannelHealth] table creation warning: ${err.message}`);
    }
  }

  // ──────────────────────────────────────────────
  // Event Subscription
  // ──────────────────────────────────────────────

  _subscribeEvents() {
    if (!this._agentManager) return;

    this._agentManager.on('status_change', (data) => {
      this._onStatusChange(data);
    });

    this._agentManager.on('error', (data) => {
      this._onError(data);
    });

    logger.debug('[ChannelHealth] subscribed to AgentManager events');
  }

  _onStatusChange({ accountId, agentId, status, oldStatus }) {
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO platform_connection_events (id, account_id, event_type, old_status, new_status, created_at)
        VALUES (?, ?, 'status_change', ?, ?, datetime('now'))
      `).run(uuidv4(), accountId, oldStatus || null, status);

      // Update health cache immediately
      const cached = this._healthCache.get(accountId) || {};
      cached.status = status;
      cached.lastStatusChange = new Date().toISOString();
      this._healthCache.set(accountId, cached);

      // Broadcast real-time update
      if (this._broadcast) {
        this._broadcast('platform:health_update', {
          accountId,
          agentId,
          status,
          oldStatus,
          timestamp: new Date().toISOString(),
        });
      }

      // Phase 3b: Disconnect alerting
      if ((status === 'disconnected' || status === 'error') &&
          oldStatus === 'connected') {
        this._handleDisconnect(accountId, agentId, status);
      }

      logger.debug(`[ChannelHealth] status_change: ${accountId} ${oldStatus} → ${status}`);
    } catch (err) {
      logger.warn(`[ChannelHealth] failed to record status_change: ${err.message}`);
    }
  }

  _onError({ accountId, agentId, error }) {
    try {
      const db = getDatabase();
      const errorMsg = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
      db.prepare(`
        INSERT INTO platform_connection_events (id, account_id, event_type, error_message, created_at)
        VALUES (?, ?, 'error', ?, datetime('now'))
      `).run(uuidv4(), accountId, errorMsg);

      logger.debug(`[ChannelHealth] error event: ${accountId} — ${errorMsg?.substring(0, 100)}`);
    } catch (err) {
      logger.warn(`[ChannelHealth] failed to record error: ${err.message}`);
    }
  }

  // ──────────────────────────────────────────────
  // Phase 3b: Disconnect Alerting
  // ──────────────────────────────────────────────

  /**
   * Handle a platform disconnect — notify master via alternative channel.
   * Uses cooldown to prevent alert flooding.
   */
  async _handleDisconnect(accountId, agentId, newStatus) {
    try {
      // Check cooldown
      const lastAlert = this._disconnectAlertCooldown.get(accountId);
      if (lastAlert && (Date.now() - lastAlert) < DISCONNECT_ALERT_COOLDOWN_MS) {
        logger.debug(`[ChannelHealth] disconnect alert skipped (cooldown): ${accountId}`);
        return;
      }

      const db = getDatabase();

      // Get account details (platform, agent name)
      const account = db.prepare(`
        SELECT pa.id, pa.platform, pa.agent_id, pa.user_id, pa.last_error,
               a.name as agent_name
        FROM platform_accounts pa
        LEFT JOIN agents a ON pa.agent_id = a.id
        WHERE pa.id = ?
      `).get(accountId);

      if (!account) return;

      const platformLabel = (account.platform || 'unknown').replace('-', ' ');
      const agentName = account.agent_name || 'Unknown Agent';

      // Find agentic profile linked to this agent (for master notification)
      const profile = db.prepare(`
        SELECT id, user_id, master_contact_id, master_contact_channel
        FROM agentic_profiles
        WHERE agent_id = ? AND user_id = ?
      `).get(account.agent_id, account.user_id);

      if (!profile || !profile.master_contact_id) {
        logger.debug(`[ChannelHealth] no master contact for agent ${agentId}, skipping disconnect alert`);
        return;
      }

      // Check if there are other CONNECTED accounts for this user (for cross-channel alert)
      const otherConnected = db.prepare(`
        SELECT id, platform FROM platform_accounts
        WHERE user_id = ? AND status = 'connected' AND id != ?
      `).all(account.user_id, accountId);

      const statusEmoji = newStatus === 'error' ? '🔴' : '🟡';
      const title = `${platformLabel} Disconnected`;
      const message = `${statusEmoji} Your ${platformLabel} channel (${agentName}) has ${newStatus === 'error' ? 'encountered an error' : 'disconnected'}.\n\n` +
        (account.last_error ? `Error: ${account.last_error}\n\n` : '') +
        (otherConnected.length > 0
          ? `Other active channels: ${otherConnected.map(c => c.platform).join(', ')}`
          : '⚠️ All messaging channels are now offline! Messages will be queued for delivery when reconnected.');

      // Send notification via MasterNotificationService
      try {
        const { masterNotificationService } = require('./agentic/MasterNotificationService.cjs');
        const result = await masterNotificationService.sendNotification({
          agenticId: profile.id,
          userId: account.user_id,
          type: 'critical_error',
          title,
          message,
          priority: otherConnected.length === 0 ? 'urgent' : 'high',
          forceSend: true, // Always send disconnect alerts regardless of notification preferences
        });

        if (result.success) {
          logger.info(`[ChannelHealth] disconnect alert sent for ${accountId} (${platformLabel})`);
        } else {
          logger.warn(`[ChannelHealth] disconnect alert delivery failed: ${result.error}`);
        }
      } catch (notifErr) {
        logger.warn(`[ChannelHealth] disconnect alert failed: ${notifErr.message}`);
      }

      // Set cooldown
      this._disconnectAlertCooldown.set(accountId, Date.now());

      // If ALL channels are down, log a critical warning
      if (otherConnected.length === 0) {
        logger.warn(`[ChannelHealth] ⚠️ ALL channels offline for user ${account.user_id} — messages will queue in DLQ`);
      }

    } catch (err) {
      logger.warn(`[ChannelHealth] _handleDisconnect failed: ${err.message}`);
    }
  }

  // ──────────────────────────────────────────────
  // Periodic Health Check
  // ──────────────────────────────────────────────

  _runHealthCheck() {
    try {
      const db = getDatabase();

      // Get all platform accounts
      const accounts = db.prepare(`
        SELECT id, user_id, agent_id, platform, status, last_connected_at, last_error, error_count
        FROM platform_accounts
      `).all();

      for (const acct of accounts) {
        const health = this._computeHealth(db, acct);

        // Upsert into platform_health
        db.prepare(`
          INSERT INTO platform_health
            (account_id, platform, agent_id, status, health_score,
             last_message_sent_at, last_message_received_at, last_error,
             error_count_1h, error_count_24h, uptime_pct_24h,
             avg_delivery_latency_ms, dead_letter_count, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(account_id) DO UPDATE SET
            platform = excluded.platform,
            agent_id = excluded.agent_id,
            status = excluded.status,
            health_score = excluded.health_score,
            last_message_sent_at = excluded.last_message_sent_at,
            last_message_received_at = excluded.last_message_received_at,
            last_error = excluded.last_error,
            error_count_1h = excluded.error_count_1h,
            error_count_24h = excluded.error_count_24h,
            uptime_pct_24h = excluded.uptime_pct_24h,
            avg_delivery_latency_ms = excluded.avg_delivery_latency_ms,
            dead_letter_count = excluded.dead_letter_count,
            updated_at = datetime('now')
        `).run(
          acct.id,
          acct.platform,
          acct.agent_id || null,
          health.status,
          health.score,
          health.lastMessageSentAt,
          health.lastMessageReceivedAt,
          health.lastError,
          health.errorCount1h,
          health.errorCount24h,
          health.uptimePct24h,
          health.avgDeliveryLatencyMs,
          health.deadLetterCount
        );

        // Update in-memory cache
        this._healthCache.set(acct.id, {
          ...health,
          accountId: acct.id,
          platform: acct.platform,
          agentId: acct.agent_id,
          updatedAt: new Date().toISOString(),
        });
      }

      // Broadcast aggregated health status via WebSocket
      if (this._broadcast && accounts.length > 0) {
        this._broadcast('platform:health_summary', {
          accounts: accounts.length,
          healthy: [...this._healthCache.values()].filter(h => h.score >= 70).length,
          degraded: [...this._healthCache.values()].filter(h => h.score >= 40 && h.score < 70).length,
          critical: [...this._healthCache.values()].filter(h => h.score < 40).length,
          timestamp: new Date().toISOString(),
        });
      }

    } catch (err) {
      logger.warn(`[ChannelHealth] health check failed: ${err.message}`);
    }
  }

  /**
   * Compute health for a single platform account.
   * @returns {{ score, status, ... }}
   */
  _computeHealth(db, acct) {
    const result = {
      status: acct.status || 'unknown',
      score: 0,
      lastMessageSentAt: null,
      lastMessageReceivedAt: null,
      lastError: acct.last_error || null,
      errorCount1h: 0,
      errorCount24h: 0,
      uptimePct24h: 0,
      avgDeliveryLatencyMs: 0,
      deadLetterCount: 0,
    };

    // --- Error counts from connection events ---
    try {
      const err1h = db.prepare(`
        SELECT COUNT(*) as cnt FROM platform_connection_events
        WHERE account_id = ? AND event_type = 'error'
          AND created_at > datetime('now', '-1 hour')
      `).get(acct.id);
      result.errorCount1h = err1h?.cnt || 0;

      const err24h = db.prepare(`
        SELECT COUNT(*) as cnt FROM platform_connection_events
        WHERE account_id = ? AND event_type = 'error'
          AND created_at > datetime('now', '-24 hours')
      `).get(acct.id);
      result.errorCount24h = err24h?.cnt || 0;
    } catch (_) {}

    // --- Last message timestamps from platform_metrics ---
    try {
      const lastSent = db.prepare(`
        SELECT created_at FROM platform_metrics
        WHERE account_id = ? AND metric_type = 'message_sent'
        ORDER BY created_at DESC LIMIT 1
      `).get(acct.id);
      result.lastMessageSentAt = lastSent?.created_at || null;

      const lastRecv = db.prepare(`
        SELECT created_at FROM platform_metrics
        WHERE account_id = ? AND metric_type = 'message_received'
        ORDER BY created_at DESC LIMIT 1
      `).get(acct.id);
      result.lastMessageReceivedAt = lastRecv?.created_at || null;
    } catch (_) {}

    // --- Average delivery latency (from delivery_queue sent items, last 24h) ---
    try {
      const latency = db.prepare(`
        SELECT AVG(
          CAST((julianday(updated_at) - julianday(created_at)) * 86400000 AS INTEGER)
        ) as avg_ms
        FROM delivery_queue
        WHERE account_id = ? AND status = 'sent'
          AND created_at > datetime('now', '-24 hours')
      `).get(acct.id);
      result.avgDeliveryLatencyMs = Math.round(latency?.avg_ms || 0);
    } catch (_) {}

    // --- Dead letter count ---
    try {
      const dead = db.prepare(`
        SELECT COUNT(*) as cnt FROM delivery_queue
        WHERE account_id = ? AND status = 'dead'
      `).get(acct.id);
      result.deadLetterCount = dead?.cnt || 0;
    } catch (_) {}

    // --- Uptime percentage (24h) ---
    // Count status_change events to estimate connected time
    try {
      const events = db.prepare(`
        SELECT new_status, created_at FROM platform_connection_events
        WHERE account_id = ? AND event_type = 'status_change'
          AND created_at > datetime('now', '-24 hours')
        ORDER BY created_at ASC
      `).all(acct.id);

      if (events.length > 0) {
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        let connectedMs = 0;
        let lastConnectedStart = null;

        // Assume initial state from first event's old status (or disconnected)
        for (const evt of events) {
          const evtTime = new Date(evt.created_at + 'Z');
          if (evt.new_status === 'connected') {
            lastConnectedStart = evtTime;
          } else if (lastConnectedStart) {
            connectedMs += evtTime.getTime() - lastConnectedStart.getTime();
            lastConnectedStart = null;
          }
        }
        // If still connected, count up to now
        if (lastConnectedStart) {
          connectedMs += now.getTime() - lastConnectedStart.getTime();
        }

        const totalMs = now.getTime() - dayAgo.getTime();
        result.uptimePct24h = Math.min(100, Math.round((connectedMs / totalMs) * 10000) / 100);
      } else {
        // No events — if currently connected, assume 100%; otherwise 0%
        result.uptimePct24h = acct.status === 'connected' ? 100 : 0;
      }
    } catch (_) {}

    // --- Compute health score ---
    result.score = this._calculateScore(result, acct);

    return result;
  }

  /**
   * Calculate health score (0-100) based on multiple factors.
   */
  _calculateScore(health, acct) {
    let score = 0;

    // Connection status (0-40 points)
    switch (acct.status) {
      case 'connected': score += 40; break;
      case 'connecting':
      case 'qr_pending': score += 20; break;
      case 'error': score += 5; break;
      case 'disconnected':
      default: score += 0; break;
    }

    // Error rate (0-20 points) — fewer errors = higher
    if (health.errorCount1h === 0) {
      score += 20;
    } else if (health.errorCount1h <= 2) {
      score += 15;
    } else if (health.errorCount1h <= 5) {
      score += 10;
    } else if (health.errorCount1h <= 10) {
      score += 5;
    }

    // Message freshness (0-20 points) — recent activity = healthier
    const lastActivity = health.lastMessageSentAt || health.lastMessageReceivedAt;
    if (lastActivity) {
      const ageMs = Date.now() - new Date(lastActivity + 'Z').getTime();
      const ageHours = ageMs / (60 * 60 * 1000);
      if (ageHours < 1) score += 20;
      else if (ageHours < 6) score += 15;
      else if (ageHours < 24) score += 10;
      else if (ageHours < 72) score += 5;
    } else if (acct.status === 'connected') {
      // No messages yet but account is connected — give partial credit
      // (new account, not unhealthy, just unused)
      score += 10;
    }

    // Dead letters (0-10 points) — no dead letters = healthy
    if (health.deadLetterCount === 0) {
      score += 10;
    } else if (health.deadLetterCount <= 3) {
      score += 5;
    }

    // Uptime (0-10 points)
    if (health.uptimePct24h >= 95) score += 10;
    else if (health.uptimePct24h >= 80) score += 7;
    else if (health.uptimePct24h >= 50) score += 4;

    return Math.min(100, Math.max(0, score));
  }

  // ──────────────────────────────────────────────
  // Cleanup
  // ──────────────────────────────────────────────

  _cleanupOldEvents() {
    try {
      const db = getDatabase();
      const result = db.prepare(`
        DELETE FROM platform_connection_events
        WHERE created_at < datetime('now', '-${EVENT_RETENTION_DAYS} days')
      `).run();
      if (result.changes > 0) {
        logger.info(`[ChannelHealth] cleaned up ${result.changes} old connection events`);
      }
    } catch (err) {
      logger.warn(`[ChannelHealth] cleanup failed: ${err.message}`);
    }
  }

  // ──────────────────────────────────────────────
  // Public API Methods
  // ──────────────────────────────────────────────

  /**
   * Get health summary for all platform accounts.
   * @param {string} [userId] - Filter by user ID (multi-tenant isolation)
   * @returns {Array} Health snapshots
   */
  getAllHealth(userId) {
    try {
      const db = getDatabase();
      let query = `
        SELECT
          ph.*,
          pa.user_id,
          a.name as agent_name
        FROM platform_health ph
        LEFT JOIN platform_accounts pa ON ph.account_id = pa.id
        LEFT JOIN agents a ON ph.agent_id = a.id
      `;
      const params = [];
      if (userId) {
        query += ` WHERE pa.user_id = ?`;
        params.push(userId);
      }
      query += ` ORDER BY ph.health_score ASC`;

      const rows = db.prepare(query).all(...params);
      return rows.map(r => this._transformHealthRow(r));
    } catch (err) {
      logger.warn(`[ChannelHealth] getAllHealth failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get health for a specific account.
   * @param {string} accountId
   * @param {string} [userId] - Filter by user ID (multi-tenant isolation)
   * @returns {Object|null}
   */
  getAccountHealth(accountId, userId) {
    try {
      const db = getDatabase();
      let query = `
        SELECT
          ph.*,
          pa.user_id,
          a.name as agent_name
        FROM platform_health ph
        LEFT JOIN platform_accounts pa ON ph.account_id = pa.id
        LEFT JOIN agents a ON ph.agent_id = a.id
        WHERE ph.account_id = ?
      `;
      const params = [accountId];
      if (userId) {
        query += ` AND pa.user_id = ?`;
        params.push(userId);
      }

      const row = db.prepare(query).get(...params);
      return row ? this._transformHealthRow(row) : null;
    } catch (err) {
      logger.warn(`[ChannelHealth] getAccountHealth failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Get recent connection events for an account.
   * @param {string} accountId
   * @param {number} limit
   * @param {string} [userId] - Filter by user ID (multi-tenant isolation)
   * @returns {Array}
   */
  getAccountEvents(accountId, limit = 50, userId) {
    try {
      const db = getDatabase();

      // Verify account belongs to user if userId provided
      if (userId) {
        const owner = db.prepare(`SELECT user_id FROM platform_accounts WHERE id = ?`).get(accountId);
        if (!owner || owner.user_id !== userId) return [];
      }

      return db.prepare(`
        SELECT * FROM platform_connection_events
        WHERE account_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(accountId, limit);
    } catch (err) {
      logger.warn(`[ChannelHealth] getAccountEvents failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get aggregate health summary (for dashboard overview).
   * @param {string} [userId] - Filter by user ID (multi-tenant isolation)
   * @returns {Object}
   */
  getHealthSummary(userId) {
    try {
      const db = getDatabase();

      // Base query joins platform_accounts to filter by user_id
      const whereClause = userId
        ? `WHERE pa.user_id = ?`
        : '';
      const params = userId ? [userId] : [];

      const total = db.prepare(`
        SELECT COUNT(*) as cnt FROM platform_health ph
        LEFT JOIN platform_accounts pa ON ph.account_id = pa.id
        ${whereClause}
      `).get(...params);

      const healthy = db.prepare(`
        SELECT COUNT(*) as cnt FROM platform_health ph
        LEFT JOIN platform_accounts pa ON ph.account_id = pa.id
        ${whereClause}${userId ? ' AND' : 'WHERE'} ph.health_score >= 70
      `).get(...params);

      const degraded = db.prepare(`
        SELECT COUNT(*) as cnt FROM platform_health ph
        LEFT JOIN platform_accounts pa ON ph.account_id = pa.id
        ${whereClause}${userId ? ' AND' : 'WHERE'} ph.health_score >= 40 AND ph.health_score < 70
      `).get(...params);

      const critical = db.prepare(`
        SELECT COUNT(*) as cnt FROM platform_health ph
        LEFT JOIN platform_accounts pa ON ph.account_id = pa.id
        ${whereClause}${userId ? ' AND' : 'WHERE'} ph.health_score < 40
      `).get(...params);

      // Per-platform breakdown
      const byPlatform = db.prepare(`
        SELECT
          ph.platform,
          COUNT(*) as total,
          SUM(CASE WHEN ph.health_score >= 70 THEN 1 ELSE 0 END) as healthy,
          SUM(CASE WHEN ph.health_score >= 40 AND ph.health_score < 70 THEN 1 ELSE 0 END) as degraded,
          SUM(CASE WHEN ph.health_score < 40 THEN 1 ELSE 0 END) as critical,
          ROUND(AVG(ph.health_score), 1) as avg_score
        FROM platform_health ph
        LEFT JOIN platform_accounts pa ON ph.account_id = pa.id
        ${whereClause}
        GROUP BY ph.platform
      `).all(...params);

      return {
        total: total?.cnt || 0,
        healthy: healthy?.cnt || 0,
        degraded: degraded?.cnt || 0,
        critical: critical?.cnt || 0,
        byPlatform,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      logger.warn(`[ChannelHealth] getHealthSummary failed: ${err.message}`);
      return { total: 0, healthy: 0, degraded: 0, critical: 0, byPlatform: [] };
    }
  }

  _transformHealthRow(r) {
    return {
      accountId: r.account_id,
      platform: r.platform,
      agentId: r.agent_id,
      agentName: r.agent_name || null,
      userId: r.user_id || null,
      status: r.status,
      healthScore: r.health_score,
      lastMessageSentAt: r.last_message_sent_at,
      lastMessageReceivedAt: r.last_message_received_at,
      lastError: r.last_error,
      errorCount1h: r.error_count_1h,
      errorCount24h: r.error_count_24h,
      uptimePct24h: r.uptime_pct_24h,
      avgDeliveryLatencyMs: r.avg_delivery_latency_ms,
      deadLetterCount: r.dead_letter_count,
      updatedAt: r.updated_at,
    };
  }
}

// Singleton
let instance = null;

function getChannelHealthMonitor() {
  if (!instance) {
    instance = new ChannelHealthMonitor();
  }
  return instance;
}

module.exports = { ChannelHealthMonitor, getChannelHealthMonitor };
