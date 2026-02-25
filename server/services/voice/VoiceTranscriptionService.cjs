/**
 * VoiceTranscriptionService - Multi-provider voice transcription with 3-level fallback
 *
 * Transcribes audio using cloud APIs with automatic failover.
 * Uses USER'S CONFIGURED PROVIDERS from ai_providers table (not hardcoded).
 *
 * Fallback chain is user-configurable:
 *   Level 1: User's primary provider
 *   Level 2: First fallback provider
 *   Level 3: Second fallback provider
 *
 * Supported provider types:
 *   - groq: Groq Whisper API (fast, free tier available)
 *   - openai-whisper: OpenAI Whisper API (reliable, paid)
 *   - openai-compatible: Any OpenAI-compatible /audio/transcriptions endpoint
 *
 * Mirrors VisionAIService.cjs architecture.
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');

// Default transcription models per provider type
const DEFAULT_MODELS = {
  'groq': 'whisper-large-v3',
  'openai-whisper': 'whisper-1',
  'openai-compatible': 'whisper-1',
};

// Provider type → default base URL
const PROVIDER_BASE_URLS = {
  'groq': 'https://api.groq.com/openai/v1',
  'openai-whisper': 'https://api.openai.com/v1',
};

// Audio transcription-capable provider types
const TRANSCRIPTION_PROVIDER_TYPES = ['groq', 'openai-whisper', 'openai-compatible'];

// Max file size for transcription APIs (25MB for OpenAI, 25MB for Groq)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

class VoiceTranscriptionService {
  constructor() {
    // No hardcoded provider instances - resolved from ai_providers table
  }

  /**
   * Get user's configured AI providers that support audio transcription
   * @param {string} userId - User ID
   * @returns {Array} List of transcription-capable providers
   */
  getUserTranscriptionProviders(userId) {
    if (!userId) return [];

    try {
      const db = getDatabase();

      const providers = db.prepare(`
        SELECT id, name, type, models, is_default, api_key, base_url
        FROM ai_providers
        WHERE user_id = ? AND type IN (${TRANSCRIPTION_PROVIDER_TYPES.map(() => '?').join(',')})
        ORDER BY is_default DESC, name
      `).all(userId, ...TRANSCRIPTION_PROVIDER_TYPES);

      return providers.map(provider => {
        let models = [];
        try { models = provider.models ? JSON.parse(provider.models) : []; } catch { /* ignore */ }

        // Add default model if not present
        const defaultModel = DEFAULT_MODELS[provider.type];
        if (defaultModel && !models.includes(defaultModel)) {
          models.unshift(defaultModel);
        }

        return {
          id: provider.id,
          name: provider.name,
          type: provider.type,
          isDefault: Boolean(provider.is_default),
          hasApiKey: Boolean(provider.api_key),
          transcriptionModels: models,
          baseUrl: provider.base_url || PROVIDER_BASE_URLS[provider.type] || null,
        };
      });

    } catch (error) {
      logger.warn(`Failed to get user transcription providers: ${error.message}`);
      return [];
    }
  }

  /**
   * Get user's voice transcription settings from database
   * @param {string} userId - User ID
   * @returns {Object} Transcription settings with fallback chain
   */
  getUserTranscriptionSettings(userId) {
    const defaults = {
      transcriptionEnabled: true,
      transcriptionAutoExtract: true,
      transcriptionLanguage: 'auto',
      fallbackChain: [],
      availableProviders: [],
    };

    if (!userId) return defaults;

    try {
      const db = getDatabase();
      const settings = db.prepare(`
        SELECT
          transcription_enabled,
          transcription_auto_extract,
          transcription_provider_1, transcription_model_1,
          transcription_provider_2, transcription_model_2,
          transcription_provider_3, transcription_model_3,
          transcription_language
        FROM superbrain_settings
        WHERE user_id = ?
      `).get(userId);

      const userProviders = this.getUserTranscriptionProviders(userId);

      // Build fallback chain from user settings
      const fallbackChain = [];

      const resolveProvider = (providerRef, model) => {
        if (!providerRef) return null;

        // Try by ID, then type, then name
        let provider = userProviders.find(p => p.id === providerRef);
        if (!provider) provider = userProviders.find(p => p.type === providerRef);
        if (!provider) provider = userProviders.find(p => p.name.toLowerCase() === providerRef.toLowerCase());

        if (provider) {
          return {
            providerId: provider.id,
            providerName: provider.name,
            providerType: provider.type,
            model: model || DEFAULT_MODELS[provider.type] || provider.transcriptionModels[0],
            baseUrl: provider.baseUrl,
          };
        }
        return null;
      };

      if (settings) {
        const level1 = resolveProvider(settings.transcription_provider_1, settings.transcription_model_1);
        if (level1) fallbackChain.push(level1);

        const level2 = resolveProvider(settings.transcription_provider_2, settings.transcription_model_2);
        if (level2) fallbackChain.push(level2);

        const level3 = resolveProvider(settings.transcription_provider_3, settings.transcription_model_3);
        if (level3) fallbackChain.push(level3);
      }

      // Auto-populate chain if empty but providers exist
      if (fallbackChain.length === 0 && userProviders.length > 0) {
        for (const provider of userProviders) {
          if (fallbackChain.length >= 3) break;
          fallbackChain.push({
            providerId: provider.id,
            providerName: provider.name,
            providerType: provider.type,
            model: DEFAULT_MODELS[provider.type] || provider.transcriptionModels[0],
            baseUrl: provider.baseUrl,
          });
        }
      }

      return {
        transcriptionEnabled: settings ? settings.transcription_enabled !== 0 : defaults.transcriptionEnabled,
        transcriptionAutoExtract: settings ? settings.transcription_auto_extract !== 0 : defaults.transcriptionAutoExtract,
        transcriptionLanguage: settings?.transcription_language || defaults.transcriptionLanguage,
        fallbackChain,
        availableProviders: userProviders,
      };

    } catch (error) {
      logger.warn(`Failed to get transcription settings: ${error.message}`);
      return defaults;
    }
  }

  /**
   * Transcribe audio with a specific cloud provider
   *
   * Both Groq and OpenAI use the same OpenAI-compatible multipart API:
   * POST /audio/transcriptions with form-data: file, model, language, response_format
   *
   * @param {string} audioPath - Path to audio file
   * @param {Object} providerInfo - Provider info from fallback chain
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeWithProvider(audioPath, providerInfo, options = {}) {
    const { userId, language = 'auto' } = options;
    const { providerType, model, providerId } = providerInfo;

    // Resolve provider credentials from DB
    const db = getDatabase();
    const provider = db.prepare(`
      SELECT id, name, type, api_key, base_url
      FROM ai_providers WHERE id = ? AND user_id = ?
    `).get(providerId, userId);

    if (!provider) {
      throw new Error(`Provider ${providerId} not found for user`);
    }
    if (!provider.api_key) {
      throw new Error(`No API key configured for provider ${provider.name}`);
    }

    // Determine base URL
    let baseUrl = provider.base_url || PROVIDER_BASE_URLS[provider.type];
    if (!baseUrl) {
      throw new Error(`No base URL for provider type: ${provider.type}`);
    }

    // Remove trailing slash
    baseUrl = baseUrl.replace(/\/$/, '');

    // Check file size
    const stats = fs.statSync(audioPath);
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`Audio file too large (${(stats.size / 1024 / 1024).toFixed(1)}MB, max 25MB)`);
    }

    // Build multipart form-data request using Node.js native FormData
    const { FormData, File } = await import('undici');
    const audioBuffer = fs.readFileSync(audioPath);
    const ext = path.extname(audioPath).toLowerCase().slice(1) || 'ogg';
    const mimeTypes = {
      ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg',
      webm: 'audio/webm', m4a: 'audio/m4a', flac: 'audio/flac',
    };
    const mimeType = mimeTypes[ext] || 'audio/ogg';

    const formData = new FormData();
    const audioFile = new File([audioBuffer], `audio.${ext}`, { type: mimeType });
    formData.append('file', audioFile);
    formData.append('model', model || DEFAULT_MODELS[providerType] || 'whisper-1');
    formData.append('response_format', 'verbose_json');

    if (language && language !== 'auto') {
      formData.append('language', language);
    }

    const transcriptionUrl = `${baseUrl}/audio/transcriptions`;
    logger.info(`Transcription API call: ${providerType} → ${transcriptionUrl} (model: ${model})`);

    const response = await fetch(transcriptionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.api_key}`,
      },
      body: formData,
      signal: AbortSignal.timeout(120000), // 2 minute timeout
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(`Transcription API error (${response.status}): ${errorBody.slice(0, 200)}`);
    }

    const result = await response.json();

    return {
      text: result.text || '',
      language: result.language || language,
      duration: result.duration || null,
      segments: result.segments || [],
      provider: provider.name,
      providerType: provider.type,
      model: model || DEFAULT_MODELS[providerType],
    };
  }

  /**
   * Transcribe audio with 3-level fallback chain
   *
   * @param {string} audioPath - Path to audio file
   * @param {Object} options - Transcription options
   * @param {string} options.userId - User ID for settings lookup
   * @param {string} options.language - Language hint (default: auto)
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeAudio(audioPath, options = {}) {
    const { userId, language } = options;

    const settings = this.getUserTranscriptionSettings(userId);

    if (!settings.transcriptionEnabled) {
      logger.debug('Voice transcription disabled for user');
      return { success: false, reason: 'transcription_disabled' };
    }

    if (settings.fallbackChain.length === 0) {
      logger.warn('No transcription providers configured');
      return {
        success: false,
        reason: 'no_providers_configured',
        availableProviders: settings.availableProviders,
      };
    }

    // Verify audio file exists
    if (!fs.existsSync(audioPath)) {
      return { success: false, reason: 'file_not_found', error: `Audio file not found: ${audioPath}` };
    }

    const transcriptionLanguage = language || settings.transcriptionLanguage || 'auto';

    // Try each provider in the fallback chain
    const errors = [];

    for (let i = 0; i < settings.fallbackChain.length; i++) {
      const providerInfo = settings.fallbackChain[i];
      const level = i + 1;

      logger.info(`Transcription Level ${level}: Trying ${providerInfo.providerName} (${providerInfo.providerType}) with ${providerInfo.model}`);

      try {
        const startTime = Date.now();
        const result = await this.transcribeWithProvider(
          audioPath,
          providerInfo,
          { userId, language: transcriptionLanguage }
        );

        const duration = Date.now() - startTime;
        logger.info(`Transcription success: ${providerInfo.providerName}/${providerInfo.model} in ${duration}ms (${result.text.length} chars)`);

        return {
          success: true,
          text: result.text,
          language: result.language,
          audioDuration: result.duration,
          segments: result.segments,
          provider: result.provider,
          providerType: result.providerType,
          model: result.model,
          level,
          processingDuration: duration,
        };

      } catch (error) {
        const errorMsg = `Level ${level} (${providerInfo.providerName}/${providerInfo.model}) failed: ${error.message}`;
        logger.warn(`Transcription ${errorMsg}`);
        errors.push({
          level,
          provider: providerInfo.providerName,
          providerType: providerInfo.providerType,
          model: providerInfo.model,
          error: error.message,
        });
        continue;
      }
    }

    // All providers failed
    logger.error(`Transcription: All ${settings.fallbackChain.length} providers failed`);
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
    const settings = this.getUserTranscriptionSettings(userId);
    const userProviders = this.getUserTranscriptionProviders(userId);

    const providerStatus = {};
    for (const provider of userProviders) {
      // Transcription providers are available if they have an API key
      providerStatus[provider.id] = provider.hasApiKey;
    }

    return {
      transcriptionEnabled: settings.transcriptionEnabled,
      transcriptionAutoExtract: settings.transcriptionAutoExtract,
      transcriptionLanguage: settings.transcriptionLanguage,
      fallbackChain: settings.fallbackChain,
      providerStatus,
      availableProviders: userProviders,
    };
  }
}

// Singleton
let _instance = null;
function getVoiceTranscriptionService() {
  if (!_instance) _instance = new VoiceTranscriptionService();
  return _instance;
}

module.exports = {
  VoiceTranscriptionService,
  getVoiceTranscriptionService,
  TRANSCRIPTION_PROVIDER_TYPES,
  DEFAULT_MODELS,
  PROVIDER_BASE_URLS,
};
