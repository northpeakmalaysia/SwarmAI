/**
 * Ollama Provider
 *
 * Local AI provider using Ollama for lightweight tasks.
 * Optimized for translation, summarization, and simple Q&A.
 */

const { logger } = require('../../logger.cjs');

/**
 * Default Ollama configuration
 */
const DEFAULT_CONFIG = {
  baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  defaultModel: process.env.OLLAMA_MODEL || 'llama3.2',
  timeout: 60000, // 60 seconds
  maxRetries: 2,
};

/**
 * Supported models and their capabilities
 */
const MODEL_PROFILES = {
  'llama3.2': {
    contextLength: 8192,
    capabilities: ['chat', 'completion', 'translation', 'summarization'],
    speed: 'fast',
  },
  'llama3.2:1b': {
    contextLength: 4096,
    capabilities: ['chat', 'completion', 'translation'],
    speed: 'very-fast',
  },
  'llama3.1': {
    contextLength: 32768,
    capabilities: ['chat', 'completion', 'translation', 'summarization', 'code'],
    speed: 'medium',
  },
  'mistral': {
    contextLength: 8192,
    capabilities: ['chat', 'completion', 'translation', 'code'],
    speed: 'fast',
  },
  'codellama': {
    contextLength: 16384,
    capabilities: ['code', 'completion'],
    speed: 'medium',
  },
  'nomic-embed-text': {
    contextLength: 8192,
    capabilities: ['embedding'],
    speed: 'fast',
    dimensions: 768,
  },
};

class OllamaProvider {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Try to load URL from database first, then env, then default
    const dbConfig = this.loadConfigFromDatabase();
    this.baseUrl = dbConfig?.baseUrl || this.config.baseUrl;
    this.defaultModel = dbConfig?.defaultModel || this.config.defaultModel;

    this.isHealthy = null;
    this.lastHealthCheck = null;
    this.availableModels = [];
    this.resolvedDefaultModel = null; // Cached resolved text model
    this.resolvedVisionModel = null;  // Cached resolved vision model

