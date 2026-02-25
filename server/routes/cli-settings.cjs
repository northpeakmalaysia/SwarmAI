/**
 * CLI Settings Routes
 *
 * API endpoints for managing CLI tool settings per user:
 * - Get/update CLI settings (model preferences, timeout, etc.)
 * - Get CLI auth status
 * - Get available models for each CLI
 * - Test CLI connection
 */

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database.cjs');
const { getCLIAIProvider } = require('../services/ai/providers/CLIAIProvider.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');

// Apply authentication to all routes
router.use(authenticate);

// Valid CLI types
const VALID_CLI_TYPES = ['claude', 'gemini', 'opencode'];

// Default models per CLI type
const CLI_DEFAULT_MODELS = {
  claude: {
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  gemini: {
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    defaultModel: 'gemini-2.5-flash',
  },
  opencode: {
    models: [
      'claude-sonnet-4-20250514',
      'gpt-4o',
      'gpt-4o-mini',
      'deepseek-chat',
      'deepseek-reasoner',
      'gemini-2.0-flash',
      'gemini-2.5-pro',
    ],
    defaultModel: 'claude-sonnet-4-20250514',
    providers: ['anthropic', 'openai', 'deepseek', 'google'],
  },
};

/**
 * GET /api/cli/settings
 * Get all CLI settings for the current user
 */
router.get('/settings', async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    const settings = db.prepare(`
      SELECT cli_type, preferred_model, fallback_model, timeout_seconds, max_tokens, temperature, settings, total_executions, last_used_at
      FROM cli_settings
      WHERE user_id = ?
    `).all(userId);

    // Build response with defaults for missing CLI types
    const result = {};
    for (const cliType of VALID_CLI_TYPES) {
      const setting = settings.find(s => s.cli_type === cliType);
      result[cliType] = {
        preferredModel: setting?.preferred_model || CLI_DEFAULT_MODELS[cliType]?.defaultModel || null,
        fallbackModel: setting?.fallback_model || null,
        timeoutSeconds: setting?.timeout_seconds || 300,
        maxTokens: setting?.max_tokens || null,
        temperature: setting?.temperature || null,
        settings: setting?.settings ? JSON.parse(setting.settings) : {},
        totalExecutions: setting?.total_executions || 0,
        lastUsedAt: setting?.last_used_at || null,
      };
    }

    res.json(result);
  } catch (error) {
    logger.error('Error getting CLI settings:', error);
    res.status(500).json({ error: 'Failed to get CLI settings' });
  }
});

/**
 * GET /api/cli/settings/:cliType
 * Get settings for a specific CLI type
 */
router.get('/settings/:cliType', async (req, res) => {
  try {
    const { cliType } = req.params;
    const userId = req.user.id;

    if (!VALID_CLI_TYPES.includes(cliType)) {
      return res.status(400).json({ error: `Invalid CLI type. Must be one of: ${VALID_CLI_TYPES.join(', ')}` });
    }

    const db = getDatabase();
    const setting = db.prepare(`
      SELECT preferred_model, fallback_model, timeout_seconds, max_tokens, temperature, settings, total_executions, last_used_at
      FROM cli_settings
      WHERE user_id = ? AND cli_type = ?
    `).get(userId, cliType);

    const defaults = CLI_DEFAULT_MODELS[cliType] || {};

    res.json({
      cliType,
      preferredModel: setting?.preferred_model || defaults.defaultModel || null,
      fallbackModel: setting?.fallback_model || null,
      timeoutSeconds: setting?.timeout_seconds || 300,
      maxTokens: setting?.max_tokens || null,
      temperature: setting?.temperature || null,
      settings: setting?.settings ? JSON.parse(setting.settings) : {},
      totalExecutions: setting?.total_executions || 0,
      lastUsedAt: setting?.last_used_at || null,
      availableModels: defaults.models || [],
      availableProviders: defaults.providers || [],
    });
  } catch (error) {
    logger.error('Error getting CLI settings:', error);
    res.status(500).json({ error: 'Failed to get CLI settings' });
  }
});

