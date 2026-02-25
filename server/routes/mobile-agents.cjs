/**
 * Mobile Agent Routes
 *
 * Manages mobile phone pairing, device management, and event queries.
 * Completely separate from Local Agent routes (desktop CLI).
 *
 * Public routes (no auth — used by mobile app):
 *   GET  /verify                        - App verifies valid SwarmAI server
 *   POST /pair/register-code            - App requests 6-digit pairing code
 *   GET  /pair/status/:id               - App polls for pairing result
 *
 * Protected routes (JWT — dashboard):
 *   GET  /pair/pending                  - List pending pairing requests
 *   POST /pair/validate                 - User enters code to pair device
 *   GET  /devices                       - List paired mobile devices
 *   GET  /devices/:id                   - Get single device details
 *   DELETE /devices/:id                 - Unpair (revoke) a device
 *   PUT  /devices/:id/config            - Update push filters
 *   GET  /events                        - Query mobile events
 *   GET  /events/summary                - Event counts by type
 *   POST /devices/:id/command           - Send command to device
 */

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const { getMobileAgentGateway } = require('../services/MobileAgentGateway.cjs');

const router = express.Router();

// ============================================
// Helpers
// ============================================

function generateApiKey() {
  const raw = crypto.randomBytes(24).toString('hex'); // 48 hex chars
  return `sma_${raw}`; // sma_ = swarm mobile agent (distinct from sla_ for local agents)
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function generatePairingCode() {
  // 6-digit numeric code (100000-999999)
  return String(100000 + crypto.randomInt(900000));
}

// Simple in-memory rate limiter
const rateLimits = new Map(); // key → { count, resetAt }

function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  let entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimits.set(key, entry);
  }
  entry.count++;
  return entry.count <= maxRequests;
}

// Cleanup rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(key);
  }
}, 5 * 60 * 1000);

// ============================================
// PUBLIC ROUTES (no auth — used by mobile app)
// ============================================

/**
 * GET /api/mobile-agents/verify
 * App verifies this is a valid SwarmAI server
 */
router.get('/verify', (req, res) => {
  res.json({
    valid: true,
    serverName: 'SwarmAI',
    version: process.env.npm_package_version || '1.0.0',
    features: ['sms', 'notifications', 'device_status', 'gps', 'commands'],
  });
});

/**
 * POST /api/mobile-agents/pair/register-code
 * App sends device info, gets 6-digit pairing code
 */
router.post('/pair/register-code', (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(`pair-register:${ip}`, 5, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many pairing requests. Try again later.' });
    }

    const { deviceName, deviceModel, deviceManufacturer, androidVersion, appVersion, phoneNumber } = req.body;

    if (!deviceName || typeof deviceName !== 'string' || deviceName.length > 100) {
      return res.status(400).json({ error: 'deviceName is required and must be under 100 characters' });
    }

    const db = getDatabase();
    const id = uuidv4();
    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min
    const serverUrl = req.headers.origin || req.headers.host || '';

    db.prepare(`
      INSERT INTO mobile_pairing_codes (id, code, device_name, device_info, phone_number, server_url, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      code,
      deviceName,
      JSON.stringify({
        model: deviceModel || '',
        manufacturer: deviceManufacturer || '',
        androidVersion: androidVersion || '',
        appVersion: appVersion || '',
      }),
      phoneNumber || null,
      serverUrl,
      expiresAt
    );

    logger.info(`[MobileAgent] Pairing code ${code} created for "${deviceName}" (id: ${id})`);

    res.json({ id, code, expiresAt });
  } catch (error) {
    logger.error(`[MobileAgent] register-code failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to create pairing code' });
  }
});

/**
 * GET /api/mobile-agents/pair/status/:id
 * App polls for pairing result
 */
