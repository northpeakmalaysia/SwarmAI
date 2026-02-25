/**
 * AI Routes
 * AI provider management, usage tracking, and MCP
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const config = require('../config/index.cjs');
const { getLinkPreview: getCachedLinkPreview, storeLinkPreview: cacheLinkPreview } = require('../services/redis.cjs');

/**
 * Find Chrome executable in Puppeteer cache directory
 * Handles dynamic version detection
 */
function findChromeExecutable() {
  // If configured path exists, use it
  if (config.puppeteerExecutablePath && fs.existsSync(config.puppeteerExecutablePath)) {
    return config.puppeteerExecutablePath;
  }

  // Try to find Chrome in puppeteer cache
  const cacheDir = '/opt/puppeteer-cache/chrome';
  if (fs.existsSync(cacheDir)) {
    try {
      const versions = fs.readdirSync(cacheDir);
      for (const version of versions) {
        const chromePath = path.join(cacheDir, version, 'chrome-linux64', 'chrome');
        if (fs.existsSync(chromePath)) {
          logger.info(`Found Chrome at: ${chromePath}`);
          return chromePath;
        }
      }
    } catch (e) {
      logger.warn(`Failed to scan Chrome cache: ${e.message}`);
    }
  }

  // Fallback: let Puppeteer find it automatically
  return undefined;
}

// AI Router Services
const { getAIRouterService, CONFIDENCE_THRESHOLDS } = require('../services/ai/AIRouterService.cjs');
const { getSystemToolsRegistry, TOOL_CATEGORIES } = require('../services/ai/SystemToolsRegistry.cjs');

// CLI AI Provider for CLI provider sync
const { getCLIAIProvider, CLI_DEFAULT_MODELS } = require('../services/ai/providers/CLIAIProvider.cjs');

// SuperBrain Message Processor
const {
  getSuperBrainMessageProcessor,
  PROCESSING_MODES,
  RESPONSE_TYPES,
} = require('../services/ai/SuperBrainMessageProcessor.cjs');

const router = express.Router();

router.use(authenticate);

// ============================================
// AI Providers
// ============================================

/**
 * Transform database provider to camelCase response
 */
function transformProvider(p) {
  return {
    id: p.id,
    userId: p.user_id,
    name: p.name,
    type: p.type,
    apiKey: p.api_key,
    baseUrl: p.base_url,
    config: p.config ? JSON.parse(p.config) : {},
    models: p.models ? JSON.parse(p.models) : [],
    isDefault: !!p.is_default,
    isActive: p.is_active !== undefined ? !!p.is_active : true,
    budgetLimit: p.budget_limit || null,
    budgetUsed: p.budget_used || 0,
    lastTested: p.last_tested || null,
    createdAt: p.created_at,
    updatedAt: p.updated_at
  };
}

/**
 * GET /api/ai/providers
 * List AI providers
 */
router.get('/providers', (req, res) => {
  try {
    const db = getDatabase();

    // USER-LEVEL only - users must configure their own providers
    const providers = db.prepare(`
      SELECT * FROM ai_providers
      WHERE user_id = ?
      ORDER BY is_default DESC, name
    `).all(req.user.id);

    res.json({
      providers: providers.map(transformProvider)
    });

  } catch (error) {
    logger.error(`Failed to list providers: ${error.message}`);
    res.status(500).json({ error: 'Failed to list providers' });
  }
});

/**
 * POST /api/ai/providers
 * Add AI provider
 */
router.post('/providers', (req, res) => {
  try {
    const { name, type, apiKey, baseUrl, config } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const db = getDatabase();
    const providerId = uuidv4();

    db.prepare(`
      INSERT INTO ai_providers (id, user_id, name, type, api_key, base_url, config)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(providerId, req.user.id, name, type, apiKey || null, baseUrl || null, JSON.stringify(config || {}));

    const provider = db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(providerId);

    res.status(201).json({
      provider: transformProvider(provider)
    });

  } catch (error) {
    logger.error(`Failed to add provider: ${error.message}`);
    res.status(500).json({ error: 'Failed to add provider' });
  }
});

/**
 * PUT /api/ai/providers/:id
 * Update AI provider
 */
router.put('/providers/:id', (req, res) => {
  try {
    const db = getDatabase();

    const existing = db.prepare('SELECT id FROM ai_providers WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const { name, apiKey, baseUrl, config, isDefault, isActive } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (apiKey !== undefined) { updates.push('api_key = ?'); params.push(apiKey); }
    if (baseUrl !== undefined) { updates.push('base_url = ?'); params.push(baseUrl); }
    if (config !== undefined) { updates.push('config = ?'); params.push(JSON.stringify(config)); }
    if (isDefault !== undefined) { updates.push('is_default = ?'); params.push(isDefault ? 1 : 0); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE ai_providers SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const provider = db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(req.params.id);

    res.json({
      provider: transformProvider(provider)
    });

  } catch (error) {
    logger.error(`Failed to update provider: ${error.message}`);
    res.status(500).json({ error: 'Failed to update provider' });
  }
});

/**
 * DELETE /api/ai/providers/:id
 * Delete AI provider
 */
router.delete('/providers/:id', (req, res) => {
  try {
    const db = getDatabase();

    const result = db.prepare('DELETE FROM ai_providers WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    res.json({ message: 'Provider deleted' });

  } catch (error) {
    logger.error(`Failed to delete provider: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete provider' });
  }
});

/**
 * POST /api/ai/providers/:id/test
 * Test AI provider connection
 */
router.post('/providers/:id/test', async (req, res) => {
  try {
    const db = getDatabase();

    // User-level providers only - users must configure their own API keys
    const provider = db.prepare('SELECT * FROM ai_providers WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Actually test the provider connection based on type
    const baseUrl = provider.base_url || '';
    const apiKey = provider.api_key;
    const providerType = provider.type;

    try {
      let testUrl;
      let headers = { 'Content-Type': 'application/json' };
      let testResult = false;
      let modelCount = 0;
      let discoveredModels = [];

      switch (providerType) {
        case 'ollama':
          // Test Ollama by fetching available models
          testUrl = `${baseUrl.replace(/\/$/, '')}/api/tags`;
          const ollamaResponse = await fetch(testUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });

          if (ollamaResponse.ok) {
            const ollamaData = await ollamaResponse.json();
            testResult = true;
            discoveredModels = (ollamaData.models || []).map(m => m.name);
            modelCount = discoveredModels.length;

            // Auto-save discovered models to database
            if (discoveredModels.length > 0) {
              db.prepare('UPDATE ai_providers SET models = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(JSON.stringify(discoveredModels), req.params.id);
              logger.info(`Auto-saved ${modelCount} Ollama models for provider ${provider.name}`);
            }
          }
          break;

        case 'openrouter':
          // Test OpenRouter by fetching models
          testUrl = 'https://openrouter.ai/api/v1/models';
          if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
          }
          const orResponse = await fetch(testUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000)
          });

          if (orResponse.ok) {
            const orData = await orResponse.json();
            testResult = true;
            modelCount = orData.data?.length || 0;
          }
          break;

        case 'anthropic':
          // Test Anthropic - requires API key
          if (!apiKey) {
            return res.json({ success: false, message: 'API key not configured' });
          }
          // Make a minimal API call to verify key
          testUrl = `${baseUrl.replace(/\/$/, '')}/messages`;
          const anthropicResponse = await fetch(testUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }]
            }),
            signal: AbortSignal.timeout(10000)
          });
          // Even a 400 error means the key is valid (just not enough tokens, etc)
          // Only 401/403 mean authentication failure
          testResult = anthropicResponse.status !== 401 && anthropicResponse.status !== 403;
          break;

        case 'google':
          // Test Google AI
          if (!apiKey) {
            return res.json({ success: false, message: 'API key not configured' });
          }
          testUrl = `${baseUrl.replace(/\/$/, '')}/models?key=${apiKey}`;
          const googleResponse = await fetch(testUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000)
          });
          testResult = googleResponse.ok;
          if (testResult) {
            const googleData = await googleResponse.json();
            modelCount = googleData.models?.length || 0;
          }
          break;

        case 'cli-claude':
        case 'cli-gemini':
        case 'cli-opencode':
          // Test CLI providers by verifying auth and discovering models
          const cliType = providerType.replace('cli-', ''); // 'cli-opencode' -> 'opencode'
          const cliProvider = getCLIAIProvider();

          // Check if CLI is available
          const cliAvailable = await cliProvider.isAvailable(cliType);
          if (!cliAvailable) {
            return res.json({
              success: false,
              message: `${cliType} CLI is not installed or not accessible`,
              requiresAuth: false
            });
          }

          // Check authentication status
          const cliAuth = cliProvider.isAuthenticated(cliType);

          // Detect capabilities (includes model discovery)
          const capabilities = await cliProvider.detectCapabilities(cliType, true); // forceRefresh = true
          discoveredModels = (capabilities.models || CLI_DEFAULT_MODELS[cliType] || []).map(m =>
            typeof m === 'string' ? m : (m.id || m.name)
          );
          modelCount = discoveredModels.length;

          // Save discovered models to database
          if (discoveredModels.length > 0) {
            db.prepare('UPDATE ai_providers SET models = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(JSON.stringify(discoveredModels), req.params.id);
            logger.info(`Synced ${modelCount} ${cliType} CLI models for provider ${provider.name}`);
          }

          // Update auth state if needed
          if (cliAuth) {
            await cliProvider.saveAuthState(cliType, true, { capabilities });
          }

          testResult = cliAvailable;
          // Update last_tested for CLI providers (early return bypasses the common update below)
          if (cliAvailable) {
            db.prepare('UPDATE ai_providers SET last_tested = CURRENT_TIMESTAMP WHERE id = ?')
              .run(req.params.id);
          }
          // Return CLI-specific response
          return res.json({
            success: true,
            authenticated: cliAuth,
            message: cliAuth
              ? `${cliType} CLI authenticated (${modelCount} models synced)`
              : `${cliType} CLI available but not authenticated`,
            modelCount,
            models: discoveredModels,
            capabilities: capabilities.features || [],
            requiresAuth: !cliAuth
          });

        case 'openai-compatible':
        default:
          // Test OpenAI-compatible endpoints
          if (!apiKey) {
            return res.json({ success: false, message: 'API key not configured' });
          }
          testUrl = `${baseUrl.replace(/\/$/, '')}/models`;
          headers['Authorization'] = `Bearer ${apiKey}`;
          const openaiResponse = await fetch(testUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000)
          });
          testResult = openaiResponse.ok;
          if (testResult) {
            const openaiData = await openaiResponse.json();
            modelCount = openaiData.data?.length || 0;
          }
          break;
      }

      if (testResult) {
        // Update last_tested timestamp
        db.prepare('UPDATE ai_providers SET last_tested = CURRENT_TIMESTAMP WHERE id = ?')
          .run(req.params.id);

        res.json({
          success: true,
          message: `Connection successful${modelCount > 0 ? ` (${modelCount} models available)` : ''}`,
          modelCount,
          models: discoveredModels.length > 0 ? discoveredModels : undefined
        });
      } else {
        res.json({ success: false, message: 'Connection failed - could not reach provider' });
      }

    } catch (fetchError) {
      logger.warn(`Provider test failed for ${providerType}: ${fetchError.message}`);
      res.json({
        success: false,
        message: `Connection failed: ${fetchError.message.includes('timeout') ? 'Request timed out' : fetchError.message}`
      });
    }

  } catch (error) {
    logger.error(`Failed to test provider: ${error.message}`);
    res.status(500).json({ error: 'Failed to test provider' });
  }
});

