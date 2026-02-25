/**
 * Webhook Routes
 * HTTP webhook management
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/webhook/http-webhooks
 * List HTTP webhooks
 */
router.get('/http-webhooks', (req, res) => {
  try {
    const db = getDatabase();

    const webhooks = db.prepare(`
      SELECT * FROM http_webhooks
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.user.id);

    res.json({
      webhooks: webhooks.map(w => ({
        ...w,
        config: w.config ? JSON.parse(w.config) : {},
        headers: w.headers ? JSON.parse(w.headers) : {}
      }))
    });

  } catch (error) {
    logger.error(`Failed to list webhooks: ${error.message}`);
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

/**
 * GET /api/webhook/http-webhooks/:id
 * Get webhook details
 */
router.get('/http-webhooks/:id', (req, res) => {
  try {
    const db = getDatabase();

    const webhook = db.prepare('SELECT * FROM http_webhooks WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json({
      webhook: {
        ...webhook,
        config: webhook.config ? JSON.parse(webhook.config) : {},
        headers: webhook.headers ? JSON.parse(webhook.headers) : {}
      }
    });

  } catch (error) {
    logger.error(`Failed to get webhook: ${error.message}`);
    res.status(500).json({ error: 'Failed to get webhook' });
  }
});

/**
 * POST /api/webhook/http-webhooks
 * Create HTTP webhook
 */
router.post('/http-webhooks', (req, res) => {
  try {
    const { name, url, method, headers, config, isActive } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    const db = getDatabase();
    const webhookId = uuidv4();
    const token = crypto.randomBytes(32).toString('hex');

    db.prepare(`
      INSERT INTO http_webhooks (id, user_id, name, url, method, headers, config, token, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      webhookId,
      req.user.id,
      name,
      url,
      method || 'POST',
      JSON.stringify(headers || {}),
      JSON.stringify(config || {}),
      token,
      isActive !== false ? 1 : 0
    );

    const webhook = db.prepare('SELECT * FROM http_webhooks WHERE id = ?').get(webhookId);

    res.status(201).json({
      webhook: {
        ...webhook,
        config: webhook.config ? JSON.parse(webhook.config) : {},
        headers: webhook.headers ? JSON.parse(webhook.headers) : {}
      }
    });

  } catch (error) {
    logger.error(`Failed to create webhook: ${error.message}`);
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

/**
 * PUT /api/webhook/http-webhooks/:id
 * Update webhook
 */
router.put('/http-webhooks/:id', (req, res) => {
  try {
    const db = getDatabase();

    const existing = db.prepare('SELECT id FROM http_webhooks WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const { name, url, method, headers, config, isActive } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (url !== undefined) { updates.push('url = ?'); params.push(url); }
    if (method !== undefined) { updates.push('method = ?'); params.push(method); }
    if (headers !== undefined) { updates.push('headers = ?'); params.push(JSON.stringify(headers)); }
    if (config !== undefined) { updates.push('config = ?'); params.push(JSON.stringify(config)); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(req.params.id);
      db.prepare(`UPDATE http_webhooks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const webhook = db.prepare('SELECT * FROM http_webhooks WHERE id = ?').get(req.params.id);

    res.json({
      webhook: {
        ...webhook,
        config: webhook.config ? JSON.parse(webhook.config) : {},
        headers: webhook.headers ? JSON.parse(webhook.headers) : {}
      }
    });

  } catch (error) {
    logger.error(`Failed to update webhook: ${error.message}`);
    res.status(500).json({ error: 'Failed to update webhook' });
  }
});

/**
 * DELETE /api/webhook/http-webhooks/:id
 * Delete webhook
 */
router.delete('/http-webhooks/:id', (req, res) => {
  try {
    const db = getDatabase();

    const result = db.prepare('DELETE FROM http_webhooks WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json({ message: 'Webhook deleted' });

  } catch (error) {
    logger.error(`Failed to delete webhook: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

/**
 * POST /api/webhook/http-webhooks/:id/regenerate-token
 * Regenerate webhook token
 */
router.post('/http-webhooks/:id/regenerate-token', (req, res) => {
  try {
    const db = getDatabase();
    const newToken = crypto.randomBytes(32).toString('hex');

    const result = db.prepare(`
      UPDATE http_webhooks SET token = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(newToken, req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json({ token: newToken });

  } catch (error) {
    logger.error(`Failed to regenerate token: ${error.message}`);
    res.status(500).json({ error: 'Failed to regenerate token' });
  }
});

/**
 * GET /api/webhook/http-webhooks/:webhookId/logs
 * Get webhook logs
 */
router.get('/http-webhooks/:webhookId/logs', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0 } = req.query;

    const logs = db.prepare(`
      SELECT * FROM webhook_logs
      WHERE webhook_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.params.webhookId, parseInt(limit), parseInt(offset));

    res.json({
      logs: logs.map(l => ({
        ...l,
        request: l.request ? JSON.parse(l.request) : {},
        response: l.response ? JSON.parse(l.response) : {}
      }))
    });

  } catch (error) {
    logger.error(`Failed to get webhook logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to get webhook logs' });
  }
});

module.exports = router;
