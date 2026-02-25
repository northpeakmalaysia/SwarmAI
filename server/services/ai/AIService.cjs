/**
 * AI Service
 *
 * Provides AI completion capabilities for the FlowBuilder and other services.
 * Supports OpenRouter as the primary provider with rate limiting integration.
 */

const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { checkRateLimit, incrementUsage } = require('../rateLimitService.cjs');

// Default models
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * AI Service class for handling AI completions
 */
class AIService {
  constructor() {
    this.initialized = false;
    this.providers = new Map();
  }

  /**
   * Initialize the AI service by loading providers from database
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const db = getDatabase();
      const providers = db.prepare(`
        SELECT * FROM ai_providers WHERE is_active = 1
      `).all();

      for (const provider of providers) {
        this.providers.set(provider.id, {
          id: provider.id,
          name: provider.name,
          type: provider.type,
          apiKey: provider.api_key,
          baseUrl: provider.base_url,
          defaultModel: provider.default_model,
          isDefault: provider.is_default === 1,
        });
      }

      this.initialized = true;
      logger.info(`AIService initialized with ${this.providers.size} providers`);
    } catch (error) {
      logger.error(`Failed to initialize AIService: ${error.message}`);
      this.initialized = true; // Mark as initialized to prevent infinite loops
    }
  }

  /**
   * Get the default provider for a user
   */
  getDefaultProvider(userId) {
    // First try user-specific default
    const db = getDatabase();
    let row = db.prepare(`
      SELECT * FROM ai_providers
      WHERE user_id = ? AND is_default = 1 AND is_active = 1
      LIMIT 1
    `).get(userId);

    // SuperBrain is USER-LEVEL: users must configure their own AI providers
    // No fallback to system-level or global providers

    if (row) {
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        apiKey: row.api_key,
        baseUrl: row.base_url,
        defaultModel: row.default_model,
      };
    }