/**
 * POST /api/ai/providers/test-config
 * Test a provider configuration without saving
 * Used by AddProviderModal to test before creating
 */
router.post('/providers/test-config', async (req, res) => {
  try {
    const { type, baseUrl, apiKey } = req.body;

    if (!type || !baseUrl) {
      return res.status(400).json({ error: 'type and baseUrl are required' });
    }

    let testUrl;
    let headers = { 'Content-Type': 'application/json' };
    let testResult = false;
    let modelCount = 0;
    let models = [];

    try {
      switch (type) {
        case 'ollama':
          testUrl = `${baseUrl.replace(/\/$/, '')}/api/tags`;
          const ollamaResponse = await fetch(testUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000)
          });

          if (ollamaResponse.ok) {
            const ollamaData = await ollamaResponse.json();
            testResult = true;
            models = ollamaData.models || [];
            modelCount = models.length;
          }
          break;

        case 'openrouter':
          testUrl = 'https://openrouter.ai/api/v1/models';
          if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
          }
          const orResponse = await fetch(testUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000)
          });

          if (orResponse.ok) {
            const orData = await orResponse.json();
            testResult = true;
            modelCount = orData.data?.length || 0;
          }
          break;

        case 'anthropic':
          if (!apiKey) {
            return res.json({ success: false, message: 'API key is required for Anthropic' });
          }
          testUrl = `${baseUrl.replace(/\/$/, '')}/messages`;
          const anthropicResponse = await fetch(testUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }]
            }),
            signal: AbortSignal.timeout(10000)
          });
          testResult = anthropicResponse.status !== 401 && anthropicResponse.status !== 403;
          break;

        case 'google':
          if (!apiKey) {
            return res.json({ success: false, message: 'API key is required for Google AI' });
          }
          testUrl = `${baseUrl.replace(/\/$/, '')}/models?key=${apiKey}`;
          const googleResponse = await fetch(testUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000)
          });
          if (googleResponse.ok) {
            const googleData = await googleResponse.json();
            testResult = true;
            modelCount = googleData.models?.length || 0;
          }
          break;

        case 'openai-compatible':
        default:
          if (!apiKey) {
            return res.json({ success: false, message: 'API key is required' });
          }
          testUrl = `${baseUrl.replace(/\/$/, '')}/models`;
          headers['Authorization'] = `Bearer ${apiKey}`;
          const openaiResponse = await fetch(testUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000)
          });
          if (openaiResponse.ok) {
            const openaiData = await openaiResponse.json();
            testResult = true;
            modelCount = openaiData.data?.length || 0;
          }
          break;
      }

      if (testResult) {
        res.json({
          success: true,
          message: `Connection successful${modelCount > 0 ? ` (${modelCount} models available)` : ''}`,
          modelCount,
          models: type === 'ollama' ? models : undefined
        });
      } else {
        res.json({ success: false, message: 'Connection failed - could not reach provider' });
      }

    } catch (fetchError) {
      logger.warn(`Provider config test failed for ${type}: ${fetchError.message}`);
      res.json({
        success: false,
        message: `Connection failed: ${fetchError.message.includes('timeout') ? 'Request timed out' : fetchError.message}`
      });
    }

  } catch (error) {
    logger.error(`Failed to test provider config: ${error.message}`);
    res.status(500).json({ error: 'Failed to test provider config' });
  }
});

/**
 * POST /api/ai/providers/discover-models
 * Discover models from a provider without saving
 * Used by AddProviderModal for model discovery
 */
