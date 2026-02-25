/**
 * Tool API Key Service
 *
 * Manages API keys for system tools that require external service authentication.
 * Supports multi-provider fallback for tools like searchWeb.
 *
 * Features:
 * - Per-user API key storage
 * - Multi-provider support with priority ordering
 * - Provider-specific key validation
 * - Automatic fallback to free providers
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

/**
 * Provider registry - tools that support API keys
 * Each tool can have multiple providers with different capabilities
 */
const TOOL_PROVIDERS = {
  searchWeb: [
    {
      id: 'brave',
      name: 'Brave Search',
      keyRequired: true,
      testEndpoint: 'https://api.search.brave.com/res/v1/web/search',
      docsUrl: 'https://brave.com/search/api/',
      description: 'High-quality web search with 2,000 free queries/month',
    },
    {
      id: 'serper',
      name: 'Serper.dev',
      keyRequired: true,
      testEndpoint: 'https://google.serper.dev/search',
      docsUrl: 'https://serper.dev/',
      description: 'Google Search API with 2,500 free queries/month',
    },
    {
      id: 'duckduckgo',
      name: 'DuckDuckGo',
      keyRequired: false,
      testEndpoint: null,
      docsUrl: null,
      description: 'Free instant answers (limited results)',
    },
  ],
  // Future tools can be added here
  // weather: [
  //   { id: 'openweathermap', name: 'OpenWeatherMap', keyRequired: true, ... },
  // ],
};

/**
 * Get all tool providers configuration
 * @returns {Object} Tool providers registry
 */
function getToolProviders() {
  return TOOL_PROVIDERS;
}

/**
 * Get providers for a specific tool
 * @param {string} toolId - Tool ID
 * @returns {Array|null} List of providers or null if tool not found
 */
function getProvidersForTool(toolId) {
  return TOOL_PROVIDERS[toolId] || null;
}

/**
 * Get API keys for a tool, ordered by priority
 * @param {string} userId - User ID
 * @param {string} toolId - Tool ID
 * @returns {Array} List of API key records
 */
function getKeysForTool(userId, toolId) {
  const db = getDatabase();

  try {
    const keys = db.prepare(`
      SELECT * FROM tool_api_keys
      WHERE user_id = ? AND tool_id = ?
      ORDER BY priority ASC, created_at ASC
    `).all(userId, toolId);

    return keys;
  } catch (error) {
    logger.error(`Failed to get keys for tool ${toolId}: ${error.message}`);
    return [];
  }
}

/**
 * Get the first active key for a tool/provider combination
 * @param {string} userId - User ID
 * @param {string} toolId - Tool ID
 * @param {string|null} provider - Specific provider (optional)
 * @returns {Object|null} API key record or null
 */
function getActiveKey(userId, toolId, provider = null) {
  const db = getDatabase();

  try {
    let query = `
      SELECT * FROM tool_api_keys
      WHERE user_id = ? AND tool_id = ? AND is_active = 1
    `;
    const params = [userId, toolId];

    if (provider) {
      query += ' AND provider = ?';
      params.push(provider);
    }

    query += ' ORDER BY priority ASC LIMIT 1';

    return db.prepare(query).get(...params) || null;
  } catch (error) {
    logger.error(`Failed to get active key: ${error.message}`);
    return null;
  }
}

/**
 * Create a new API key
 * @param {string} userId - User ID
 * @param {string} toolId - Tool ID
 * @param {string} provider - Provider ID
 * @param {string} apiKey - API key value
 * @param {number} priority - Priority (lower = higher priority)
 * @returns {Object} Created key record
 */
function createKey(userId, toolId, provider, apiKey, priority = 1) {
  const db = getDatabase();

  // Validate provider exists
  const providers = TOOL_PROVIDERS[toolId];
  if (!providers) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  const providerConfig = providers.find(p => p.id === provider);
  if (!providerConfig) {
    throw new Error(`Unknown provider ${provider} for tool ${toolId}`);
  }

  if (!providerConfig.keyRequired && apiKey) {
    throw new Error(`Provider ${provider} does not require an API key`);
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO tool_api_keys (id, user_id, tool_id, provider, api_key, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, toolId, provider, apiKey, priority, now, now);

    logger.info(`Created API key for ${toolId}/${provider} (user: ${userId})`);

    return {
      id,
      userId,
      toolId,
      provider,
      priority,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error(`API key for ${provider} already exists for this tool`);
    }
    throw error;
  }
}

/**
 * Update an API key
 * @param {string} keyId - Key ID
 * @param {string} userId - User ID (for authorization)
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated key or null
 */
function updateKey(keyId, userId, updates) {
  const db = getDatabase();

  // Verify ownership
  const existing = db.prepare(`
    SELECT * FROM tool_api_keys WHERE id = ? AND user_id = ?
  `).get(keyId, userId);

  if (!existing) {
    return null;
  }

  const allowedFields = ['api_key', 'priority', 'is_active'];
  const setClause = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    const dbKey = key === 'apiKey' ? 'api_key' : key === 'isActive' ? 'is_active' : key;
    if (allowedFields.includes(dbKey)) {
      setClause.push(`${dbKey} = ?`);
      params.push(value);
    }
  }

  if (setClause.length === 0) {
    return existing;
  }

  setClause.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(keyId);
  params.push(userId);

  db.prepare(`
    UPDATE tool_api_keys
    SET ${setClause.join(', ')}
    WHERE id = ? AND user_id = ?
  `).run(...params);

  logger.info(`Updated API key ${keyId}`);

  return db.prepare(`
    SELECT * FROM tool_api_keys WHERE id = ?
  `).get(keyId);
}