    return null;
  }

  /**
   * Send a chat completion request
   * Routes through SuperBrainRouter for Task Routing support when no providerId specified.
   * Falls back to legacy behavior when providerId is explicitly provided.
   *
   * @param {Array<{role: string, content: string}>} messages - Chat messages
   * @param {Object} options - Request options
   * @param {string} options.userId - User ID for rate limiting
   * @param {string} [options.model] - Model to use
   * @param {string} [options.providerId] - Specific provider ID (bypasses Task Routing)
   * @param {string} [options.forceTier] - Force a specific task tier
   * @param {number} [options.temperature=0.7] - Temperature
   * @param {number} [options.maxTokens] - Max tokens
   * @returns {Promise<{content: string, model: string, usage: {promptTokens: number, completionTokens: number}}>}
   */
  async chat(messages, options = {}) {
    const { userId, providerId } = options;

    // If specific providerId is requested, use legacy direct provider call
    if (providerId) {
      logger.debug('AIService: Using legacy direct provider call (providerId specified)');
      return this._legacyChat(messages, options);
    }

    // Route through SuperBrainRouter for Task Routing support
    try {
      const { getSuperBrainRouter } = require('./SuperBrainRouter.cjs');
      const superBrain = getSuperBrainRouter();

      logger.debug('AIService: Routing through SuperBrainRouter for Task Routing');

      const result = await superBrain.process({
        messages,
        userId,
        forceTier: options.forceTier || null,
      }, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        agentId: options.agentId,
      });

      return {
        content: result.content,
        model: result.model,
        provider: result.provider,
        usage: result.usage || {
          promptTokens: 0,
          completionTokens: 0,
        },
      };
    } catch (error) {
      logger.warn(`SuperBrainRouter failed, falling back to legacy: ${error.message}`);
      // Fall back to legacy behavior if SuperBrain fails
      return this._legacyChat(messages, options);
    }
  }

  /**
   * Legacy chat implementation - direct provider call without Task Routing
   * Used when providerId is explicitly specified or as fallback
   * @private
   */
  async _legacyChat(messages, options = {}) {
    await this.initialize();

    const { userId, providerId, model, temperature = 0.7, maxTokens } = options;

    // Check rate limits
    if (userId) {
      const rateLimitStatus = await checkRateLimit(userId);
      if (!rateLimitStatus.allowed) {
        throw new Error(`Rate limit exceeded. Please try again later.`);
      }
    }

    // Get provider
    const provider = providerId
      ? this.providers.get(providerId)
      : this.getDefaultProvider(userId);

    if (!provider) {
      throw new Error('No AI provider available. Please configure an AI provider.');
    }

    const selectedModel = model || provider.defaultModel || DEFAULT_MODEL;
    const baseUrl = provider.baseUrl || 'https://openrouter.ai/api/v1';

    logger.debug(`AI chat request (legacy)`, {
      provider: provider.name,
      model: selectedModel,
      messageCount: messages.length,
    });

    try {
      const response = await this.makeOpenAIRequest(baseUrl, provider.apiKey, {
        model: selectedModel,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const result = {
        content: response.choices[0]?.message?.content || '',
        model: response.model || selectedModel,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
        },
      };

      // Track usage
      if (userId) {
        const estimatedCost = this.estimateCost(
          result.usage.promptTokens,
          result.usage.completionTokens,
          result.model
        );
        await incrementUsage(userId, estimatedCost);
        await this.trackUsage(provider.id, userId, options.agentId, result);
      }

      return result;
    } catch (error) {
      logger.error(`AI chat error (legacy): ${error.message}`, {
        provider: provider.name,
        model: selectedModel,
      });
      throw error;
    }
  }

  /**
   * Simple completion (convenience method)
   *
   * @param {string} prompt - The prompt text
   * @param {Object} options - Request options
   * @returns {Promise<string>} The completion text
   */
  async complete(prompt, options = {}) {
    const messages = [{ role: 'user', content: prompt }];

    if (options.systemPrompt) {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const response = await this.chat(messages, options);
    return response.content;
  }

  /**
   * Generate embeddings for texts
   * Tries Ollama first (free), then falls back to OpenRouter
   *
   * @param {string[]} texts - Array of texts to embed
   * @param {Object} options - Options
   * @param {string} [options.model] - Embedding model (overrides user settings)
   * @param {string} [options.userId] - User ID
   * @param {boolean} [options.forceOpenRouter] - Force OpenRouter instead of Ollama
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async embed(texts, options = {}) {
    await this.initialize();

    const { userId, model } = options;

    // Load user's embedding settings from database
    const embeddingSettings = this.getUserEmbeddingSettings(userId);
    const configuredProvider = embeddingSettings.embeddingProvider || 'auto';
    const configuredModel = model || embeddingSettings.embeddingModel;

    logger.debug(`Embedding request: provider=${configuredProvider}, model=${configuredModel || 'default'}`);

    // If user explicitly chose a non-auto provider, use that directly
    if (configuredProvider !== 'auto' && configuredProvider !== 'ollama') {
      return this.embedWithProvider(texts, configuredProvider, configuredModel, userId);
    }

    // Auto mode or Ollama: Try Ollama first (free local embeddings)
    if (configuredProvider === 'auto' || configuredProvider === 'ollama') {
      try {
        const ollamaModel = configuredProvider === 'ollama' && configuredModel
          ? configuredModel
          : 'nomic-embed-text';

        const ollamaEmbeddings = await this.embedWithOllama(texts, { ...options, ollamaModel });
        if (ollamaEmbeddings) {
          return ollamaEmbeddings;
        }
      } catch (ollamaError) {
        if (configuredProvider === 'ollama') {
          // User explicitly chose Ollama, don't fallback
          throw new Error(`Ollama embedding failed: ${ollamaError.message}`);
        }
        logger.debug(`Ollama embedding not available, falling back to OpenRouter: ${ollamaError.message}`);
      }
    }

    // Fall back to OpenRouter (only in auto mode)
    return this.embedWithProvider(texts, 'openrouter', configuredModel, userId);
  }

  /**
   * Get user's embedding settings from database
   * @private
   */
  getUserEmbeddingSettings(userId) {
    if (!userId) {
      return { embeddingProvider: 'auto', embeddingModel: null };
    }

    try {
      const db = getDatabase();
      const settings = db.prepare(`
        SELECT embedding_provider, embedding_model
        FROM superbrain_settings
        WHERE user_id = ?
      `).get(userId);

      if (settings) {
        return {
          embeddingProvider: settings.embedding_provider || 'auto',
          embeddingModel: settings.embedding_model,
        };
      }
    } catch (error) {
      logger.debug(`Failed to get embedding settings: ${error.message}`);
    }

    return { embeddingProvider: 'auto', embeddingModel: null };
  }

  /**
   * Generate embeddings using a specific provider
   * @private
   */
  async embedWithProvider(texts, providerType, model, userId) {
    const db = getDatabase();

    // Find the provider - USER-LEVEL only
    let provider;
    if (providerType === 'openrouter') {
      provider = db.prepare(`
        SELECT * FROM ai_providers
        WHERE user_id = ? AND type = 'openrouter' AND is_active = 1
        ORDER BY is_default DESC
        LIMIT 1
      `).get(userId);
    } else if (providerType === 'openai') {
      provider = db.prepare(`
        SELECT * FROM ai_providers
        WHERE user_id = ? AND type = 'openai' AND is_active = 1
        ORDER BY is_default DESC
        LIMIT 1
      `).get(userId);
    } else {
      // Try to find by provider ID (must belong to user)
      provider = db.prepare(`
        SELECT * FROM ai_providers WHERE id = ? AND user_id = ? AND is_active = 1
      `).get(providerType, userId);
    }

    if (!provider) {
      // Fall back to user's default provider (user-level only)
      provider = this.getDefaultProvider(userId);
    }

    if (!provider) {
      throw new Error('No AI provider available for embeddings.');
    }

    const baseUrl = provider.base_url || provider.baseUrl || 'https://openrouter.ai/api/v1';
    const embeddingModel = model || DEFAULT_EMBEDDING_MODEL;

    try {
      const response = await this.makeOpenAIRequest(
        baseUrl,
        provider.api_key || provider.apiKey,
        {
          model: embeddingModel,
          input: texts,
        },
        'embeddings'
      );

      logger.debug(`Generated embeddings using ${provider.name} (${embeddingModel})`);
      return response.data.map((item) => item.embedding);
    } catch (error) {
      logger.error(`Embedding error with ${provider.name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate embeddings using Ollama (free local)
   * @private
   */
  async embedWithOllama(texts, options = {}) {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://host.docker.internal:11434';
    const model = options.ollamaModel || 'nomic-embed-text';
    const textArray = Array.isArray(texts) ? texts : [texts];

    const embeddings = [];

    for (const text of textArray) {
      const response = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding failed: ${response.status}`);
      }

      const data = await response.json();
      embeddings.push(data.embedding);
    }

    logger.debug(`Generated ${embeddings.length} embeddings using Ollama (${model})`);
    return embeddings;
  }

  /**
   * Make an OpenAI-compatible API request
   * @private
   */
  async makeOpenAIRequest(baseUrl, apiKey, body, endpoint = 'chat/completions') {
    const url = `${baseUrl}/${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://agents.northpeak.app',
        'X-Title': 'SwarmAI',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Estimate cost based on tokens
   * @private
   */
  estimateCost(promptTokens, completionTokens, model) {
    // Rough pricing estimates per 1M tokens
    const pricing = {
      'gpt-4o': { input: 2.5, output: 10 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'gpt-4-turbo': { input: 10, output: 30 },
      'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
      'claude-3-opus': { input: 15, output: 75 },
      'claude-3-sonnet': { input: 3, output: 15 },
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      'default': { input: 1, output: 2 },
    };

    // Find matching pricing
    let prices = pricing.default;
    for (const [key, value] of Object.entries(pricing)) {
      if (model && model.toLowerCase().includes(key)) {
        prices = value;
        break;
      }
    }

    const inputCost = (promptTokens / 1000000) * prices.input;
    const outputCost = (completionTokens / 1000000) * prices.output;

    return inputCost + outputCost;
  }

  /**
   * Track AI usage in database
   * @private
   */
  async trackUsage(providerId, userId, agentId, result) {
    try {
      const db = getDatabase();
      const { v4: uuidv4 } = require('uuid');

      const inputTokens  = result.usage?.promptTokens    || 0;
      const outputTokens = result.usage?.completionTokens || 0;
      db.prepare(`
        INSERT INTO ai_usage (
          id, user_id, provider, agent_id, model,
          input_tokens, output_tokens,
          cost, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        userId,
        providerId,
        agentId || null,
        result.model,
        inputTokens,
        outputTokens,
        this.estimateCost(inputTokens, outputTokens, result.model)
      );
    } catch (error) {
      logger.warn(`Failed to track AI usage: ${error.message}`);
    }
  }
}

// Singleton instance
let aiServiceInstance = null;

/**
 * Get the AIService singleton instance
 * @returns {AIService}
 */
function getAIService() {
  if (!aiServiceInstance) {
    aiServiceInstance = new AIService();
  }
  return aiServiceInstance;
}

module.exports = {
  AIService,
  getAIService,
};
