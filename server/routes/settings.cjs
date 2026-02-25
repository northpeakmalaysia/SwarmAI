/**
 * Settings Routes
 * User settings and preferences
 */

const express = require('express');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const bcrypt = require('bcryptjs');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/settings
 * Get user settings
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();

    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?')
      .get(req.user.id);

    if (!settings) {
      // Return default settings
      return res.json({
        settings: {
          theme: 'dark',
          language: 'en',
          notifications: {
            email: true,
            push: true,
            inApp: true
          },
          privacy: {
            showOnline: true,
            allowAnalytics: true
          }
        }
      });
    }

    res.json({
      settings: {
        ...settings,
        preferences: settings.preferences ? JSON.parse(settings.preferences) : {},
        notifications: settings.notifications ? JSON.parse(settings.notifications) : {},
        privacy: settings.privacy ? JSON.parse(settings.privacy) : {}
      }
    });

  } catch (error) {
    logger.error(`Failed to get settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * PUT /api/settings
 * Update user settings
 */
router.put('/', (req, res) => {
  try {
    const { theme, language, preferences, notifications, privacy } = req.body;
    const db = getDatabase();

    // Check if settings exist
    const existing = db.prepare('SELECT id FROM user_settings WHERE user_id = ?').get(req.user.id);

    if (existing) {
      const updates = [];
      const params = [];

      if (theme !== undefined) { updates.push('theme = ?'); params.push(theme); }
      if (language !== undefined) { updates.push('language = ?'); params.push(language); }
      if (preferences !== undefined) { updates.push('preferences = ?'); params.push(JSON.stringify(preferences)); }
      if (notifications !== undefined) { updates.push('notifications = ?'); params.push(JSON.stringify(notifications)); }
      if (privacy !== undefined) { updates.push('privacy = ?'); params.push(JSON.stringify(privacy)); }

      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        params.push(req.user.id);
        db.prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...params);
      }
    } else {
      db.prepare(`
        INSERT INTO user_settings (user_id, theme, language, preferences, notifications, privacy)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        req.user.id,
        theme || 'dark',
        language || 'en',
        JSON.stringify(preferences || {}),
        JSON.stringify(notifications || { email: true, push: true, inApp: true }),
        JSON.stringify(privacy || { showOnline: true, allowAnalytics: true })
      );
    }

    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);

    res.json({
      settings: {
        ...settings,
        preferences: settings.preferences ? JSON.parse(settings.preferences) : {},
        notifications: settings.notifications ? JSON.parse(settings.notifications) : {},
        privacy: settings.privacy ? JSON.parse(settings.privacy) : {}
      }
    });

  } catch (error) {
    logger.error(`Failed to update settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * GET /api/settings/profile
 * Get user profile
 */
router.get('/profile', (req, res) => {
  try {
    const db = getDatabase();

    const user = db.prepare(`
      SELECT id, email, name, avatar, role, is_superuser, created_at
      FROM users WHERE id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        isSuperuser: !!user.is_superuser,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    logger.error(`Failed to get profile: ${error.message}`);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * PUT /api/settings/profile
 * Update user profile
 */
router.put('/profile', (req, res) => {
  try {
    const { name, avatar } = req.body;
    const db = getDatabase();

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (avatar !== undefined) { updates.push('avatar = ?'); params.push(avatar); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.user.id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db.prepare('SELECT id, email, name, avatar, role FROM users WHERE id = ?')
      .get(req.user.id);

    res.json({ profile: user });

  } catch (error) {
    logger.error(`Failed to update profile: ${error.message}`);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * PUT /api/settings/password
 * Change password
 */
router.put('/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const db = getDatabase();

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newHash, req.user.id);

    logger.info(`Password changed for user: ${req.user.email}`);

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    logger.error(`Failed to change password: ${error.message}`);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * DELETE /api/settings/account
 * Delete account
 */
router.delete('/account', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete account' });
    }

    const db = getDatabase();

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Delete user data (cascading should handle related records)
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);

    logger.info(`Account deleted: ${req.user.email}`);

    res.json({ message: 'Account deleted successfully' });

  } catch (error) {
    logger.error(`Failed to delete account: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

/**
 * GET /api/settings/api-keys
 * Get user API keys
 */
router.get('/api-keys', (req, res) => {
  try {
    const db = getDatabase();

    const keys = db.prepare(`
      SELECT id, name, key_prefix, last_used_at, created_at
      FROM api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.user.id);

    res.json({ apiKeys: keys });

  } catch (error) {
    logger.error(`Failed to get API keys: ${error.message}`);
    res.status(500).json({ error: 'Failed to get API keys' });
  }
});

/**
 * POST /api/settings/api-keys
 * Create API key
 */
router.post('/api-keys', (req, res) => {
  try {
    const { name } = req.body;
    const crypto = require('crypto');

    const db = getDatabase();
    const keyId = require('uuid').v4();
    const key = `swarm_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = key.substring(0, 12) + '...';

    db.prepare(`
      INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix)
      VALUES (?, ?, ?, ?, ?)
    `).run(keyId, req.user.id, name || 'API Key', crypto.createHash('sha256').update(key).digest('hex'), keyPrefix);

    res.status(201).json({
      apiKey: {
        id: keyId,
        name: name || 'API Key',
        key, // Full key returned only on creation
        keyPrefix
      }
    });

  } catch (error) {
    logger.error(`Failed to create API key: ${error.message}`);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * DELETE /api/settings/api-keys/:keyId
 * Delete API key
 */
router.delete('/api-keys/:keyId', (req, res) => {
  try {
    const db = getDatabase();

    const result = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?')
      .run(req.params.keyId, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({ message: 'API key deleted' });

  } catch (error) {
    logger.error(`Failed to delete API key: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// ============================================
// Data Retention Settings
// ============================================

/**
 * Retention limits by subscription plan
 */
const RETENTION_LIMITS = {
  free: { maxRedisDays: 7, maxSqliteMonths: 1 },
  starter: { maxRedisDays: 30, maxSqliteMonths: 3 },
  pro: { maxRedisDays: 60, maxSqliteMonths: 12 },
  enterprise: { maxRedisDays: 365, maxSqliteMonths: 36 }
};

/**
 * Default retention settings by subscription plan
 */
const RETENTION_DEFAULTS = {
  free: { redisTtlDays: 7, sqliteTtlMonths: 1, autoCleanupEnabled: true },
  starter: { redisTtlDays: 14, sqliteTtlMonths: 3, autoCleanupEnabled: true },
  pro: { redisTtlDays: 30, sqliteTtlMonths: 6, autoCleanupEnabled: true },
  enterprise: { redisTtlDays: 90, sqliteTtlMonths: 12, autoCleanupEnabled: true }
};

/**
 * Get user's subscription plan
 */
function getUserSubscriptionPlan(db, userId) {
  const subscription = db.prepare(`
    SELECT plan FROM subscriptions WHERE user_id = ? AND status = 'active'
  `).get(userId);
  return subscription?.plan || 'free';
}

/**
 * GET /api/settings/data-retention
 * Get data retention settings
 */
router.get('/data-retention', (req, res) => {
  try {
    const db = getDatabase();
    const plan = getUserSubscriptionPlan(db, req.user.id);
    const limits = RETENTION_LIMITS[plan] || RETENTION_LIMITS.free;
    const defaults = RETENTION_DEFAULTS[plan] || RETENTION_DEFAULTS.free;

    // Get user settings
    const userSettings = db.prepare('SELECT preferences FROM user_settings WHERE user_id = ?')
      .get(req.user.id);

    let dataRetention = defaults;
    if (userSettings?.preferences) {
      try {
        const prefs = JSON.parse(userSettings.preferences);
        if (prefs.data_retention) {
          dataRetention = {
            redisTtlDays: Math.min(prefs.data_retention.redisTtlDays || defaults.redisTtlDays, limits.maxRedisDays),
            sqliteTtlMonths: Math.min(prefs.data_retention.sqliteTtlMonths || defaults.sqliteTtlMonths, limits.maxSqliteMonths),
            autoCleanupEnabled: prefs.data_retention.autoCleanupEnabled ?? defaults.autoCleanupEnabled,
            lastCleanupAt: prefs.data_retention.lastCleanupAt || null
          };
        }
      } catch (e) {
        // Invalid JSON, use defaults
      }
    }

    res.json({
      settings: dataRetention,
      limits,
      defaults,
      subscriptionPlan: plan
    });

  } catch (error) {
    logger.error(`Failed to get data retention settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to get data retention settings' });
  }
});

/**
 * PUT /api/settings/data-retention
 * Update data retention settings
 */
router.put('/data-retention', (req, res) => {
  try {
    const { redisTtlDays, sqliteTtlMonths, autoCleanupEnabled } = req.body;
    const db = getDatabase();
    const plan = getUserSubscriptionPlan(db, req.user.id);
    const limits = RETENTION_LIMITS[plan] || RETENTION_LIMITS.free;

    // Validate input
    if (redisTtlDays !== undefined) {
      if (redisTtlDays < 1 || redisTtlDays > 365) {
        return res.status(400).json({ error: 'redisTtlDays must be between 1 and 365' });
      }
      if (redisTtlDays > limits.maxRedisDays) {
        return res.status(400).json({
          error: `Your plan (${plan}) allows maximum ${limits.maxRedisDays} days for Redis TTL`
        });
      }
    }

    if (sqliteTtlMonths !== undefined) {
      if (sqliteTtlMonths < 1 || sqliteTtlMonths > 36) {
        return res.status(400).json({ error: 'sqliteTtlMonths must be between 1 and 36' });
      }
      if (sqliteTtlMonths > limits.maxSqliteMonths) {
        return res.status(400).json({
          error: `Your plan (${plan}) allows maximum ${limits.maxSqliteMonths} months for SQLite TTL`
        });
      }
    }

    // Get or create user settings
    let userSettings = db.prepare('SELECT id, preferences FROM user_settings WHERE user_id = ?')
      .get(req.user.id);

    let preferences = {};
    if (userSettings?.preferences) {
      try {
        preferences = JSON.parse(userSettings.preferences);
      } catch (e) {
        preferences = {};
      }
    }

    // Update data retention in preferences
    const existingRetention = preferences.data_retention || {};
    preferences.data_retention = {
      ...existingRetention,
      ...(redisTtlDays !== undefined && { redisTtlDays }),
      ...(sqliteTtlMonths !== undefined && { sqliteTtlMonths }),
      ...(autoCleanupEnabled !== undefined && { autoCleanupEnabled })
    };

    if (userSettings) {
      db.prepare(`
        UPDATE user_settings
        SET preferences = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(JSON.stringify(preferences), req.user.id);
    } else {
      const { v4: uuidv4 } = require('uuid');
      db.prepare(`
        INSERT INTO user_settings (id, user_id, preferences)
        VALUES (?, ?, ?)
      `).run(uuidv4(), req.user.id, JSON.stringify(preferences));
    }

    const defaults = RETENTION_DEFAULTS[plan] || RETENTION_DEFAULTS.free;

    res.json({
      settings: {
        redisTtlDays: preferences.data_retention.redisTtlDays || defaults.redisTtlDays,
        sqliteTtlMonths: preferences.data_retention.sqliteTtlMonths || defaults.sqliteTtlMonths,
        autoCleanupEnabled: preferences.data_retention.autoCleanupEnabled ?? defaults.autoCleanupEnabled,
        lastCleanupAt: preferences.data_retention.lastCleanupAt || null
      },
      limits,
      defaults,
      subscriptionPlan: plan
    });

  } catch (error) {
    logger.error(`Failed to update data retention settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to update data retention settings' });
  }
});

/**
 * POST /api/settings/data-retention/reset
 * Reset data retention settings to defaults
 */
router.post('/data-retention/reset', (req, res) => {
  try {
    const db = getDatabase();
    const plan = getUserSubscriptionPlan(db, req.user.id);
    const limits = RETENTION_LIMITS[plan] || RETENTION_LIMITS.free;
    const defaults = RETENTION_DEFAULTS[plan] || RETENTION_DEFAULTS.free;

    // Get user settings
    let userSettings = db.prepare('SELECT id, preferences FROM user_settings WHERE user_id = ?')
      .get(req.user.id);

    if (userSettings?.preferences) {
      let preferences = {};
      try {
        preferences = JSON.parse(userSettings.preferences);
      } catch (e) {
        preferences = {};
      }

      // Reset data retention to defaults
      preferences.data_retention = { ...defaults };

      db.prepare(`
        UPDATE user_settings
        SET preferences = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(JSON.stringify(preferences), req.user.id);
    }

    res.json({
      settings: defaults,
      limits,
      defaults,
      subscriptionPlan: plan
    });

  } catch (error) {
    logger.error(`Failed to reset data retention settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to reset data retention settings' });
  }
});

// ============================================
// Webhook Settings
// ============================================

/**
 * Ensure webhook settings tables exist
 */
function ensureWebhookTables() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      enabled INTEGER DEFAULT 0,
      url TEXT,
      secret_hash TEXT,
      events TEXT DEFAULT '[]',
      max_retries INTEGER DEFAULT 3,
      retry_strategy TEXT DEFAULT 'exponential',
      timeout_seconds INTEGER DEFAULT 30,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event TEXT NOT NULL,
      endpoint_url TEXT NOT NULL,
      status INTEGER,
      response_time_ms INTEGER,
      attempt_number INTEGER DEFAULT 1,
      max_attempts INTEGER DEFAULT 3,
      request_payload TEXT,
      response_body TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_webhook_settings_user_id ON webhook_settings(user_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_user_id ON webhook_delivery_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_created_at ON webhook_delivery_logs(created_at);
  `);
}

let webhookTablesEnsured = false;
function ensureWebhookTablesOnce() {
  if (!webhookTablesEnsured) {
    ensureWebhookTables();
    webhookTablesEnsured = true;
  }
}

/**
 * GET /api/settings/webhooks
 * Get webhook configuration
 */
router.get('/webhooks', (req, res) => {
  try {
    ensureWebhookTablesOnce();
    const db = getDatabase();

    const config = db.prepare('SELECT * FROM webhook_settings WHERE user_id = ?')
      .get(req.user.id);

    if (!config) {
      return res.json({
        enabled: false,
        url: null,
        hasSecret: false,
        events: [],
        maxRetries: 3,
        retryStrategy: 'exponential',
        timeoutSeconds: 30
      });
    }

    let events = [];
    try { events = JSON.parse(config.events || '[]'); } catch (e) { events = []; }

    res.json({
      enabled: !!config.enabled,
      url: config.url || null,
      hasSecret: !!config.secret_hash,
      events,
      maxRetries: config.max_retries || 3,
      retryStrategy: config.retry_strategy || 'exponential',
      timeoutSeconds: config.timeout_seconds || 30,
      updatedAt: config.updated_at
    });

  } catch (error) {
    logger.error(`Failed to get webhook config: ${error.message}`);
    res.status(500).json({ error: 'Failed to get webhook configuration' });
  }
});

/**
 * PUT /api/settings/webhooks
 * Update webhook configuration
 */
router.put('/webhooks', (req, res) => {
  try {
    ensureWebhookTablesOnce();
    const { enabled, url, secret, events, maxRetries, retryStrategy, timeoutSeconds } = req.body;
    const db = getDatabase();
    const { v4: uuidv4 } = require('uuid');
    const crypto = require('crypto');

    const existing = db.prepare('SELECT id, secret_hash FROM webhook_settings WHERE user_id = ?')
      .get(req.user.id);

    let secretHash = existing?.secret_hash || null;
    if (secret) {
      secretHash = crypto.createHash('sha256').update(secret).digest('hex');
    }

    const eventsJson = JSON.stringify(events || []);

    if (existing) {
      db.prepare(`
        UPDATE webhook_settings
        SET enabled = ?, url = ?, secret_hash = ?, events = ?,
            max_retries = ?, retry_strategy = ?, timeout_seconds = ?,
            updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        enabled ? 1 : 0,
        url || null,
        secretHash,
        eventsJson,
        maxRetries || 3,
        retryStrategy || 'exponential',
        timeoutSeconds || 30,
        req.user.id
      );
    } else {
      db.prepare(`
        INSERT INTO webhook_settings (id, user_id, enabled, url, secret_hash, events, max_retries, retry_strategy, timeout_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        req.user.id,
        enabled ? 1 : 0,
        url || null,
        secretHash,
        eventsJson,
        maxRetries || 3,
        retryStrategy || 'exponential',
        timeoutSeconds || 30
      );
    }

    let parsedEvents = [];
    try { parsedEvents = JSON.parse(eventsJson); } catch (e) { parsedEvents = []; }

    res.json({
      enabled: !!enabled,
      url: url || null,
      hasSecret: !!secretHash,
      events: parsedEvents,
      maxRetries: maxRetries || 3,
      retryStrategy: retryStrategy || 'exponential',
      timeoutSeconds: timeoutSeconds || 30,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Failed to update webhook config: ${error.message}`);
    res.status(500).json({ error: 'Failed to update webhook configuration' });
  }
});

/**
 * POST /api/settings/webhooks/generate-secret
 * Generate a new webhook secret
 */
router.post('/webhooks/generate-secret', (req, res) => {
  try {
    const crypto = require('crypto');
    const secret = `whsec_${crypto.randomBytes(32).toString('hex')}`;
    res.json({ secret });
  } catch (error) {
    logger.error(`Failed to generate webhook secret: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate secret' });
  }
});

/**
 * POST /api/settings/webhooks/test
 * Send a test webhook to the configured URL
 */
router.post('/webhooks/test', async (req, res) => {
  try {
    ensureWebhookTablesOnce();
    const db = getDatabase();
    const { v4: uuidv4 } = require('uuid');
    const crypto = require('crypto');

    const config = db.prepare('SELECT * FROM webhook_settings WHERE user_id = ?')
      .get(req.user.id);

    if (!config || !config.url) {
      return res.status(400).json({ error: 'No webhook URL configured' });
    }

    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from SwarmAI',
        userId: req.user.id
      }
    };

    const payloadStr = JSON.stringify(testPayload);
    const headers = { 'Content-Type': 'application/json' };

    if (config.secret_hash) {
      // We can't recover the secret from hash, but for test we sign with the hash itself
      // In a real implementation, the raw secret would be stored encrypted
      headers['X-SwarmAI-Signature'] = crypto.createHmac('sha256', config.secret_hash)
        .update(payloadStr).digest('hex');
    }

    const startTime = Date.now();
    let statusCode = null;
    let responseBody = null;
    let errorMessage = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), (config.timeout_seconds || 30) * 1000);

      const response = await fetch(config.url, {
        method: 'POST',
        headers,
        body: payloadStr,
        signal: controller.signal
      });
      clearTimeout(timeout);

      statusCode = response.status;
      try { responseBody = await response.text(); } catch (e) { responseBody = null; }
    } catch (fetchErr) {
      errorMessage = fetchErr.name === 'AbortError' ? 'Request timed out' : fetchErr.message;
    }

    const responseTimeMs = Date.now() - startTime;

    // Log the test delivery
    db.prepare(`
      INSERT INTO webhook_delivery_logs (id, user_id, event, endpoint_url, status, response_time_ms, attempt_number, max_attempts, request_payload, response_body, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), req.user.id, 'test', config.url,
      statusCode, responseTimeMs, 1, 1,
      payloadStr, responseBody, errorMessage
    );

    const success = statusCode && statusCode >= 200 && statusCode < 300;

    res.json({
      success,
      statusCode: statusCode || 0,
      message: success ? 'Test webhook delivered successfully' : (errorMessage || `HTTP ${statusCode}`)
    });

  } catch (error) {
    logger.error(`Failed to test webhook: ${error.message}`);
    res.status(500).json({ error: 'Failed to send test webhook' });
  }
});

/**
 * GET /api/settings/webhooks/logs
 * Get webhook delivery logs
 */
router.get('/webhooks/logs', (req, res) => {
  try {
    ensureWebhookTablesOnce();
    const db = getDatabase();

    const logs = db.prepare(`
      SELECT id, event, endpoint_url, status, response_time_ms,
             attempt_number, max_attempts, request_payload, response_body,
             error_message, created_at
      FROM webhook_delivery_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.user.id);

    res.json(logs.map(log => ({
      id: log.id,
      event: log.event,
      endpointUrl: log.endpoint_url,
      status: log.status,
      responseTimeMs: log.response_time_ms,
      attemptNumber: log.attempt_number,
      maxAttempts: log.max_attempts,
      requestPayload: log.request_payload || '{}',
      responseBody: log.response_body,
      errorMessage: log.error_message,
      createdAt: log.created_at
    })));

  } catch (error) {
    logger.error(`Failed to get webhook logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to get webhook delivery logs' });
  }
});

/**
 * GET /api/settings/webhooks/logs/:logId
 * Get specific webhook log details
 */
router.get('/webhooks/logs/:logId', (req, res) => {
  try {
    ensureWebhookTablesOnce();
    const db = getDatabase();

    const log = db.prepare(`
      SELECT id, event, endpoint_url, status, response_time_ms,
             attempt_number, max_attempts, request_payload, response_body,
             error_message, created_at
      FROM webhook_delivery_logs
      WHERE id = ? AND user_id = ?
    `).get(req.params.logId, req.user.id);

    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }

    res.json({
      id: log.id,
      event: log.event,
      endpointUrl: log.endpoint_url,
      status: log.status,
      responseTimeMs: log.response_time_ms,
      attemptNumber: log.attempt_number,
      maxAttempts: log.max_attempts,
      requestPayload: log.request_payload || '{}',
      responseBody: log.response_body,
      errorMessage: log.error_message,
      createdAt: log.created_at
    });

  } catch (error) {
    logger.error(`Failed to get webhook log: ${error.message}`);
    res.status(500).json({ error: 'Failed to get webhook log details' });
  }
});

/**
 * POST /api/settings/webhooks/logs/:logId/retry
 * Retry a failed webhook delivery
 */
router.post('/webhooks/logs/:logId/retry', async (req, res) => {
  try {
    ensureWebhookTablesOnce();
    const db = getDatabase();
    const { v4: uuidv4 } = require('uuid');
    const crypto = require('crypto');

    const log = db.prepare(`
      SELECT * FROM webhook_delivery_logs WHERE id = ? AND user_id = ?
    `).get(req.params.logId, req.user.id);

    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }

    const config = db.prepare('SELECT * FROM webhook_settings WHERE user_id = ?')
      .get(req.user.id);

    if (!config || !config.url) {
      return res.status(400).json({ error: 'No webhook URL configured' });
    }

    const headers = { 'Content-Type': 'application/json' };
    if (config.secret_hash) {
      headers['X-SwarmAI-Signature'] = crypto.createHmac('sha256', config.secret_hash)
        .update(log.request_payload).digest('hex');
    }

    const startTime = Date.now();
    let statusCode = null;
    let responseBody = null;
    let errorMessage = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), (config.timeout_seconds || 30) * 1000);

      const response = await fetch(config.url, {
        method: 'POST',
        headers,
        body: log.request_payload,
        signal: controller.signal
      });
      clearTimeout(timeout);

      statusCode = response.status;
      try { responseBody = await response.text(); } catch (e) { responseBody = null; }
    } catch (fetchErr) {
      errorMessage = fetchErr.name === 'AbortError' ? 'Request timed out' : fetchErr.message;
    }

    const responseTimeMs = Date.now() - startTime;

    // Log the retry as a new entry
    db.prepare(`
      INSERT INTO webhook_delivery_logs (id, user_id, event, endpoint_url, status, response_time_ms, attempt_number, max_attempts, request_payload, response_body, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), req.user.id, log.event, config.url,
      statusCode, responseTimeMs, log.attempt_number + 1, log.max_attempts,
      log.request_payload, responseBody, errorMessage
    );

    res.json({ message: 'Retry queued successfully' });

  } catch (error) {
    logger.error(`Failed to retry webhook: ${error.message}`);
    res.status(500).json({ error: 'Failed to retry webhook delivery' });
  }
});

/**
 * DELETE /api/settings/webhooks/logs
 * Clear delivery logs older than 24 hours
 */
router.delete('/webhooks/logs', (req, res) => {
  try {
    ensureWebhookTablesOnce();
    const db = getDatabase();

    const result = db.prepare(`
      DELETE FROM webhook_delivery_logs
      WHERE user_id = ? AND created_at < datetime('now', '-1 day')
    `).run(req.user.id);

    res.json({ message: `Cleared ${result.changes} old log entries` });

  } catch (error) {
    logger.error(`Failed to clear webhook logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

module.exports = router;