/**
 * Delete an API key
 * @param {string} keyId - Key ID
 * @param {string} userId - User ID (for authorization)
 * @returns {boolean} Success
 */
function deleteKey(keyId, userId) {
  const db = getDatabase();

  const result = db.prepare(`
    DELETE FROM tool_api_keys WHERE id = ? AND user_id = ?
  `).run(keyId, userId);

  if (result.changes > 0) {
    logger.info(`Deleted API key ${keyId}`);
    return true;
  }

  return false;
}

/**
 * Get all keys for a user (across all tools)
 * @param {string} userId - User ID
 * @returns {Array} List of key records (with masked API keys)
 */
function getAllKeysForUser(userId) {
  const db = getDatabase();

  try {
    const keys = db.prepare(`
      SELECT id, user_id, tool_id, provider, api_key, priority, is_active,
             last_used_at, last_error, created_at, updated_at
      FROM tool_api_keys
      WHERE user_id = ?
      ORDER BY tool_id, priority ASC
    `).all(userId);

    // Mask API keys
    return keys.map(key => ({
      ...key,
      apiKeyMasked: maskApiKey(key.api_key),
      api_key: undefined, // Don't expose full key
    }));
  } catch (error) {
    logger.error(`Failed to get keys for user: ${error.message}`);
    return [];
  }
}

/**
 * Mask API key for display
 * @param {string} key - Full API key
 * @returns {string} Masked key
 */
function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}${'*'.repeat(Math.min(key.length - 8, 16))}${key.slice(-4)}`;
}

/**
 * Test an API key validity
 * @param {string} keyId - Key ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Test result
 */
async function testKey(keyId, userId) {
  const db = getDatabase();

  const key = db.prepare(`
    SELECT * FROM tool_api_keys WHERE id = ? AND user_id = ?
  `).get(keyId, userId);

  if (!key) {
    return { success: false, error: 'Key not found' };
  }

  const providers = TOOL_PROVIDERS[key.tool_id];
  const providerConfig = providers?.find(p => p.id === key.provider);

  if (!providerConfig) {
    return { success: false, error: 'Unknown provider' };
  }

  if (!providerConfig.keyRequired) {
    return { success: true, message: 'Provider does not require key validation' };
  }

  // Provider-specific testing
  try {
    const result = await testProviderKey(key.provider, key.api_key, key.tool_id);

    // Update last_used_at and clear error on success
    if (result.success) {
      db.prepare(`
        UPDATE tool_api_keys SET last_used_at = ?, last_error = NULL WHERE id = ?
      `).run(new Date().toISOString(), keyId);
    } else {
      db.prepare(`
        UPDATE tool_api_keys SET last_error = ? WHERE id = ?
      `).run(result.error, keyId);
    }

    return result;
  } catch (error) {
    const errorMsg = error.message;
    db.prepare(`
      UPDATE tool_api_keys SET last_error = ? WHERE id = ?
    `).run(errorMsg, keyId);

    return { success: false, error: errorMsg };
  }
}

/**
 * Test a provider API key
 * @param {string} provider - Provider ID
 * @param {string} apiKey - API key
 * @param {string} toolId - Tool ID
 * @returns {Promise<Object>} Test result
 */
async function testProviderKey(provider, apiKey, toolId) {
  const fetch = (await import('node-fetch')).default;

  switch (provider) {
    case 'brave': {
      const response = await fetch(
        'https://api.search.brave.com/res/v1/web/search?q=test&count=1',
        {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': apiKey,
          },
        }
      );

      if (response.ok) {
        return { success: true, message: 'Brave Search API key is valid' };
      }

      const error = await response.json().catch(() => ({}));
      return {
        success: false,
        error: error.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    case 'serper': {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: 'test', num: 1 }),
      });

      if (response.ok) {
        return { success: true, message: 'Serper API key is valid' };
      }

      const error = await response.json().catch(() => ({}));
      return {
        success: false,
        error: error.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    default:
      return { success: false, error: `Testing not supported for provider: ${provider}` };
  }
}

/**
 * Record usage of an API key (for tracking)
 * @param {string} keyId - Key ID
 */
function recordKeyUsage(keyId) {
  const db = getDatabase();

  try {
    db.prepare(`
      UPDATE tool_api_keys SET last_used_at = ? WHERE id = ?
    `).run(new Date().toISOString(), keyId);
  } catch (error) {
    // Non-critical, log and continue
    logger.debug(`Failed to record key usage: ${error.message}`);
  }
}

/**
 * Record error for an API key
 * @param {string} keyId - Key ID
 * @param {string} error - Error message
 */
function recordKeyError(keyId, error) {
  const db = getDatabase();

  try {
    db.prepare(`
      UPDATE tool_api_keys SET last_error = ?, updated_at = ? WHERE id = ?
    `).run(error, new Date().toISOString(), keyId);
  } catch (err) {
    logger.debug(`Failed to record key error: ${err.message}`);
  }
}

module.exports = {
  // Provider registry
  TOOL_PROVIDERS,
  getToolProviders,
  getProvidersForTool,

  // Key management
  getKeysForTool,
  getActiveKey,
  getAllKeysForUser,
  createKey,
  updateKey,
  deleteKey,

  // Testing
  testKey,
  testProviderKey,

  // Usage tracking
  recordKeyUsage,
  recordKeyError,

  // Utilities
  maskApiKey,
};