router.post('/providers/discover-models', async (req, res) => {
  try {
    const { type, baseUrl, apiKey } = req.body;

    if (!type || !baseUrl) {
      return res.status(400).json({ error: 'type and baseUrl are required' });
    }

    let models = [];

    try {
      switch (type) {
        case 'ollama':
          const ollamaResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
            method: 'GET',
            signal: AbortSignal.timeout(10000)
          });

          if (ollamaResponse.ok) {
            const ollamaData = await ollamaResponse.json();
            models = (ollamaData.models || []).map(m => ({
              id: m.name,
              name: m.name.split(':')[0],
              size: m.size,
              modified: m.modified_at,
              details: m.details || {}
            }));
          }
          break;

        case 'openrouter':
          const headers = { 'Content-Type': 'application/json' };
          if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
          }
          const orResponse = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000)
          });

          if (orResponse.ok) {
            const orData = await orResponse.json();
            models = (orData.data || []).slice(0, 50).map(m => ({
              id: m.id,
              name: m.name || m.id,
              contextLength: m.context_length,
              pricing: m.pricing
            }));
          }
          break;

        case 'google':
          if (!apiKey) {
            return res.json({ success: false, message: 'API key required', models: [] });
          }
          const googleResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/models?key=${apiKey}`, {
            method: 'GET',
            signal: AbortSignal.timeout(10000)
          });

          if (googleResponse.ok) {
            const googleData = await googleResponse.json();
            models = (googleData.models || []).map(m => ({
              id: m.name,
              name: m.displayName || m.name,
              description: m.description
            }));
          }
          break;

        default:
          // For OpenAI-compatible and others
          if (apiKey) {
            const openaiResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              signal: AbortSignal.timeout(10000)
            });

            if (openaiResponse.ok) {
              const openaiData = await openaiResponse.json();
              models = (openaiData.data || []).map(m => ({
                id: m.id,
                name: m.id,
                ownedBy: m.owned_by
              }));
            }
          }
          break;
      }

      res.json({ success: true, models });

    } catch (fetchError) {
      logger.warn(`Model discovery failed for ${type}: ${fetchError.message}`);
      res.json({
        success: false,
        message: `Discovery failed: ${fetchError.message}`,
        models: []
      });
    }

  } catch (error) {
    logger.error(`Failed to discover models: ${error.message}`);
    res.status(500).json({ error: 'Failed to discover models' });
  }
});

/**
 * POST /api/ai/providers/ollama/pull
 * Pull/download a model from Ollama
 */
router.post('/providers/ollama/pull', async (req, res) => {
  try {
    const { baseUrl, modelName } = req.body;

    if (!baseUrl || !modelName) {
      return res.status(400).json({ error: 'baseUrl and modelName are required' });
    }

    logger.info(`Pulling Ollama model: ${modelName} from ${baseUrl}`);

    // Start the pull - this is a streaming endpoint in Ollama
    const pullResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: false }),
      signal: AbortSignal.timeout(600000) // 10 minute timeout for large models
    });

    if (pullResponse.ok) {
      const result = await pullResponse.json();
      logger.info(`Successfully pulled model: ${modelName}`);
      res.json({
        success: true,
        message: `Model ${modelName} downloaded successfully`,
        status: result.status
      });
    } else {
      const errorText = await pullResponse.text();
      logger.warn(`Failed to pull model ${modelName}: ${errorText}`);
      res.json({
        success: false,
        message: `Failed to download model: ${errorText}`
      });
    }

  } catch (error) {
    logger.error(`Failed to pull Ollama model: ${error.message}`);
    res.status(500).json({ error: `Failed to pull model: ${error.message}` });
  }
});

/**
 * GET /api/ai/providers/ollama/library
 * Get available models from Ollama library (popular models)
 */
router.get('/providers/ollama/library', async (req, res) => {
  try {
    // Return a curated list of popular Ollama models
    const popularModels = [
      { name: 'llama3.2', description: 'Meta Llama 3.2 - Latest Llama model', sizes: ['1b', '3b'] },
      { name: 'llama3.1', description: 'Meta Llama 3.1 - Powerful open model', sizes: ['8b', '70b'] },
      { name: 'mistral', description: 'Mistral 7B - Fast and efficient', sizes: ['7b'] },
      { name: 'mixtral', description: 'Mixtral 8x7B - MoE architecture', sizes: ['8x7b'] },
      { name: 'codellama', description: 'Code Llama - Optimized for code', sizes: ['7b', '13b', '34b'] },
      { name: 'deepseek-coder', description: 'DeepSeek Coder - Code generation', sizes: ['6.7b', '33b'] },
      { name: 'phi3', description: 'Microsoft Phi-3 - Small but capable', sizes: ['mini', 'medium'] },
      { name: 'gemma2', description: 'Google Gemma 2 - Lightweight model', sizes: ['2b', '9b', '27b'] },
      { name: 'qwen2.5', description: 'Alibaba Qwen 2.5 - Multilingual', sizes: ['0.5b', '1.5b', '7b', '72b'] },
      { name: 'llava', description: 'LLaVA - Vision-language model', sizes: ['7b', '13b'] },
      { name: 'nomic-embed-text', description: 'Nomic Embed - Text embeddings', sizes: ['v1.5'] },
    ];

    res.json({ models: popularModels });

  } catch (error) {
    logger.error(`Failed to get Ollama library: ${error.message}`);
    res.status(500).json({ error: 'Failed to get Ollama library' });
  }
});

/**
 * GET /api/ai/ollama/models
 * Get available models from local Ollama instance
 * Used by CreateAgentModal when provider is 'ollama'
 */
router.get('/ollama/models', async (req, res) => {
  try {
    const db = getDatabase();

    // Get Ollama provider config for user (or use default)
    const provider = db.prepare(`
      SELECT base_url FROM ai_providers
      WHERE user_id = ? AND type = 'ollama'
      LIMIT 1
    `).get(req.user.id);

    const baseUrl = provider?.base_url || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    // Fetch models from Ollama
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return res.json({
        success: false,
        data: [],
        error: `Failed to connect to Ollama at ${baseUrl}`
      });
    }

    const data = await response.json();
    const models = (data.models || []).map(m => ({
      name: m.name,
      size: m.size,
      modified: m.modified_at,
      details: m.details || {}
    }));

    res.json({ success: true, data: models });

  } catch (error) {
    logger.error(`Failed to get Ollama models: ${error.message}`);
    // Return empty array instead of error to allow fallback
    res.json({
      success: false,
      data: [],
      error: error.message
    });
  }
});

/**
 * POST /api/ai/providers/:id/set-default
 * Set default AI provider
 */
router.post('/providers/:id/set-default', (req, res) => {
  try {
    const db = getDatabase();

    // Reset all defaults for this user only (user-level providers)
    db.prepare('UPDATE ai_providers SET is_default = 0 WHERE user_id = ?').run(req.user.id);

    // Set new default (user-level providers only - users must configure their own API keys)
    const result = db.prepare('UPDATE ai_providers SET is_default = 1 WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    res.json({ message: 'Default provider set', success: true });

  } catch (error) {
    logger.error(`Failed to set default: ${error.message}`);
    res.status(500).json({ error: 'Failed to set default' });
  }
});

/**
 * POST /api/ai/providers/:id/set-default-model
 * Set default model for a provider
 * Also updates user's superbrain_settings preferred model
 */
router.post('/providers/:id/set-default-model', (req, res) => {
  try {
    const { modelId } = req.body;
    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required' });
    }

    const db = getDatabase();

    // Get provider info (user-level providers only)
    const provider = db.prepare('SELECT type FROM ai_providers WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Store default model in ai_providers table (add column if needed)
    // User-level providers only - users must configure their own API keys
    try {
      db.prepare('UPDATE ai_providers SET default_model = ? WHERE id = ? AND user_id = ?')
        .run(modelId, req.params.id, req.user.id);
    } catch (colErr) {
      // Column might not exist, add it (SQLite error: "no such column: default_model")
      if (colErr.message.includes('no such column') || colErr.message.includes('no column named')) {
        db.exec('ALTER TABLE ai_providers ADD COLUMN default_model TEXT');
        db.prepare('UPDATE ai_providers SET default_model = ? WHERE id = ? AND user_id = ?')
          .run(modelId, req.params.id, req.user.id);
      } else {
        throw colErr;
      }
    }

    // Also update superbrain_settings for this provider type
    // Check if model is free (from openrouter_models)
    const model = db.prepare('SELECT is_free FROM openrouter_models WHERE id = ?').get(modelId);
    const isFree = model?.is_free === 1;

    // Update the appropriate preferred model in superbrain_settings
    const column = isFree ? 'preferred_free_model' : 'preferred_paid_model';
    const existingSettings = db.prepare('SELECT id FROM superbrain_settings WHERE user_id = ?').get(req.user.id);

    if (existingSettings) {
      db.prepare(`UPDATE superbrain_settings SET ${column} = ?, updated_at = datetime('now') WHERE user_id = ?`)
        .run(modelId, req.user.id);
    } else {
      // Create new settings
      const { v4: uuidv4 } = require('uuid');
      db.prepare(`INSERT INTO superbrain_settings (id, user_id, ${column}, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`)
        .run(uuidv4(), req.user.id, modelId);
    }

    logger.info(`User ${req.user.id} set default model to ${modelId} for provider ${req.params.id}`);
    res.json({ message: 'Default model set', success: true, modelId });

  } catch (error) {
    logger.error(`Failed to set default model: ${error.message}`);
    res.status(500).json({ error: 'Failed to set default model' });
  }
});

// ============================================
// AI Usage Tracking
// ============================================

/**
 * GET /api/ai/usage
 * Get AI usage records
 */
router.get('/usage', (req, res) => {
  try {
    const db = getDatabase();
    const { startDate, endDate, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT * FROM ai_usage WHERE user_id = ?';
    const params = [req.user.id];

    if (startDate) {
      query += ' AND created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const usage = db.prepare(query).all(...params);

    res.json({ usage });

  } catch (error) {
    logger.error(`Failed to get usage: ${error.message}`);
    res.status(500).json({ error: 'Failed to get usage' });
  }
});

/**
 * GET /api/ai/usage/summary
 * Get AI usage summary
 */
router.get('/usage/summary', (req, res) => {
  try {
    const db = getDatabase();
    const { startDate, endDate } = req.query;

    const params = [req.user.id];
    let dateWhere = '';
    if (startDate) { dateWhere += ' AND created_at >= ?'; params.push(startDate); }
    if (endDate)   { dateWhere += ' AND created_at <= ?'; params.push(endDate); }

    // By provider
    const byProviderRows = db.prepare(`
      SELECT provider, COUNT(*) as requests,
             COALESCE(SUM(input_tokens + output_tokens), 0) as tokens,
             COALESCE(SUM(cost), 0) as cost
      FROM ai_usage WHERE user_id = ?${dateWhere}
      GROUP BY provider
    `).all(...params);

    // By model
    const byModelRows = db.prepare(`
      SELECT model, COUNT(*) as requests,
             COALESCE(SUM(input_tokens + output_tokens), 0) as tokens,
             COALESCE(SUM(cost), 0) as cost
      FROM ai_usage WHERE user_id = ?${dateWhere}
      GROUP BY model
    `).all(...params);

    // By date (daily)
    const byDateRows = db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as requests,
             COALESCE(SUM(input_tokens + output_tokens), 0) as tokens,
             COALESCE(SUM(cost), 0) as cost
      FROM ai_usage WHERE user_id = ?${dateWhere}
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all(...params);

    // Totals
    const totals = db.prepare(`
      SELECT COUNT(*) as requestCount,
             COALESCE(SUM(input_tokens + output_tokens), 0) as totalTokens,
             COALESCE(SUM(cost), 0) as totalCost
      FROM ai_usage WHERE user_id = ?${dateWhere}
    `).get(...params);

    // Reshape to match AIUsageSummary type
    const byProvider = {};
    for (const row of byProviderRows) {
      byProvider[row.provider || 'unknown'] = {
        tokens: row.tokens, cost: row.cost, requests: row.requests,
      };
    }

    const byModel = {};
    for (const row of byModelRows) {
      byModel[row.model || 'unknown'] = {
        tokens: row.tokens, cost: row.cost, requests: row.requests,
      };
    }

    const byDate = byDateRows.map(row => ({
      date: row.date, tokens: row.tokens, cost: row.cost, requests: row.requests,
    }));

    res.json({
      totalTokens:             totals.totalTokens   || 0,
      totalCost:               totals.totalCost      || 0,
      requestCount:            totals.requestCount   || 0,
      averageTokensPerRequest: totals.requestCount > 0
        ? Math.round(totals.totalTokens / totals.requestCount)
        : 0,
      byProvider,
      byModel,
      byDate,
    });

  } catch (error) {
    logger.error(`Failed to get usage summary: ${error.message}`);
    res.status(500).json({ error: 'Failed to get usage summary' });
  }
});

// ============================================
// MCP (Model Context Protocol)
// ============================================

/**
 * GET /api/ai/mcp/servers
 * List MCP servers
 */
router.get('/mcp/servers', (req, res) => {
  try {
    const db = getDatabase();
    const { getMCPClientManager } = require('../services/mcp/MCPClientManager.cjs');
    const mcpManager = getMCPClientManager();

    const servers = db.prepare('SELECT * FROM mcp_servers WHERE user_id = ?').all(req.user.id);

    res.json({
      servers: servers.map(s => ({
        ...s,
        config: s.config ? JSON.parse(s.config) : {},
        // Keep tools as JSON string - frontend ServerCard does JSON.parse(server.tools)
        tools: s.tools || '[]',
        isConnected: mcpManager.isConnected(req.user.id, s.id),
      }))
    });

  } catch (error) {
    logger.error(`Failed to list MCP servers: ${error.message}`);
    res.status(500).json({ error: 'Failed to list MCP servers' });
  }
});

/**
 * POST /api/ai/mcp/servers
 * Create MCP server
 */
router.post('/mcp/servers', (req, res) => {
  try {
    // Frontend sends 'transport', backend uses 'type' in DB
    const { name, type: rawType, transport, command, args, env, config, url } = req.body;
    const type = rawType || transport; // Accept either field name

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type/transport are required' });
    }

    // For SSE, store url in config if provided at top-level
    let configData = config || {};
    if (type === 'sse' && url && !configData.url) {
      configData = { ...configData, url };
    }

    const db = getDatabase();
    const serverId = uuidv4();

    db.prepare(`
      INSERT INTO mcp_servers (id, user_id, name, type, command, args, env, config, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'disconnected')
    `).run(
      serverId,
      req.user.id,
      name,
      type,
      command || null,
      args ? JSON.stringify(args) : null,
      env ? JSON.stringify(env) : null,
      Object.keys(configData).length > 0 ? JSON.stringify(configData) : null
    );

    const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(serverId);

    res.status(201).json({
      server: {
        ...server,
        config: server.config ? JSON.parse(server.config) : {},
        tools: server.tools ? JSON.parse(server.tools) : [],
      }
    });

  } catch (error) {
    logger.error(`Failed to create MCP server: ${error.message}`);
    res.status(500).json({ error: 'Failed to create MCP server' });
  }
});

/**
 * PUT /api/ai/mcp/servers/:serverId
 * Update MCP server
 */
router.put('/mcp/servers/:serverId', (req, res) => {
  try {
    const db = getDatabase();

    const existing = db.prepare('SELECT id FROM mcp_servers WHERE id = ? AND user_id = ?')
      .get(req.params.serverId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'MCP server not found' });
    }

    const { name, command, args, env, config } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (command !== undefined) { updates.push('command = ?'); params.push(command); }
    if (args !== undefined) { updates.push('args = ?'); params.push(JSON.stringify(args)); }
    if (env !== undefined) { updates.push('env = ?'); params.push(JSON.stringify(env)); }
    if (config !== undefined) { updates.push('config = ?'); params.push(JSON.stringify(config)); }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(req.params.serverId);
      db.prepare(`UPDATE mcp_servers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.serverId);

    res.json({
      server: {
        ...server,
        config: server.config ? JSON.parse(server.config) : {}
      }
    });

  } catch (error) {
    logger.error(`Failed to update MCP server: ${error.message}`);
    res.status(500).json({ error: 'Failed to update MCP server' });
  }
});