router.get('/pair/status/:id', (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(`pair-status:${ip}`, 60, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const db = getDatabase();
    const record = db.prepare(
      'SELECT id, status, mobile_agent_id, expires_at FROM mobile_pairing_codes WHERE id = ?'
    ).get(req.params.id);

    if (!record) {
      return res.status(404).json({ error: 'Pairing session not found' });
    }

    // Check expiry
    if (new Date(record.expires_at) < new Date() && record.status === 'pending') {
      db.prepare("UPDATE mobile_pairing_codes SET status = 'expired' WHERE id = ?").run(record.id);
      return res.json({ status: 'expired' });
    }

    const response = { status: record.status };

    // If paired, try to retrieve the API key from gateway memory
    if (record.status === 'paired' && record.mobile_agent_id) {
      const gateway = getMobileAgentGateway();
      const apiKey = gateway.consumeApprovedKey(record.id);

      if (apiKey) {
        response.apiKey = apiKey;
        response.agentId = record.mobile_agent_id;

        // Mark as consumed so key is not retrievable again
        db.prepare("UPDATE mobile_pairing_codes SET status = 'consumed' WHERE id = ?").run(record.id);
      } else {
        // Key already consumed or expired
        response.agentId = record.mobile_agent_id;
        response.keyConsumed = true;
      }
    }

    res.json(response);
  } catch (error) {
    logger.error(`[MobileAgent] pair/status failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to check pairing status' });
  }
});

// ============================================
// PROTECTED ROUTES (JWT auth — dashboard)
// ============================================

/**
 * GET /api/mobile-agents/pair/pending
 * List pending pairing codes (for dashboard notification)
 */
router.get('/pair/pending', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const pending = db.prepare(`
      SELECT id, code, device_name, device_info, phone_number, expires_at, created_at
      FROM mobile_pairing_codes
      WHERE status = 'pending' AND expires_at > datetime('now')
      ORDER BY created_at DESC
    `).all();

    res.json({ pairingRequests: pending.map(p => ({
      ...p,
      device_info: JSON.parse(p.device_info || '{}'),
    }))});
  } catch (error) {
    logger.error(`[MobileAgent] pair/pending failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to list pending pairings' });
  }
});

/**
 * POST /api/mobile-agents/pair/validate
 * Dashboard user enters 6-digit code to pair device
 */
router.post('/pair/validate', authenticate, (req, res) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return res.status(400).json({ error: 'code must be a 6-digit string' });
    }

    // Rate limit validation attempts
    if (!checkRateLimit(`pair-validate:${userId}`, 10, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many validation attempts. Try again later.' });
    }

    const db = getDatabase();

    // Find matching pending code
    const pairingRecord = db.prepare(`
      SELECT * FROM mobile_pairing_codes
      WHERE code = ? AND status = 'pending' AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).get(code);

    if (!pairingRecord) {
      return res.status(404).json({ error: 'Invalid or expired pairing code' });
    }

    // Parse device info
    const deviceInfo = JSON.parse(pairingRecord.device_info || '{}');

    // Generate API key
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const apiKeyPrefix = apiKey.substring(0, 12); // "sla_a1b2c3d4"

    // Create mobile_agents row
    const agentId = uuidv4();
    db.prepare(`
      INSERT INTO mobile_agents (id, user_id, name, api_key_hash, api_key_prefix, phone_number, device_model, device_manufacturer, os_version, app_version, capabilities)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agentId,
      userId,
      pairingRecord.device_name,
      apiKeyHash,
      apiKeyPrefix,
      pairingRecord.phone_number || null,
      deviceInfo.model || null,
      deviceInfo.manufacturer || null,
      deviceInfo.androidVersion || null,
      deviceInfo.appVersion || null,
      JSON.stringify(['push_sms', 'push_notifications', 'push_device_status', 'push_gps', 'send_sms'])
    );

    // Update pairing record
    db.prepare(`
      UPDATE mobile_pairing_codes
      SET status = 'paired', user_id = ?, mobile_agent_id = ?, api_key_hash = ?, api_key_prefix = ?
      WHERE id = ?
    `).run(userId, agentId, apiKeyHash, apiKeyPrefix, pairingRecord.id);

    // Store API key in gateway for app polling
    const gateway = getMobileAgentGateway();
    gateway.storeApprovedKey(pairingRecord.id, apiKey);

    logger.info(`[MobileAgent] Device "${pairingRecord.device_name}" paired to user ${userId} (agent: ${agentId})`);

    res.json({
      success: true,
      agent: {
        id: agentId,
        name: pairingRecord.device_name,
        deviceModel: deviceInfo.model,
        deviceManufacturer: deviceInfo.manufacturer,
      },
    });
  } catch (error) {
    logger.error(`[MobileAgent] pair/validate failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to validate pairing code' });
  }
});

/**
 * GET /api/mobile-agents/devices
 * List user's paired mobile devices
 */
router.get('/devices', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const gateway = getMobileAgentGateway();

    const devices = db.prepare(`
      SELECT id, name, phone_number, device_model, device_manufacturer, os_version, app_version,
             is_online, last_connected_at, last_heartbeat_at, health_metrics, push_config,
             capabilities, status, created_at, updated_at
      FROM mobile_agents
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `).all(req.user.id);

    const result = devices.map(d => ({
      ...d,
      health_metrics: JSON.parse(d.health_metrics || '{}'),
      push_config: JSON.parse(d.push_config || '{}'),
      capabilities: JSON.parse(d.capabilities || '[]'),
      isOnline: gateway.isOnline(d.id),
      deviceStatus: gateway.getDeviceStatus(d.id),
    }));

    res.json({ devices: result });
  } catch (error) {
    logger.error(`[MobileAgent] devices list failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to list devices' });
  }
});