/**
 * PATCH /api/cli/settings/:cliType
 * Update settings for a specific CLI type
 */
router.patch('/settings/:cliType', async (req, res) => {
  try {
    const { cliType } = req.params;
    const userId = req.user.id;

    if (!VALID_CLI_TYPES.includes(cliType)) {
      return res.status(400).json({ error: `Invalid CLI type. Must be one of: ${VALID_CLI_TYPES.join(', ')}` });
    }

    const {
      preferredModel,
      fallbackModel,
      timeoutSeconds,
      maxTokens,
      temperature,
      settings,
    } = req.body;

    const db = getDatabase();

    // Upsert settings
    db.prepare(`
      INSERT INTO cli_settings (user_id, cli_type, preferred_model, fallback_model, timeout_seconds, max_tokens, temperature, settings, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, cli_type) DO UPDATE SET
        preferred_model = COALESCE(excluded.preferred_model, preferred_model),
        fallback_model = COALESCE(excluded.fallback_model, fallback_model),
        timeout_seconds = COALESCE(excluded.timeout_seconds, timeout_seconds),
        max_tokens = COALESCE(excluded.max_tokens, max_tokens),
        temperature = COALESCE(excluded.temperature, temperature),
        settings = COALESCE(excluded.settings, settings),
        updated_at = datetime('now')
    `).run(
      userId,
      cliType,
      preferredModel || null,
      fallbackModel || null,
      timeoutSeconds || null,
      maxTokens || null,
      temperature || null,
      settings ? JSON.stringify(settings) : null
    );

    // Fetch updated settings
    const updated = db.prepare(`
      SELECT preferred_model, fallback_model, timeout_seconds, max_tokens, temperature, settings
      FROM cli_settings
      WHERE user_id = ? AND cli_type = ?
    `).get(userId, cliType);

    res.json({
      cliType,
      preferredModel: updated?.preferred_model,
      fallbackModel: updated?.fallback_model,
      timeoutSeconds: updated?.timeout_seconds,
      maxTokens: updated?.max_tokens,
      temperature: updated?.temperature,
      settings: updated?.settings ? JSON.parse(updated.settings) : {},
      message: 'CLI settings updated successfully',
    });
  } catch (error) {
    logger.error('Error updating CLI settings:', error);
    res.status(500).json({ error: 'Failed to update CLI settings' });
  }
});

/**
 * GET /api/cli/:cliType/models
 * Get available models for a specific CLI type
 */
router.get('/:cliType/models', async (req, res) => {
  try {
    const { cliType } = req.params;

    if (!VALID_CLI_TYPES.includes(cliType)) {
      return res.status(400).json({ error: `Invalid CLI type. Must be one of: ${VALID_CLI_TYPES.join(', ')}` });
    }

    const defaults = CLI_DEFAULT_MODELS[cliType] || {};
    const cliProvider = getCLIAIProvider();
    const authStatus = cliProvider.getAuthStatus();
    const cliAuth = authStatus[cliType] || {};

    res.json({
      cliType,
      models: cliAuth.capabilities?.models || defaults.models || [],
      defaultModel: defaults.defaultModel || null,
      providers: defaults.providers || [],
    });
  } catch (error) {
    logger.error('Error getting CLI models:', error);
    res.status(500).json({ error: 'Failed to get CLI models' });
  }
});

/**
 * GET /api/cli/:cliType/status
 * Get authentication status for a specific CLI type
 */
router.get('/:cliType/status', async (req, res) => {
  try {
    const { cliType } = req.params;

    if (!VALID_CLI_TYPES.includes(cliType)) {
      return res.status(400).json({ error: `Invalid CLI type. Must be one of: ${VALID_CLI_TYPES.join(', ')}` });
    }

    const cliProvider = getCLIAIProvider();

    // Get status from database for persistence info
    const dbStatus = cliProvider.getAuthStatusFromDB();
    const status = dbStatus[cliType] || {};

    // Check if CLI is actually available
    const isAvailable = await cliProvider.isAvailable(cliType);

    res.json({
      cliType,
      authenticated: status.authenticated || false,
      authenticatedAt: status.authenticatedAt || null,
      authenticatedBy: status.authenticatedBy || null,
      capabilities: status.capabilities || {},
      lastUsedAt: status.lastUsedAt || null,
      isAvailable,
      errorMessage: status.errorMessage || null,
    });
  } catch (error) {
    logger.error('Error getting CLI status:', error);
    res.status(500).json({ error: 'Failed to get CLI status' });
  }
});