/**
 * DELETE /api/ai/mcp/servers/:serverId
 * Delete MCP server
 */
router.delete('/mcp/servers/:serverId', async (req, res) => {
  try {
    const db = getDatabase();
    const { getMCPClientManager } = require('../services/mcp/MCPClientManager.cjs');
    const mcpManager = getMCPClientManager();

    // Disconnect if connected
    if (mcpManager.isConnected(req.user.id, req.params.serverId)) {
      await mcpManager.disconnectServer(req.user.id, req.params.serverId);
    }

    const result = db.prepare('DELETE FROM mcp_servers WHERE id = ? AND user_id = ?')
      .run(req.params.serverId, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'MCP server not found' });
    }

    res.json({ message: 'MCP server deleted' });

  } catch (error) {
    logger.error(`Failed to delete MCP server: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete MCP server' });
  }
});

/**
 * POST /api/ai/mcp/servers/:serverId/connect
 * Connect to MCP server
 */
router.post('/mcp/servers/:serverId/connect', async (req, res) => {
  try {
    const { getMCPClientManager } = require('../services/mcp/MCPClientManager.cjs');
    const mcpManager = getMCPClientManager();

    const result = await mcpManager.connectServer(req.user.id, req.params.serverId);

    res.json({
      status: 'connected',
      tools: result.tools,
      toolCount: result.tools.length,
    });

  } catch (error) {
    logger.error(`Failed to connect MCP server: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to connect MCP server' });
  }
});

/**
 * POST /api/ai/mcp/servers/:serverId/disconnect
 * Disconnect from MCP server
 */
