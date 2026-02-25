/**
 * User Routes
 * User notification settings and preferences
 */

const express = require('express');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Default notification settings
const DEFAULT_NOTIFICATION_SETTINGS = {
  emailNotifications: true,
  pushNotifications: true,
  newMessages: true,
  agentStatusChanges: true,
  swarmEvents: true,
  flowExecutionAlerts: true,
  securityAlerts: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00'
};

// ============================================
// Notification Settings
// ============================================

/**
 * GET /api/users/notifications
 * Get notification settings for current user
 */
router.get('/notifications', (req, res) => {
  try {
    const db = getDatabase();

    const setting = db.prepare(`
      SELECT value FROM settings
      WHERE user_id = ? AND key = 'notification_config'
    `).get(req.user.id);

    if (!setting || !setting.value) {
      return res.json(DEFAULT_NOTIFICATION_SETTINGS);
    }

    try {
      const config = JSON.parse(setting.value);
      res.json({ ...DEFAULT_NOTIFICATION_SETTINGS, ...config });
    } catch {
      res.json(DEFAULT_NOTIFICATION_SETTINGS);
    }

  } catch (error) {
    logger.error(`Failed to get notification settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to get notification settings' });
  }
});

/**
 * PATCH /api/users/notifications
 * Update notification settings
 */
router.patch('/notifications', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;

    // Validate input
    const allowedKeys = Object.keys(DEFAULT_NOTIFICATION_SETTINGS);
    const input = {};

    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        input[key] = req.body[key];
      }
    }

    // Validate quiet hours format
    if (input.quietHoursStart && !/^\d{2}:\d{2}$/.test(input.quietHoursStart)) {
      return res.status(400).json({ error: 'Invalid quietHoursStart format. Use HH:MM' });
    }
    if (input.quietHoursEnd && !/^\d{2}:\d{2}$/.test(input.quietHoursEnd)) {
      return res.status(400).json({ error: 'Invalid quietHoursEnd format. Use HH:MM' });
    }

    // Get existing settings
    const existing = db.prepare(`
      SELECT value FROM settings
      WHERE user_id = ? AND key = 'notification_config'
    `).get(userId);

    let currentConfig = { ...DEFAULT_NOTIFICATION_SETTINGS };
    if (existing && existing.value) {
      try {
        currentConfig = { ...currentConfig, ...JSON.parse(existing.value) };
      } catch {
        // Use defaults on parse error
      }
    }

    // Merge with input
    const updated = { ...currentConfig, ...input };

    // Save settings
    if (existing) {
      db.prepare(`
        UPDATE settings SET value = ?, updated_at = datetime('now')
        WHERE user_id = ? AND key = 'notification_config'
      `).run(JSON.stringify(updated), userId);
    } else {
      const { v4: uuidv4 } = require('uuid');
      db.prepare(`
        INSERT INTO settings (id, user_id, key, value)
        VALUES (?, ?, 'notification_config', ?)
      `).run(uuidv4(), userId, JSON.stringify(updated));
    }

    res.json(updated);

  } catch (error) {
    logger.error(`Failed to update notification settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

// ============================================
// User Preferences (future expansion)
// ============================================

/**
 * GET /api/users/preferences
 * Get user preferences
 */
router.get('/preferences', (req, res) => {
  try {
    const db = getDatabase();

    const setting = db.prepare(`
      SELECT value FROM settings
      WHERE user_id = ? AND key = 'user_preferences'
    `).get(req.user.id);

    if (!setting || !setting.value) {
      return res.json({
        theme: 'system',
        language: 'en',
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h'
      });
    }

    try {
      res.json(JSON.parse(setting.value));
    } catch {
      res.json({
        theme: 'system',
        language: 'en',
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h'
      });
    }

  } catch (error) {
    logger.error(`Failed to get preferences: ${error.message}`);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

/**
 * PATCH /api/users/profile
 * Update user profile (name, avatar, preferences)
 */
router.patch('/profile', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;
    const { name, avatar, preferences } = req.body;

    // Update user table (name, avatar)
    const userUpdates = [];
    const userParams = [];

    if (name !== undefined) {
      userUpdates.push('name = ?');
      userParams.push(name);
    }
    if (avatar !== undefined) {
      userUpdates.push('avatar = ?');
      userParams.push(avatar);
    }

    if (userUpdates.length > 0) {
      userUpdates.push("updated_at = datetime('now')");
      userParams.push(userId);
      db.prepare(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`).run(...userParams);
    }

    // Update preferences if provided
    if (preferences) {
      const allowedKeys = ['theme', 'language', 'timezone', 'dateFormat', 'timeFormat'];
      const input = {};

      for (const key of allowedKeys) {
        if (preferences[key] !== undefined) {
          input[key] = preferences[key];
        }
      }

      if (Object.keys(input).length > 0) {
        // Get existing settings
        const existing = db.prepare(`
          SELECT value FROM settings
          WHERE user_id = ? AND key = 'user_preferences'
        `).get(userId);

        let currentConfig = {
          theme: 'system',
          language: 'en',
          timezone: 'UTC',
          dateFormat: 'YYYY-MM-DD',
          timeFormat: '24h'
        };

        if (existing && existing.value) {
          try {
            currentConfig = { ...currentConfig, ...JSON.parse(existing.value) };
          } catch {
            // Use defaults
          }
        }

        const updated = { ...currentConfig, ...input };

        if (existing) {
          db.prepare(`
            UPDATE settings SET value = ?, updated_at = datetime('now')
            WHERE user_id = ? AND key = 'user_preferences'
          `).run(JSON.stringify(updated), userId);
        } else {
          const { v4: uuidv4 } = require('uuid');
          db.prepare(`
            INSERT INTO settings (id, user_id, key, value)
            VALUES (?, ?, 'user_preferences', ?)
          `).run(uuidv4(), userId, JSON.stringify(updated));
        }
      }
    }

    // Get updated user data
    const user = db.prepare('SELECT id, email, name, avatar, role FROM users WHERE id = ?').get(userId);

    // Get updated preferences
    const prefSetting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'user_preferences'
    `).get(userId);

    let userPrefs = { theme: 'system', language: 'en', timezone: 'UTC' };
    if (prefSetting?.value) {
      try {
        userPrefs = JSON.parse(prefSetting.value);
      } catch {
        // Use defaults
      }
    }

    res.json({
      profile: {
        ...user,
        preferences: userPrefs
      }
    });

  } catch (error) {
    logger.error(`Failed to update profile: ${error.message}`);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * PATCH /api/users/preferences
 * Update user preferences
 */
router.patch('/preferences', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;

    const allowedKeys = ['theme', 'language', 'timezone', 'dateFormat', 'timeFormat'];
    const input = {};

    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        input[key] = req.body[key];
      }
    }

    // Validate theme
    if (input.theme && !['light', 'dark', 'system'].includes(input.theme)) {
      return res.status(400).json({ error: 'Invalid theme. Use: light, dark, or system' });
    }

    // Validate time format
    if (input.timeFormat && !['12h', '24h'].includes(input.timeFormat)) {
      return res.status(400).json({ error: 'Invalid timeFormat. Use: 12h or 24h' });
    }

    // Get existing settings
    const existing = db.prepare(`
      SELECT value FROM settings
      WHERE user_id = ? AND key = 'user_preferences'
    `).get(userId);

    let currentConfig = {
      theme: 'system',
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h'
    };

    if (existing && existing.value) {
      try {
        currentConfig = { ...currentConfig, ...JSON.parse(existing.value) };
      } catch {
        // Use defaults
      }
    }

    const updated = { ...currentConfig, ...input };

    if (existing) {
      db.prepare(`
        UPDATE settings SET value = ?, updated_at = datetime('now')
        WHERE user_id = ? AND key = 'user_preferences'
      `).run(JSON.stringify(updated), userId);
    } else {
      const { v4: uuidv4 } = require('uuid');
      db.prepare(`
        INSERT INTO settings (id, user_id, key, value)
        VALUES (?, ?, 'user_preferences', ?)
      `).run(uuidv4(), userId, JSON.stringify(updated));
    }

    res.json(updated);

  } catch (error) {
    logger.error(`Failed to update preferences: ${error.message}`);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ============================================
// User AI API Keys
// ============================================

/**
 * GET /api/users/ai-keys
 * Get user's personal AI API keys (masked)
 */
router.get('/ai-keys', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;

    // Get user's AI keys from settings
    const setting = db.prepare(`
      SELECT value FROM settings
      WHERE user_id = ? AND key = 'user_ai_keys'
    `).get(userId);

    const providerTypes = ['openrouter', 'anthropic', 'google', 'openai-compatible'];
    let keys = {};

    if (setting?.value) {
      try {
        keys = JSON.parse(setting.value);
      } catch {
        keys = {};
      }
    }

    // Map to response format with masked keys
    const keysList = providerTypes.map(type => ({
      id: type,
      providerType: type,
      providerName: {
        openrouter: 'OpenRouter',
        anthropic: 'Anthropic',
        google: 'Google AI',
        'openai-compatible': 'OpenAI Compatible'
      }[type] || type,
      hasKey: !!keys[type],
      lastUsed: keys[`${type}_lastUsed`] || null
    }));

    res.json({ keys: keysList });

  } catch (error) {
    logger.error(`Failed to get AI keys: ${error.message}`);
    res.status(500).json({ error: 'Failed to get AI keys' });
  }
});

/**
 * POST /api/users/ai-keys
 * Save a personal AI API key
 */
router.post('/ai-keys', (req, res) => {
  try {
    const { providerType, apiKey } = req.body;
    const db = getDatabase();
    const userId = req.user.id;

    if (!providerType || !apiKey) {
      return res.status(400).json({ error: 'Provider type and API key are required' });
    }

    const validProviders = ['openrouter', 'anthropic', 'google', 'openai-compatible'];
    if (!validProviders.includes(providerType)) {
      return res.status(400).json({ error: 'Invalid provider type' });
    }

    // Get existing keys
    const existing = db.prepare(`
      SELECT value FROM settings
      WHERE user_id = ? AND key = 'user_ai_keys'
    `).get(userId);

    let keys = {};
    if (existing?.value) {
      try {
        keys = JSON.parse(existing.value);
      } catch {
        keys = {};
      }
    }

    // Update the key (in production, this should be encrypted)
    keys[providerType] = apiKey;
    keys[`${providerType}_updatedAt`] = new Date().toISOString();

    // Save to database
    if (existing) {
      db.prepare(`
        UPDATE settings SET value = ?, updated_at = datetime('now')
        WHERE user_id = ? AND key = 'user_ai_keys'
      `).run(JSON.stringify(keys), userId);
    } else {
      const { v4: uuidv4 } = require('uuid');
      db.prepare(`
        INSERT INTO settings (id, user_id, key, value)
        VALUES (?, ?, 'user_ai_keys', ?)
      `).run(uuidv4(), userId, JSON.stringify(keys));
    }

    logger.info(`User ${userId} updated AI key for ${providerType}`);

    res.json({ success: true, message: 'API key saved' });

  } catch (error) {
    logger.error(`Failed to save AI key: ${error.message}`);
    res.status(500).json({ error: 'Failed to save API key' });
  }
});

// ============================================
// AI Translation & Rephrase Settings
// ============================================

// Default AI settings
const DEFAULT_AI_SETTINGS = {
  translationLanguage: 'en',
  translationModel: 'meta-llama/llama-3.3-8b-instruct:free',
  rephraseModel: 'meta-llama/llama-3.3-8b-instruct:free',
  rephraseStyle: 'professional',
  autoTranslate: false,
  showOriginalWithTranslation: true,
};

// Rephrase style presets for different platforms
const REPHRASE_STYLES = {
  professional: 'Professional and formal tone',
  casual: 'Casual and friendly tone',
  concise: 'Brief and to the point',
  detailed: 'Comprehensive and thorough',
  friendly: 'Warm and approachable',
  formal: 'Very formal and business-like',
};

/**
 * GET /api/users/ai-settings
 * Get AI translation and rephrase settings
 */
router.get('/ai-settings', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;

    const setting = db.prepare(`
      SELECT value FROM settings
      WHERE user_id = ? AND key = 'ai_translation_settings'
    `).get(userId);

    if (!setting || !setting.value) {
      return res.json({
        settings: DEFAULT_AI_SETTINGS,
        rephraseStyles: REPHRASE_STYLES,
      });
    }

    try {
      const config = JSON.parse(setting.value);
      res.json({
        settings: { ...DEFAULT_AI_SETTINGS, ...config },
        rephraseStyles: REPHRASE_STYLES,
      });
    } catch {
      res.json({
        settings: DEFAULT_AI_SETTINGS,
        rephraseStyles: REPHRASE_STYLES,
      });
    }

  } catch (error) {
    logger.error(`Failed to get AI settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to get AI settings' });
  }
});

/**
 * PATCH /api/users/ai-settings
 * Update AI translation and rephrase settings
 */
router.patch('/ai-settings', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;

    // Validate input
    const allowedKeys = Object.keys(DEFAULT_AI_SETTINGS);
    const input = {};

    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        input[key] = req.body[key];
      }
    }

    // Validate rephraseStyle
    if (input.rephraseStyle && !REPHRASE_STYLES[input.rephraseStyle]) {
      return res.status(400).json({
        error: `Invalid rephraseStyle. Valid options: ${Object.keys(REPHRASE_STYLES).join(', ')}`
      });
    }

    // Get existing settings
    const existing = db.prepare(`
      SELECT value FROM settings
      WHERE user_id = ? AND key = 'ai_translation_settings'
    `).get(userId);

    let currentConfig = { ...DEFAULT_AI_SETTINGS };
    if (existing && existing.value) {
      try {
        currentConfig = { ...currentConfig, ...JSON.parse(existing.value) };
      } catch {
        // Use defaults on parse error
      }
    }

    // Merge with input
    const updated = { ...currentConfig, ...input };

    // Save settings
    if (existing) {
      db.prepare(`
        UPDATE settings SET value = ?, updated_at = datetime('now')
        WHERE user_id = ? AND key = 'ai_translation_settings'
      `).run(JSON.stringify(updated), userId);
    } else {
      const { v4: uuidv4 } = require('uuid');
      db.prepare(`
        INSERT INTO settings (id, user_id, key, value)
        VALUES (?, ?, 'ai_translation_settings', ?)
      `).run(uuidv4(), userId, JSON.stringify(updated));
    }

    logger.info(`User ${userId} updated AI translation/rephrase settings`);

    res.json({
      settings: updated,
      rephraseStyles: REPHRASE_STYLES,
    });

  } catch (error) {
    logger.error(`Failed to update AI settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to update AI settings' });
  }
});

/**
 * DELETE /api/users/ai-keys/:providerType
 * Delete a personal AI API key
 */
router.delete('/ai-keys/:providerType', (req, res) => {
  try {
    const { providerType } = req.params;
    const db = getDatabase();
    const userId = req.user.id;

    // Get existing keys
    const existing = db.prepare(`
      SELECT value FROM settings
      WHERE user_id = ? AND key = 'user_ai_keys'
    `).get(userId);

    if (!existing?.value) {
      return res.status(404).json({ error: 'No AI keys found' });
    }

    let keys = {};
    try {
      keys = JSON.parse(existing.value);
    } catch {
      return res.status(500).json({ error: 'Failed to parse existing keys' });
    }

    if (!keys[providerType]) {
      return res.status(404).json({ error: 'Key not found for this provider' });
    }

    // Delete the key
    delete keys[providerType];
    delete keys[`${providerType}_updatedAt`];
    delete keys[`${providerType}_lastUsed`];

    // Save updated keys
    db.prepare(`
      UPDATE settings SET value = ?, updated_at = datetime('now')
      WHERE user_id = ? AND key = 'user_ai_keys'
    `).run(JSON.stringify(keys), userId);

    logger.info(`User ${userId} deleted AI key for ${providerType}`);

    res.json({ success: true, message: 'API key deleted' });

  } catch (error) {
    logger.error(`Failed to delete AI key: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

module.exports = router;