/**
 * GET /api/cli/status
 * Get authentication status for all CLI types
 */
router.get('/status', async (req, res) => {
  try {
    const cliProvider = getCLIAIProvider();
    const dbStatus = cliProvider.getAuthStatusFromDB();

    // Check availability for each CLI
    const result = {};
    for (const cliType of VALID_CLI_TYPES) {
      const status = dbStatus[cliType] || {};
      const isAvailable = await cliProvider.isAvailable(cliType);

      result[cliType] = {
        authenticated: status.authenticated || false,
        authenticatedAt: status.authenticatedAt || null,
        authenticatedBy: status.authenticatedBy || null,
        capabilities: status.capabilities || {},
        lastUsedAt: status.lastUsedAt || null,
        isAvailable,
        errorMessage: status.errorMessage || null,
      };
    }

    res.json(result);
  } catch (error) {
    logger.error('Error getting CLI status:', error);
    res.status(500).json({ error: 'Failed to get CLI status' });
  }
});

/**
 * POST /api/cli/:cliType/test
 * Test CLI connection by running a simple command
 */
router.post('/:cliType/test', async (req, res) => {
  try {
    const { cliType } = req.params;

    if (!VALID_CLI_TYPES.includes(cliType)) {
      return res.status(400).json({ error: `Invalid CLI type. Must be one of: ${VALID_CLI_TYPES.join(', ')}` });
    }

    const cliProvider = getCLIAIProvider();

    // Check if available
    const isAvailable = await cliProvider.isAvailable(cliType);
    if (!isAvailable) {
      return res.json({
        success: false,
        cliType,
        message: `${cliType} CLI is not installed or not accessible`,
      });
    }

    // Check if authenticated
    const isAuthenticated = cliProvider.isAuthenticated(cliType);

    res.json({
      success: true,
      cliType,
      isAvailable: true,
      isAuthenticated,
      message: isAuthenticated
        ? `${cliType} CLI is available and authenticated`
        : `${cliType} CLI is available but not authenticated`,
    });
  } catch (error) {
    logger.error('Error testing CLI:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test CLI',
      message: error.message,
    });
  }
});

/**
 * POST /api/cli/:cliType/verify
 * Verify and refresh CLI authentication status
 */
router.post('/:cliType/verify', async (req, res) => {
  try {
    const { cliType } = req.params;

    if (!VALID_CLI_TYPES.includes(cliType)) {
      return res.status(400).json({ error: `Invalid CLI type. Must be one of: ${VALID_CLI_TYPES.join(', ')}` });
    }

    const cliProvider = getCLIAIProvider();

    // Verify auth
    const isValid = await cliProvider.verifyCLIAuth(cliType);

    if (isValid) {
      // Update capabilities if authenticated
      const capabilities = await cliProvider.detectCapabilities(cliType);
      await cliProvider.saveAuthState(cliType, true, { capabilities });
    } else {
      await cliProvider.saveAuthState(cliType, false, { error_message: 'Verification failed' });
    }

    // Get updated status
    const dbStatus = cliProvider.getAuthStatusFromDB();
    const status = dbStatus[cliType] || {};

    res.json({
      cliType,
      verified: isValid,
      authenticated: status.authenticated || false,
      capabilities: status.capabilities || {},
      message: isValid ? 'CLI authentication verified' : 'CLI authentication verification failed',
    });
  } catch (error) {
    logger.error('Error verifying CLI:', error);
    res.status(500).json({ error: 'Failed to verify CLI' });
  }
});

module.exports = router;