router.post('/mcp/servers/:serverId/disconnect', async (req, res) => {
  try {
    const { getMCPClientManager } = require('../services/mcp/MCPClientManager.cjs');
    const mcpManager = getMCPClientManager();

    await mcpManager.disconnectServer(req.user.id, req.params.serverId);

    res.json({ status: 'disconnected' });

  } catch (error) {
    logger.error(`Failed to disconnect MCP server: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to disconnect MCP server' });
  }
});

/**
 * GET /api/ai/mcp/tools
 * List MCP tools
 */
router.get('/mcp/tools', (req, res) => {
  try {
    const db = getDatabase();
    const { getMCPClientManager } = require('../services/mcp/MCPClientManager.cjs');
    const mcpManager = getMCPClientManager();

    // Get live tools from connected servers (has full inputSchema in memory)
    const liveTools = mcpManager.getTools(req.user.id);

    if (liveTools.length > 0) {
      res.json({ tools: liveTools });
      return;
    }

    // Fallback: read from mcp_server_tools table (for servers that were previously connected)
    const dbTools = db.prepare(`
      SELECT st.tool_name as name, st.description, st.input_schema,
             st.server_id as serverId, ms.name as serverName
      FROM mcp_server_tools st
      JOIN mcp_servers ms ON st.server_id = ms.id
      WHERE st.user_id = ? AND st.is_enabled = 1 AND ms.status = 'connected'
    `).all(req.user.id);

    const tools = dbTools.map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.input_schema ? JSON.parse(t.input_schema) : { type: 'object', properties: {} },
      serverId: t.serverId,
      serverName: t.serverName,
    }));

    res.json({ tools });

  } catch (error) {
    logger.error(`Failed to list MCP tools: ${error.message}`);
    res.status(500).json({ error: 'Failed to list MCP tools' });
  }
});

/**
 * POST /api/ai/mcp/tools/:toolName/call
 * Call MCP tool
 */
router.post('/mcp/tools/:toolName/call', async (req, res) => {
  try {
    const { serverId, arguments: args } = req.body;
    const { getMCPClientManager } = require('../services/mcp/MCPClientManager.cjs');
    const mcpManager = getMCPClientManager();

    if (!serverId) {
      return res.status(400).json({ error: 'serverId is required' });
    }

    const result = await mcpManager.callTool(
      req.user.id,
      serverId,
      req.params.toolName,
      args || {}
    );

    res.json({ success: true, result });

  } catch (error) {
    logger.error(`Failed to call MCP tool: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to call MCP tool' });
  }
});

// ============================================
// Rate Limiting Routes
// ============================================

const rateLimitService = require('../services/rateLimitService.cjs');

/**
 * GET /api/ai/rate-limit/status
 * Get current rate limit status
 */
router.get('/rate-limit/status', async (req, res) => {
  try {
    const status = await rateLimitService.getStatus(req.user.id);
    res.json({ status });
  } catch (error) {
    logger.error(`Failed to get rate limit status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get rate limit status' });
  }
});

/**
 * GET /api/ai/rate-limit/tiers
 * Get available rate limit tiers
 */
router.get('/rate-limit/tiers', (req, res) => {
  try {
    const tiers = Object.entries(rateLimitService.RATE_LIMIT_TIERS).map(([id, config]) => ({
      id,
      ...config
    }));
    res.json({ tiers });
  } catch (error) {
    logger.error(`Failed to get rate limit tiers: ${error.message}`);
    res.status(500).json({ error: 'Failed to get rate limit tiers' });
  }
});

/**
 * GET /api/ai/rate-limit/history
 * Get rate limit usage history
 */
router.get('/rate-limit/history', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const history = await rateLimitService.getHistory(req.user.id, days);
    res.json({ history, period: { days } });
  } catch (error) {
    logger.error(`Failed to get rate limit history: ${error.message}`);
    res.status(500).json({ error: 'Failed to get rate limit history' });
  }
});

/**
 * GET /api/ai/rate-limit/check
 * Check if request would be allowed
 */
router.get('/rate-limit/check', async (req, res) => {
  try {
    const { allowed, status } = await rateLimitService.checkRateLimit(req.user.id);
    res.json({ allowed, status });
  } catch (error) {
    logger.error(`Failed to check rate limit: ${error.message}`);
    res.status(500).json({ error: 'Failed to check rate limit' });
  }
});

/**
 * POST /api/ai/rate-limit/reset/:userId
 * Reset rate limits (admin only)
 */
router.post('/rate-limit/reset/:userId', async (req, res) => {
  try {
    // Check admin access
    if (req.user.role !== 'admin' && !req.user.isSuperuser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await rateLimitService.resetLimits(req.params.userId);
    res.json({ message: `Rate limits reset for user ${req.params.userId}` });
  } catch (error) {
    logger.error(`Failed to reset rate limits: ${error.message}`);
    res.status(500).json({ error: 'Failed to reset rate limits' });
  }
});

/**
 * PUT /api/ai/rate-limit/tier/:userId
 * Update user tier (admin only)
 */
router.put('/rate-limit/tier/:userId', async (req, res) => {
  try {
    // Check admin access
    if (req.user.role !== 'admin' && !req.user.isSuperuser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { tier } = req.body;
    if (!tier || !rateLimitService.RATE_LIMIT_TIERS[tier]) {
      return res.status(400).json({
        error: `Invalid tier. Valid tiers: ${Object.keys(rateLimitService.RATE_LIMIT_TIERS).join(', ')}`
      });
    }

    await rateLimitService.setUserTier(req.params.userId, tier);
    res.json({
      message: `User ${req.params.userId} tier updated to ${tier}`,
      tierUpdate: { userId: req.params.userId, tier, config: rateLimitService.RATE_LIMIT_TIERS[tier] }
    });
  } catch (error) {
    logger.error(`Failed to update user tier: ${error.message}`);
    res.status(500).json({ error: 'Failed to update user tier' });
  }
});

// ============================================
// Model Management Routes
// ============================================

/**
 * GET /api/ai/models
 * List available models with filtering
 * Auto-syncs from OpenRouter if table is empty
 * Supports capability filters: vision, tools, json
 */
router.get('/models', async (req, res) => {
  try {
    const db = getDatabase();
    const { free, provider, search, minContext, modality, vision, tools, json } = req.query;

    // Check if we have models, if not trigger auto-sync
    const modelCount = db.prepare('SELECT COUNT(*) as count FROM openrouter_models').get();
    if (modelCount.count === 0) {
      logger.info('No models in database, triggering auto-sync from OpenRouter...');
      try {
        const modelSyncService = require('../services/modelSyncService.cjs');
        await modelSyncService.syncModels();
      } catch (syncError) {
        logger.warn(`Auto-sync failed: ${syncError.message}`);
        // Continue anyway - will return empty array
      }
    }

    let sql = 'SELECT * FROM openrouter_models WHERE 1=1';
    const params = [];

    if (free === 'true') {
      sql += ' AND is_free = 1';
    } else if (free === 'false') {
      sql += ' AND is_free = 0';
    }

    if (provider) {
      sql += ' AND provider = ?';
      params.push(provider);
    }

    if (search) {
      sql += ' AND (name LIKE ? OR id LIKE ? OR description LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (minContext) {
      sql += ' AND context_length >= ?';
      params.push(parseInt(minContext));
    }

    if (modality) {
      sql += ' AND modality LIKE ?';
      params.push(`%${modality}%`);
    }

    // Capability filters
    if (vision === 'true') {
      sql += ' AND supports_vision = 1';
    }
    if (tools === 'true') {
      sql += ' AND supports_tools = 1';
    }
    if (json === 'true') {
      sql += ' AND supports_json = 1';
    }

    sql += ' ORDER BY name';

    const models = db.prepare(sql).all(...params);

    const transformedModels = models.map(m => ({
      ...m,
      isFree: !!m.is_free,
      pricingPrompt: m.pricing_prompt,
      pricingCompletion: m.pricing_completion,
      contextLength: m.context_length,
      topProvider: m.top_provider,
      perRequestLimits: m.per_request_limits ? JSON.parse(m.per_request_limits) : null,
      // Capabilities
      supportsVision: !!m.supports_vision,
      supportsTools: !!m.supports_tools,
      supportsJson: !!m.supports_json,
      supportsStreaming: !!m.supports_streaming,
      inputModalities: m.input_modalities ? JSON.parse(m.input_modalities) : ['text'],
      outputModalities: m.output_modalities ? JSON.parse(m.output_modalities) : ['text'],
      maxOutputTokens: m.max_output_tokens,
      tokenizer: m.tokenizer
    }));

    res.json({
      models: transformedModels,
      pagination: {
        count: transformedModels.length,
        total: transformedModels.length
      }
    });

  } catch (error) {
    logger.error(`Failed to list models: ${error.message}`);
    res.status(500).json({ error: 'Failed to list models' });
  }
});

/**
 * GET /api/ai/models/free
 * Get free models only with capabilities
 */
router.get('/models/free', (req, res) => {
  try {
    const db = getDatabase();
    const models = db.prepare('SELECT * FROM openrouter_models WHERE is_free = 1 ORDER BY name').all();

    const transformedModels = models.map(m => ({
      ...m,
      isFree: true,
      pricingPrompt: m.pricing_prompt,
      pricingCompletion: m.pricing_completion,
      contextLength: m.context_length,
      supportsVision: !!m.supports_vision,
      supportsTools: !!m.supports_tools,
      supportsJson: !!m.supports_json,
      supportsStreaming: !!m.supports_streaming
    }));

    res.json({ models: transformedModels });

  } catch (error) {
    logger.error(`Failed to get free models: ${error.message}`);
    res.status(500).json({ error: 'Failed to get free models' });
  }
});

/**
 * GET /api/ai/models/recommended
 * Get recommended models with capabilities
 */
router.get('/models/recommended', (req, res) => {
  try {
    const db = getDatabase();

    // Recommended models: Claude, GPT-4, Gemini, Llama variants
    const recommended = db.prepare(`
      SELECT * FROM openrouter_models
      WHERE id LIKE '%claude%'
         OR id LIKE '%gpt-4%'
         OR id LIKE '%gemini%'
         OR id LIKE '%llama%'
      ORDER BY name
      LIMIT 20
    `).all();

    const transformedModels = recommended.map(m => ({
      ...m,
      isFree: !!m.is_free,
      pricingPrompt: m.pricing_prompt,
      pricingCompletion: m.pricing_completion,
      contextLength: m.context_length,
      supportsVision: !!m.supports_vision,
      supportsTools: !!m.supports_tools,
      supportsJson: !!m.supports_json,
      supportsStreaming: !!m.supports_streaming
    }));

    res.json({ success: true, data: transformedModels, models: transformedModels });

  } catch (error) {
    logger.error(`Failed to get recommended models: ${error.message}`);
    res.status(500).json({ error: 'Failed to get recommended models' });
  }
});

/**
 * GET /api/ai/models/providers
 * List unique providers
 * Auto-syncs from OpenRouter if table is empty
 */
router.get('/models/providers', async (req, res) => {
  try {
    const db = getDatabase();

    // Check if we have models, if not trigger auto-sync
    const modelCount = db.prepare('SELECT COUNT(*) as count FROM openrouter_models').get();
    if (modelCount.count === 0) {
      logger.info('No models in database, triggering auto-sync from OpenRouter...');
      try {
        const modelSyncService = require('../services/modelSyncService.cjs');
        await modelSyncService.syncModels();
      } catch (syncError) {
        logger.warn(`Auto-sync failed: ${syncError.message}`);
      }
    }

    const providers = db.prepare(`
      SELECT DISTINCT provider, COUNT(*) as modelCount
      FROM openrouter_models
      WHERE provider IS NOT NULL
      GROUP BY provider
      ORDER BY provider
    `).all();

    res.json({ modelProviders: providers });

  } catch (error) {
    logger.error(`Failed to list providers: ${error.message}`);
    res.status(500).json({ error: 'Failed to list providers' });
  }
});

/**
 * GET /api/ai/models/by-provider
 * Models grouped by provider
 */
router.get('/models/by-provider', (req, res) => {
  try {
    const db = getDatabase();
    const models = db.prepare('SELECT * FROM openrouter_models ORDER BY provider, name').all();

    const grouped = {};
    for (const model of models) {
      const provider = model.provider || 'unknown';
      if (!grouped[provider]) {
        grouped[provider] = [];
      }
      grouped[provider].push({ ...model, isFree: !!model.is_free });
    }

    res.json({
      modelsByProvider: grouped,
      providerCount: Object.keys(grouped).length
    });

  } catch (error) {
    logger.error(`Failed to get models by provider: ${error.message}`);
    res.status(500).json({ error: 'Failed to get models by provider' });
  }
});

/**
 * GET /api/ai/models/capabilities
 * Find models by capability requirements
 * Used by SuperBrain and Agentic AI for intelligent model selection
 */
router.get('/models/capabilities', (req, res) => {
  try {
    const { vision, tools, json, minContext, preferFree } = req.query;
    const modelSyncService = require('../services/modelSyncService.cjs');

    const models = modelSyncService.getModelsWithCapabilities({
      vision: vision === 'true',
      tools: tools === 'true',
      json: json === 'true',
      minContext: minContext ? parseInt(minContext) : undefined,
      preferFree: preferFree === 'true'
    });

    res.json({ models });

  } catch (error) {
    logger.error(`Failed to get models by capability: ${error.message}`);
    res.status(500).json({ error: 'Failed to get models by capability' });
  }
});

/**
 * GET /api/ai/models/capabilities/summary
 * Get capability summary statistics
 */
router.get('/models/capabilities/summary', (req, res) => {
  try {
    const modelSyncService = require('../services/modelSyncService.cjs');
    const summary = modelSyncService.getCapabilitySummary();

    res.json({
      summary: {
        totalModels: summary.total,
        visionModels: summary.visionCount,
        toolsModels: summary.toolsCount,
        jsonModels: summary.jsonCount,
        streamingModels: summary.streamingCount,
        freeModels: summary.freeCount
      }
    });

  } catch (error) {
    logger.error(`Failed to get capability summary: ${error.message}`);
    res.status(500).json({ error: 'Failed to get capability summary' });
  }
});

/**
 * GET /api/ai/models/sync-status
 * Get model sync status
 */
router.get('/models/sync-status', (req, res) => {
  try {
    const db = getDatabase();

    const count = db.prepare('SELECT COUNT(*) as count FROM openrouter_models').get();
    const latest = db.prepare('SELECT MAX(updated_at) as lastSync FROM openrouter_models').get();

    res.json({
      syncStatus: {
        currentModelCount: count.count,
        lastSync: latest.lastSync,
        source: 'openrouter'
      }
    });

  } catch (error) {
    logger.error(`Failed to get sync status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

/**
 * POST /api/ai/models/refresh
 * Refresh models from OpenRouter API
 */
router.post('/models/refresh', async (req, res) => {
  try {
    const modelSyncService = require('../services/modelSyncService.cjs');
    const result = await modelSyncService.syncModels();

    if (result.success) {
      res.json({
        success: true,
        message: 'Models synced from OpenRouter',
        count: result.count
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Sync failed'
      });
    }

  } catch (error) {
    logger.error(`Failed to refresh models: ${error.message}`);
    res.status(500).json({ error: 'Failed to refresh models' });
  }
});

/**
 * POST /api/ai/models/validate
 * Validate model IDs
 */
router.post('/models/validate', (req, res) => {
  try {
    const { modelIds } = req.body;

    if (!Array.isArray(modelIds)) {
      return res.status(400).json({ error: 'modelIds must be an array' });
    }

    const db = getDatabase();
    const results = {};

    for (const modelId of modelIds) {
      const model = db.prepare('SELECT id FROM openrouter_models WHERE id = ?').get(modelId);
      results[modelId] = !!model;
    }

    res.json({ validation: results });

  } catch (error) {
    logger.error(`Failed to validate models: ${error.message}`);
    res.status(500).json({ error: 'Failed to validate models' });
  }
});

/**
 * POST /api/ai/ollama/sync-capabilities
 * Sync Ollama models with their capabilities (vision, embedding, tools)
 * Uses /api/show endpoint to detect capabilities dynamically
 */
router.post('/ollama/sync-capabilities', async (req, res) => {
  try {
    const { getOllamaProvider } = require('../services/ai/providers/OllamaProvider.cjs');
    const ollama = getOllamaProvider();

    // Check if Ollama is available
    const isHealthy = await ollama.isAvailable();
    if (!isHealthy) {
      return res.status(503).json({
        success: false,
        error: 'Ollama server not available'
      });
    }

    // Sync capabilities
    const result = await ollama.syncModelCapabilities();

    res.json(result);

  } catch (error) {
    logger.error(`Failed to sync Ollama capabilities: ${error.message}`);
    res.status(500).json({ error: 'Failed to sync Ollama capabilities' });
  }
});

/**
 * GET /api/ai/ollama/models
 * Get all Ollama models with their capabilities from database
 */
router.get('/ollama/models', async (req, res) => {
  try {
    const db = getDatabase();

    // Get models from ollama_models table
    const models = db.prepare(`
      SELECT id, name, size, parameter_size, quantization, format, family,
             context_length, embedding_length,
             supports_completion, supports_vision, supports_embedding, supports_tools,
             raw_capabilities, modified_at, synced_at
      FROM ollama_models
      ORDER BY name
    `).all();

    // Also check if Ollama is running
    let ollamaStatus = false;
    try {
      const { getOllamaProvider } = require('../services/ai/providers/OllamaProvider.cjs');
      const ollama = getOllamaProvider();
      ollamaStatus = await ollama.isAvailable();
    } catch {
      // Ollama not available
    }

    res.json({
      models: models.map(m => ({
        ...m,
        capabilities: m.raw_capabilities ? JSON.parse(m.raw_capabilities) : [],
        supportsCompletion: m.supports_completion === 1,
        supportsVision: m.supports_vision === 1,
        supportsEmbedding: m.supports_embedding === 1,
        supportsTools: m.supports_tools === 1,
      })),
      count: models.length,
      ollamaOnline: ollamaStatus
    });

  } catch (error) {
    logger.error(`Failed to get Ollama models: ${error.message}`);
    res.status(500).json({ error: 'Failed to get Ollama models' });
  }
});

/**
 * GET /api/ai/ollama/model/:modelId
 * Get detailed info for a specific Ollama model (live from API)
 */
router.get('/ollama/model/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;

    const { getOllamaProvider } = require('../services/ai/providers/OllamaProvider.cjs');
    const ollama = getOllamaProvider();

    // Check if Ollama is available
    const isHealthy = await ollama.isAvailable();
    if (!isHealthy) {
      return res.status(503).json({
        success: false,
        error: 'Ollama server not available'
      });
    }

    // Get model info
    const info = await ollama.getModelInfo(modelId);

    if (!info) {
      return res.status(404).json({
        success: false,
        error: `Model ${modelId} not found`
      });
    }

    res.json({
      success: true,
      model: info
    });

  } catch (error) {
    logger.error(`Failed to get Ollama model info: ${error.message}`);
    res.status(500).json({ error: 'Failed to get Ollama model info' });
  }
});

// ============================================
// AI Message Features (Translation, Rephrase, Transform)
// All features powered by SuperBrain Router
// ============================================

const { getSuperBrainRouter } = require('../services/ai/SuperBrainRouter.cjs');

/**
 * GET /api/ai/languages
 * Get supported languages for translation
 */
router.get('/languages', (req, res) => {
  const superBrain = getSuperBrainRouter();
  res.json({ languages: superBrain.getSupportedLanguages() });
});

/**
 * GET /api/ai/rephrase-styles
 * Get available rephrase styles
 */
router.get('/rephrase-styles', (req, res) => {
  const superBrain = getSuperBrainRouter();
  const styles = superBrain.getRephraseStyles();
  res.json({
    styles: Object.entries(styles).map(([id, description]) => ({
      id,
      description,
    })),
  });
});

/**
 * POST /api/ai/translate
 * Translate a message to target language (via SuperBrain)
 */
router.post('/translate', async (req, res) => {
  try {
    const { message, targetLanguage, platform } = req.body;

    if (!message || !targetLanguage) {
      return res.status(400).json({ error: 'message and targetLanguage are required' });
    }

    logger.info(`SuperBrain translating message to ${targetLanguage} for user ${req.user.id}`);

    const superBrain = getSuperBrainRouter();
    const result = await superBrain.translateMessage({
      message,
      targetLanguage,
      platform,
      userId: req.user.id,
    });

    res.json(result);

  } catch (error) {
    logger.error(`Failed to translate message: ${error.message}`);
    res.status(500).json({ error: 'Failed to translate message' });
  }
});

/**
 * POST /api/ai/rephrase
 * Rephrase/polish a message for better clarity (via SuperBrain)
 * Platform-aware (WhatsApp, Telegram, Email)
 */
router.post('/rephrase', async (req, res) => {
  try {
    const { message, targetLanguage, platform = 'whatsapp', style = 'professional' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    logger.info(`SuperBrain rephrasing message for ${platform} user ${req.user.id}`);

    const superBrain = getSuperBrainRouter();
    const result = await superBrain.rephraseMessage({
      message,
      targetLanguage,
      platform,
      style,
      userId: req.user.id,
    });

    res.json(result);

  } catch (error) {
    logger.error(`Failed to rephrase message: ${error.message}`);
    res.status(500).json({ error: 'Failed to rephrase message' });
  }
});

/**
 * POST /api/ai/transform
 * Transform message content (detect URLs, extract embeds)
 */
router.post('/transform', (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const superBrain = getSuperBrainRouter();
    const result = superBrain.transformMessage({ message });

    res.json(result);

  } catch (error) {
    logger.error(`Failed to transform message: ${error.message}`);
    res.status(500).json({ error: 'Failed to transform message' });
  }
});

/**
 * GET /api/ai/superbrain/info
 * Get SuperBrain status and capabilities
 */
router.get('/superbrain/info', (req, res) => {
  try {
    const superBrain = getSuperBrainRouter();
    res.json(superBrain.getInfo());
  } catch (error) {
    logger.error(`Failed to get SuperBrain info: ${error.message}`);
    res.status(500).json({ error: 'Failed to get SuperBrain info' });
  }
});

// ============================================
// SuperBrain Message Processor Routes
// ============================================

/**
 * POST /api/ai/superbrain/process
 * Process a message through SuperBrain (Central Hub)
 * Routes to flows, tools, AI, or swarm based on intent
 */
router.post('/superbrain/process', async (req, res) => {
  try {
    const { message, mode, context = {} } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message object is required' });
    }

    const processor = getSuperBrainMessageProcessor();

    const result = await processor.process(message, {
      userId: req.user.id,
      mode: mode || PROCESSING_MODES.AUTO,
      ...context,
    });

    res.json({
      success: true,
      ...result,
    });

  } catch (error) {
    logger.error(`SuperBrain process failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to process message through SuperBrain' });
  }
});

/**
 * GET /api/ai/superbrain/modes
 * Get available processing modes
 */
router.get('/superbrain/modes', (req, res) => {
  res.json({
    modes: Object.entries(PROCESSING_MODES).map(([key, value]) => ({
      id: value,
      name: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
      description: {
        auto: 'SuperBrain decides the best processing path (Flow → AI Router → Direct AI)',
        flow_only: 'Only check for matching flow triggers',
        ai_router: 'Use AI Router for intent classification and tool execution',
        direct_ai: 'Direct AI response without tool routing',
        swarm: 'Route to swarm agents',
      }[value] || '',
    })),
    defaultMode: PROCESSING_MODES.AUTO,
  });
});

/**
 * GET /api/ai/superbrain/response-types
 * Get possible response types
 */
router.get('/superbrain/response-types', (req, res) => {
  res.json({
    types: Object.entries(RESPONSE_TYPES).map(([key, value]) => ({
      id: value,
      name: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
    })),
  });
});

/**
 * GET /api/ai/superbrain/status
 * Get SuperBrain Message Processor status
 */
router.get('/superbrain/status', (req, res) => {
  try {
    const processor = getSuperBrainMessageProcessor();

    res.json({
      initialized: processor.initialized,
      metrics: processor.getMetrics(),
      modes: PROCESSING_MODES,
      responseTypes: RESPONSE_TYPES,
    });

  } catch (error) {
    logger.error(`Failed to get SuperBrain status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get SuperBrain status' });
  }
});

/**
 * POST /api/ai/superbrain/config
 * Update SuperBrain configuration
 */
router.post('/superbrain/config', (req, res) => {
  try {
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Config object is required' });
    }

    const processor = getSuperBrainMessageProcessor();

    // Validate config keys
    const validKeys = [
      'enableFlowTriggers',
      'enableAIRouter',
      'enableSwarm',
      'autoReply',
    ];

    const updates = {};
    for (const key of validKeys) {
      if (key in config) {
        updates[key] = config[key];
      }
    }

    processor.config = { ...processor.config, ...updates };

    res.json({
      success: true,
      config: processor.config,
    });

  } catch (error) {
    logger.error(`Failed to update SuperBrain config: ${error.message}`);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// ============================================
// AI Router (Main Brain) Routes
// ============================================

/**
 * POST /api/ai/router/process
 * Process a message through the AI Router (Main Brain)
 * Classifies intent and executes appropriate tools
 */
router.post('/router/process', async (req, res) => {
  try {
    const { message, context = {} } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const router = getAIRouterService();

    const result = await router.process({
      message: message.trim(),
      userId: req.user.id,
      sessionId: context.sessionId || uuidv4(),
      context: {
        ...context,
        agentId: context.agentId,
        flowId: context.flowId,
      },
    });

    res.json({
      success: true,
      ...result,
    });

  } catch (error) {
    logger.error(`AI Router process failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to process message through AI Router' });
  }
});

/**
 * GET /api/ai/router/tools
 * Get all available system tools
 */
router.get('/router/tools', (req, res) => {
  try {
    const registry = getSystemToolsRegistry();
    const tools = registry.getAllTools();

    res.json({
      tools: tools.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        parameters: t.parameters,
        requiredParams: t.requiredParams,
        optionalParams: t.optionalParams,
        examples: t.examples,
        requiresAuth: t.requiresAuth,
      })),
      count: tools.length,
    });

  } catch (error) {
    logger.error(`Failed to get router tools: ${error.message}`);
    res.status(500).json({ error: 'Failed to get tools' });
  }
});

/**
 * GET /api/ai/router/tools/categories
 * Get tools grouped by category with full tool information
 */
router.get('/router/tools/categories', (req, res) => {
  try {
    const registry = getSystemToolsRegistry();
    const grouped = registry.getToolsByCategory();

    res.json({
      categories: Object.keys(TOOL_CATEGORIES).map(key => ({
        id: TOOL_CATEGORIES[key],
        name: key.charAt(0) + key.slice(1).toLowerCase(),
        tools: (grouped[TOOL_CATEGORIES[key]] || []).map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          parameters: t.parameters || {},
          requiredParams: t.requiredParams || [],
          examples: t.examples || [],
          requiresAuth: t.requiresAuth || false,
        })),
      })),
    });

  } catch (error) {
    logger.error(`Failed to get tool categories: ${error.message}`);
    res.status(500).json({ error: 'Failed to get tool categories' });
  }
});

/**
 * GET /api/ai/router/knowledge-base
 * Get tool definitions formatted for AI knowledge base
 */
router.get('/router/knowledge-base', (req, res) => {
  try {
    const registry = getSystemToolsRegistry();

    res.json({
      systemPrompt: registry.getSystemPrompt(),
      toolDefinitions: registry.getToolKnowledgeBase(),
    });

  } catch (error) {
    logger.error(`Failed to get knowledge base: ${error.message}`);
    res.status(500).json({ error: 'Failed to get knowledge base' });
  }
});

/**
 * GET /api/ai/router/status
 * Get AI Router metrics and status
 */
router.get('/router/status', (req, res) => {
  try {
    const router = getAIRouterService();
    const registry = getSystemToolsRegistry();

    res.json({
      metrics: router.getMetrics(),
      toolCount: registry.getAllTools().length,
      categories: Object.keys(TOOL_CATEGORIES).length,
      confidenceThresholds: CONFIDENCE_THRESHOLDS,
    });

  } catch (error) {
    logger.error(`Failed to get router status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get router status' });
  }
});

/**
 * POST /api/ai/router/clear-history
 * Clear conversation history for a session
 */
router.post('/router/clear-history', (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const router = getAIRouterService();
    router.clearHistory(sessionId);

    res.json({
      success: true,
      message: 'Conversation history cleared',
    });

  } catch (error) {
    logger.error(`Failed to clear history: ${error.message}`);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

/**
 * POST /api/ai/router/execute-tool
 * Execute a specific tool directly (without AI classification)
 */
router.post('/router/execute-tool', async (req, res) => {
  try {
    const { toolId, parameters = {} } = req.body;

    if (!toolId) {
      return res.status(400).json({ error: 'Tool ID is required' });
    }

    const registry = getSystemToolsRegistry();
    const tool = registry.getTool(toolId);

    if (!tool) {
      return res.status(404).json({ error: `Tool not found: ${toolId}` });
    }

    // Validate required parameters
    const missingParams = tool.requiredParams.filter(p => !(p in parameters));
    if (missingParams.length > 0) {
      return res.status(400).json({
        error: 'Missing required parameters',
        missingParams,
      });
    }

    // Execute the tool
    const result = await registry.executeTool(toolId, parameters, {
      userId: req.user.id,
      requestId: uuidv4(),
    });

    res.json({
      success: result.success,
      tool: toolId,
      result: result.data,
      error: result.error,
    });

  } catch (error) {
    logger.error(`Failed to execute tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to execute tool' });
  }
});

/**
 * GET /api/ai/router/tool/:toolId
 * Get details for a specific tool
 */
router.get('/router/tool/:toolId', (req, res) => {
  try {
    const registry = getSystemToolsRegistry();
    const tool = registry.getTool(req.params.toolId);

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    res.json({ tool });

  } catch (error) {
    logger.error(`Failed to get tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to get tool' });
  }
});

/**
 * GET /api/ai/models/:modelId
 * Get specific model by ID with full capabilities
 * NOTE: This must be last as :modelId matches any path
 */
router.get('/models/:modelId(*)', (req, res) => {
  try {
    const db = getDatabase();
    const model = db.prepare('SELECT * FROM openrouter_models WHERE id = ?').get(req.params.modelId);

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    res.json({
      model: {
        ...model,
        isFree: !!model.is_free,
        pricingPrompt: model.pricing_prompt,
        pricingCompletion: model.pricing_completion,
        contextLength: model.context_length,
        // Capabilities
        supportsVision: !!model.supports_vision,
        supportsTools: !!model.supports_tools,
        supportsJson: !!model.supports_json,
        supportsStreaming: !!model.supports_streaming,
        inputModalities: model.input_modalities ? JSON.parse(model.input_modalities) : ['text'],
        outputModalities: model.output_modalities ? JSON.parse(model.output_modalities) : ['text'],
        maxOutputTokens: model.max_output_tokens,
        tokenizer: model.tokenizer
      }
    });

  } catch (error) {
    logger.error(`Failed to get model: ${error.message}`);
    res.status(500).json({ error: 'Failed to get model' });
  }
});

// ============================================
// Link Preview (OG Metadata)
// ============================================

// Link previews cached in Redis with 30-day TTL (configured in redis.cjs)

/**
 * Extract OG meta tags, Twitter Cards, and other metadata from HTML using regex
 */
function extractOgMetadata(html, url) {
  const urlObj = new URL(url);
  const metadata = {
    url,
    title: null,
    description: null,
    image: null,
    siteName: null,
    type: null,
    favicon: null,
  };

  // Helper to make URLs absolute
  const makeAbsolute = (urlStr) => {
    if (!urlStr) return null;
    if (urlStr.startsWith('//')) {
      return `${urlObj.protocol}${urlStr}`;
    }
    if (urlStr.startsWith('/')) {
      return `${urlObj.protocol}//${urlObj.host}${urlStr}`;
    }
    if (!urlStr.startsWith('http')) {
      return `${urlObj.protocol}//${urlObj.host}/${urlStr}`;
    }
    return urlStr;
  };

  // Extract og:title
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogTitleMatch) metadata.title = ogTitleMatch[1];

  // Fallback to Twitter Card title
  if (!metadata.title) {
    const twitterTitleMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:title["']/i);
    if (twitterTitleMatch) metadata.title = twitterTitleMatch[1];
  }

  // Fallback to regular title tag
  if (!metadata.title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) metadata.title = titleMatch[1].trim();
  }

  // Extract og:description
  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
  if (ogDescMatch) metadata.description = ogDescMatch[1];

  // Fallback to Twitter Card description
  if (!metadata.description) {
    const twitterDescMatch = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:description["']/i);
    if (twitterDescMatch) metadata.description = twitterDescMatch[1];
  }

  // Fallback to meta description
  if (!metadata.description) {
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    if (descMatch) metadata.description = descMatch[1];
  }

  // Extract og:image
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (ogImageMatch) {
    metadata.image = makeAbsolute(ogImageMatch[1]);
  }

  // Fallback to Twitter Card image
  if (!metadata.image) {
    const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (twitterImageMatch) {
      metadata.image = makeAbsolute(twitterImageMatch[1]);
    }
  }

  // Extract og:site_name
  const ogSiteMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
  if (ogSiteMatch) metadata.siteName = ogSiteMatch[1];

  // Fallback to Twitter site
  if (!metadata.siteName) {
    const twitterSiteMatch = html.match(/<meta[^>]*name=["']twitter:site["'][^>]*content=["']([^"']+)["']/i);
    if (twitterSiteMatch) metadata.siteName = twitterSiteMatch[1].replace('@', '');
  }

  // Extract og:type
  const ogTypeMatch = html.match(/<meta[^>]*property=["']og:type["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:type["']/i);
  if (ogTypeMatch) metadata.type = ogTypeMatch[1];

  // Fallback to Twitter card type
  if (!metadata.type) {
    const twitterCardMatch = html.match(/<meta[^>]*name=["']twitter:card["'][^>]*content=["']([^"']+)["']/i);
    if (twitterCardMatch) metadata.type = twitterCardMatch[1];
  }

  // Extract favicon - try multiple formats
  const faviconPatterns = [
    /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i,
    /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]*rel=["']icon["'][^>]*href=["']([^"']+)["']/i,
  ];
  for (const pattern of faviconPatterns) {
    const match = html.match(pattern);
    if (match) {
      metadata.favicon = makeAbsolute(match[1]);
      break;
    }
  }

  // Default favicon fallback
  if (!metadata.favicon) {
    metadata.favicon = `${urlObj.protocol}//${urlObj.host}/favicon.ico`;
  }

  // If no title found, use domain as fallback title
  if (!metadata.title) {
    metadata.title = urlObj.hostname.replace('www.', '');
  }

  // Decode HTML entities in extracted values
  Object.keys(metadata).forEach(key => {
    if (typeof metadata[key] === 'string') {
      metadata[key] = metadata[key]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/');
    }
  });

  return metadata;
}

/**
 * GET /api/ai/link-preview
 * Fetch OG metadata for a URL using Puppeteer (headless browser)
 * This bypasses anti-bot protections that block server-side fetch requests
 */
router.get('/link-preview', async (req, res) => {
  let browser = null;

  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // Check Redis cache (30-day TTL)
    const cached = await getCachedLinkPreview(url);
    if (cached) {
      return res.json({ preview: cached, cached: true });
    }

    // Launch Puppeteer browser
    const puppeteerOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
      ],
    };

    // Find Chrome executable (handles dynamic version detection)
    const chromePath = findChromeExecutable();
    if (chromePath) {
      puppeteerOptions.executablePath = chromePath;
    }

    browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();

    // Set realistic viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // Navigate with timeout - use networkidle2 to handle redirects (e.g. TikTok short URLs)
    try {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      });
    } catch (navError) {
      if (navError.name === 'TimeoutError') {
        // On timeout, still try to extract what we have
        logger.debug('Link preview navigation timed out, attempting to extract available content');
      } else {
        throw navError;
      }
    }

    // Wait a bit for any JavaScript to populate meta tags
    await new Promise(r => setTimeout(r, 500));

    // Get the page HTML - retry if context destroyed by late navigation
    let html;
    try {
      html = await page.content();
    } catch (contentError) {
      if (contentError.message?.includes('Execution context was destroyed')) {
        // A late redirect happened - wait for it to settle and retry
        try {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 300));
          html = await page.content();
        } catch {
          throw new Error('Page navigated away during content extraction');
        }
      } else {
        throw contentError;
      }
    }
    await browser.close();
    browser = null;

    const metadata = extractOgMetadata(html, url);

    // Cache the result in Redis (30 days TTL) - async, don't block response
    cacheLinkPreview(url, metadata).catch(err => {
      logger.warn(`Failed to cache link preview in Redis: ${err.message}`);
    });

    res.json({ preview: metadata, cached: false });

  } catch (error) {
    logger.error(`Failed to fetch link preview: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch link preview' });
  } finally {
    // Ensure browser is closed even on error
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        logger.warn(`Failed to close browser: ${e.message}`);
      }
    }
  }
});

// =============================================================================
// Embedding Settings
// =============================================================================

/**
 * GET /api/ai/embedding-settings
 * Get current user's embedding configuration
 */
router.get('/embedding-settings', async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;

    // Get user's embedding settings from superbrain_settings
    let settings = db.prepare(`
      SELECT embedding_provider, embedding_model
      FROM superbrain_settings
      WHERE user_id = ?
    `).get(userId);

    // If no settings exist, create default
    if (!settings) {
      db.prepare(`
        INSERT INTO superbrain_settings (user_id, embedding_provider, embedding_model)
        VALUES (?, 'auto', NULL)
      `).run(userId);
      settings = { embedding_provider: 'auto', embedding_model: null };
    }

    // Get available embedding models from configured providers
    const providers = db.prepare(`
      SELECT id, name, type, base_url, is_active
      FROM ai_providers
      WHERE user_id = ? AND is_active = 1
    `).all(userId);

    // Define available embedding models per provider type
    const embeddingModels = {
      ollama: [
        { id: 'nomic-embed-text', name: 'Nomic Embed Text', dimensions: 768, description: 'High quality text embeddings (free, local)' },
        { id: 'mxbai-embed-large', name: 'MXBai Embed Large', dimensions: 1024, description: 'Large embedding model' },
        { id: 'all-minilm', name: 'All-MiniLM-L6', dimensions: 384, description: 'Fast, lightweight embeddings' },
        { id: 'snowflake-arctic-embed', name: 'Snowflake Arctic Embed', dimensions: 1024, description: 'Snowflake embedding model' },
      ],
      openrouter: [
        { id: 'openai/text-embedding-3-small', name: 'OpenAI text-embedding-3-small', dimensions: 1536, description: 'OpenAI small embeddings (paid)' },
        { id: 'openai/text-embedding-3-large', name: 'OpenAI text-embedding-3-large', dimensions: 3072, description: 'OpenAI large embeddings (paid)' },
        { id: 'openai/text-embedding-ada-002', name: 'OpenAI Ada-002', dimensions: 1536, description: 'Legacy OpenAI embeddings (paid)' },
      ],
      openai: [
        { id: 'text-embedding-3-small', name: 'text-embedding-3-small', dimensions: 1536, description: 'OpenAI small embeddings' },
        { id: 'text-embedding-3-large', name: 'text-embedding-3-large', dimensions: 3072, description: 'OpenAI large embeddings' },
        { id: 'text-embedding-ada-002', name: 'text-embedding-ada-002', dimensions: 1536, description: 'Legacy Ada embeddings' },
      ],
    };

    // Build available providers list with their models
    const availableProviders = [
      {
        id: 'auto',
        name: 'Auto (Ollama → OpenRouter)',
        type: 'auto',
        description: 'Tries Ollama first (free), falls back to OpenRouter',
        models: [],
      },
    ];

    for (const provider of providers) {
      const providerType = provider.type?.toLowerCase();
      const models = embeddingModels[providerType] || [];

      if (models.length > 0) {
        availableProviders.push({
          id: provider.id,
          name: provider.name,
          type: providerType,
          description: providerType === 'ollama' ? 'Free local embeddings' : 'Cloud-based embeddings (may incur costs)',
          models,
        });
      }
    }

    res.json({
      settings: {
        embeddingProvider: settings.embedding_provider || 'auto',
        embeddingModel: settings.embedding_model,
      },
      availableProviders,
    });

  } catch (error) {
    logger.error(`Failed to get embedding settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to get embedding settings' });
  }
});

/**
 * PATCH /api/ai/embedding-settings
 * Update embedding configuration
 */
router.patch('/embedding-settings', async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;
    const { embeddingProvider, embeddingModel } = req.body;

    // Validate provider value
    const validProviders = ['auto', 'ollama', 'openrouter', 'openai'];
    if (embeddingProvider && !validProviders.includes(embeddingProvider)) {
      // Check if it's a provider ID
      const provider = db.prepare(`
        SELECT id FROM ai_providers WHERE id = ? AND user_id = ?
      `).get(embeddingProvider, userId);

      if (!provider) {
        return res.status(400).json({ error: 'Invalid embedding provider' });
      }
    }

    // Upsert settings
    const existing = db.prepare(`
      SELECT id FROM superbrain_settings WHERE user_id = ?
    `).get(userId);

    if (existing) {
      const updates = [];
      const params = [];

      if (embeddingProvider !== undefined) {
        updates.push('embedding_provider = ?');
        params.push(embeddingProvider);
      }
      if (embeddingModel !== undefined) {
        updates.push('embedding_model = ?');
        params.push(embeddingModel);
      }

      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        params.push(userId);

        db.prepare(`
          UPDATE superbrain_settings
          SET ${updates.join(', ')}
          WHERE user_id = ?
        `).run(...params);
      }
    } else {
      db.prepare(`
        INSERT INTO superbrain_settings (user_id, embedding_provider, embedding_model)
        VALUES (?, ?, ?)
      `).run(userId, embeddingProvider || 'auto', embeddingModel || null);
    }

    logger.info(`Updated embedding settings for user ${userId}: provider=${embeddingProvider}, model=${embeddingModel}`);

    res.json({
      success: true,
      settings: {
        embeddingProvider: embeddingProvider || 'auto',
        embeddingModel: embeddingModel || null,
      },
    });

  } catch (error) {
    logger.error(`Failed to update embedding settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to update embedding settings' });
  }
});

module.exports = router;