    logger.info(`OllamaProvider initialized with URL: ${this.baseUrl}`);
  }

  /**
   * Load Ollama configuration from ai_providers table
   * @returns {Object|null} Config object with baseUrl and defaultModel
   */
  loadConfigFromDatabase() {
    try {
      const { getDatabase } = require('../../database.cjs');
      const db = getDatabase();

      // Look for active Ollama provider in database
      const provider = db.prepare(`
        SELECT base_url, config FROM ai_providers
        WHERE type = 'ollama' AND is_active = 1
        ORDER BY updated_at DESC LIMIT 1
      `).get();

      if (provider?.base_url) {
        logger.debug(`Loaded Ollama URL from database: ${provider.base_url}`);
        let parsedConfig = {};
        try {
          parsedConfig = provider.config ? JSON.parse(provider.config) : {};
        } catch (e) { /* ignore parse errors */ }

        return {
          baseUrl: provider.base_url,
          defaultModel: parsedConfig.defaultModel || null,
        };
      }

      return null;
    } catch (error) {
      logger.debug(`Could not load Ollama config from database: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a model name indicates a vision/multimodal model
   * @param {string} modelName
   * @returns {boolean}
   */
  isVisionModel(modelName) {
    if (!modelName) return false;
    const lower = modelName.toLowerCase();
    return lower.includes('-vl') ||
           lower.includes('-vision') ||
           lower.includes('llava') ||
           lower.includes('bakllava') ||
           lower.includes('moondream');
  }

  /**
   * Check if a model is an embedding-only model
   * @param {string} modelName
   * @returns {boolean}
   */
  isEmbeddingModel(modelName) {
    if (!modelName) return false;
    const lower = modelName.toLowerCase();
    return lower.includes('embed') || lower.includes('nomic');
  }

  /**
   * Get an available model to use
   * Automatically selects text or vision model based on options
   * @param {Object} options - Selection options
   * @param {boolean} options.preferVision - Prefer vision model for image tasks
   * @param {boolean} options.hasImages - Content includes images
   * @returns {Promise<string|null>}
   */
  async getAvailableModel(options = {}) {
    const needsVision = options.preferVision || options.hasImages;

    // Use cached resolved model if available and we've checked recently
    const cacheValid = this.lastHealthCheck && Date.now() - this.lastHealthCheck < 30000;

    if (cacheValid) {
      if (needsVision && this.resolvedVisionModel) {
        return this.resolvedVisionModel;
      }
      if (!needsVision && this.resolvedDefaultModel) {
        return this.resolvedDefaultModel;
      }
    }

    // Ensure we have the list of available models
    if (this.availableModels.length === 0) {
      await this.isAvailable();
    }

    if (this.availableModels.length === 0) {
      return null;
    }

    // Categorize available models
    const textModels = this.availableModels.filter(m =>
      !this.isEmbeddingModel(m) && !this.isVisionModel(m)
    );

    const visionModels = this.availableModels.filter(m =>
      !this.isEmbeddingModel(m) && this.isVisionModel(m)
    );

    // Sort models by size (prefer smaller/faster)
    const sortBySize = (models) => {
      return [...models].sort((a, b) => {
        const sizeA = a.match(/:(\d+)b/i)?.[1] || a.match(/(\d+)b/i)?.[1] || '999';
        const sizeB = b.match(/:(\d+)b/i)?.[1] || b.match(/(\d+)b/i)?.[1] || '999';
        return parseInt(sizeA) - parseInt(sizeB);
      });
    };

    const sortedTextModels = sortBySize(textModels);
    const sortedVisionModels = sortBySize(visionModels);

    // Cache the best models of each type
    if (sortedTextModels.length > 0 && !this.resolvedDefaultModel) {
      this.resolvedDefaultModel = sortedTextModels[0];
      logger.info(`Ollama: Text model selected: "${this.resolvedDefaultModel}"`);
    }

    if (sortedVisionModels.length > 0 && !this.resolvedVisionModel) {
      this.resolvedVisionModel = sortedVisionModels[0];
      logger.info(`Ollama: Vision model selected: "${this.resolvedVisionModel}"`);
    }

    // Return appropriate model based on task
    if (needsVision) {
      if (this.resolvedVisionModel) {
        logger.debug(`Ollama: Using vision model "${this.resolvedVisionModel}" for image task`);
        return this.resolvedVisionModel;
      }
      // Fallback to text model if no vision model available
      logger.warn(`Ollama: No vision model available, falling back to text model for image task`);
    }

    // Return text model (or best available)
    if (this.resolvedDefaultModel) {
      return this.resolvedDefaultModel;
    }

    // Last resort: use any non-embedding model
    const anyModel = this.availableModels.find(m => !this.isEmbeddingModel(m));
    if (anyModel) {
      logger.warn(`Ollama: Using "${anyModel}" as fallback`);
      return anyModel;
    }

    return null;
  }

  /**
   * Get available text model (for classification, chat, etc.)
   * @returns {Promise<string|null>}
   */
  async getTextModel() {
    return this.getAvailableModel({ preferVision: false });
  }

  /**
   * Get available vision model (for image analysis, etc.)
   * @returns {Promise<string|null>}
   */
  async getVisionModel() {
    return this.getAvailableModel({ preferVision: true });
  }

  /**
   * Check if Ollama service is available
   * @param {boolean} forceRefresh - Force refresh the model list
   * @returns {Promise<boolean>}
   */
  async isAvailable(forceRefresh = false) {
    // Use cached health status if recent (within 30 seconds)
    if (!forceRefresh && this.lastHealthCheck && Date.now() - this.lastHealthCheck < 30000) {
      return this.isHealthy;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      this.isHealthy = response.ok;
      this.lastHealthCheck = Date.now();

      if (response.ok) {
        const data = await response.json();
        const newModels = data.models?.map(m => m.name) || [];

        // Reset cached models if model list changed
        if (JSON.stringify(newModels) !== JSON.stringify(this.availableModels)) {
          this.availableModels = newModels;
          this.resolvedDefaultModel = null;
          this.resolvedVisionModel = null;
          logger.info(`Ollama: Model list updated (${this.availableModels.length} models)`);
        }

        logger.debug(`Ollama available with ${this.availableModels.length} models`);
      }

      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = Date.now();
      logger.debug(`Ollama not available: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if messages contain images
   * @param {Array} messages
   * @returns {boolean}
   */
  hasImages(messages) {
    if (!Array.isArray(messages)) return false;
    return messages.some(msg => {
      // Check for image in content array (multimodal format)
      if (Array.isArray(msg.content)) {
        return msg.content.some(part =>
          part.type === 'image' ||
          part.type === 'image_url' ||
          part.image_url ||
          part.image
        );
      }
      // Check for images array (Ollama format)
      if (msg.images && msg.images.length > 0) {
        return true;
      }
      return false;
    });
  }

  /**
   * Chat completion
   * Automatically selects vision model if images are present
   * @param {Array} messages - Chat messages
   * @param {Object} options - Generation options
   * @returns {Promise<Object>}
   */
  async chat(messages, options = {}) {
    // Detect if messages contain images
    const hasImages = options.hasImages ?? this.hasImages(messages);

    // Use provided model, or auto-select based on content type
    let model = options.model;
    if (!model) {
      model = await this.getAvailableModel({ hasImages });
    }

    if (!model) {
      throw new Error('No Ollama models available');
    }

    // Log model selection for debugging
    if (hasImages) {
      logger.debug(`Ollama chat: Using vision model "${model}" for image content`);
    }

    const payload = {
      model,
      messages: this.formatMessages(messages),
      stream: false,
      think: false, // Disable thinking mode - we need structured content, not internal reasoning
      options: {
        temperature: options.temperature ?? 0.7,
        top_p: options.topP ?? 0.9,
        num_predict: options.maxTokens ?? 1024,
      },
    };

    if (options.systemPrompt) {
      payload.messages.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    try {
      // Debug: log the request details for agentic requests
      const msgRoles = payload.messages.map(m => `${m.role}(${(m.content || '').length}c)`).join(', ');
      logger.debug(`Ollama chat: model=${payload.model}, messages=[${msgRoles}], num_predict=${payload.options.num_predict}`);

      const response = await this.request('/api/chat', payload, options);

      let content = response.message?.content || '';
      // Some thinking models put reasoning in `thinking` field and leave `content` empty.
      // Only use thinking content if it contains structured tool calls (JSON with "action").
      // Raw reasoning text should NOT be used as user-facing response.
      if (!content && response.message?.thinking) {
        const thinking = response.message.thinking;
        const hasToolCalls = thinking.includes('"action"') || thinking.includes('```tool') || thinking.includes('```json');
        if (hasToolCalls) {
          logger.info(`Ollama chat: Content empty, using 'thinking' field (contains tool calls, ${thinking.length} chars)`);
          content = thinking;
        } else {
          // Thinking field contains only internal reasoning, not structured output.
          // Do NOT construct fake respond actions from thinking - it produces planning text as responses.
          // Let the failover chain handle this by returning empty content.
          logger.warn(`Ollama chat: Thinking model returned only internal reasoning (${thinking.length} chars), no actionable content. Thinking preview: ${thinking.substring(0, 200)}`);
        }
      }
      if (!content) {
        logger.warn(`Ollama chat: Empty content! Response keys: ${Object.keys(response).join(', ')}, message keys: ${response.message ? Object.keys(response.message).join(', ') : 'null'}, done_reason: ${response.done_reason || 'N/A'}, eval_count: ${response.eval_count || 0}`);
      }

      return {
        content,
        model: response.model,
        usage: {
          promptTokens: response.prompt_eval_count || 0,
          completionTokens: response.eval_count || 0,
          totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
        },
        provider: 'ollama',
        metadata: {
          totalDuration: response.total_duration,
          loadDuration: response.load_duration,
          evalDuration: response.eval_duration,
          usedVisionModel: hasImages,
        },
      };
    } catch (error) {
      logger.error(`Ollama chat error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Text generation/completion
   * @param {string} prompt - Generation prompt
   * @param {Object} options - Generation options
   * @returns {Promise<Object>}
   */
  async generate(prompt, options = {}) {
    // Text generation uses text model by default
    const model = options.model || await this.getTextModel() || this.defaultModel;

    if (!model) {
      throw new Error('No Ollama models available');
    }

    const payload = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        top_p: options.topP ?? 0.9,
        num_predict: options.maxTokens ?? 1024,
      },
    };

    if (options.systemPrompt) {
      payload.system = options.systemPrompt;
    }

    try {
      const response = await this.request('/api/generate', payload, options);

      return {
        content: response.response || '',
        model: response.model,
        usage: {
          promptTokens: response.prompt_eval_count || 0,
          completionTokens: response.eval_count || 0,
          totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
        },
        provider: 'ollama',
        done: response.done,
      };
    } catch (error) {
      logger.error(`Ollama generate error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate embeddings
   * @param {string|string[]} texts - Text(s) to embed
   * @param {Object} options - Embedding options
   * @returns {Promise<number[][]>}
   */
  async embed(texts, options = {}) {
    const model = options.model || 'nomic-embed-text';
    const textArray = Array.isArray(texts) ? texts : [texts];

    const embeddings = [];

    for (const text of textArray) {
      const payload = {
        model,
        prompt: text,
      };

      try {
        const response = await this.request('/api/embeddings', payload, options);
        embeddings.push(response.embedding);
      } catch (error) {
        logger.error(`Ollama embed error: ${error.message}`);
        throw error;
      }
    }

    return embeddings;
  }

  /**
   * Translation helper
   * @param {string} text - Text to translate
   * @param {string} targetLanguage - Target language
   * @param {Object} options - Options
   * @returns {Promise<Object>}
   */
  async translate(text, targetLanguage, options = {}) {
    const systemPrompt = `You are a professional translator. Translate the following text to ${targetLanguage}. Only output the translation, nothing else.`;

    return this.chat([
      { role: 'user', content: text },
    ], {
      ...options,
      systemPrompt,
      temperature: 0.3, // Lower temperature for more accurate translation
    });
  }

  /**
   * Summarization helper
   * @param {string} text - Text to summarize
   * @param {Object} options - Options
   * @returns {Promise<Object>}
   */
  async summarize(text, options = {}) {
    const systemPrompt = options.systemPrompt ||
      'You are a summarization assistant. Provide a concise summary of the following text. Focus on the key points.';

    return this.chat([
      { role: 'user', content: text },
    ], {
      ...options,
      systemPrompt,
      temperature: 0.5,
    });
  }

  /**
   * List available models
   * @returns {Promise<Array>}
   */
  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this.availableModels = data.models || [];

      return this.availableModels.map(model => ({
        name: model.name,
        size: model.size,
        modified: model.modified_at,
        profile: MODEL_PROFILES[model.name.split(':')[0]] || null,
      }));
    } catch (error) {
      logger.error(`Failed to list Ollama models: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if a specific model is available
   * @param {string} modelName - Model name
   * @returns {Promise<boolean>}
   */
  async hasModel(modelName) {
    const models = await this.listModels();
    return models.some(m => m.name === modelName || m.name.startsWith(modelName + ':'));
  }

  /**
   * Pull a model if not available
   * @param {string} modelName - Model name
   * @returns {Promise<boolean>}
   */
  async pullModel(modelName) {
    try {
      logger.info(`Pulling Ollama model: ${modelName}`);

      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Stream the response to wait for completion
      const reader = response.body.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      logger.info(`Successfully pulled model: ${modelName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to pull model ${modelName}: ${error.message}`);
      return false;
    }
  }

  /**
   * Format messages to Ollama format
   */
  formatMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Make HTTP request to Ollama
   */
  async request(endpoint, payload, options = {}) {
    const timeout = options.timeout || this.config.timeout;
    const maxRetries = options.maxRetries ?? this.config.maxRetries;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ollama HTTP ${response.status}: ${errorText}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.debug(`Ollama request retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get detailed model info using /api/show endpoint
   * This returns capabilities like vision, completion, embedding, tools
   * @param {string} modelName - Model name (e.g., 'deepseek-ocr:latest')
   * @returns {Promise<Object>} Model info with capabilities
   */
  async getModelInfo(modelName) {
    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Parse capabilities from modelfile and model_info
      const capabilities = [];
      const details = data.details || {};
      const modelInfo = data.model_info || {};

      // Check for vision capability in model_info (e.g., 'deepseekocr.vision.block_count')
      const hasVision = Object.keys(modelInfo).some(key =>
        key.toLowerCase().includes('.vision.') ||
        key.toLowerCase().includes('vision_')
      );

      // Check for embedding capability
      const hasEmbedding = details.family?.toLowerCase().includes('embed') ||
        modelInfo['general.architecture']?.toLowerCase().includes('embed');

      // Check for tools/function calling
      const hasTools = Object.keys(modelInfo).some(key =>
        key.toLowerCase().includes('tool') ||
        key.toLowerCase().includes('function')
      );

      // Always has completion (text generation)
      capabilities.push('completion');
      if (hasVision) capabilities.push('vision');
      if (hasEmbedding) capabilities.push('embedding');
      if (hasTools) capabilities.push('tools');

      return {
        name: modelName,
        details: {
          format: details.format,
          family: details.family,
          families: details.families,
          parameterSize: details.parameter_size,
          quantizationLevel: details.quantization_level,
        },
        modelInfo: {
          architecture: modelInfo['general.architecture'],
          contextLength: modelInfo['general.context_length'] ||
            modelInfo[`${details.family}.context_length`],
          embeddingLength: modelInfo['general.embedding_length'] ||
            modelInfo[`${details.family}.embedding_length`],
        },
        capabilities,
        supportsVision: hasVision,
        supportsEmbedding: hasEmbedding,
        supportsCompletion: true,
        supportsTools: hasTools,
        rawModelInfo: modelInfo,
        modifiedAt: data.modified_at,
      };
    } catch (error) {
      logger.warn(`Failed to get model info for ${modelName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Sync all Ollama models with their capabilities to database
   * This fetches /api/show for each model and stores capabilities
   * @returns {Promise<Object>} Sync result with stats
   */
  async syncModelCapabilities() {
    try {
      const { getDatabase } = require('../../database.cjs');
      const db = getDatabase();

      // First, get list of all models
      const models = await this.listModels();
      if (models.length === 0) {
        return { success: false, error: 'No models found', synced: 0 };
      }

      logger.info(`Syncing capabilities for ${models.length} Ollama models...`);

      // Prepare upsert statement
      const upsert = db.prepare(`
        INSERT OR REPLACE INTO ollama_models (
          id, name, size, parameter_size, quantization, format, family,
          context_length, embedding_length,
          supports_completion, supports_vision, supports_embedding, supports_tools,
          raw_capabilities, model_info, modified_at, synced_at
        ) VALUES (
          @id, @name, @size, @parameterSize, @quantization, @format, @family,
          @contextLength, @embeddingLength,
          @supportsCompletion, @supportsVision, @supportsEmbedding, @supportsTools,
          @rawCapabilities, @modelInfo, @modifiedAt, datetime('now')
        )
      `);

      let synced = 0;
      let errors = [];

      // Process each model
      for (const model of models) {
        try {
          const info = await this.getModelInfo(model.name);

          if (info) {
            upsert.run({
              id: model.name,
              name: model.name.split(':')[0],
              size: model.size || 0,
              parameterSize: info.details?.parameterSize || null,
              quantization: info.details?.quantizationLevel || null,
              format: info.details?.format || null,
              family: info.details?.family || null,
              contextLength: info.modelInfo?.contextLength || null,
              embeddingLength: info.modelInfo?.embeddingLength || null,
              supportsCompletion: info.supportsCompletion ? 1 : 0,
              supportsVision: info.supportsVision ? 1 : 0,
              supportsEmbedding: info.supportsEmbedding ? 1 : 0,
              supportsTools: info.supportsTools ? 1 : 0,
              rawCapabilities: JSON.stringify(info.capabilities),
              modelInfo: JSON.stringify(info.rawModelInfo || {}),
              modifiedAt: info.modifiedAt || null,
            });
            synced++;
            logger.debug(`Synced model: ${model.name} (vision: ${info.supportsVision})`);
          }
        } catch (err) {
          errors.push({ model: model.name, error: err.message });
          logger.warn(`Failed to sync model ${model.name}: ${err.message}`);
        }
      }

      logger.info(`Ollama model sync complete: ${synced}/${models.length} models synced`);

      return {
        success: true,
        total: models.length,
        synced,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error(`Failed to sync Ollama model capabilities: ${error.message}`);
      return { success: false, error: error.message, synced: 0 };
    }
  }

  /**
   * Check if a model has vision capability (uses database if available)
   * @param {string} modelName - Model name
   * @returns {boolean}
   */
  isVisionModelFromDb(modelName) {
    if (!modelName) return false;

    try {
      const { getDatabase } = require('../../database.cjs');
      const db = getDatabase();

      // Check database first
      const model = db.prepare(
        'SELECT supports_vision FROM ollama_models WHERE id = ? OR name = ?'
      ).get(modelName, modelName.split(':')[0]);

      if (model) {
        return model.supports_vision === 1;
      }
    } catch (error) {
      // Fall through to pattern matching
    }

    // Fallback to pattern matching
    return this.isVisionModel(modelName);
  }

  /**
   * Get all vision-capable models from database
   * @returns {Array} List of vision model names
   */
  getVisionModelsFromDb() {
    try {
      const { getDatabase } = require('../../database.cjs');
      const db = getDatabase();

      const models = db.prepare(
        'SELECT id FROM ollama_models WHERE supports_vision = 1'
      ).all();

      return models.map(m => m.id);
    } catch (error) {
      logger.debug(`Failed to get vision models from DB: ${error.message}`);
      return [];
    }
  }

  /**
   * Get supported task types
   * @returns {string[]}
   */
  getSupportedTasks() {
    return ['translation', 'summarization', 'simple_qa', 'formatting', 'chat', 'completion'];
  }

  /**
   * Get provider info
   * @returns {Object}
   */
  getInfo() {
    // Categorize models
    const textModels = this.availableModels.filter(m =>
      !this.isEmbeddingModel(m) && !this.isVisionModel(m)
    );
    const visionModels = this.availableModels.filter(m =>
      !this.isEmbeddingModel(m) && this.isVisionModel(m)
    );
    const embeddingModels = this.availableModels.filter(m =>
      this.isEmbeddingModel(m)
    );

    return {
      name: 'Ollama',
      type: 'local',
      baseUrl: this.baseUrl,
      defaultModel: this.defaultModel,
      isHealthy: this.isHealthy,
      availableModels: this.availableModels,
      modelsByType: {
        text: textModels,
        vision: visionModels,
        embedding: embeddingModels,
      },
      resolvedModels: {
        text: this.resolvedDefaultModel,
        vision: this.resolvedVisionModel,
      },
      supportedTasks: this.getSupportedTasks(),
    };
  }
}

// Singleton instance
let ollamaProviderInstance = null;

function getOllamaProvider(config = {}) {
  if (!ollamaProviderInstance) {
    ollamaProviderInstance = new OllamaProvider(config);
  }
  return ollamaProviderInstance;
}

module.exports = {
  OllamaProvider,
  getOllamaProvider,
  MODEL_PROFILES,
};
