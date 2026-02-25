/**
 * Mobile Agent Gateway
 * ====================
 * Manages WebSocket connections from Mobile Agent (Android app).
 *
 * Uses a dedicated Socket.io namespace (/mobile-agent) with API key auth.
 * Completely separate from LocalAgentGateway (desktop CLI agents).
 *
 * Events pushed by the app: heartbeat, mobile:events, mobile:device-status, command:result
 * Events sent to the app: heartbeat:ack, command, config:update, revoked
 * Events broadcast to dashboard: mobile-agent:online, mobile-agent:offline, mobile-agent:event-received
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

// Config
const HEARTBEAT_CHECK_INTERVAL_MS = 30 * 1000;
const HEARTBEAT_STALE_THRESHOLD_MS = 45 * 1000;
const APPROVED_KEY_TTL_MS = 5 * 60 * 1000;
const MAX_EVENTS_PER_BATCH = 50;
const MAX_EVENTS_PER_MINUTE = 200;
const DEDUP_WINDOW_MS = 5000;

// Keywords that mark an SMS/notification as important
const IMPORTANT_KEYWORDS = /\b(otp|verification|verify|urgent|bank|security|code|password|pin|auth|2fa|mfa)\b/i;

class MobileAgentGateway {
  constructor() {
    this._io = null;
    this._namespace = null;
    this._connectedAgents = new Map();  // agentId → { socket, userId, lastHeartbeat, deviceStatus }
    this._pendingCommands = new Map();  // commandId → { resolve, reject, timeout }
    this._approvedKeys = new Map();     // pairingId → { apiKey, expiresAt }
    this._rateLimits = new Map();       // agentId → { count, resetAt }
    this._recentEvents = new Map();     // dedupKey → timestamp
    this._heartbeatInterval = null;
    this._dedupCleanupInterval = null;
    this._initialized = false;
  }

  _ensureAlertsTable() {
    try {
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS mobile_alerts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          agentic_id TEXT,
          alert_type TEXT NOT NULL CHECK(alert_type IN (
            'approval_needed','task_completed','critical_error',
            'budget_warning','budget_exceeded','daily_report',
            'schedule_alert','reminder','custom','test'
          )),
          title TEXT NOT NULL,
          body TEXT,
          priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
          action_url TEXT,
          reference_type TEXT,
          reference_id TEXT,
          delivery_status TEXT DEFAULT 'pending' CHECK(delivery_status IN ('pending','delivered','failed')),
          delivered_to TEXT DEFAULT '[]',
          read_at TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_ma_user ON mobile_alerts(user_id);
        CREATE INDEX IF NOT EXISTS idx_ma_unread ON mobile_alerts(user_id, read_at);
        CREATE INDEX IF NOT EXISTS idx_ma_type ON mobile_alerts(alert_type);
      `);
    } catch (e) {
      if (!e.message.includes('already exists')) {
        logger.error(`[MobileAgentGateway] Failed to ensure mobile_alerts table: ${e.message}`);
      }
    }
  }

  /**
   * Initialize the gateway with Socket.io server
   * @param {import('socket.io').Server} io
   */
  initialize(io) {
    if (this._initialized) return;

    this._io = io;
    this._namespace = io.of('/mobile-agent');

    // Ensure mobile_alerts table exists (safe if already created by migration)
    this._ensureAlertsTable();

    // Auth middleware
    this._namespace.use(this._authMiddleware.bind(this));

    // Connection handler
    this._namespace.on('connection', this._onConnect.bind(this));

    // Start heartbeat checker
    this._startHeartbeatCheck();

    // Start dedup cleanup (every 30s)
    this._dedupCleanupInterval = setInterval(() => {
      const cutoff = Date.now() - DEDUP_WINDOW_MS;
      for (const [key, ts] of this._recentEvents) {
        if (ts < cutoff) this._recentEvents.delete(key);
      }
    }, 30000);

    this._initialized = true;
    logger.info('[MobileAgentGateway] Initialized on /mobile-agent namespace');
  }

  // ============================================
  // Auth
  // ============================================

  _authMiddleware(socket, next) {
    const apiKey = socket.handshake.auth?.apiKey;

    if (!apiKey || !apiKey.startsWith('sma_')) {
      return next(new Error('Invalid API key'));
    }

    try {
      const db = getDatabase();
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const agent = db.prepare(
        "SELECT id, user_id, name, status FROM mobile_agents WHERE api_key_hash = ? AND status = 'active'"
      ).get(keyHash);

      if (!agent) {
        return next(new Error('API key not found or agent revoked'));
      }

      socket.agentId = agent.id;
      socket.userId = agent.user_id;
      socket.agentName = agent.name;

      next();
    } catch (error) {
      logger.error(`[MobileAgentGateway] Auth error: ${error.message}`);
      next(new Error('Authentication failed'));
    }
  }

  // ============================================
  // Connection Handling
  // ============================================

  _onConnect(socket) {
    const { agentId, userId, agentName } = socket;

    // Disconnect existing connection for this agent
    const existing = this._connectedAgents.get(agentId);
    if (existing) {
      logger.info(`[MobileAgentGateway] Replacing connection for mobile agent ${agentId}`);
      existing.socket.disconnect(true);
    }

    // Register
    this._connectedAgents.set(agentId, {
      socket,
      userId,
      lastHeartbeat: Date.now(),
      deviceStatus: null,
    });

    // Update DB
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE mobile_agents
        SET is_online = 1, last_connected_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(agentId);
    } catch (e) {
      logger.error(`[MobileAgentGateway] DB update on connect failed: ${e.message}`);
    }

    logger.info(`[MobileAgentGateway] Mobile agent connected: ${agentName} (${agentId})`);

    // Broadcast to dashboard
    if (this._io) {
      this._io.of('/').emit('mobile-agent:online', { agentId, name: agentName, userId });
    }

    // Deliver any pending alerts to this newly connected device
    this.deliverPendingAlerts(agentId, userId);

    // Register event handlers
    socket.on('heartbeat', (data) => this._onHeartbeat(agentId, data));
    socket.on('mobile:events', (data) => this._onMobileEvents(agentId, userId, data));
    socket.on('mobile:device-status', (data) => this._onDeviceStatus(agentId, userId, data));
    socket.on('command:result', (data) => this._onCommandResult(data));
    socket.on('disconnect', (reason) => this._onDisconnect(agentId, userId, agentName, reason));
  }

  // ============================================
  // Event Handlers
  // ============================================

  _onHeartbeat(agentId, data) {
    const entry = this._connectedAgents.get(agentId);
    if (entry) {
      entry.lastHeartbeat = Date.now();

      // Update health metrics if provided
      if (data?.metrics) {
        entry.deviceStatus = { ...entry.deviceStatus, ...data.metrics, updatedAt: Date.now() };

        // Persist to DB periodically (not every heartbeat)
        try {
          const db = getDatabase();
          db.prepare(`
            UPDATE mobile_agents
            SET last_heartbeat_at = datetime('now'), health_metrics = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(JSON.stringify(data.metrics), agentId);
        } catch (e) {
          logger.debug(`[MobileAgentGateway] Heartbeat DB update failed: ${e.message}`);
        }
      }
    }

    // Acknowledge
    const socket = entry?.socket;
    if (socket) {
      socket.emit('heartbeat:ack', { timestamp: new Date().toISOString() });
    }
  }

  _onMobileEvents(agentId, userId, data) {
    if (!data?.events || !Array.isArray(data.events)) return;

    // Rate limit check
    if (!this._checkRateLimit(agentId)) {
      logger.warn(`[MobileAgentGateway] Rate limit exceeded for mobile agent ${agentId}`);
      return;
    }

    // Cap batch size
    const events = data.events.slice(0, MAX_EVENTS_PER_BATCH);
    const db = getDatabase();
    let insertedCount = 0;

    const insertStmt = db.prepare(`
      INSERT INTO mobile_events (id, mobile_agent_id, user_id, event_type, source_app, sender, title, body, metadata, is_important, device_timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const validEventTypes = new Set([
      'sms_received', 'sms_sent', 'notification', 'battery_status',
      'device_status', 'call_missed', 'call_incoming', 'connectivity_change',
      'location_update'
    ]);

    for (const evt of events) {
      try {
        // Validate event type
        if (!evt.eventType || !validEventTypes.has(evt.eventType)) continue;

        // Dedup check
        const dedupKey = `${agentId}:${evt.eventType}:${evt.sender || ''}:${evt.deviceTimestamp || ''}`;
        if (this._recentEvents.has(dedupKey)) continue;
        this._recentEvents.set(dedupKey, Date.now());

        // Auto-importance detection
        const isImportant = this._detectImportance(evt);

        const eventId = uuidv4();
        insertStmt.run(
          eventId,
          agentId,
          userId,
          evt.eventType,
          evt.sourceApp || null,
          evt.sender || null,
          evt.title || null,
          evt.body || null,
          JSON.stringify(evt.metadata || {}),
          isImportant ? 1 : 0,
          evt.deviceTimestamp || null
        );
        insertedCount++;
      } catch (e) {
        logger.debug(`[MobileAgentGateway] Event insert failed: ${e.message}`);
      }
    }

    if (insertedCount > 0) {
      logger.debug(`[MobileAgentGateway] Stored ${insertedCount} events from mobile agent ${agentId}`);

      // Broadcast to dashboard
      if (this._io) {
        const agent = this._connectedAgents.get(agentId);
        this._io.of('/').emit('mobile-agent:event-received', {
          agentId,
          deviceName: agent?.socket?.agentName || 'Unknown',
          count: insertedCount,
          latestEventType: events[events.length - 1]?.eventType,
          userId,
        });
      }
    }
  }

  _onDeviceStatus(agentId, userId, data) {
    if (!data) return;

    const entry = this._connectedAgents.get(agentId);
    if (entry) {
      entry.deviceStatus = {
        batteryLevel: data.batteryLevel,
        batteryCharging: data.batteryCharging,
        wifiConnected: data.wifiConnected,
        cellularType: data.cellularType,
        screenOn: data.screenOn,
        storageAvailableMb: data.storageAvailableMb,
        latitude: data.latitude,
        longitude: data.longitude,
        locationAccuracy: data.locationAccuracy,
        locationTimestamp: data.locationTimestamp,
        updatedAt: Date.now(),
      };
    }

    // Also store as event for historical tracking
    try {
      const db = getDatabase();
      const isImportant = this._detectImportance({ eventType: 'device_status', metadata: data });

      db.prepare(`
        INSERT INTO mobile_events (id, mobile_agent_id, user_id, event_type, metadata, is_important, device_timestamp)
        VALUES (?, ?, ?, 'device_status', ?, ?, datetime('now'))
      `).run(uuidv4(), agentId, userId, JSON.stringify(data), isImportant ? 1 : 0);
    } catch (e) {
      logger.debug(`[MobileAgentGateway] Device status event insert failed: ${e.message}`);
    }
  }

  _onCommandResult(data) {
    if (!data?.commandId) return;

    const pending = this._pendingCommands.get(data.commandId);
    if (pending) {
      clearTimeout(pending.timeout);
      this._pendingCommands.delete(data.commandId);

      if (data.error) {
        pending.reject(new Error(data.error));
      } else {
        pending.resolve(data.result || { success: true });
      }
    }
  }

  _onDisconnect(agentId, userId, agentName, reason) {
    this._connectedAgents.delete(agentId);

    // Update DB
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE mobile_agents SET is_online = 0, updated_at = datetime('now') WHERE id = ?
      `).run(agentId);
    } catch (e) {
      logger.error(`[MobileAgentGateway] DB update on disconnect failed: ${e.message}`);
    }

    logger.info(`[MobileAgentGateway] Mobile agent disconnected: ${agentName} (${reason})`);

    // Broadcast to dashboard
    if (this._io) {
      this._io.of('/').emit('mobile-agent:offline', { agentId, userId });
    }
  }

  // ============================================
  // Importance Detection
  // ============================================

  _detectImportance(evt) {
    // Missed calls are always important
    if (evt.eventType === 'call_missed') return true;

    // SMS/notification with important keywords
    if (evt.eventType === 'sms_received' || evt.eventType === 'notification') {
      const text = `${evt.title || ''} ${evt.body || ''}`;
      if (IMPORTANT_KEYWORDS.test(text)) return true;
    }

    // Battery below 15%
    if (evt.eventType === 'battery_status' || evt.eventType === 'device_status') {
      const meta = evt.metadata || {};
      if (typeof meta.batteryLevel === 'number' && meta.batteryLevel < 15) return true;
    }

    // Connectivity lost
    if (evt.eventType === 'connectivity_change') {
      const meta = evt.metadata || {};
      if (!meta.wifiConnected && !meta.cellularConnected) return true;
    }

    return false;
  }

  // ============================================
  // Rate Limiting
  // ============================================

  _checkRateLimit(agentId) {
    const now = Date.now();
    let entry = this._rateLimits.get(agentId);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + 60000 };
      this._rateLimits.set(agentId, entry);
    }

    entry.count++;
    return entry.count <= MAX_EVENTS_PER_MINUTE;
  }

  // ============================================
  // Heartbeat Monitoring
  // ============================================

  _startHeartbeatCheck() {
    this._heartbeatInterval = setInterval(() => {
      const now = Date.now();

      for (const [agentId, entry] of this._connectedAgents) {
        if (now - entry.lastHeartbeat > HEARTBEAT_STALE_THRESHOLD_MS) {
          logger.info(`[MobileAgentGateway] Mobile agent ${agentId} stale — disconnecting`);
          entry.socket.disconnect(true);
          // _onDisconnect will handle cleanup
        }
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);
  }

  // ============================================
  // Command Dispatch
  // ============================================

  /**
   * Send a command to a mobile device
   * @param {string} agentId
   * @param {string} command - e.g. 'send_sms'
   * @param {Object} params
   * @param {number} [timeoutMs=30000]
   * @returns {Promise<Object>}
   */
  sendCommand(agentId, command, params, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const entry = this._connectedAgents.get(agentId);
      if (!entry) {
        return reject(new Error(`Mobile agent ${agentId} is not connected`));
      }

      const commandId = uuidv4();
      const timeout = setTimeout(() => {
        this._pendingCommands.delete(commandId);
        reject(new Error(`Command ${command} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this._pendingCommands.set(commandId, { resolve, reject, timeout });

      entry.socket.emit('command', { commandId, command, params });
      logger.info(`[MobileAgentGateway] Sent command ${command} (${commandId}) to mobile agent ${agentId}`);
    });
  }

  // ============================================
  // Public API Methods
  // ============================================

  isOnline(agentId) {
    return this._connectedAgents.has(agentId);
  }

  getOnlineAgents(userId) {
    const ids = [];
    for (const [agentId, entry] of this._connectedAgents) {
      if (entry.userId === userId) ids.push(agentId);
    }
    return ids;
  }

  getDeviceStatus(agentId) {
    const entry = this._connectedAgents.get(agentId);
    return entry?.deviceStatus || null;
  }

  /**
   * Store a plain-text API key after pairing approval (for app polling)
   */
  storeApprovedKey(pairingId, apiKey) {
    this._approvedKeys.set(pairingId, {
      apiKey,
      expiresAt: Date.now() + APPROVED_KEY_TTL_MS,
    });

    // Auto-cleanup after TTL
    setTimeout(() => {
      this._approvedKeys.delete(pairingId);
    }, APPROVED_KEY_TTL_MS + 1000);
  }

  /**
   * Retrieve and consume the plain-text API key (one-time use)
   */
  consumeApprovedKey(pairingId) {
    const entry = this._approvedKeys.get(pairingId);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this._approvedKeys.delete(pairingId);
      return null;
    }

    this._approvedKeys.delete(pairingId);
    return entry.apiKey;
  }

  // ============================================
  // Push Alerts (Server → Phone)
  // ============================================

  /**
   * Push an alert notification to a user's mobile devices.
   * Stores in mobile_alerts table and emits via socket to online devices.
   *
   * @param {string} userId
   * @param {Object} alertData
   * @param {string} alertData.alertType - e.g. 'approval_needed', 'critical_error', 'custom'
   * @param {string} alertData.title
   * @param {string} [alertData.body]
   * @param {string} [alertData.priority='normal'] - 'low'|'normal'|'high'|'urgent'
   * @param {string} [alertData.agenticId]
   * @param {string} [alertData.actionUrl]
   * @param {string} [alertData.referenceType]
   * @param {string} [alertData.referenceId]
   * @returns {{ alertId: string, deliveredTo: string[], pending: boolean }}
   */
  pushAlert(userId, alertData) {
    const alertId = uuidv4();
    const {
      alertType,
      title,
      body = null,
      priority = 'normal',
      agenticId = null,
      actionUrl = null,
      referenceType = null,
      referenceId = null,
    } = alertData;

    // Store in DB
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO mobile_alerts (id, user_id, agentic_id, alert_type, title, body, priority, action_url, reference_type, reference_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(alertId, userId, agenticId, alertType, title, body, priority, actionUrl, referenceType, referenceId);
    } catch (e) {
      logger.error(`[MobileAgentGateway] Failed to store alert: ${e.message}`);
      return { alertId, deliveredTo: [], pending: true };
    }

    // Build payload for socket emission
    const payload = {
      alertId,
      alertType,
      title,
      body,
      priority,
      referenceType,
      referenceId,
      timestamp: new Date().toISOString(),
    };

    // Find online devices for this user and emit
    const onlineAgents = this.getOnlineAgents(userId);
    const deliveredTo = [];

    for (const agentId of onlineAgents) {
      const entry = this._connectedAgents.get(agentId);
      if (entry?.socket) {
        try {
          entry.socket.emit('mobile:alert', payload);
          deliveredTo.push(agentId);
        } catch (e) {
          logger.debug(`[MobileAgentGateway] Failed to emit alert to ${agentId}: ${e.message}`);
        }
      }
    }

    // Update delivery status in DB
    if (deliveredTo.length > 0) {
      try {
        const db = getDatabase();
        db.prepare(`
          UPDATE mobile_alerts
          SET delivery_status = 'delivered', delivered_to = ?
          WHERE id = ?
        `).run(JSON.stringify(deliveredTo), alertId);
      } catch (e) {
        logger.debug(`[MobileAgentGateway] Failed to update alert delivery status: ${e.message}`);
      }
    }

    const pending = deliveredTo.length === 0;
    logger.info(`[MobileAgentGateway] Alert ${alertId} (${alertType}) → ${deliveredTo.length} device(s)${pending ? ' [pending]' : ''}`);

    return { alertId, deliveredTo, pending };
  }

  /**
   * Deliver pending (undelivered) alerts when a device reconnects.
   * Called from _onConnect().
   *
   * @param {string} agentId - The reconnecting mobile agent
   * @param {string} userId
   */
  deliverPendingAlerts(agentId, userId) {
    try {
      const db = getDatabase();
      const pendingAlerts = db.prepare(`
        SELECT id, alert_type, title, body, priority, reference_type, reference_id, created_at
        FROM mobile_alerts
        WHERE user_id = ? AND delivery_status = 'pending'
          AND created_at > datetime('now', '-24 hours')
        ORDER BY created_at ASC
      `).all(userId);

      if (pendingAlerts.length === 0) return;

      const entry = this._connectedAgents.get(agentId);
      if (!entry?.socket) return;

      let deliveredCount = 0;
      for (const alert of pendingAlerts) {
        try {
          entry.socket.emit('mobile:alert', {
            alertId: alert.id,
            alertType: alert.alert_type,
            title: alert.title,
            body: alert.body,
            priority: alert.priority,
            referenceType: alert.reference_type,
            referenceId: alert.reference_id,
            timestamp: alert.created_at ? alert.created_at.replace(' ', 'T') + 'Z' : new Date().toISOString(),
          });

          // Update delivery status
          const existing = JSON.parse(
            db.prepare('SELECT delivered_to FROM mobile_alerts WHERE id = ?').get(alert.id)?.delivered_to || '[]'
          );
          existing.push(agentId);
          db.prepare(`
            UPDATE mobile_alerts
            SET delivery_status = 'delivered', delivered_to = ?
            WHERE id = ?
          `).run(JSON.stringify(existing), alert.id);

          deliveredCount++;
        } catch (e) {
          logger.debug(`[MobileAgentGateway] Failed to deliver pending alert ${alert.id}: ${e.message}`);
        }
      }

      if (deliveredCount > 0) {
        logger.info(`[MobileAgentGateway] Delivered ${deliveredCount} pending alert(s) to ${agentId}`);
      }
    } catch (e) {
      logger.error(`[MobileAgentGateway] deliverPendingAlerts failed: ${e.message}`);
    }
  }

  // ============================================
  // Shutdown
  // ============================================

  stop() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    if (this._dedupCleanupInterval) {
      clearInterval(this._dedupCleanupInterval);
      this._dedupCleanupInterval = null;
    }

    // Disconnect all mobile agents
    for (const [agentId, entry] of this._connectedAgents) {
      entry.socket.disconnect(true);
    }
    this._connectedAgents.clear();

    // Clear pending commands
    for (const [, pending] of this._pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Gateway shutting down'));
    }
    this._pendingCommands.clear();
    this._approvedKeys.clear();
    this._rateLimits.clear();
    this._recentEvents.clear();

    this._initialized = false;
    logger.info('[MobileAgentGateway] Stopped');
  }
}

// Singleton
let instance = null;

function getMobileAgentGateway() {
  if (!instance) {
    instance = new MobileAgentGateway();
  }
  return instance;
}

module.exports = { MobileAgentGateway, getMobileAgentGateway };
