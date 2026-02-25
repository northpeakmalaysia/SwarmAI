/**
 * VisionAIService - Multi-provider Vision AI with configurable 3-level fallback
 *
 * Analyzes images using AI vision models with automatic failover.
 * Uses USER'S CONFIGURED PROVIDERS from ai_providers table (not hardcoded).
 *
 * Fallback chain is user-configurable:
 *   Level 1: User's primary provider
 *   Level 2: First fallback provider
 *   Level 3: Second fallback provider
 *
 * Supported provider types:
 *   - ollama: Local Ollama with vision models (LLaVA, BakLLaVA, etc.)
 *   - openrouter: OpenRouter API (free and paid vision models)
 *   - gemini-cli: Google Gemini CLI (multimodal)
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');

// Vision AI is now fully user-configurable via superbrain_settings
// Vision models are fetched from synced database tables (openrouter_models, ollama_models)
// No hardcoded model lists - users configure their own fallback chain like Task Routing

class VisionAIService {
  constructor() {
    // Lazy-loaded provider instances
    this._ollamaProvider = null;
    this._openRouterProvider = null;
    this._cliProvider = null;
  }

  /**
   * Get Ollama provider (lazy load)
   */
  getOllamaProvider() {
    if (!this._ollamaProvider) {
      try {
        const { getOllamaProvider } = require('../ai/providers/OllamaProvider.cjs');
        this._ollamaProvider = getOllamaProvider();
      } catch (error) {
        logger.debug('OllamaProvider not available');
      }
    }
    return this._ollamaProvider;
  }

  /**
   * Get OpenRouter provider (lazy load)
   */
  getOpenRouterProvider() {
    if (!this._openRouterProvider) {
      try {
        const { getOpenRouterProvider } = require('../ai/providers/OpenRouterProvider.cjs');
        this._openRouterProvider = getOpenRouterProvider();
      } catch (error) {
        logger.debug('OpenRouterProvider not available');
      }
    }
    return this._openRouterProvider;
  }

  /**
   * Get CLI AI provider (lazy load)
   */
  getCLIProvider() {
    if (!this._cliProvider) {
      try {
        const { getCLIAIProvider } = require('../ai/providers/CLIAIProvider.cjs');
        this._cliProvider = getCLIAIProvider();
      } catch (error) {
        logger.debug('CLIAIProvider not available');
      }
    }
    return this._cliProvider;
  }

  /**
   * Get user's configured AI providers that support vision
   * @param {string} userId - User ID
   * @returns {Array} List of vision-capable providers
   */
  getUserVisionProviders(userId) {
    if (!userId) return [];

    try {
      const db = getDatabase();

      // Get user's configured providers - USER-LEVEL only
      const providers = db.prepare(`
        SELECT id, name, type, models, is_default, api_key, base_url
        FROM ai_providers
        WHERE user_id = ?
        ORDER BY is_default DESC, name
      `).all(userId);

      // Filter to vision-capable providers and enrich with vision model info
      return providers.map(provider => {
        const visionModels = this.getVisionModelsForProvider(provider);
        return {
          id: provider.id,
          name: provider.name,
          type: provider.type,
          isDefault: Boolean(provider.is_default),
          hasApiKey: Boolean(provider.api_key),
          visionCapable: visionModels.length > 0,
          visionModels,
          allModels: provider.models ? JSON.parse(provider.models) : [],
        };
      }).filter(p => p.visionCapable);

    } catch (error) {
      logger.warn(`Failed to get user vision providers: ${error.message}`);
      return [];
    }
  }

  /**
   * Get vision-capable models for a provider
   * @param {Object} provider - Provider from ai_providers table
   * @returns {Array} List of vision-capable models
   */
  getVisionModelsForProvider(provider) {
    const type = provider.type?.toLowerCase();

    // 1. Get user's configured models for this provider (from ai_providers.models)
    let configuredModels = [];
    if (provider.models) {
      try {
        const parsed = JSON.parse(provider.models);
        // Handle both array of strings and array of objects
        configuredModels = parsed.map(m => typeof m === 'string' ? m : (m.id || m.name));
      } catch {
        configuredModels = [];
      }
    }

    // Return vision-capable models from user's configured list first
    if (configuredModels.length > 0) {
      // Filter configured models to those that are vision-capable
      const visionCapable = configuredModels.filter(modelId => {
        return this.isModelVisionCapable(modelId, type);
      });

      if (visionCapable.length > 0) {
        logger.debug(`Found ${visionCapable.length} vision models from provider config: ${visionCapable.join(', ')}`);
        return visionCapable;
      }
    }

    // 2. For Ollama: fetch vision-capable models from ollama_models database
    // Models are synced via /api/ai/ollama/sync-capabilities using /api/show
    if (type === 'ollama') {
      try {
        const db = getDatabase();
        const dbModels = db.prepare(`
          SELECT id FROM ollama_models
          WHERE supports_vision = 1
          ORDER BY name
        `).all();

        if (dbModels.length > 0) {
          logger.debug(`Found ${dbModels.length} vision models from Ollama DB`);
          return dbModels.map(m => m.id);
        }
      } catch (error) {
        logger.debug(`Failed to fetch Ollama vision models from DB: ${error.message}`);
      }

      // Fallback: return all configured models (user can select any)
      if (configuredModels.length > 0) {
        logger.debug(`Returning all ${configuredModels.length} Ollama models for selection (DB empty)`);
        return configuredModels;
      }
    }

    // 3. For OpenRouter: fetch vision-capable models from openrouter_models database
    if (type === 'openrouter') {
      try {
        const db = getDatabase();
        const dbModels = db.prepare(`
          SELECT id FROM openrouter_models
          WHERE supports_vision = 1
          ORDER BY
            CASE WHEN is_free = 1 THEN 0 ELSE 1 END,
            name
          LIMIT 30
        `).all();

        if (dbModels.length > 0) {
          logger.debug(`Found ${dbModels.length} vision models from OpenRouter DB`);
          return dbModels.map(m => m.id);
        }
      } catch (error) {
        logger.debug(`Failed to fetch vision models from DB: ${error.message}`);
      }
    }

    // 4. Return all configured models - user can select any model they want
    // Vision AI is now fully user-configurable, no hardcoded suggestions
    if (configuredModels.length > 0) {
      logger.debug(`Returning all ${configuredModels.length} configured models for user selection`);
      return configuredModels;
    }

    // No models available
    logger.debug(`No vision models found for provider type: ${type}`);
    return [];
  }

  /**
   * Check if a model is vision-capable
   * Uses database lookups only - no hardcoded patterns
   * If model not in database, trust user's selection (return true)
   * @param {string} modelId - Model ID
   * @param {string} providerType - Provider type
   * @returns {boolean}
   */
  isModelVisionCapable(modelId, providerType) {
    if (!modelId) return false;

    const db = getDatabase();

    // For OpenRouter: check openrouter_models database
    if (providerType === 'openrouter') {
      try {
        const model = db.prepare(
          'SELECT supports_vision FROM openrouter_models WHERE id = ?'
        ).get(modelId);
        if (model) {
          return model.supports_vision === 1;
        }
      } catch (error) {
        logger.debug(`OpenRouter model DB check failed: ${error.message}`);
      }
    }

    // For Ollama: check ollama_models database (synced via /api/show)
    if (providerType === 'ollama') {
      try {
        const model = db.prepare(
          'SELECT supports_vision FROM ollama_models WHERE id = ? OR name = ?'
        ).get(modelId, modelId.split(':')[0]);
        if (model) {
          logger.debug(`Ollama model ${modelId} vision capability from DB: ${model.supports_vision === 1}`);
          return model.supports_vision === 1;
        }
      } catch (error) {
        logger.debug(`Ollama model DB check failed: ${error.message}`);
      }
    }

    // Model not in database - trust user's selection
    // Users configure their own vision models via superbrain_settings
    logger.debug(`Model ${modelId} not in DB, trusting user selection`);
    return true;
  }

  /**
   * Get user's Vision AI settings from database
   * References user's configured providers by ID
   * @param {string} userId - User ID
   * @returns {Object} Vision AI settings with fallback chain
   */
  getUserVisionSettings(userId) {
    // Default Vision AI prompt - optimized to avoid verbose "[unclear]" markers
    const DEFAULT_VISION_PROMPT = `Analyze this image concisely. Provide:

TYPE: [Photo/Document/Screenshot/ID Card/etc.]
TEXT: [Transcribe only clearly readable text. If text is partially visible or blurry, summarize what's readable and note "some text unclear" - do NOT list every unclear character]
DESCRIPTION: [Brief visual description - main subjects, key elements, context]
KEY DATA: [Any important data points like dates, names, numbers, or "None found"]
CONTEXT: [What this image appears to be about]

Rules:
- Keep response under 150 words total
- Never repeat "[unclear]" multiple times - just note once if text is hard to read
- Focus on what IS readable, not what isn't
- Be concise and factual`;

    const defaults = {
      visionEnabled: true,
      ocrEnabled: true,
      ocrLanguages: 'eng+msa+chi_sim',
      ocrMinConfidence: 0.3,
      fallbackChain: [],
      visionAiPrompt: DEFAULT_VISION_PROMPT,
    };

    if (!userId) return defaults;

    try {
      const db = getDatabase();
      const settings = db.prepare(`
        SELECT
          vision_enabled,
          vision_provider_1, vision_model_1,
          vision_provider_2, vision_model_2,
          vision_provider_3, vision_model_3,
          ocr_enabled, ocr_languages, ocr_min_confidence,
          vision_ai_prompt
        FROM superbrain_settings
        WHERE user_id = ?
      `).get(userId);

      // Get user's configured providers
      const userProviders = this.getUserVisionProviders(userId);

      // Build fallback chain from user settings
      const fallbackChain = [];

      // Helper to resolve provider (by ID or type)
      const resolveProvider = (providerRef, model) => {
        if (!providerRef) return null;

        // Try to find by ID first
        let provider = userProviders.find(p => p.id === providerRef);

        // If not found by ID, try by type
        if (!provider) {
          provider = userProviders.find(p => p.type === providerRef);
        }

        // If still not found, try by name (case-insensitive)
        if (!provider) {
          provider = userProviders.find(p =>
            p.name.toLowerCase() === providerRef.toLowerCase()
          );
        }

        if (provider) {
          return {
            providerId: provider.id,
            providerName: provider.name,
            providerType: provider.type,
            model: model || provider.visionModels[0],
          };
        }

        return null;
      };

      if (settings) {
        // Level 1
        const level1 = resolveProvider(settings.vision_provider_1, settings.vision_model_1);
        if (level1) fallbackChain.push(level1);

        // Level 2
        const level2 = resolveProvider(settings.vision_provider_2, settings.vision_model_2);
        if (level2) fallbackChain.push(level2);

        // Level 3
        const level3 = resolveProvider(settings.vision_provider_3, settings.vision_model_3);
        if (level3) fallbackChain.push(level3);
      }

      // If no chain configured, use defaults based on available providers
      if (fallbackChain.length === 0 && userProviders.length > 0) {
        // Prioritize: ollama (local) -> openrouter -> cli
        const ollamaProvider = userProviders.find(p => p.type === 'ollama');
        const openrouterProvider = userProviders.find(p => p.type === 'openrouter');

        if (ollamaProvider) {
          fallbackChain.push({
            providerId: ollamaProvider.id,
            providerName: ollamaProvider.name,
            providerType: ollamaProvider.type,
            model: ollamaProvider.visionModels[0],
          });
        }

        if (openrouterProvider) {
          fallbackChain.push({
            providerId: openrouterProvider.id,
            providerName: openrouterProvider.name,
            providerType: openrouterProvider.type,
            model: openrouterProvider.visionModels[0],
          });
        }
      }

      return {
        visionEnabled: settings?.vision_enabled !== 0,
        ocrEnabled: settings?.ocr_enabled !== 0,
        ocrLanguages: settings?.ocr_languages || defaults.ocrLanguages,
        ocrMinConfidence: settings?.ocr_min_confidence ?? defaults.ocrMinConfidence,
        fallbackChain,
        availableProviders: userProviders,
        visionAiPrompt: settings?.vision_ai_prompt || defaults.visionAiPrompt,
      };

    } catch (error) {
      logger.warn(`Failed to get Vision AI settings: ${error.message}`);
      return defaults;
    }
  }

  /**
   * Prepare image data for API (base64 encode if needed)
   * @param {string} imagePath - Local path or URL to image
   * @returns {Object} { data, mimeType }
   */
  async prepareImageData(imagePath) {
    let imageData = null;
    let mimeType = 'image/jpeg';

    // Handle URL
    if (imagePath.startsWith('http')) {
      return { data: imagePath, mimeType: null, isUrl: true };
    }

    // Handle base64 data URI
    if (imagePath.startsWith('data:')) {
      const match = imagePath.match(/^data:([^;]+);base64,/);
      if (match) {
        mimeType = match[1];
      }
      return { data: imagePath, mimeType, isUrl: false };
    }

    // Handle local file
    const absolutePath = path.isAbsolute(imagePath)
      ? imagePath
      : path.join(__dirname, '../../data/media', path.basename(imagePath));

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Image file not found: ${absolutePath}`);
    }

    const imageBuffer = fs.readFileSync(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();

    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.bmp') mimeType = 'image/bmp';

    imageData = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

    return { data: imageData, mimeType, isUrl: false };
  }

  /**
   * Analyze image with a specific provider
   * @param {Object} imageData - Prepared image data
   * @param {Object} providerInfo - Provider info from fallback chain
   * @param {string} prompt - Analysis prompt
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeWithProvider(imageData, providerInfo, prompt, options = {}) {
    const { userId } = options;
    const { providerType, model } = providerInfo;

    switch (providerType) {
      case 'ollama': {
        const ollama = this.getOllamaProvider();
        if (!ollama) throw new Error('Ollama provider not available');

        // Check if Ollama is running
        const isAvailable = await ollama.isAvailable();
        if (!isAvailable) throw new Error('Ollama server not running');

        // Ollama vision API uses images array
        const messages = [{
          role: 'user',
          content: prompt,
          images: [imageData.data.replace(/^data:[^;]+;base64,/, '')], // Ollama expects raw base64
        }];

        const result = await ollama.chat(messages, { model });
        return {
          content: result.content,
          provider: providerInfo.providerName,
          providerType,
          model,
        };
      }

      case 'openrouter': {
        const openRouter = this.getOpenRouterProvider();
        if (!openRouter) throw new Error('OpenRouter provider not available');

        const messages = [{ role: 'user', content: prompt }];
        const result = await openRouter.chat(messages, {
          userId,
          model,
          images: [imageData.data],
          taskType: 'vision',
        });

        return {
          content: result.content,
          provider: providerInfo.providerName,
          providerType,
          model: result.model || model,
        };
      }

      case 'gemini-cli':
      case 'cli-gemini': {
        const cliProvider = this.getCLIProvider();
        if (!cliProvider) throw new Error('CLI provider not available');

        // Check if Gemini CLI is authenticated
        const authStatus = await cliProvider.checkAuth('gemini');
        if (!authStatus.authenticated) {
          throw new Error('Gemini CLI not authenticated');
        }

        const messages = [{ role: 'user', content: prompt }];
        const result = await cliProvider.chat(messages, {
          userId,
          cliType: 'gemini',
          context: {
            images: [imageData.isUrl ? imageData.data : imageData.data],
            model,
          },
        });

        return {
          content: result.content,
          provider: providerInfo.providerName,
          providerType,
          model,
        };
      }

      default:
        throw new Error(`Unknown vision provider type: ${providerType}`);
    }
  }

  /**
   * Analyze an image with 3-level fallback using user's configured providers
   * @param {string} imagePath - Path to image file
   * @param {Object} options - Analysis options
   * @param {string} options.userId - User ID for settings lookup
   * @param {string} options.prompt - Custom analysis prompt
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeImage(imagePath, options = {}) {
    const { userId, prompt } = options;

    // Get user's vision settings (includes configured providers)
    const settings = this.getUserVisionSettings(userId);

    if (!settings.visionEnabled) {
      logger.debug('Vision AI disabled for user');
      return { success: false, reason: 'vision_disabled' };
    }

    if (settings.fallbackChain.length === 0) {
      logger.warn('No vision-capable providers configured');
      return {
        success: false,
        reason: 'no_providers_configured',
        availableProviders: settings.availableProviders,
      };
    }

    // Prepare image data
    let imageData;
    try {
      imageData = await this.prepareImageData(imagePath);
    } catch (error) {
      logger.error(`Failed to prepare image: ${error.message}`);
      return { success: false, reason: 'image_preparation_failed', error: error.message };
    }

    // Use user's custom prompt from settings, or the one passed as parameter
    const analysisPrompt = prompt || settings.visionAiPrompt;

    // Try each provider in the fallback chain
    const errors = [];

    for (let i = 0; i < settings.fallbackChain.length; i++) {
      const providerInfo = settings.fallbackChain[i];
      const level = i + 1;

      logger.info(`Vision AI Level ${level}: Trying ${providerInfo.providerName} (${providerInfo.providerType}) with ${providerInfo.model}`);

      try {
        const startTime = Date.now();
        const result = await this.analyzeWithProvider(
          imageData,
          providerInfo,
          analysisPrompt,
          { userId }
        );

        const duration = Date.now() - startTime;
        logger.info(`Vision AI success: ${providerInfo.providerName}/${providerInfo.model} in ${duration}ms`);

        return {
          success: true,
          content: result.content,
          provider: result.provider,
          providerType: result.providerType,
          model: result.model,
          level,
          duration,
        };

      } catch (error) {
        const errorMsg = `Level ${level} (${providerInfo.providerName}/${providerInfo.model}) failed: ${error.message}`;
        logger.warn(`Vision AI ${errorMsg}`);
        errors.push({
          level,
          provider: providerInfo.providerName,
          providerType: providerInfo.providerType,
          model: providerInfo.model,
          error: error.message,
        });

        // Continue to next provider in chain
        continue;
      }
    }

    // All providers failed
    logger.error(`Vision AI: All ${settings.fallbackChain.length} providers failed`);
    return {
      success: false,
      reason: 'all_providers_failed',
      errors,
    };
  }

  /**
   * Get service status and capabilities
   */
  async getStatus(userId) {
    const settings = this.getUserVisionSettings(userId);
    const userProviders = this.getUserVisionProviders(userId);

    // Check provider availability
    const providerStatus = {};

    for (const provider of userProviders) {
      switch (provider.type) {
        case 'ollama': {
          const ollama = this.getOllamaProvider();
          if (ollama) {
            try {
              providerStatus[provider.id] = await ollama.isAvailable();
            } catch {
              providerStatus[provider.id] = false;
            }
          } else {
            providerStatus[provider.id] = false;
          }
          break;
        }

        case 'openrouter': {
          // OpenRouter is available if provider exists and has API key
          providerStatus[provider.id] = provider.hasApiKey;
          break;
        }

        case 'gemini-cli':
        case 'cli-gemini': {
          const cliProvider = this.getCLIProvider();
          if (cliProvider) {
            try {
              const authStatus = await cliProvider.checkAuth('gemini');
              providerStatus[provider.id] = authStatus.authenticated;
            } catch {
              providerStatus[provider.id] = false;
            }
          } else {
            providerStatus[provider.id] = false;
          }
          break;
        }

        default:
          providerStatus[provider.id] = false;
      }
    }

    return {
      visionEnabled: settings.visionEnabled,
      ocrEnabled: settings.ocrEnabled,
      fallbackChain: settings.fallbackChain,
      providerStatus,
      availableProviders: userProviders,
      // No hardcoded suggestions - models come from synced database tables
    };
  }
}

// Singleton instance
let _visionAIService = null;

function getVisionAIService() {
  if (!_visionAIService) {
    _visionAIService = new VisionAIService();
  }
  return _visionAIService;
}

module.exports = {
  VisionAIService,
  getVisionAIService,
};
