/**
 * Athena Personal Assistant API Routes
 * ======================================
 * Endpoints for managing and monitoring the Athena agent.
 */

const express = require('express');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { getAthenaMonitorService } = require('../services/agentic/AthenaMonitorService.cjs');

const router = express.Router();

// Auth middleware - support both JWT and test bypass token
const { authenticate } = require('./auth.cjs');
router.use(authenticate);

// =====================================================
// GET /api/athena/status - Get Athena's current status
// =====================================================
router.get('/status', (req, res) => {
  try {
    const athena = getAthenaMonitorService();
    const status = athena.getStatus();

    const db = getDatabase();

    // Get response agents with details
    const responseAgents = [];
    for (const agentId of status.responseAgentIds) {
      const agent = db.prepare('SELECT id, name, status FROM agents WHERE id = ?').get(agentId);
      if (agent) {
        const platforms = db.prepare(`
          SELECT id, platform, status FROM platform_accounts WHERE agent_id = ?
        `).all(agentId);
        responseAgents.push({
          agentId: agent.id,
          agentName: agent.name,
          agentStatus: agent.status,
          platforms: platforms.map(p => ({
            accountId: p.id,
            platform: p.platform,
            status: p.status,
          })),
        });
      }
    }

    // Get notification count for today
    let todayNotifications = 0;
    if (status.profileId) {
      try {
        todayNotifications = db.prepare(`
          SELECT COUNT(*) as count FROM agentic_master_notifications
          WHERE agentic_id = ? AND created_at > datetime('now', '-1 day')
        `).get(status.profileId)?.count || 0;
      } catch (e) { /* table might not exist */ }
    }

    res.json({
      ...status,
      responseAgents,
      todayNotifications,
    });
  } catch (error) {
    logger.error(`Athena status error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/athena/enable - Enable Athena monitoring
// =====================================================
router.post('/enable', async (req, res) => {
  try {
    const athena = getAthenaMonitorService();
    await athena.setEnabled(true);
    res.json({ success: true, message: 'Athena monitoring enabled' });
  } catch (error) {
    logger.error(`Athena enable error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/athena/disable - Disable Athena monitoring
// =====================================================
router.post('/disable', async (req, res) => {
  try {
    const athena = getAthenaMonitorService();
    await athena.setEnabled(false);
    res.json({ success: true, message: 'Athena monitoring disabled' });
  } catch (error) {
    logger.error(`Athena disable error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// PUT /api/athena/config - Update Athena configuration
// =====================================================
router.put('/config', async (req, res) => {
  try {
    const athena = getAthenaMonitorService();
    const db = getDatabase();
    const { responseAgentIds, notifyOn, healthCheckIntervalMinutes, batchIntervalSeconds, dailyCap } = req.body;

    if (!athena.athenaProfile) {
      return res.status(404).json({ error: 'Athena profile not found' });
    }

    const updates = [];
    const params = [];

    if (responseAgentIds !== undefined) {
      updates.push('response_agent_ids = ?');
      params.push(JSON.stringify(responseAgentIds));
    }
    if (notifyOn !== undefined) {
      updates.push('notify_master_on = ?');
      params.push(JSON.stringify(notifyOn));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(athena.athenaProfile.id);
      db.prepare(`UPDATE agentic_profiles SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    // Update runtime settings
    if (healthCheckIntervalMinutes) {
      athena.healthCheckIntervalMs = healthCheckIntervalMinutes * 60000;
    }
    if (batchIntervalSeconds) {
      athena.batchIntervalMs = batchIntervalSeconds * 1000;
    }
    if (dailyCap) {
      athena.dailyCap = dailyCap;
    }

    // Rebuild ignore list if response agents changed
    if (responseAgentIds !== undefined) {
      athena.athenaProfile.response_agent_ids = JSON.stringify(responseAgentIds);
      await athena.buildIgnoreList();
      await athena.setupWhatsAppClient();
    }

    res.json({ success: true, message: 'Configuration updated' });
  } catch (error) {
    logger.error(`Athena config error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/athena/test-notification - Send test message
// =====================================================
router.post('/test-notification', async (req, res) => {
  try {
    const athena = getAthenaMonitorService();
    const result = await athena.sendNotificationDirect({
      type: 'test',
      title: 'Athena Test Notification',
      message: `This is a test notification from Athena Personal Assistant.\n\nTime: ${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}`,
      priority: 'normal',
    });

    res.json({
      success: result?.success || false,
      message: result?.success ? 'Test notification sent' : `Failed: ${result?.error || 'Unknown error'}`,
      result,
    });
  } catch (error) {
    logger.error(`Athena test notification error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/athena/health-report - Trigger health report
// =====================================================
router.post('/health-report', async (req, res) => {
  try {
    const athena = getAthenaMonitorService();
    await athena.sendHealthSummary();
    res.json({ success: true, message: 'Health report sent' });
  } catch (error) {
    logger.error(`Athena health report error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// GET /api/athena/notifications - Get notification history
// =====================================================
router.get('/notifications', (req, res) => {
  try {
    const athena = getAthenaMonitorService();
    if (!athena.athenaProfile) {
      return res.status(404).json({ error: 'Athena profile not found' });
    }

    const db = getDatabase();
    const { limit = 50, offset = 0, type } = req.query;

    let query = `
      SELECT * FROM agentic_master_notifications
      WHERE agentic_id = ?
    `;
    const params = [athena.athenaProfile.id];

    if (type) {
      query += ' AND notification_type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const notifications = db.prepare(query).all(...params);
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_master_notifications WHERE agentic_id = ?
    `).get(athena.athenaProfile.id)?.count || 0;

    res.json({
      notifications: notifications.map(n => {
        const ctx = JSON.parse(n.context || '{}');
        return {
          id: n.id,
          type: n.notification_type,
          title: n.title,
          message: n.content,
          priority: ctx.priority || 'normal',
          channel: n.channel,
          status: n.delivery_status,
          deliveryStatus: n.delivery_status,
          deliveredAt: n.delivered_at ? n.delivered_at + 'Z' : null,
          createdAt: n.created_at ? n.created_at + 'Z' : null,
        };
      }),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    logger.error(`Athena notifications error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