/**
 * GET /api/mobile-agents/devices/:id
 * Get single device details
 */
router.get('/devices/:id', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const gateway = getMobileAgentGateway();

    const device = db.prepare(`
      SELECT * FROM mobile_agents WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({
      ...device,
      health_metrics: JSON.parse(device.health_metrics || '{}'),
      push_config: JSON.parse(device.push_config || '{}'),
      capabilities: JSON.parse(device.capabilities || '[]'),
      isOnline: gateway.isOnline(device.id),
      deviceStatus: gateway.getDeviceStatus(device.id),
    });
  } catch (error) {
    logger.error(`[MobileAgent] device get failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to get device' });
  }
});

/**
 * DELETE /api/mobile-agents/devices/:id
 * Unpair (revoke) a device
 */
router.delete('/devices/:id', authenticate, (req, res) => {
  try {
    const db = getDatabase();

    const device = db.prepare(
      "SELECT id, name FROM mobile_agents WHERE id = ? AND user_id = ? AND status = 'active'"
    ).get(req.params.id, req.user.id);

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Revoke (soft delete)
    db.prepare(`
      UPDATE mobile_agents SET status = 'revoked', is_online = 0, updated_at = datetime('now') WHERE id = ?
    `).run(device.id);

    // Disconnect if online
    const gateway = getMobileAgentGateway();
    if (gateway.isOnline(device.id)) {
      const entry = gateway._connectedAgents.get(device.id);
      if (entry) {
        entry.socket.emit('revoked', { reason: 'Device unpaired by user' });
        entry.socket.disconnect(true);
      }
    }

    logger.info(`[MobileAgent] Device "${device.name}" (${device.id}) revoked`);
    res.json({ success: true });
  } catch (error) {
    logger.error(`[MobileAgent] device revoke failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to unpair device' });
  }
});

/**
 * PUT /api/mobile-agents/devices/:id/config
 * Update push notification filters
 */
router.put('/devices/:id/config', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const device = db.prepare(
      "SELECT id FROM mobile_agents WHERE id = ? AND user_id = ? AND status = 'active'"
    ).get(req.params.id, req.user.id);

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const pushConfig = req.body;
    db.prepare(`
      UPDATE mobile_agents SET push_config = ?, updated_at = datetime('now') WHERE id = ?
    `).run(JSON.stringify(pushConfig), device.id);

    // Push config update to device if online
    const gateway = getMobileAgentGateway();
    if (gateway.isOnline(device.id)) {
      const entry = gateway._connectedAgents.get(device.id);
      if (entry) {
        entry.socket.emit('config:update', { pushConfig });
      }
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`[MobileAgent] config update failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

/**
 * GET /api/mobile-agents/events
 * Query mobile events (for dashboard and AI tools)
 */
router.get('/events', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;
    const {
      eventType,
      sender,
      search,
      since,
      limit = '20',
      importantOnly,
      deviceId,
    } = req.query;

    const conditions = ['me.user_id = ?'];
    const params = [userId];

    if (eventType) {
      conditions.push('me.event_type = ?');
      params.push(eventType);
    }

    if (sender) {
      conditions.push('me.sender LIKE ?');
      params.push(`%${sender}%`);
    }

    if (search) {
      conditions.push('(me.title LIKE ? OR me.body LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (since) {
      conditions.push('me.created_at > ?');
      params.push(since);
    } else {
      // Default: last 24h
      conditions.push("me.created_at > datetime('now', '-1 day')");
    }

    if (importantOnly === 'true') {
      conditions.push('me.is_important = 1');
    }

    if (deviceId) {
      conditions.push('me.mobile_agent_id = ?');
      params.push(deviceId);
    }

    const maxLimit = Math.min(parseInt(limit) || 20, 100);
    params.push(maxLimit);

    const events = db.prepare(`
      SELECT me.*, ma.name as device_name
      FROM mobile_events me
      LEFT JOIN mobile_agents ma ON me.mobile_agent_id = ma.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY me.created_at DESC
      LIMIT ?
    `).all(...params);

    res.json({
      events: events.map(e => ({
        ...e,
        metadata: JSON.parse(e.metadata || '{}'),
        created_at: e.created_at ? e.created_at.replace(' ', 'T') + 'Z' : null,
      })),
    });
  } catch (error) {
    logger.error(`[MobileAgent] events query failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to query events' });
  }
});

/**
 * GET /api/mobile-agents/events/summary
 * Event counts by type for dashboard
 */
router.get('/events/summary', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const since = req.query.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const counts = db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM mobile_events
      WHERE user_id = ? AND created_at > ?
      GROUP BY event_type
    `).all(req.user.id, since);

    const summary = {};
    for (const row of counts) {
      summary[row.event_type] = row.count;
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM mobile_events
      WHERE user_id = ? AND created_at > ?
    `).get(req.user.id, since);

    const important = db.prepare(`
      SELECT COUNT(*) as count FROM mobile_events
      WHERE user_id = ? AND is_important = 1 AND created_at > ?
    `).get(req.user.id, since);

    res.json({
      total: total.count,
      important: important.count,
      byType: summary,
      since,
    });
  } catch (error) {
    logger.error(`[MobileAgent] events summary failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to get event summary' });
  }
});

/**
 * POST /api/mobile-agents/devices/:id/command
 * Send command to mobile device (e.g. send_sms)
 */
router.post('/devices/:id/command', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const device = db.prepare(
      "SELECT id, name FROM mobile_agents WHERE id = ? AND user_id = ? AND status = 'active'"
    ).get(req.params.id, req.user.id);

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const gateway = getMobileAgentGateway();
    if (!gateway.isOnline(device.id)) {
      return res.status(409).json({ error: 'Device is offline' });
    }

    const { command, params } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }

    const result = await gateway.sendCommand(device.id, command, params || {});
    res.json({ success: true, result });
  } catch (error) {
    logger.error(`[MobileAgent] command failed: ${error.message}`);
    res.status(500).json({ error: error.message || 'Command failed' });
  }
});

// ============================================
// ALERT ENDPOINTS (server → phone notifications)
// ============================================

/**
 * GET /api/mobile-agents/alerts
 * Query alert history with optional filters
 */
router.get('/alerts', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;
    const { alertType, unreadOnly, limit = '50', offset = '0' } = req.query;

    const conditions = ['user_id = ?'];
    const params = [userId];

    if (alertType) {
      conditions.push('alert_type = ?');
      params.push(alertType);
    }

    if (unreadOnly === 'true') {
      conditions.push('read_at IS NULL');
    }

    const maxLimit = Math.min(parseInt(limit) || 50, 100);
    const safeOffset = parseInt(offset) || 0;

    const alerts = db.prepare(`
      SELECT * FROM mobile_alerts
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, maxLimit, safeOffset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM mobile_alerts
      WHERE ${conditions.join(' AND ')}
    `).get(...params).count;

    const unreadCount = db.prepare(`
      SELECT COUNT(*) as count FROM mobile_alerts
      WHERE user_id = ? AND read_at IS NULL
    `).get(userId).count;

    res.json({
      alerts: alerts.map(a => ({
        ...a,
        delivered_to: JSON.parse(a.delivered_to || '[]'),
        created_at: a.created_at ? a.created_at.replace(' ', 'T') + 'Z' : null,
        read_at: a.read_at ? a.read_at.replace(' ', 'T') + 'Z' : null,
      })),
      total,
      unreadCount,
    });
  } catch (error) {
    logger.error(`[MobileAgent] alerts query failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to query alerts' });
  }
});

/**
 * POST /api/mobile-agents/alerts/mark-read
 * Mark alerts as read (by IDs or all)
 */
router.post('/alerts/mark-read', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;
    const { alertIds, all } = req.body;

    let result;
    if (all === true) {
      result = db.prepare(`
        UPDATE mobile_alerts SET read_at = datetime('now')
        WHERE user_id = ? AND read_at IS NULL
      `).run(userId);
    } else if (Array.isArray(alertIds) && alertIds.length > 0) {
      const placeholders = alertIds.map(() => '?').join(',');
      result = db.prepare(`
        UPDATE mobile_alerts SET read_at = datetime('now')
        WHERE id IN (${placeholders}) AND user_id = ?
      `).run(...alertIds, userId);
    } else {
      return res.status(400).json({ error: 'Provide alertIds array or set all: true' });
    }

    res.json({ success: true, updatedCount: result.changes });
  } catch (error) {
    logger.error(`[MobileAgent] mark-read failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to mark alerts as read' });
  }
});

/**
 * POST /api/mobile-agents/alerts/test
 * Send a test notification to connected devices
 */
router.post('/alerts/test', authenticate, (req, res) => {
  try {
    const gateway = getMobileAgentGateway();
    const result = gateway.pushAlert(req.user.id, {
      alertType: 'test',
      title: 'Test Notification',
      body: 'This is a test notification from SwarmAI. If you see this on your phone, push notifications are working!',
      priority: 'high',
    });

    res.json({
      success: true,
      alertId: result.alertId,
      deliveredTo: result.deliveredTo,
      pending: result.pending,
      message: result.pending
        ? 'No mobile devices online. Alert saved and will be delivered when a device connects.'
        : `Alert delivered to ${result.deliveredTo.length} device(s).`,
    });
  } catch (error) {
    logger.error(`[MobileAgent] test alert failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to send test alert' });
  }
});

module.exports = router;
