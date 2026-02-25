/**
 * OpenRouter Provider
 *
 * API-based AI provider with 500+ models.
 * Model selection is controlled by user's Task Routing settings.
 * No automatic free/paid distinction - users configure their preferred models per tier.
 */

const { logger } = require('../../logger.cjs');
const { getDatabase } = require('../../database.cjs');

/**
 * Default OpenRouter configuration
 */
const DEFAULT_CONFIG = {
  baseUrl: 'https://openrouter.ai/api/v1',
  timeout: 120000, // 2 minutes
  maxRetries: 3,
  siteUrl: process.env.OPENROUTER_SITE_URL || 'https://swarm.ai',
  siteName: process.env.OPENROUTER_SITE_NAME || 'SwarmAI',
};

/**
 * NO HARDCODED MODEL LISTS
 *
 * Model selection is fully controlled by user's Task Routing settings.
 * Available models are synced from OpenRouter API and stored in openrouter_models table.
 * Users configure their preferred models per tier in superbrain_settings.custom_failover_chain.
 *
 * To get available models:
 * - Free models: SELECT id FROM openrouter_models WHERE is_free = 1
 * - Vision models: SELECT id FROM openrouter_models WHERE supports_vision = 1
 */

class OpenRouterProvider {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.baseUrl = this.config.baseUrl;
    this.apiKey = null; // Set via setApiKey or from database
    this.freeModels = [];
    this.paidModels = [];
    this.allModels = [];
    this.lastModelSync = null;
    this.modelSyncInterval = 3600000; // 1 hour
  }

  /**
   * Set API key
   * @param {string} apiKey - OpenRouter API key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Get API key from database if not set
   * Priority: 1) Instance apiKey, 2) ai_providers table, 3) user_settings table, 4) env var
   * @param {string} userId - User ID to get key for
   * @returns {Promise<string|null>}
   */
  async getApiKey(userId) {
    if (this.apiKey) return this.apiKey;

    try {
      const db = getDatabase();

      // SuperBrain is USER-LEVEL: only look for user's own configured providers
      if (userId) {
        const provider = db.prepare(`
          SELECT api_key FROM ai_providers
          WHERE user_id = ? AND type = 'openrouter' AND api_key IS NOT NULL
          ORDER BY is_default DESC
          LIMIT 1
        `).get(userId);

        if (provider?.api_key) {
          logger.debug(`OpenRouter: Using API key from ai_providers for user ${userId}`);
          return provider.api_key;
        }
      }

      // Fallback to user_settings table (legacy support)
      if (userId) {
        const setting = db.prepare(`
          SELECT value FROM user_settings
          WHERE user_id = ? AND key = 'openrouter_api_key'
        `).get(userId);

        if (setting?.value) {
          logger.debug(`OpenRouter: Using API key from user_settings for user ${userId}`);
          return setting.value;
        }
      }

      // Final fallback to environment variable (for system-level operations only)
      if (process.env.OPENROUTER_API_KEY) {
        logger.debug('OpenRouter: Using API key from environment variable');
        return process.env.OPENROUTER_API_KEY;
      }

      return null;
    } catch (error) {
      logger.warn(`OpenRouter: Failed to get API key: ${error.message}`);
      return process.env.OPENROUTER_API_KEY || null;
    }
  }

  /**
   * Check if provider is available
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async isAvailable(userId) {
    const apiKey = await this.getApiKey(userId);
    return !!apiKey;
  }

  /**
   * Sync models from OpenRouter API
   * @param {string} userId - User ID for API key
   * @returns {Promise<Object>}
   */
  async syncModels(userId) {
    // Skip if recently synced
    if (this.lastModelSync && Date.now() - this.lastModelSync < this.modelSyncInterval) {
      return {
        freeModels: this.freeModels,
        paidModels: this.paidModels,
        total: this.allModels.length,
        cached: true,
      };
    }

    const apiKey = await this.getApiKey(userId);
    if (!apiKey) {
      logger.warn('No OpenRouter API key available for model sync');
      return { freeModels: [], paidModels: [], total: 0, error: 'No API key' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': this.config.siteUrl,
          'X-Title': this.config.siteName,
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this.allModels = data.data || [];

      // Categorize models - ONLY include models with :free suffix as free
      // This is more reliable than checking pricing which can be inaccurate
      this.freeModels = this.allModels
        .filter(m => m.id?.endsWith(':free'))  // Must have :free suffix
        .sort((a, b) => this.getModelScore(b) - this.getModelScore(a))
        .map(m => m.id);

      this.paidModels = this.allModels
        .filter(m => !m.id?.endsWith(':free'))  // Paid = no :free suffix
        .sort((a, b) => this.getModelScore(b) - this.getModelScore(a))
        .map(m => m.id);

      this.lastModelSync = Date.now();

      logger.info(`Synced ${this.allModels.length} OpenRouter models (${this.freeModels.length} free, ${this.paidModels.length} paid)`);

      return {
        freeModels: this.freeModels,
        paidModels: this.paidModels,
        total: this.allModels.length,
        cached: false,
      };
    } catch (error) {
      logger.error(`Failed to sync OpenRouter models: ${error.message}`);
      // No hardcoded fallback - user should configure Task Routing
      return { freeModels: [], paidModels: [], total: 0, error: error.message };
    }
  }

  /**
   * Check if a model is free
   * @param {Object} model - Model object from API
   * @returns {boolean}
   */
  isFreeModel(model) {
    // Check if model ID ends with :free
    if (model.id?.endsWith(':free')) return true;

    // Check pricing (both prompt and completion should be 0)
    const pricing = model.pricing || {};
    return (
      parseFloat(pricing.prompt || '1') === 0 &&
      parseFloat(pricing.completion || '1') === 0
    );
  }

  /**
   * Calculate model score for sorting
   * @param {Object} model - Model object
   * @returns {number}
   */
  getModelScore(model) {
    let score = 0;

    // Prefer larger context windows
    score += Math.log10(model.context_length || 4096) * 10;

    // Prefer lower latency (if available)
    if (model.top_provider?.max_completion_tokens) {
      score += 5;
    }

    // Boost popular models
    const popularPrefixes = ['google/', 'anthropic/', 'openai/', 'meta-llama/'];
    if (popularPrefixes.some(p => model.id?.startsWith(p))) {
      score += 10;
    }

    return score;
  }

  /**
   * Select optimal model from synced database
   * This is used as a FALLBACK when user has no Task Routing settings configured.
   * Users should configure their preferred models via Task Routing settings.
   * @param {Object} options - Selection options
   * @returns {string}
   */
  selectOptimalModel(options = {}) {
    const { taskType = null } = options;
    const db = getDatabase();

    try {
      // For vision tasks, get vision-capable free model from DB
      if (taskType === 'vision') {
        const visionModel = db.prepare(`
          SELECT id FROM openrouter_models
          WHERE supports_vision = 1 AND is_free = 1
          ORDER BY name LIMIT 1
        `).get();
        if (visionModel) return visionModel.id;

        // Fallback to any vision model
        const anyVision = db.prepare(`
          SELECT id FROM openrouter_models
          WHERE supports_vision = 1
          ORDER BY CASE WHEN is_free = 1 THEN 0 ELSE 1 END, name LIMIT 1
        `).get();
        if (anyVision) return anyVision.id;
      }

      // For code tasks, prefer llama models
      if (taskType === 'code') {
        const codeModel = db.prepare(`
          SELECT id FROM openrouter_models
          WHERE id LIKE '%llama%' AND is_free = 1
          ORDER BY name LIMIT 1
        `).get();
        if (codeModel) return codeModel.id;
      }

      // Default: get first free model from synced DB
      const freeModel = db.prepare(`
        SELECT id FROM openrouter_models
        WHERE is_free = 1
        ORDER BY name LIMIT 1
      `).get();
      if (freeModel) return freeModel.id;

    } catch (error) {
      logger.debug(`selectOptimalModel DB error: ${error.message}`);
    }

    // Ultimate fallback - user should configure Task Routing
    logger.warn('No models in database - user should configure Task Routing settings');
    return null;
  }

  /**
   * Check if a model supports vision/image input (from database)
   * @param {string} modelId - Model ID to check
   * @returns {boolean}
   */
  isVisionCapable(modelId) {
    if (!modelId) return false;

    try {
      const db = getDatabase();
      const model = db.prepare(`
        SELECT supports_vision FROM openrouter_models WHERE id = ?
      `).get(modelId);
      if (model) return model.supports_vision === 1;
    } catch (error) {
      logger.debug(`isVisionCapable DB check failed: ${error.message}`);
    }

    // Model not in DB - trust user's selection
    return true;
  }

  /**
   * Check if a model supports native tool/function calling (from database)
   * @param {string} modelId - Model ID to check
   * @returns {boolean}
   */
  isToolCapable(modelId) {
    if (!modelId) return false;

    try {
      const db = getDatabase();
      const model = db.prepare(
        'SELECT supports_tools FROM openrouter_models WHERE id = ?'
      ).get(modelId);
      if (model) return model.supports_tools === 1;
    } catch (error) {
      logger.debug(`isToolCapable DB check failed: ${error.message}`);
    }

    // Model not in DB - conservative default: no tool support
    // Prevents sending tools to models that would error
    return false;
  }

  /**
   * Get list of vision-capable models from database
   * @returns {string[]}
   */
  getVisionModels() {
    try {
      const db = getDatabase();
      const models = db.prepare(`
        SELECT id FROM openrouter_models
        WHERE supports_vision = 1
        ORDER BY CASE WHEN is_free = 1 THEN 0 ELSE 1 END, name
        LIMIT 30
      `).all();
      return models.map(m => m.id);
    } catch (error) {
      logger.debug(`getVisionModels DB error: ${error.message}`);
      return [];
    }
  }

  /**
   * Chat completion with model failover
   * Model selection is controlled by user's Task Routing settings.
   * Supports multimodal (vision) requests when images are provided.
   * @param {Array} messages - Chat messages
   * @param {Object} options - Generation options
   * @param {Array} options.images - Array of image URLs or base64 data URIs for vision tasks
   * @param {Array} options.userFallbackModels - User's configured fallback models from Task Routing
   * @returns {Promise<Object>}
   */
  async chat(messages, options = {}) {
    const { userId, model: requestedModel, images, userFallbackModels = [] } = options;

    // Allow explicit API key override (for multi-account support)
    const apiKey = options.apiKey || await this.getApiKey(userId);
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    // Ensure models are synced
    await this.syncModels(userId);

    // Check if this is a vision request (has images)
    const isVisionRequest = images && images.length > 0;

    // Determine model to use
    // Priority: requestedModel (from Task Routing) > auto-selection (fallback only)
    let model;
    if (requestedModel) {
      model = requestedModel;
      logger.info(`OpenRouter: Using Task Routing model: ${model}`);
    } else if (isVisionRequest) {
      // For vision requests, use vision-capable model
      model = this.selectOptimalModel({ taskType: 'vision' });
      logger.info(`OpenRouter: Vision request - auto-selected model: ${model}`);
    } else {
      model = this.selectOptimalModel({ taskType: options.taskType });
      logger.info(`OpenRouter: Auto-selected model: ${model} (no Task Routing model specified)`);
    }

    // Build provider chain for failover
    // TASK ROUTING: User's configured models have FULL CONTROL
    // No hardcoded fallbacks - user must configure Task Routing settings
    let providerChain;
    if (userFallbackModels && userFallbackModels.length > 0) {
      // Use user's custom fallback chain from Task Routing settings AS-IS
      providerChain = userFallbackModels.slice(0, 5);
      logger.info(`OpenRouter: Using user's Task Routing fallback chain (${providerChain.length} models)`);
    } else if (isVisionRequest) {
      // For vision requests without user settings, get from database
      providerChain = this.getVisionModels().slice(0, 5);
      if (providerChain.length === 0) {
        logger.warn('OpenRouter: No vision models in database - user should configure Task Routing');
      }
    } else {
      // Get free models from database when no user settings
      providerChain = this.getFreeModels().slice(0, 5);
      if (providerChain.length === 0) {
        logger.warn('OpenRouter: No models in database - user should configure Task Routing settings');
      }
    }

    // Ensure selected model is first in the chain
    const modelsToTry = requestedModel
      ? [model, ...providerChain.filter(m => m !== model)].slice(0, 5)
      : providerChain;

    // Log the source of model selection for debugging
    const modelSource = userFallbackModels?.length > 0 ? 'UserTaskRouting' : (requestedModel ? 'TaskRouting' : 'Recommended');
    logger.info(`OpenRouter: Model source: ${modelSource}, Chain: ${modelsToTry.slice(0, 3).join(' → ')}${modelsToTry.length > 3 ? '...' : ''}`);

    logger.debug(`OpenRouter: Failover chain: ${modelsToTry.join(' → ')}`);

    let lastError;

    for (const currentModel of modelsToTry) {
      try {
        logger.debug(`OpenRouter: Trying model: ${currentModel}`);
        const result = await this.makeRequest(messages, currentModel, apiKey, options);

        // Check for empty response (but allow empty content when native tool calls are present)
        if ((!result.content || result.content.trim() === '') && !result.usedNativeTools) {
          logger.warn(`OpenRouter model ${currentModel} returned empty response`);
          lastError = new Error('Empty response from model');
          continue; // Try next model
        }

        logger.info(`OpenRouter: Success with model: ${currentModel}`);
        return result;
      } catch (error) {
        lastError = error;
        logger.warn(`OpenRouter model ${currentModel} failed: ${error.message}`);

        // Don't failover for non-retryable errors
        if (error.status === 401 || error.status === 403) {
          throw error;
        }

        // Stop failover if credits are exhausted (affects all models)
        if (error.message?.includes('Insufficient credits')) {
          logger.error('OpenRouter: Insufficient credits - stopping failover');
          throw new Error('OpenRouter credits exhausted. Please add credits at https://openrouter.ai/settings/credits');
        }

        continue;
      }
    }

    throw lastError || new Error('All OpenRouter models failed');
  }

  /**
   * Make request to OpenRouter API
   */
  async makeRequest(messages, model, apiKey, options = {}) {
    const payload = {
      model,
      messages: this.formatMessages(messages, options),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      top_p: options.topP ?? 0.9,
      stream: false,
    };

    if (options.stop) {
      payload.stop = options.stop;
    }

    // Native tool calling: add tools if provided AND model supports it
    if (options.tools && options.tools.length > 0 && this.isToolCapable(model)) {
      payload.tools = options.tools;
      payload.tool_choice = 'auto';
      logger.info(`OpenRouter: Native tool calling enabled for ${model} (${options.tools.length} tools)`);
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': this.config.siteUrl,
        'X-Title': this.config.siteName,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Build comprehensive error message including metadata.raw for detailed upstream errors
      let errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      const metadata = errorData.error?.metadata;

      // Include the raw upstream error message if available (contains actual error details)
      if (metadata?.raw) {
        errorMessage = `${errorMessage}: ${metadata.raw}`;
      }

      // Add provider info if available
      if (metadata?.provider_name) {
        errorMessage = `[${metadata.provider_name}] ${errorMessage}`;
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.code = errorData.error?.code;
      error.metadata = metadata;
      throw error;
    }

    const data = await response.json();

    let content = data.choices?.[0]?.message?.content || '';

    // Some thinking models return content in reasoning_content or thinking field
    if (!content) {
      const msg = data.choices?.[0]?.message;
      const thinkingContent = msg?.reasoning_content || msg?.thinking || msg?.reasoning;
      if (thinkingContent && typeof thinkingContent === 'string' && thinkingContent.trim()) {
        logger.info(`OpenRouter: Content empty, using thinking/reasoning field as fallback (${thinkingContent.length} chars)`);
        content = thinkingContent;
      }
    }

    // Extract native tool calls if present
    const nativeToolCalls = data.choices?.[0]?.message?.tool_calls || null;
    const usedNativeTools = Array.isArray(nativeToolCalls) && nativeToolCalls.length > 0;

    if (usedNativeTools) {
      logger.info(`OpenRouter: Native tool calls returned: ${nativeToolCalls.map(tc => tc.function?.name).join(', ')}`);
    }

    return {
      content,
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      provider: 'openrouter',
      isFree: model.endsWith(':free') || this.freeModels.includes(model),
      finishReason: data.choices?.[0]?.finish_reason,
      nativeToolCalls,
      usedNativeTools,
    };
  }

  /**
   * Generate embeddings (if supported)
   * @param {string[]} texts - Texts to embed
   * @param {Object} options - Options
   * @returns {Promise<number[][]>}
   */
  async embed(texts, options = {}) {
    const { userId } = options;
    const apiKey = await this.getApiKey(userId);

    if (!apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    // Use a model that supports embeddings
    const model = options.model || 'openai/text-embedding-3-small';

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': this.config.siteUrl,
        'X-Title': this.config.siteName,
      },
      body: JSON.stringify({
        model,
        input: texts,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.data?.map(d => d.embedding) || [];
  }

  /**
   * Format messages for OpenRouter
   * Supports multimodal content (text + images) in OpenAI-compatible format
   */
  formatMessages(messages, options = {}) {
    const formatted = [];

    if (options.systemPrompt) {
      formatted.push({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    for (const msg of messages) {
      // Handle native tool result messages (role: 'tool')
      if (msg.role === 'tool') {
        formatted.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
        continue;
      }

      // Handle assistant messages that include native tool_calls
      if (msg.role === 'assistant' && msg.tool_calls) {
        formatted.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.tool_calls,
        });
        continue;
      }

      // Check if message has images attached
      const images = msg.images || options.images;

      if (images && images.length > 0 && msg.role === 'user') {
        // Build multimodal content array
        const contentParts = [];

        // Add text content first
        if (msg.content) {
          contentParts.push({
            type: 'text',
            text: msg.content,
          });
        }

        // Add images
        for (const image of images) {
          // Support both URL strings and image objects
          const imageUrl = typeof image === 'string' ? image : image.url;

          contentParts.push({
            type: 'image_url',
            image_url: {
              url: imageUrl,
              // Optional: detail level (low, high, auto)
              detail: image.detail || 'auto',
            },
          });
        }

        formatted.push({
          role: msg.role,
          content: contentParts,
        });
      } else {
        // Standard text-only message
        formatted.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return formatted;
  }

  /**
   * Get model pricing
   * @param {string} modelId - Model ID
   * @returns {Object|null}
   */
  getModelPricing(modelId) {
    const model = this.allModels.find(m => m.id === modelId);
    if (!model) return null;

    return {
      prompt: parseFloat(model.pricing?.prompt || '0'),
      completion: parseFloat(model.pricing?.completion || '0'),
      image: parseFloat(model.pricing?.image || '0'),
      isFree: this.isFreeModel(model),
    };
  }

  /**
   * Get provider info
   * @returns {Object}
   */
  getInfo() {
    return {
      name: 'OpenRouter',
      type: 'api',
      baseUrl: this.baseUrl,
      freeModelsCount: this.freeModels.length,
      paidModelsCount: this.paidModels.length,
      totalModels: this.allModels.length,
      lastSync: this.lastModelSync ? new Date(this.lastModelSync).toISOString() : null,
      supportedTasks: ['chat', 'completion', 'embedding'],
    };
  }

  /**
   * Get free models (from synced data)
   * @returns {string[]}
   */
  getFreeModels() {
    return this.freeModels || [];
  }

  /**
   * Get paid models (from synced data)
   * @returns {string[]}
   */
  getPaidModels() {
    return this.paidModels || [];
  }
}

// Singleton instance
let openRouterProviderInstance = null;

function getOpenRouterProvider(config = {}) {
  if (!openRouterProviderInstance) {
    openRouterProviderInstance = new OpenRouterProvider(config);
  }
  return openRouterProviderInstance;
}

module.exports = {
  OpenRouterProvider,
  getOpenRouterProvider,
  // No hardcoded model lists exported - use Task Routing settings
};
