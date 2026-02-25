/**
 * Super Brain Routes
 *
 * API endpoints for the Super Brain AI orchestration system.
 * Handles task processing, provider management, and CLI authentication.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate, requireSuperadmin } = require('./auth.cjs');
const { getSuperBrainRouter } = require('../services/ai/SuperBrainRouter.cjs');
const { getCLIAuthManager } = require('../services/ai/CLIAuthManager.cjs');
const { getCLIAIProvider, CLI_DEFAULT_MODELS, CLI_DISPLAY_NAMES } = require('../services/ai/providers/CLIAIProvider.cjs');
const { getFailoverConfigService } = require('../services/ai/FailoverConfigService.cjs');
const { getWorkspaceManager } = require('../services/ai/WorkspaceManager.cjs');
const { getTaskClassifier } = require('../services/ai/TaskClassifier.cjs');
const { getSuperBrainLogService, LOG_TTL_SECONDS } = require('../services/ai/SuperBrainLogService.cjs');
const { getSystemToolsRegistry, TOOL_CATEGORIES } = require('../services/ai/SystemToolsRegistry.cjs');
const { getLocalAgentGateway } = require('../services/LocalAgentGateway.cjs');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ========================================
// Constants for User Settings
// ========================================

// Default SuperBrain settings (used when user has no custom settings)
const DEFAULT_SUPERBRAIN_SETTINGS = {
  // Translation Settings
  translationLanguage: 'en',
  translationProvider: 'system', // Provider for translation (system = use task routing)
  translationModel: null, // Will use system default
  autoTranslate: false,
  showOriginalWithTranslation: true,

  // Rephrase Settings
  rephraseProvider: 'system', // Provider for rephrase (system = use task routing)
  rephraseModel: null, // Will use system default
  rephraseStyle: 'professional',

  // Task Classification Preferences (Provider per tier)
  // NOTE: Users configure their model preferences via Task Routing settings
  trivialTierProvider: 'ollama',
  simpleTierProvider: 'openrouter',
  moderateTierProvider: 'openrouter',
  complexTierProvider: 'openrouter',
  criticalTierProvider: 'cli-claude',

  // Model per tier (specific model for each classification)
  trivialTierModel: null,
  simpleTierModel: null,
  moderateTierModel: null,
  complexTierModel: null,
  criticalTierModel: null,

  // Custom Failover Chain
  customFailoverChain: null,

  // Tool Access Control Settings
  autoSendMode: 'restricted', // 'allowed' | 'restricted' - Controls auto-sending messages
  enabledTools: null, // null = all tools, or array of tool IDs
  toolConfidenceThreshold: 0.7, // 0.0 - 1.0 - Minimum confidence to auto-execute
  aiRouterMode: 'full', // 'full' | 'classify_only' | 'disabled'

  // OCR Settings
  ocrEnabled: true,
  ocrLanguages: 'eng+msa+chi_sim', // Tesseract language chain
  ocrAutoExtract: true, // Auto-extract text from image-only messages
  ocrMinConfidence: 0.3, // Minimum OCR confidence to use extracted text

  // Document Analysis Settings
  docAutoExtract: true, // Auto-extract text from PDF/Excel/Word documents
  docAutoSummarize: false, // Use AI to summarize extracted document content

  // Vision AI Settings (3-level fallback chain for image description)
  // NOTE: User must configure their own vision providers/models - no defaults
  visionEnabled: true,
  visionProvider1: null, // User configures via Settings > SuperBrain > Vision AI
  visionModel1: null,
  visionProvider2: null,
  visionModel2: null,
  visionProvider3: null,
  visionModel3: null,
  ocrMinConfidence: 0.3, // Minimum OCR confidence threshold

  // Vision AI prompt (user-configurable)
  visionAiPrompt: `Analyze this image and provide a detailed description. Include:
1. Main subject/content of the image
2. Any text visible in the image (transcribe it exactly)
3. Key visual elements (colors, objects, people, etc.)
4. Context or purpose (if apparent)

Keep the description concise but informative (max 200 words).`,

  // Voice Transcription Settings (3-level fallback chain for audio transcription)
  transcriptionEnabled: true,
  transcriptionAutoExtract: true,
  transcriptionProvider1: null,
  transcriptionModel1: null,
  transcriptionProvider2: null,
  transcriptionModel2: null,
  transcriptionProvider3: null,
  transcriptionModel3: null,
  transcriptionLanguage: 'auto',

  // AI Task Classifier Settings
  classifierMode: 'local',        // 'local' (keyword-based) | 'ai' (AI-powered)
  classifierChain: null,           // JSON array of {provider, model} entries (unlimited fallback chain)
  classifierProvider1: null,       // LEGACY: primary AI provider (migrated to classifierChain)
  classifierModel1: null,          // LEGACY
  classifierProvider2: null,       // LEGACY
  classifierModel2: null,          // LEGACY
};

// Available rephrase styles
const REPHRASE_STYLES = {
  professional: 'Professional and formal tone',
  casual: 'Casual and friendly tone',
  concise: 'Brief and to the point',
  detailed: 'Comprehensive and thorough',
  friendly: 'Warm and approachable',
  formal: 'Very formal and business-like',
};

// Available AI provider tiers
// NOTE: These are defaults. Users configure their own via Task Routing settings.
const PROVIDER_TIERS = {
  trivial: ['ollama', 'openrouter'],
  simple: ['openrouter', 'ollama', 'cli-gemini', 'cli-opencode'],
  moderate: ['openrouter', 'ollama', 'cli-gemini', 'cli-opencode', 'cli-claude'],
  complex: ['openrouter', 'cli-claude', 'cli-gemini', 'cli-opencode'],
  critical: ['cli-claude', 'cli-gemini', 'cli-opencode', 'openrouter'],
};

// Supported languages for translation
const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
];

/**
 * Convert database row to API response format for settings
 */
function formatUserSettings(row) {
  if (!row) {
    return { ...DEFAULT_SUPERBRAIN_SETTINGS };
  }

  return {
    translationLanguage: row.translation_language || DEFAULT_SUPERBRAIN_SETTINGS.translationLanguage,
    translationProvider: row.translation_provider || DEFAULT_SUPERBRAIN_SETTINGS.translationProvider,
    translationModel: row.translation_model || DEFAULT_SUPERBRAIN_SETTINGS.translationModel,
    autoTranslate: Boolean(row.auto_translate),
    showOriginalWithTranslation: row.show_original_with_translation !== 0,
    rephraseProvider: row.rephrase_provider || DEFAULT_SUPERBRAIN_SETTINGS.rephraseProvider,
    rephraseModel: row.rephrase_model || DEFAULT_SUPERBRAIN_SETTINGS.rephraseModel,
    rephraseStyle: row.rephrase_style || DEFAULT_SUPERBRAIN_SETTINGS.rephraseStyle,

    // Provider per tier
    trivialTierProvider: row.trivial_tier_provider || DEFAULT_SUPERBRAIN_SETTINGS.trivialTierProvider,
    simpleTierProvider: row.simple_tier_provider || DEFAULT_SUPERBRAIN_SETTINGS.simpleTierProvider,
    moderateTierProvider: row.moderate_tier_provider || DEFAULT_SUPERBRAIN_SETTINGS.moderateTierProvider,
    complexTierProvider: row.complex_tier_provider || DEFAULT_SUPERBRAIN_SETTINGS.complexTierProvider,
    criticalTierProvider: row.critical_tier_provider || DEFAULT_SUPERBRAIN_SETTINGS.criticalTierProvider,

    // Model per tier
    trivialTierModel: row.trivial_tier_model || DEFAULT_SUPERBRAIN_SETTINGS.trivialTierModel,
    simpleTierModel: row.simple_tier_model || DEFAULT_SUPERBRAIN_SETTINGS.simpleTierModel,
    moderateTierModel: row.moderate_tier_model || DEFAULT_SUPERBRAIN_SETTINGS.moderateTierModel,
    complexTierModel: row.complex_tier_model || DEFAULT_SUPERBRAIN_SETTINGS.complexTierModel,
    criticalTierModel: row.critical_tier_model || DEFAULT_SUPERBRAIN_SETTINGS.criticalTierModel,

    customFailoverChain: row.custom_failover_chain
      ? migrateFailoverChain(JSON.parse(row.custom_failover_chain))
      : null,

    // Reasoning Budget (per-tier iteration limits)
    reasoningBudgets: row.reasoning_budgets ? JSON.parse(row.reasoning_budgets) : null,

    // Tool Access Control
    autoSendMode: row.auto_send_mode || DEFAULT_SUPERBRAIN_SETTINGS.autoSendMode,
    enabledTools: row.enabled_tools ? JSON.parse(row.enabled_tools) : DEFAULT_SUPERBRAIN_SETTINGS.enabledTools,
    toolConfidenceThreshold: row.tool_confidence_threshold !== null && row.tool_confidence_threshold !== undefined
      ? row.tool_confidence_threshold
      : DEFAULT_SUPERBRAIN_SETTINGS.toolConfidenceThreshold,
    aiRouterMode: row.ai_router_mode || DEFAULT_SUPERBRAIN_SETTINGS.aiRouterMode,

    // OCR Settings
    ocrEnabled: row.ocr_enabled !== 0,
    ocrLanguages: row.ocr_languages || DEFAULT_SUPERBRAIN_SETTINGS.ocrLanguages,
    ocrAutoExtract: row.ocr_auto_extract !== 0,
    ocrMinConfidence: row.ocr_min_confidence !== null && row.ocr_min_confidence !== undefined
      ? row.ocr_min_confidence
      : DEFAULT_SUPERBRAIN_SETTINGS.ocrMinConfidence,

    // Document Analysis Settings
    docAutoExtract: row.doc_auto_extract !== 0,
    docAutoSummarize: Boolean(row.doc_auto_summarize),

    // Vision AI Settings (3-level fallback chain)
    visionEnabled: row.vision_enabled !== 0,
    visionProvider1: row.vision_provider_1 || DEFAULT_SUPERBRAIN_SETTINGS.visionProvider1,
    visionModel1: row.vision_model_1 || DEFAULT_SUPERBRAIN_SETTINGS.visionModel1,
    visionProvider2: row.vision_provider_2 || DEFAULT_SUPERBRAIN_SETTINGS.visionProvider2,
    visionModel2: row.vision_model_2 || DEFAULT_SUPERBRAIN_SETTINGS.visionModel2,
    visionProvider3: row.vision_provider_3 || DEFAULT_SUPERBRAIN_SETTINGS.visionProvider3,
    visionModel3: row.vision_model_3 || DEFAULT_SUPERBRAIN_SETTINGS.visionModel3,
    visionAiPrompt: row.vision_ai_prompt || DEFAULT_SUPERBRAIN_SETTINGS.visionAiPrompt,

    // Voice Transcription Settings (3-level fallback chain)
    transcriptionEnabled: row.transcription_enabled !== undefined ? row.transcription_enabled !== 0 : DEFAULT_SUPERBRAIN_SETTINGS.transcriptionEnabled,
    transcriptionAutoExtract: row.transcription_auto_extract !== undefined ? row.transcription_auto_extract !== 0 : DEFAULT_SUPERBRAIN_SETTINGS.transcriptionAutoExtract,
    transcriptionProvider1: row.transcription_provider_1 || DEFAULT_SUPERBRAIN_SETTINGS.transcriptionProvider1,
    transcriptionModel1: row.transcription_model_1 || DEFAULT_SUPERBRAIN_SETTINGS.transcriptionModel1,
    transcriptionProvider2: row.transcription_provider_2 || DEFAULT_SUPERBRAIN_SETTINGS.transcriptionProvider2,
    transcriptionModel2: row.transcription_model_2 || DEFAULT_SUPERBRAIN_SETTINGS.transcriptionModel2,
    transcriptionProvider3: row.transcription_provider_3 || DEFAULT_SUPERBRAIN_SETTINGS.transcriptionProvider3,
    transcriptionModel3: row.transcription_model_3 || DEFAULT_SUPERBRAIN_SETTINGS.transcriptionModel3,
    transcriptionLanguage: row.transcription_language || DEFAULT_SUPERBRAIN_SETTINGS.transcriptionLanguage,

    // AI Task Classifier Settings
    classifierMode: row.classifier_mode || DEFAULT_SUPERBRAIN_SETTINGS.classifierMode,
    classifierChain: row.classifier_chain ? JSON.parse(row.classifier_chain) : DEFAULT_SUPERBRAIN_SETTINGS.classifierChain,
  };
}

// ========================================
// Failover Chain Helpers
// ========================================

/**
 * Valid providers for failover chains
 * NOTE: 'openrouter' is the single OpenRouter provider - model selection
 * (free vs paid) is determined by user's Task Routing settings.
 * Legacy 'openrouter-free' and 'openrouter-paid' are accepted for migration.
 */
const VALID_PROVIDERS = [
  'ollama',
  'openrouter',      // Single OpenRouter provider (user configures models)
  'openrouter-free', // Legacy - accepted for migration
  'openrouter-paid', // Legacy - accepted for migration
  'cli-claude',
  'cli-gemini',
  'cli-opencode',
];

/**
 * Valid tiers for failover chains
 */
const VALID_TIERS = ['trivial', 'simple', 'moderate', 'complex', 'critical'];

/**
 * Normalize provider ID
 * Converts legacy 'openrouter-free' and 'openrouter-paid' to 'openrouter'
 * Model selection is now determined by user's Task Routing settings
 */
function normalizeProviderId(providerId) {
  // Convert legacy openrouter-free/paid to single 'openrouter'
  if (providerId === 'openrouter-free' || providerId === 'openrouter-paid') {
    return 'openrouter';
  }
  return providerId;
}

/**
 * Migrate old failover chain format to new format
 * Old format: { tier: string[] } (provider IDs only)
 * New format: { tier: { provider, model, isPrimary }[] }
 * Also normalizes legacy provider IDs (e.g., 'openrouter' -> 'openrouter-paid')
 */
function migrateFailoverChain(existingChain) {
  if (!existingChain) return null;

  // Check if already in new format (first entry has 'provider' property)
  const firstTier = Object.values(existingChain)[0];
  if (Array.isArray(firstTier) && firstTier.length > 0) {
    const firstEntry = firstTier[0];
    if (typeof firstEntry === 'object' && 'provider' in firstEntry) {
      // Already in new format, but normalize provider IDs
      const normalized = {};
      for (const [tier, entries] of Object.entries(existingChain)) {
        if (Array.isArray(entries)) {
          normalized[tier] = entries.map(entry => ({
            ...entry,
            provider: normalizeProviderId(entry.provider),
          }));
        }
      }
      return normalized;
    }
  }

  // Migrate from old format (array of provider ID strings)
  const migrated = {};
  for (const [tier, providers] of Object.entries(existingChain)) {
    if (Array.isArray(providers)) {
      migrated[tier] = providers.map((p, index) => ({
        provider: normalizeProviderId(typeof p === 'string' ? p : (p.provider || 'ollama')),
        model: typeof p === 'object' && p.model ? p.model : null,
        isPrimary: index === 0,
      }));
    }
  }

  logger.debug('Migrated failover chain from old format to new format');
  return Object.keys(migrated).length > 0 ? migrated : null;
}

/**
 * Check if a provider is valid (system provider or user's custom provider)
 * @param {string} providerId - Provider ID or name
 * @param {string} userId - User ID
 * @returns {boolean}
 */
function isValidProvider(providerId, userId) {
  // Check system providers first
  if (VALID_PROVIDERS.includes(providerId)) {
    return true;
  }

  // Check if it's a user's custom provider from ai_providers table
  if (userId) {
    try {
      const db = getDatabase();
      const customProvider = db.prepare(`
        SELECT id FROM ai_providers
        WHERE user_id = ? AND (LOWER(name) = LOWER(?) OR id = ?)
        LIMIT 1
      `).get(userId, providerId, providerId);

      return !!customProvider;
    } catch (error) {
      logger.debug(`Error checking custom provider: ${error.message}`);
      return false;
    }
  }

  return false;
}

/**
 * Validate failover chain structure
 * @param {Object} chain - Failover chain object
 * @param {string} userId - User ID (for validating custom providers)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFailoverChain(chain, userId = null) {
  if (!chain || typeof chain !== 'object') {
    return { valid: true }; // null is valid (use defaults)
  }

  for (const [tier, entries] of Object.entries(chain)) {
    // Validate tier name
    if (!VALID_TIERS.includes(tier)) {
      return { valid: false, error: `Invalid tier: ${tier}. Valid tiers: ${VALID_TIERS.join(', ')}` };
    }

    // Validate entries array
    if (!Array.isArray(entries)) {
      return { valid: false, error: `Tier "${tier}" must be an array of entries` };
    }

    // Validate each entry
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      if (typeof entry !== 'object' || entry === null) {
        return { valid: false, error: `Entry ${i} in tier "${tier}" must be an object` };
      }

      if (!entry.provider || typeof entry.provider !== 'string') {
        return { valid: false, error: `Entry ${i} in tier "${tier}" must have a provider string` };
      }

      // Check if provider is valid (system or custom)
      if (!isValidProvider(entry.provider, userId)) {
        return { valid: false, error: `Invalid provider "${entry.provider}" in tier "${tier}". Must be a system provider (${VALID_PROVIDERS.join(', ')}) or a custom provider you've configured.` };
      }

      if (entry.model !== null && entry.model !== undefined && typeof entry.model !== 'string') {
        return { valid: false, error: `Model in entry ${i} of tier "${tier}" must be a string or null` };
      }
    }

    // Ensure at least one entry has isPrimary (or mark first as primary)
    if (entries.length > 0 && !entries.some(e => e.isPrimary)) {
      entries[0].isPrimary = true;
    }
  }

  return { valid: true };
}

/**
 * Build effective failover chain from user settings
 * If customFailoverChain exists for a tier, use it
 * Otherwise, build from individual tier provider/model settings
 */
function buildEffectiveFailoverChain(settings) {
  const effectiveChain = {};

  for (const tier of VALID_TIERS) {
    // Check if user has custom chain for this tier
    if (settings.customFailoverChain?.[tier]?.length > 0) {
      effectiveChain[tier] = settings.customFailoverChain[tier];
    } else {
      // Build from individual tier settings
      const providerKey = `${tier}TierProvider`;
      const modelKey = `${tier}TierModel`;
      const provider = settings[providerKey] || DEFAULT_SUPERBRAIN_SETTINGS[providerKey];
      const model = settings[modelKey] || null;

      effectiveChain[tier] = [
        { provider, model, isPrimary: true }
      ];
    }
  }

  return effectiveChain;
}

// ========================================
// User Settings CRUD
// ========================================

/**
 * GET /api/superbrain/settings
 * Get user's SuperBrain settings
 */
router.get('/settings', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;

    const row = db.prepare(`
      SELECT * FROM superbrain_settings WHERE user_id = ?
    `).get(userId);

    const settings = formatUserSettings(row);

    // Get tool stats for the response
    const registry = getSystemToolsRegistry();
    const toolStats = registry.getStats();

    // Get user's custom AI providers and merge with system providers
    const customProviders = db.prepare(`
      SELECT name FROM ai_providers WHERE user_id = ? AND is_active = 1
    `).all(userId);

    const customProviderNames = customProviders.map(p => p.name);

    // Build provider tiers that include both system providers and user's custom providers
    const userProviderTiers = {};
    for (const [tier, systemProviders] of Object.entries(PROVIDER_TIERS)) {
      // Include custom providers at the beginning of each tier's options
      userProviderTiers[tier] = [...customProviderNames, ...systemProviders];
    }

    res.json({
      settings,
      rephraseStyles: REPHRASE_STYLES,
      supportedLanguages: SUPPORTED_LANGUAGES,
      providerTiers: userProviderTiers,
      aiRouterModes: {
        full: 'Full mode - Classify intent and execute tools automatically',
        classify_only: 'Classify only - Classify intent but do not execute tools',
        disabled: 'Disabled - No AI Router processing, only flows execute',
      },
      autoSendModes: {
        allowed: 'Allowed - SuperBrain can auto-send messages via messaging tools',
        restricted: 'Restricted - Messaging tools only work via FlowBuilder',
      },
      ocrLanguages: OCR_LANGUAGES,
      toolStats,
    });

  } catch (error) {
    logger.error(`Failed to get SuperBrain settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to get SuperBrain settings' });
  }
});

/**
 * PATCH /api/superbrain/settings
 * Update user's SuperBrain settings
 */
router.patch('/settings', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;
    const input = req.body;

    // Debug: Log incoming fields to help diagnose issues
    logger.debug(`PATCH /settings: User ${userId}, fields: ${Object.keys(input).join(', ')}`);

    // Validate rephraseStyle if provided
    if (input.rephraseStyle && !REPHRASE_STYLES[input.rephraseStyle]) {
      return res.status(400).json({
        error: `Invalid rephraseStyle. Valid options: ${Object.keys(REPHRASE_STYLES).join(', ')}`
      });
    }

    // Validate language if provided
    if (input.translationLanguage) {
      const validLang = SUPPORTED_LANGUAGES.find(l => l.code === input.translationLanguage);
      if (!validLang) {
        return res.status(400).json({
          error: `Invalid translation language. Valid options: ${SUPPORTED_LANGUAGES.map(l => l.code).join(', ')}`
        });
      }
    }

    // Validate customFailoverChain if provided
    if (input.customFailoverChain !== undefined) {
      const validation = validateFailoverChain(input.customFailoverChain, userId);
      if (!validation.valid) {
        return res.status(400).json({
          error: `Invalid customFailoverChain: ${validation.error}`
        });
      }
    }

    // Check if settings exist
    const existing = db.prepare(`
      SELECT id FROM superbrain_settings WHERE user_id = ?
    `).get(userId);

    // Get existing columns to avoid errors on missing columns
    const existingColumns = db.prepare("PRAGMA table_info(superbrain_settings)").all().map(c => c.name);
    logger.debug(`superbrain_settings columns: ${existingColumns.length} found`);

    if (existing) {
      // Build dynamic update query
      const updates = [];
      const params = [];

      const fieldMap = {
        translationLanguage: 'translation_language',
        translationProvider: 'translation_provider',
        translationModel: 'translation_model',
        autoTranslate: 'auto_translate',
        showOriginalWithTranslation: 'show_original_with_translation',
        rephraseProvider: 'rephrase_provider',
        rephraseModel: 'rephrase_model',
        rephraseStyle: 'rephrase_style',
        // Provider per tier
        trivialTierProvider: 'trivial_tier_provider',
        simpleTierProvider: 'simple_tier_provider',
        moderateTierProvider: 'moderate_tier_provider',
        complexTierProvider: 'complex_tier_provider',
        criticalTierProvider: 'critical_tier_provider',
        // Model per tier
        trivialTierModel: 'trivial_tier_model',
        simpleTierModel: 'simple_tier_model',
        moderateTierModel: 'moderate_tier_model',
        complexTierModel: 'complex_tier_model',
        criticalTierModel: 'critical_tier_model',
        // Custom failover chain (Advanced section)
        customFailoverChain: 'custom_failover_chain',
        // Reasoning Budget (per-tier iteration limits)
        reasoningBudgets: 'reasoning_budgets',
        // Tool Access Control
        autoSendMode: 'auto_send_mode',
        enabledTools: 'enabled_tools',
        toolConfidenceThreshold: 'tool_confidence_threshold',
        aiRouterMode: 'ai_router_mode',
        // OCR Settings
        ocrEnabled: 'ocr_enabled',
        ocrLanguages: 'ocr_languages',
        ocrAutoExtract: 'ocr_auto_extract',
        ocrMinConfidence: 'ocr_min_confidence',
        // Document Analysis Settings
        docAutoExtract: 'doc_auto_extract',
        docAutoSummarize: 'doc_auto_summarize',
        // Vision AI Settings (3-level fallback)
        visionEnabled: 'vision_enabled',
        visionProvider1: 'vision_provider_1',
        visionModel1: 'vision_model_1',
        visionProvider2: 'vision_provider_2',
        visionModel2: 'vision_model_2',
        visionProvider3: 'vision_provider_3',
        visionModel3: 'vision_model_3',
        visionAiPrompt: 'vision_ai_prompt',
        // Voice Transcription Settings (3-level fallback)
        transcriptionEnabled: 'transcription_enabled',
        transcriptionAutoExtract: 'transcription_auto_extract',
        transcriptionProvider1: 'transcription_provider_1',
        transcriptionModel1: 'transcription_model_1',
        transcriptionProvider2: 'transcription_provider_2',
        transcriptionModel2: 'transcription_model_2',
        transcriptionProvider3: 'transcription_provider_3',
        transcriptionModel3: 'transcription_model_3',
        transcriptionLanguage: 'transcription_language',
        // AI Task Classifier Settings
        classifierMode: 'classifier_mode',
        classifierChain: 'classifier_chain',
      };

      for (const [apiKey, dbColumn] of Object.entries(fieldMap)) {
        if (input[apiKey] !== undefined) {
          // Skip columns that don't exist in the database (migration may not have run)
          if (!existingColumns.includes(dbColumn)) {
            logger.debug(`Skipping update for non-existent column: ${dbColumn}`);
            continue;
          }
          updates.push(`${dbColumn} = ?`);
          let value = input[apiKey];

          // Convert boolean to integer for SQLite
          if (typeof value === 'boolean') {
            value = value ? 1 : 0;
          }
          // Stringify JSON objects
          if (apiKey === 'customFailoverChain' && value !== null) {
            value = JSON.stringify(value);
          }
          if (apiKey === 'reasoningBudgets' && value !== null) {
            value = JSON.stringify(value);
          }
          if (apiKey === 'classifierChain' && value !== null) {
            value = JSON.stringify(value);
          }
          // Stringify enabledTools array
          if (apiKey === 'enabledTools') {
            value = value !== null ? JSON.stringify(value) : null;
          }

          params.push(value);
        }
      }

      if (updates.length > 0) {
        updates.push(`updated_at = datetime('now')`);
        params.push(userId);

        const updateSql = `UPDATE superbrain_settings SET ${updates.join(', ')} WHERE user_id = ?`;
        logger.debug(`Executing UPDATE: columns=${updates.slice(0, -1).join(', ')}`);

        try {
          db.prepare(updateSql).run(...params);
        } catch (updateError) {
          logger.error(`UPDATE failed: ${updateError.message}`);
          logger.error(`SQL: ${updateSql}`);
          throw updateError;
        }
      }
    } else {
      // Insert new settings
      const id = uuidv4();

      db.prepare(`
        INSERT INTO superbrain_settings (
          id, user_id,
          translation_language, translation_provider, translation_model, auto_translate, show_original_with_translation,
          rephrase_provider, rephrase_model, rephrase_style,
          trivial_tier_provider, simple_tier_provider, moderate_tier_provider, complex_tier_provider, critical_tier_provider,
          trivial_tier_model, simple_tier_model, moderate_tier_model, complex_tier_model, critical_tier_model,
          custom_failover_chain,
          auto_send_mode, enabled_tools, tool_confidence_threshold, ai_router_mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        userId,
        input.translationLanguage || DEFAULT_SUPERBRAIN_SETTINGS.translationLanguage,
        input.translationProvider || DEFAULT_SUPERBRAIN_SETTINGS.translationProvider,
        input.translationModel || null,
        input.autoTranslate ? 1 : 0,
        input.showOriginalWithTranslation !== false ? 1 : 0,
        input.rephraseProvider || DEFAULT_SUPERBRAIN_SETTINGS.rephraseProvider,
        input.rephraseModel || null,
        input.rephraseStyle || DEFAULT_SUPERBRAIN_SETTINGS.rephraseStyle,
        // Provider per tier
        input.trivialTierProvider || DEFAULT_SUPERBRAIN_SETTINGS.trivialTierProvider,
        input.simpleTierProvider || DEFAULT_SUPERBRAIN_SETTINGS.simpleTierProvider,
        input.moderateTierProvider || DEFAULT_SUPERBRAIN_SETTINGS.moderateTierProvider,
        input.complexTierProvider || DEFAULT_SUPERBRAIN_SETTINGS.complexTierProvider,
        input.criticalTierProvider || DEFAULT_SUPERBRAIN_SETTINGS.criticalTierProvider,
        // Model per tier (set via Task Routing)
        input.trivialTierModel || null,
        input.simpleTierModel || null,
        input.moderateTierModel || null,
        input.complexTierModel || null,
        input.criticalTierModel || null,
        // Custom failover chain (Advanced section)
        input.customFailoverChain ? JSON.stringify(input.customFailoverChain) : null,
        // Tool Access Control
        input.autoSendMode || DEFAULT_SUPERBRAIN_SETTINGS.autoSendMode,
        input.enabledTools ? JSON.stringify(input.enabledTools) : null,
        input.toolConfidenceThreshold !== undefined ? input.toolConfidenceThreshold : DEFAULT_SUPERBRAIN_SETTINGS.toolConfidenceThreshold,
        input.aiRouterMode || DEFAULT_SUPERBRAIN_SETTINGS.aiRouterMode
      );
    }

    // Fetch and return updated settings
    const updated = db.prepare(`
      SELECT * FROM superbrain_settings WHERE user_id = ?
    `).get(userId);

    logger.info(`User ${userId} updated SuperBrain settings`);

    res.json({
      settings: formatUserSettings(updated),
      rephraseStyles: REPHRASE_STYLES,
      supportedLanguages: SUPPORTED_LANGUAGES,
    });

  } catch (error) {
    logger.error(`Failed to update SuperBrain settings: ${error.message}`);
    logger.error(`Stack: ${error.stack}`);
    // Return more detail in development/staging for debugging
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({
      error: 'Failed to update SuperBrain settings',
      detail: isDev ? error.message : undefined,
      code: error.code || undefined
    });
  }
});

/**
 * POST /api/superbrain/settings/reset
 * Reset user's SuperBrain settings to defaults
 */
router.post('/settings/reset', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;

    // Delete existing settings (will use defaults)
    db.prepare(`DELETE FROM superbrain_settings WHERE user_id = ?`).run(userId);

    logger.info(`User ${userId} reset SuperBrain settings to defaults`);

    res.json({
      settings: { ...DEFAULT_SUPERBRAIN_SETTINGS },
      rephraseStyles: REPHRASE_STYLES,
      supportedLanguages: SUPPORTED_LANGUAGES,
      message: 'Settings reset to defaults',
    });

  } catch (error) {
    logger.error(`Failed to reset SuperBrain settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to reset SuperBrain settings' });
  }
});

/**
 * GET /api/superbrain/models/available
 * Get available models for translation/rephrase (from configured providers)
 * Query params:
 *   - providerId: Filter to specific provider (e.g., 'ollama', 'openrouter', 'cli-claude')
 *   - free: Filter to free models only ('true')
 */
router.get('/models/available', async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;
    const { providerId, free } = req.query;

    const availableModels = [];

    // If specific CLI provider requested
    if (providerId && providerId.startsWith('cli-')) {
      const cliType = providerId.replace('cli-', '');
      const cliProvider = getCLIAIProvider();
      const authStatus = cliProvider.getAuthStatusFromDB();
      const cliAuth = authStatus[cliType];

      const models = cliAuth?.capabilities?.models || CLI_DEFAULT_MODELS[cliType] || [];
      for (const model of models) {
        availableModels.push({
          id: typeof model === 'string' ? model : model.id,
          name: typeof model === 'string' ? model : (model.name || model.id),
          provider: CLI_DISPLAY_NAMES[cliType] || cliType,
          providerId: providerId,
          providerType: 'cli',
          isFree: typeof model === 'object' ? model.isFree : false,
        });
      }
    } else {
      // Get user's configured AI providers - USER-LEVEL only
      let providersQuery = `
        SELECT id, name, type, models, is_default
        FROM ai_providers
        WHERE user_id = ?
      `;
      const queryParams = [userId];

      // Filter by specific provider type if requested
      if (providerId) {
        if (providerId === 'ollama') {
          providersQuery += ` AND type = 'ollama'`;
        } else if (providerId.startsWith('openrouter')) {
          providersQuery += ` AND type = 'openrouter'`;
        } else {
          providersQuery += ` AND (type = ? OR name = ?)`;
          queryParams.push(providerId, providerId);
        }
      }

      providersQuery += ` ORDER BY is_default DESC`;

      const providers = db.prepare(providersQuery).all(...queryParams);

      for (const provider of providers) {
        if (provider.models) {
          try {
            const models = JSON.parse(provider.models);
            if (Array.isArray(models)) {
              for (const model of models) {
                availableModels.push({
                  id: typeof model === 'string' ? model : model.id,
                  name: typeof model === 'string' ? model : (model.name || model.id),
                  provider: provider.name,
                  providerId: provider.type,
                  providerType: provider.type,
                  isFree: typeof model === 'object' ? model.isFree : (typeof model === 'string' && model.includes(':free')),
                });
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      // If no specific provider requested and no models found, check openrouter_models table
      if (!providerId && availableModels.length === 0) {
        const syncedModels = db.prepare(`
          SELECT id, name, is_free FROM openrouter_models
          ORDER BY name
          LIMIT 500
        `).all();

        for (const model of syncedModels) {
          availableModels.push({
            id: model.id,
            name: model.name,
            provider: 'OpenRouter',
            providerId: 'openrouter',
            providerType: 'openrouter',
            isFree: !!model.is_free,
          });
        }
      }
    }

    // Apply free filter if requested
    let filteredModels = availableModels;
    if (free === 'true') {
      filteredModels = availableModels.filter(m => m.isFree);
    }

    // Separate free and paid models
    const freeModels = filteredModels.filter(m => m.isFree);
    const paidModels = filteredModels.filter(m => !m.isFree);

    res.json({
      models: filteredModels,
      freeModels,
      paidModels,
      total: filteredModels.length,
    });

  } catch (error) {
    logger.error(`Failed to get available models: ${error.message}`);
    res.status(500).json({ error: 'Failed to get available models' });
  }
});

/**
 * GET /api/superbrain/providers/available
 * Get all available providers (user-configured API + system CLI)
 * Returns unified list with authentication status and models
 * Query params:
 *   - verify: 'true' to actually test CLI authentication (slower but accurate)
 */
router.get('/providers/available', async (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;
    const { verify } = req.query;
    const cliProvider = getCLIAIProvider();

    // If verify=true, actually test CLI authentication
    let cliAuthStatus;
    if (verify === 'true') {
      logger.info('Verifying CLI authentications...');
      const verifyResults = await cliProvider.verifyAllAuthentications();
      // Convert verify results to auth status format
      cliAuthStatus = {};
      for (const [cliType, result] of Object.entries(verifyResults)) {
        cliAuthStatus[cliType] = {
          authenticated: result.authenticated,
          authenticatedAt: result.authenticated ? new Date().toISOString() : null,
          error: result.error,
          responseTime: result.responseTime,
        };
      }
    } else {
      // Just read from database (fast but may be stale)
      cliAuthStatus = cliProvider.getAuthStatusFromDB();
    }

    const providers = [];

    // 1. Get user's configured API providers from ai_providers table - USER-LEVEL only
    const userProviders = db.prepare(`
      SELECT id, name, type, base_url, models, is_default, is_active, config, last_tested
      FROM ai_providers
      WHERE user_id = ?
      ORDER BY is_default DESC, name
    `).all(userId);

    for (const p of userProviders) {
      let models = [];

      // For OpenRouter providers, fetch models from centralized openrouter_models table
      if (p.type === 'openrouter') {
        try {
          const openrouterModels = db.prepare(`
            SELECT id, name, is_free
            FROM openrouter_models
            ORDER BY
              CASE WHEN is_free = 1 THEN 0 ELSE 1 END,
              name
            LIMIT 500
          `).all();

          models = openrouterModels.map(m => ({
            id: m.id,
            name: m.name || m.id,
            isFree: !!m.is_free
          }));
        } catch (err) {
          logger.warn(`Failed to fetch OpenRouter models: ${err.message}`);
          // Fallback to stored models if table doesn't exist
          if (p.models) {
            try {
              models = JSON.parse(p.models);
            } catch { /* ignore */ }
          }
        }
      } else if (p.models) {
        try {
          models = JSON.parse(p.models);
        } catch { /* ignore */ }
      }

      // Use provider NAME as the unique ID (not type) so that multiple providers
      // of the same type (e.g. two OpenRouter accounts) are distinguishable.
      let providerId = p.name;

      // For local-agent providers, check online status and include agent info
      if (p.type === 'local-agent') {
        let lagConfig = {};
        try { lagConfig = JSON.parse(p.config || '{}'); } catch { /* ignore */ }
        const lagGateway = getLocalAgentGateway();
        // Check real-time WebSocket connection first, fall back to DB is_active flag
        const isOnline = lagGateway.isOnline(lagConfig.localAgentId) || !!p.is_active;

        providers.push({
          id: providerId,
          dbId: p.id,
          name: p.name,
          type: 'local-agent',
          providerType: lagConfig.providerType || 'ollama',
          isConfigured: true,
          isAuthenticated: isOnline,
          isOnline,
          isDefault: !!p.is_default,
          localAgentId: lagConfig.localAgentId,
          models: models.map(m => ({
            id: typeof m === 'string' ? m : m.id,
            name: typeof m === 'string' ? m : (m.name || m.id),
            isFree: true, // Local models are always free
          })),
          lastTested: p.last_tested,
        });
      } else {
        providers.push({
          id: providerId,
          dbId: p.id,
          name: p.name,
          type: 'api',
          providerType: p.type,
          isConfigured: true,
          isAuthenticated: true, // API providers with keys are considered authenticated
          isDefault: !!p.is_default,
          models: models.map(m => ({
            id: typeof m === 'string' ? m : m.id,
            name: typeof m === 'string' ? m : (m.name || m.id),
            isFree: typeof m === 'object' ? m.isFree : (typeof m === 'string' && m.includes(':free')),
          })),
          lastTested: p.last_tested,
        });
      }
    }

    // 2. Add system CLI providers
    for (const [cliType, status] of Object.entries(cliAuthStatus)) {
      const providerId = `cli-${cliType}`;

      // Get specific models from capabilities or defaults
      const specificModels = (status.capabilities?.models || CLI_DEFAULT_MODELS[cliType] || []).map(m => ({
        id: typeof m === 'string' ? m : m.id,
        name: typeof m === 'string' ? m : (m.name || m.id),
        isFree: typeof m === 'object' ? m.isFree : false,
      }));

      // Add "Default (Auto)" model at the beginning for CLI providers
      // When selected, the CLI will auto-select the best model
      const defaultAutoModel = {
        id: 'default',
        name: 'Default (Auto)',
        isFree: cliType === 'gemini' || cliType === 'opencode', // gemini and opencode are free
        isDefault: true,
      };

      providers.push({
        id: providerId,
        name: CLI_DISPLAY_NAMES[cliType] || cliType,
        type: 'cli',
        providerType: cliType,
        isConfigured: true,
        isAuthenticated: status.authenticated,
        isDefault: false,
        models: [defaultAutoModel, ...specificModels],
        authenticatedAt: status.authenticatedAt,
        authenticatedBy: status.authenticatedBy,
        requiresSuperadmin: true,
      });
    }

    res.json({
      providers,
      summary: {
        total: providers.length,
        api: providers.filter(p => p.type === 'api').length,
        cli: providers.filter(p => p.type === 'cli').length,
        localAgent: providers.filter(p => p.type === 'local-agent').length,
        authenticated: providers.filter(p => p.isAuthenticated).length,
      },
    });

  } catch (error) {
    logger.error(`Failed to get available providers: ${error.message}`);
    res.status(500).json({ error: 'Failed to get available providers' });
  }
});

/**
 * POST /api/superbrain/providers/:providerId/verify
 * Verify CLI provider authentication by running a test command
 * Only works for CLI providers (cli-claude, cli-gemini, cli-opencode)
 */
router.post('/providers/:providerId/verify', async (req, res) => {
  try {
    const { providerId } = req.params;

    // Only allow CLI providers
    if (!providerId.startsWith('cli-')) {
      return res.status(400).json({
        error: 'Verification only supported for CLI providers',
        hint: 'API providers are verified by their API key presence',
      });
    }

    const cliType = providerId.replace('cli-', '');
    const cliProvider = getCLIAIProvider();

    logger.info(`Verifying CLI authentication for: ${cliType}`);
    const result = await cliProvider.verifyAuthentication(cliType);

    res.json({
      providerId,
      cliType,
      ...result,
      verifiedAt: new Date().toISOString(),
    });

  } catch (error) {
    logger.error(`Failed to verify provider: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/superbrain/providers/verify-all
 * Verify all CLI provider authentications
 */
router.post('/providers/verify-all', async (req, res) => {
  try {
    const cliProvider = getCLIAIProvider();

    logger.info('Verifying all CLI authentications...');
    const results = await cliProvider.verifyAllAuthentications();

    const summary = {
      total: Object.keys(results).length,
      authenticated: Object.values(results).filter(r => r.authenticated).length,
      failed: Object.values(results).filter(r => !r.authenticated).length,
    };

    res.json({
      results,
      summary,
      verifiedAt: new Date().toISOString(),
    });

  } catch (error) {
    logger.error(`Failed to verify all providers: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/superbrain/providers/:providerId/models
 * Get models for a specific provider
 * Query params:
 *   - refresh: 'true' to force model discovery/refresh
 */
router.get('/providers/:providerId/models', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { refresh } = req.query;
    const db = getDatabase();
    const userId = req.user.id;

    // Handle CLI providers
    if (providerId.startsWith('cli-')) {
      const cliType = providerId.replace('cli-', '');
      const cliProvider = getCLIAIProvider();

      // Get cached capabilities or discover new ones
      let capabilities = cliProvider.authenticatedCLIs.get(cliType)?.capabilities;

      if (refresh === 'true' || !capabilities?.models?.length) {
        // Trigger dynamic model discovery
        capabilities = await cliProvider.detectCapabilities(cliType, true);

        // Update cache
        const existing = cliProvider.authenticatedCLIs.get(cliType);
        if (existing) {
          existing.capabilities = capabilities;
          cliProvider.authenticatedCLIs.set(cliType, existing);
        }
      }

      const models = (capabilities?.models || CLI_DEFAULT_MODELS[cliType] || []).map(m => ({
        id: typeof m === 'string' ? m : m.id,
        name: typeof m === 'string' ? m : (m.name || m.id),
        isFree: typeof m === 'object' ? m.isFree : false,
      }));

      return res.json({
        providerId,
        providerType: 'cli',
        models,
        source: refresh === 'true' ? 'discovered' : 'cached',
      });
    }

    // Handle API providers - USER-LEVEL only
    // Look up by name first (new format), then fallback to id/type (legacy)
    let provider;
    provider = db.prepare(`
      SELECT id, name, type, models FROM ai_providers
      WHERE user_id = ?
        AND (name = ? OR id = ? OR type = ?)
      LIMIT 1
    `).get(userId, providerId, providerId, providerId);

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    let models = [];
    if (provider.models) {
      try {
        models = JSON.parse(provider.models);
      } catch { /* ignore */ }
    }

    // For OpenRouter providers, fetch from shared openrouter_models table
    const isOpenRouter = provider?.type === 'openrouter' || providerId === 'openrouter' || providerId.startsWith('openrouter');
    if (isOpenRouter && (refresh === 'true' || models.length === 0)) {
      const syncedModels = db.prepare(`
        SELECT id, name, is_free FROM openrouter_models
        ORDER BY name
        LIMIT 500
      `).all();

      if (syncedModels.length > 0) {
        models = syncedModels.map(m => ({
          id: m.id,
          name: m.name,
          isFree: !!m.is_free,
        }));
      }
    }

    res.json({
      providerId,
      providerType: 'api',
      models: models.map(m => ({
        id: typeof m === 'string' ? m : m.id,
        name: typeof m === 'string' ? m : (m.name || m.id),
        isFree: typeof m === 'object' ? !!m.isFree : (typeof m === 'string' && m.includes(':free')),
      })),
      source: refresh === 'true' ? 'refreshed' : 'cached',
    });

  } catch (error) {
    logger.error(`Failed to get provider models: ${error.message}`);
    res.status(500).json({ error: 'Failed to get provider models' });
  }
});

// ========================================
// Tool Access Control
// ========================================

/**
 * Messaging tools that are subject to auto_send_mode restriction
 */
const MESSAGING_TOOL_IDS = ['sendWhatsApp', 'sendTelegram', 'sendEmail'];

/**
 * AI Router mode descriptions
 */
const AI_ROUTER_MODES = {
  full: 'Full mode - Classify intent and execute tools automatically',
  classify_only: 'Classify only - Classify intent but do not execute tools (logging/analysis)',
  disabled: 'Disabled - No AI Router processing, only flows execute',
};

/**
 * GET /api/superbrain/tools
 * Get all available system tools with categories
 */
router.get('/tools', (req, res) => {
  try {
    const registry = getSystemToolsRegistry();
    const allTools = registry.getAllTools();
    const byCategory = registry.getToolsByCategory();
    const stats = registry.getStats();

    // Get user's current enabled tools setting
    const db = getDatabase();
    const userId = req.user.id;
    const userSettings = db.prepare(`
      SELECT enabled_tools, auto_send_mode FROM superbrain_settings WHERE user_id = ?
    `).get(userId);

    const enabledToolIds = userSettings?.enabled_tools
      ? JSON.parse(userSettings.enabled_tools)
      : null;
    const autoSendMode = userSettings?.auto_send_mode || 'restricted';

    // Map tools with enabled status
    const tools = allTools.map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      requiresAuth: tool.requiresAuth,
      requiredParams: tool.requiredParams,
      examples: tool.examples,
      // Is this tool currently enabled for the user?
      enabled: enabledToolIds === null ? true : enabledToolIds.includes(tool.id),
      // Is this a messaging tool subject to auto_send_mode?
      isMessagingTool: MESSAGING_TOOL_IDS.includes(tool.id),
      // If messaging tool and restricted, mark as restricted
      restricted: MESSAGING_TOOL_IDS.includes(tool.id) && autoSendMode === 'restricted',
    }));

    res.json({
      tools,
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([cat, catTools]) => [
          cat,
          catTools.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            enabled: enabledToolIds === null ? true : enabledToolIds.includes(t.id),
            isMessagingTool: MESSAGING_TOOL_IDS.includes(t.id),
            restricted: MESSAGING_TOOL_IDS.includes(t.id) && autoSendMode === 'restricted',
          })),
        ])
      ),
      categories: Object.keys(TOOL_CATEGORIES),
      stats,
      messagingToolIds: MESSAGING_TOOL_IDS,
      autoSendMode,
      aiRouterModes: AI_ROUTER_MODES,
    });

  } catch (error) {
    logger.error(`Failed to get tools: ${error.message}`);
    res.status(500).json({ error: 'Failed to get tools' });
  }
});

/**
 * PATCH /api/superbrain/tools
 * Update enabled tools for the user
 */
router.patch('/tools', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;
    const { enabledTools, autoSendMode, toolConfidenceThreshold, aiRouterMode } = req.body;

    // Validate autoSendMode
    if (autoSendMode && !['allowed', 'restricted'].includes(autoSendMode)) {
      return res.status(400).json({
        error: 'Invalid autoSendMode. Must be "allowed" or "restricted"',
      });
    }

    // Validate aiRouterMode
    if (aiRouterMode && !['full', 'classify_only', 'disabled'].includes(aiRouterMode)) {
      return res.status(400).json({
        error: 'Invalid aiRouterMode. Must be "full", "classify_only", or "disabled"',
      });
    }

    // Validate toolConfidenceThreshold
    if (toolConfidenceThreshold !== undefined) {
      const threshold = parseFloat(toolConfidenceThreshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        return res.status(400).json({
          error: 'Invalid toolConfidenceThreshold. Must be between 0 and 1',
        });
      }
    }

    // Validate enabledTools is an array of strings
    if (enabledTools !== undefined && enabledTools !== null) {
      if (!Array.isArray(enabledTools)) {
        return res.status(400).json({
          error: 'enabledTools must be an array of tool IDs or null',
        });
      }
      // Validate all tool IDs exist
      const registry = getSystemToolsRegistry();
      const invalidTools = enabledTools.filter(id => !registry.getTool(id));
      if (invalidTools.length > 0) {
        return res.status(400).json({
          error: `Invalid tool IDs: ${invalidTools.join(', ')}`,
        });
      }
    }

    // Check if settings exist
    const existing = db.prepare(`
      SELECT id FROM superbrain_settings WHERE user_id = ?
    `).get(userId);

    if (existing) {
      // Build update
      const updates = [];
      const params = [];

      if (enabledTools !== undefined) {
        updates.push('enabled_tools = ?');
        params.push(enabledTools !== null ? JSON.stringify(enabledTools) : null);
      }
      if (autoSendMode !== undefined) {
        updates.push('auto_send_mode = ?');
        params.push(autoSendMode);
      }
      if (toolConfidenceThreshold !== undefined) {
        updates.push('tool_confidence_threshold = ?');
        params.push(parseFloat(toolConfidenceThreshold));
      }
      if (aiRouterMode !== undefined) {
        updates.push('ai_router_mode = ?');
        params.push(aiRouterMode);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = datetime('now')`);
        params.push(userId);

        db.prepare(`
          UPDATE superbrain_settings
          SET ${updates.join(', ')}
          WHERE user_id = ?
        `).run(...params);
      }
    } else {
      // Insert new settings
      const id = uuidv4();
      db.prepare(`
        INSERT INTO superbrain_settings (
          id, user_id, enabled_tools, auto_send_mode, tool_confidence_threshold, ai_router_mode
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        userId,
        enabledTools !== null ? JSON.stringify(enabledTools) : null,
        autoSendMode || DEFAULT_SUPERBRAIN_SETTINGS.autoSendMode,
        toolConfidenceThreshold !== undefined ? parseFloat(toolConfidenceThreshold) : DEFAULT_SUPERBRAIN_SETTINGS.toolConfidenceThreshold,
        aiRouterMode || DEFAULT_SUPERBRAIN_SETTINGS.aiRouterMode
      );
    }

    // Fetch and return updated settings
    const updated = db.prepare(`
      SELECT * FROM superbrain_settings WHERE user_id = ?
    `).get(userId);

    logger.info(`User ${userId} updated tool access settings`);

    res.json({
      success: true,
      settings: formatUserSettings(updated),
      message: 'Tool access settings updated',
    });

  } catch (error) {
    logger.error(`Failed to update tools: ${error.message}`);
    res.status(500).json({ error: 'Failed to update tool settings' });
  }
});

// OCR supported languages (Tesseract pre-installed)
const OCR_LANGUAGES = {
  eng: 'English',
  msa: 'Malay',
  chi_sim: 'Chinese (Simplified)',
  chi_tra: 'Chinese (Traditional)',
  tam: 'Tamil',
  hin: 'Hindi',
};

/**
 * GET /api/superbrain/info
 * Get SuperBrain capabilities and configuration info
 */
router.get('/info', (req, res) => {
  res.json({
    name: 'SuperBrain',
    version: '1.2.0',
    description: 'Central intelligence orchestrator for SwarmAI',
    capabilities: {
      translation: {
        description: 'AI-powered message translation',
        supportedLanguages: SUPPORTED_LANGUAGES.length,
        languages: SUPPORTED_LANGUAGES,
      },
      rephrasing: {
        description: 'Platform-aware message rephrasing',
        styles: REPHRASE_STYLES,
      },
      taskRouting: {
        description: 'Intelligent task classification and provider routing',
        tiers: ['trivial', 'simple', 'moderate', 'complex', 'critical'],
        tierDescriptions: {
          trivial: 'Very simple tasks, greetings, yes/no questions',
          simple: 'Quick queries, basic lookups, translation, rephrasing',
          moderate: 'Standard conversations, analysis',
          complex: 'Code generation, deep reasoning',
          critical: 'Agentic tasks, autonomous operations',
        },
      },
      failover: {
        description: 'Automatic failover between AI providers',
        defaultChains: PROVIDER_TIERS,
      },
      ocr: {
        description: 'Extract text from images using Tesseract OCR',
        supportedLanguages: OCR_LANGUAGES,
        defaultLanguageChain: 'eng+msa+chi_sim',
        features: [
          'Auto-extract text from image-only messages',
          'Multi-language support (6 languages)',
          'Configurable confidence threshold',
        ],
      },
      visionAI: {
        description: 'AI-powered image analysis with configurable 3-level fallback using user-configured providers',
        usesConfiguredProviders: true,
        note: 'Vision AI models are user-configured via Task Routing - no hardcoded model lists',
        supportedProviderTypes: ['ollama', 'openrouter', 'gemini-cli'],
        modelSource: 'Available models fetched from synced database tables (ollama_models, openrouter_models)',
        fallbackChainInfo: {
          levels: 3,
          description: 'User configures up to 3 fallback levels via superbrain_settings',
          configuration: 'Settings > SuperBrain > Vision AI',
        },
        features: [
          'Fully user-configurable vision model fallback chain',
          'Models from synced database (no hardcoded lists)',
          'Analyze images when OCR finds no text',
          'Describe image content and visual elements',
          'Extract any visible text in images',
          '3-level provider fallback chain',
        ],
        endpoints: [
          '/api/superbrain/vision/status - Get status and provider availability',
          '/api/superbrain/vision/providers - Get user configured vision providers',
          '/api/superbrain/vision/models - Get suggested vision models by type',
          '/api/superbrain/vision/analyze - Analyze an image',
        ],
      },
    },
    providers: {
      ollama: { name: 'Ollama (Local)', cost: 'free', type: 'local' },
      openrouter: {
        name: 'OpenRouter',
        cost: 'variable', // Cost depends on user's model selection via Task Routing
        type: 'api',
        multiModel: true,
        description: 'Access 200+ AI models - configure your preferred models in Task Routing',
      },
      'cli-claude': { name: 'Claude CLI', cost: 'paid', type: 'cli' },
      'cli-gemini': { name: 'Gemini CLI', cost: 'free', type: 'cli' },
      'cli-opencode': {
        name: 'OpenCode CLI',
        cost: 'free',
        type: 'cli',
        multiProvider: true,
        multiModel: true,
        description: 'Free AI coding assistant with agentic capabilities and multi-provider support',
      },
    },
    defaults: DEFAULT_SUPERBRAIN_SETTINGS,
  });
});

// ========================================
// Task Processing
// ========================================

/**
 * POST /api/superbrain/process
 * Process a task through Super Brain
 */
router.post('/process', async (req, res) => {
  try {
    const { task, messages, options = {} } = req.body;

    if (!task && (!messages || messages.length === 0)) {
      return res.status(400).json({ error: 'Task or messages required' });
    }

    const superBrain = getSuperBrainRouter();

    const result = await superBrain.process({
      task,
      messages,
      userId: req.user.id,
      ...options,
    });

    res.json({
      success: true,
      result: {
        requestId: result.requestId,
        content: result.content,
        provider: result.provider,
        classification: result.classification,
        duration: result.duration,
        usage: result.usage,
      },
    });
  } catch (error) {
    logger.error(`Super Brain process error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/superbrain/classify
 * Classify a task without executing
 */
router.post('/classify', async (req, res) => {
  try {
    const { task } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'Task required' });
    }

    const classifier = getTaskClassifier();
    const classification = classifier.classify(task);

    res.json({
      task,
      classification,
    });
  } catch (error) {
    logger.error(`Classification error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/superbrain/providers
 * Get all provider statuses
 */
router.get('/providers', async (req, res) => {
  try {
    const superBrain = getSuperBrainRouter();
    const status = superBrain.getProviderStatus();

    res.json({ providers: status });
  } catch (error) {
    logger.error(`Get providers error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/superbrain/metrics
 * Get request metrics summary
 */
router.get('/metrics', async (req, res) => {
  try {
    const superBrain = getSuperBrainRouter();
    const metrics = superBrain.getMetricsSummary();

    res.json({ metrics });
  } catch (error) {
    logger.error(`Get metrics error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/superbrain/status
 * Get Super Brain overall status
 */
router.get('/status', async (req, res) => {
  try {
    const superBrain = getSuperBrainRouter();
    const cliAuthManager = getCLIAuthManager();

    res.json({
      status: 'active',
      providers: superBrain.getProviderStatus(),
      cliAuth: cliAuthManager.getAuthStatus(),
      metrics: superBrain.getMetricsSummary(),
    });
  } catch (error) {
    logger.error(`Get status error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// Failover Configuration (Superadmin only)
// ========================================

/**
 * GET /api/superbrain/config/failover
 * Get current failover configuration
 */
router.get('/config/failover', async (req, res) => {
  try {
    const failoverConfig = getFailoverConfigService();
    const config = await failoverConfig.getConfig();

    res.json({
      hierarchy: config,
      validTiers: failoverConfig.getValidTiers(),
      validProviders: failoverConfig.getValidProviders(),
    });
  } catch (error) {
    logger.error(`Get failover config error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/superbrain/config/failover
 * Update failover configuration (Superadmin only)
 */
router.put('/config/failover', requireSuperadmin, async (req, res) => {
  try {
    const { hierarchy } = req.body;

    if (!hierarchy) {
      return res.status(400).json({ error: 'Hierarchy configuration required' });
    }

    const failoverConfig = getFailoverConfigService();
    const result = await failoverConfig.updateConfig(req.user.id, hierarchy);

    res.json({
      success: true,
      message: 'Failover configuration updated',
      config: result,
    });
  } catch (error) {
    logger.error(`Update failover config error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/superbrain/config/failover/reset
 * Reset failover configuration to defaults (Superadmin only)
 */
router.post('/config/failover/reset', requireSuperadmin, async (req, res) => {
  try {
    const failoverConfig = getFailoverConfigService();
    const result = await failoverConfig.resetToDefault(req.user.id);

    res.json({
      success: true,
      message: 'Failover configuration reset to defaults',
      config: result,
    });
  } catch (error) {
    logger.error(`Reset failover config error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/superbrain/config/failover/history
 * Get failover configuration history
 */
router.get('/config/failover/history', requireSuperadmin, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const failoverConfig = getFailoverConfigService();
    const history = await failoverConfig.getHistory(parseInt(limit));

    res.json({ history });
  } catch (error) {
    logger.error(`Get failover history error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/superbrain/config/failover/preview
 * Preview providers for a task
 */
router.post('/config/failover/preview', async (req, res) => {
  try {
    const { task } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'Task required' });
    }

    const failoverConfig = getFailoverConfigService();
    const preview = await failoverConfig.previewProviders(task);

    res.json({ preview });
  } catch (error) {
    logger.error(`Preview providers error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// CLI Authentication (Superadmin only)
// ========================================

/**
 * GET /api/superbrain/cli/auth/status
 * Get CLI authentication status
 */
router.get('/cli/auth/status', async (req, res) => {
  try {
    const cliAuthManager = getCLIAuthManager();
    const status = cliAuthManager.getAuthStatus();

    res.json({ status });
  } catch (error) {
    logger.error(`Get CLI auth status error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/superbrain/cli/auth/start
 * Start CLI authentication session (Superadmin only)
 */
router.post('/cli/auth/start', requireSuperadmin, async (req, res) => {
  try {
    const { cliType } = req.body;

    if (!cliType) {
      return res.status(400).json({ error: 'CLI type required (claude, gemini, opencode)' });
    }

    const cliAuthManager = getCLIAuthManager();
    const session = await cliAuthManager.startAuthSession(cliType, req.user.id);

    res.json({
      success: true,
      session,
    });
  } catch (error) {
    logger.error(`Start CLI auth error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/superbrain/cli/auth/terminal
 * Create terminal session for CLI authentication (Superadmin only)
 */
router.post('/cli/auth/terminal', requireSuperadmin, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const cliAuthManager = getCLIAuthManager();
    const result = await cliAuthManager.createTerminalSession(sessionId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error(`Create CLI terminal error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/superbrain/cli/auth/complete
 * Complete CLI authentication (Superadmin only)
 */
router.post('/cli/auth/complete', requireSuperadmin, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const cliAuthManager = getCLIAuthManager();
    const result = await cliAuthManager.completeAuth(sessionId);

    res.json(result);
  } catch (error) {
    logger.error(`Complete CLI auth error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/superbrain/cli/auth/revoke
 * Revoke CLI authentication (Superadmin only)
 */
router.post('/cli/auth/revoke', requireSuperadmin, async (req, res) => {
  try {
    const { cliType } = req.body;

    if (!cliType) {
      return res.status(400).json({ error: 'CLI type required' });
    }

    const cliAuthManager = getCLIAuthManager();
    const result = await cliAuthManager.revokeAuth(cliType, req.user.id);

    res.json(result);
  } catch (error) {
    logger.error(`Revoke CLI auth error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// ========================================
// Workspace Management
// ========================================

/**
 * GET /api/superbrain/workspaces
 * Get user's workspaces
 */
router.get('/workspaces', async (req, res) => {
  try {
    const workspaceManager = getWorkspaceManager();
    const workspaces = await workspaceManager.getUserWorkspaces(req.user.id);

    res.json({ workspaces });
  } catch (error) {
    logger.error(`Get workspaces error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/superbrain/workspaces
 * Create a new workspace
 */
router.post('/workspaces', async (req, res) => {
  try {
    const { agentId, cliType = 'claude' } = req.body;

    const workspaceManager = getWorkspaceManager();
    const workspace = await workspaceManager.createWorkspace(
      req.user.id,
      agentId,
      cliType
    );

    res.status(201).json({
      success: true,
      workspace,
    });
  } catch (error) {
    logger.error(`Create workspace error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/superbrain/workspaces/:id
 * Get workspace details
 */
router.get('/workspaces/:id', async (req, res) => {
  try {
    const workspaceManager = getWorkspaceManager();
    const workspace = await workspaceManager.getWorkspace(req.params.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Verify ownership
    if (workspace.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ workspace });
  } catch (error) {
    logger.error(`Get workspace error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/superbrain/workspaces/:id
 * Delete a workspace
 */
router.delete('/workspaces/:id', async (req, res) => {
  try {
    const workspaceManager = getWorkspaceManager();
    const workspace = await workspaceManager.getWorkspace(req.params.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Verify ownership
    if (workspace.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await workspaceManager.deleteWorkspace(req.params.id);

    res.json({ success: true, message: 'Workspace deleted' });
  } catch (error) {
    logger.error(`Delete workspace error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/superbrain/workspaces/:id/files
 * List files in workspace
 */
router.get('/workspaces/:id/files', async (req, res) => {
  try {
    const { path: relativePath = '' } = req.query;

    const workspaceManager = getWorkspaceManager();
    const workspace = await workspaceManager.getWorkspace(req.params.id);

    if (!workspace || workspace.userId !== req.user.id) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const files = await workspaceManager.listFiles(req.params.id, relativePath);

    res.json({ files });
  } catch (error) {
    logger.error(`List workspace files error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/superbrain/workspaces/:id/files/read
 * Read a file from workspace
 */
router.get('/workspaces/:id/files/read', async (req, res) => {
  try {
    const { path: relativePath } = req.query;

    if (!relativePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    const workspaceManager = getWorkspaceManager();
    const workspace = await workspaceManager.getWorkspace(req.params.id);

    if (!workspace || workspace.userId !== req.user.id) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const content = await workspaceManager.readFile(req.params.id, relativePath);

    res.json({ path: relativePath, content });
  } catch (error) {
    logger.error(`Read workspace file error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// Activity Logs (Real-time, 12h TTL)
// ========================================

/**
 * GET /api/superbrain/logs
 * Get SuperBrain activity logs with filtering and pagination
 *
 * Query params:
 * - limit: number (default 50, max 200)
 * - offset: number (default 0)
 * - status: 'success' | 'error'
 * - provider: string (e.g., 'ollama', 'openrouter-free', 'cli-claude')
 * - tier: string (e.g., 'trivial', 'simple', 'moderate', 'complex', 'critical')
 * - intent: string (e.g., 'SKIP', 'PASSIVE', 'ACTIVE')
 * - startTime: number (Unix timestamp ms)
 * - endTime: number (Unix timestamp ms)
 */
router.get('/logs', async (req, res) => {
  try {
    const logService = getSuperBrainLogService();

    if (!logService.isAvailable()) {
      return res.status(503).json({
        error: 'Log service unavailable (Redis not connected)',
        logs: [],
        total: 0,
        hasMore: false,
      });
    }

    const options = {
      limit: Math.min(parseInt(req.query.limit) || 50, 200),
      offset: parseInt(req.query.offset) || 0,
      status: req.query.status || null,
      provider: req.query.provider || null,
      tier: req.query.tier || null,
      intent: req.query.intent || null,
      startTime: req.query.startTime ? parseInt(req.query.startTime) : null,
      endTime: req.query.endTime ? parseInt(req.query.endTime) : null,
    };

    const result = await logService.getLogs(req.user.id, options);

    res.json({
      ...result,
      ttlHours: LOG_TTL_SECONDS / 3600,
    });

  } catch (error) {
    logger.error(`Failed to fetch SuperBrain logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * GET /api/superbrain/logs/stats
 * Get SuperBrain activity statistics
 */
router.get('/logs/stats', async (req, res) => {
  try {
    const logService = getSuperBrainLogService();

    if (!logService.isAvailable()) {
      return res.status(503).json({
        error: 'Log service unavailable (Redis not connected)',
        stats: null,
      });
    }

    const stats = await logService.getLogStats(req.user.id);

    res.json({
      stats,
      ttlHours: LOG_TTL_SECONDS / 3600,
    });

  } catch (error) {
    logger.error(`Failed to fetch SuperBrain log stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/superbrain/logs/status
 * Get log service status
 * NOTE: This route MUST be defined BEFORE /logs/:id to avoid "status" being matched as an ID
 */
router.get('/logs/status', (req, res) => {
  const logService = getSuperBrainLogService();

  res.json({
    available: logService.isAvailable(),
    ttlHours: LOG_TTL_SECONDS / 3600,
    ttlSeconds: LOG_TTL_SECONDS,
  });
});

/**
 * GET /api/superbrain/logs/:id
 * Get a single log entry
 * NOTE: This route MUST be defined AFTER all other /logs/* routes to avoid matching specific paths as IDs
 */
router.get('/logs/:id', async (req, res) => {
  try {
    const logService = getSuperBrainLogService();

    if (!logService.isAvailable()) {
      return res.status(503).json({ error: 'Log service unavailable' });
    }

    const logEntry = await logService.getLogEntry(req.params.id);

    if (!logEntry) {
      return res.status(404).json({ error: 'Log entry not found or expired' });
    }

    // Verify ownership
    if (logEntry.userId !== req.user.id && !req.user.isSuperuser) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ log: logEntry });

  } catch (error) {
    logger.error(`Failed to fetch log entry: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch log entry' });
  }
});

/**
 * DELETE /api/superbrain/logs
 * Clear all logs for the current user
 */
router.delete('/logs', async (req, res) => {
  try {
    const logService = getSuperBrainLogService();

    if (!logService.isAvailable()) {
      return res.status(503).json({ error: 'Log service unavailable' });
    }

    const cleared = await logService.clearLogs(req.user.id);

    res.json({
      success: true,
      cleared,
      message: `Cleared ${cleared} log entries`,
    });

  } catch (error) {
    logger.error(`Failed to clear logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// ========================================
// OCR / Vision
// ========================================

/**
 * GET /api/superbrain/ocr/status
 * Get OCR service status and available languages
 */
router.get('/ocr/status', async (req, res) => {
  try {
    const { visionService } = require('../services/vision/VisionAnalysisService.cjs');
    const status = await visionService.getStatus();

    res.json({
      ...status,
      ocrLanguages: OCR_LANGUAGES,
    });
  } catch (error) {
    logger.error(`Failed to get OCR status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get OCR status' });
  }
});

/**
 * POST /api/superbrain/ocr/extract
 * Extract text from an image
 */
router.post('/ocr/extract', async (req, res) => {
  try {
    const { imagePath, languages } = req.body;

    if (!imagePath) {
      return res.status(400).json({ error: 'imagePath is required' });
    }

    const { visionService } = require('../services/vision/VisionAnalysisService.cjs');

    // Get user's preferred OCR languages from settings if not specified
    let ocrLanguages = languages;
    if (!ocrLanguages) {
      const db = getDatabase();
      const settings = db.prepare(`
        SELECT ocr_languages FROM superbrain_settings WHERE user_id = ?
      `).get(req.user.id);
      if (settings?.ocr_languages) {
        ocrLanguages = settings.ocr_languages;
      }
    }

    const result = await visionService.extractTextFromUrl(imagePath, {
      languages: ocrLanguages,
    });

    res.json({
      success: true,
      text: result.text,
      confidence: result.confidence,
      language: result.language,
      duration: result.duration,
    });
  } catch (error) {
    logger.error(`OCR extraction failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/superbrain/ocr/analyze-message
 * Analyze an image message and optionally update it with extracted text
 */
router.post('/ocr/analyze-message', async (req, res) => {
  try {
    const { messageId, updateMessage = false } = req.body;

    if (!messageId) {
      return res.status(400).json({ error: 'messageId is required' });
    }

    const db = getDatabase();
    const { visionService } = require('../services/vision/VisionAnalysisService.cjs');

    // Get message
    const message = db.prepare(`
      SELECT m.id, m.content, m.media_url, m.media_local_path, m.content_type, c.user_id
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.id = ?
    `).get(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify ownership
    if (message.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if it's an image message
    if (!['image', 'sticker'].includes(message.content_type)) {
      return res.status(400).json({ error: 'Message is not an image type' });
    }

    const imagePath = message.media_local_path || message.media_url;
    if (!imagePath) {
      return res.status(400).json({ error: 'No image available for this message' });
    }

    // Get user's OCR settings
    const settings = db.prepare(`
      SELECT ocr_languages, ocr_min_confidence FROM superbrain_settings WHERE user_id = ?
    `).get(req.user.id);

    // Check if OCR service is available
    const isAvailable = await visionService.checkTesseractAvailable();
    if (!isAvailable) {
      return res.json({
        success: false,
        messageId,
        extractedText: null,
        confidence: 0,
        error: 'OCR service not available. Tesseract must be installed on the server.',
        ocrUnavailable: true,
      });
    }

    const result = await visionService.analyzeImageMessage(
      { mediaUrl: imagePath, mediaLocalPath: message.media_local_path },
      {
        languages: settings?.ocr_languages,
        minConfidence: settings?.ocr_min_confidence || 0.3,
      }
    );

    // Update message if requested and text was extracted
    if (updateMessage && result.shouldUpdate && result.extractedText) {
      db.prepare(`
        UPDATE messages
        SET content = ?,
            metadata = json_set(COALESCE(metadata, '{}'), '$.ocrExtracted', 1, '$.ocrConfidence', ?, '$.ocrLanguage', ?)
        WHERE id = ?
      `).run(result.extractedText, result.confidence, result.language, messageId);

      logger.info(`Updated message ${messageId} with OCR text (${result.extractedText.length} chars)`);
    }

    res.json({
      success: true,
      messageId,
      extractedText: result.extractedText,
      confidence: result.confidence,
      language: result.language,
      duration: result.duration,
      shouldUpdate: result.shouldUpdate,
      updated: updateMessage && result.shouldUpdate,
    });
  } catch (error) {
    logger.error(`Message OCR analysis failed: ${error.message}`);

    // Check if it's a Tesseract-related error
    if (error.message.includes('Tesseract') || error.message.includes('OCR')) {
      return res.json({
        success: false,
        messageId: req.body.messageId,
        extractedText: null,
        confidence: 0,
        error: error.message,
        ocrUnavailable: true,
      });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/superbrain/analyze-image-message
 * Combined image analysis: tries OCR first, falls back to Vision AI
 * This is the unified "Analyze Image" button handler
 */
router.post('/analyze-image-message', async (req, res) => {
  try {
    const { messageId, updateMessage = false } = req.body;

    if (!messageId) {
      return res.status(400).json({ error: 'messageId is required' });
    }

    const db = getDatabase();
    const { visionService } = require('../services/vision/VisionAnalysisService.cjs');

    // Get message
    const message = db.prepare(`
      SELECT m.id, m.content, m.media_url, m.media_local_path, m.content_type, c.user_id
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.id = ?
    `).get(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify ownership
    if (message.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if it's an image message
    if (!['image', 'sticker'].includes(message.content_type)) {
      return res.status(400).json({ error: 'Message is not an image type' });
    }

    const imagePath = message.media_local_path || message.media_url;
    if (!imagePath) {
      return res.status(400).json({ error: 'No image available for this message' });
    }

    // Get user's settings
    const settings = db.prepare(`
      SELECT ocr_enabled, ocr_languages, ocr_min_confidence, vision_enabled
      FROM superbrain_settings WHERE user_id = ?
    `).get(req.user.id) || {};

    let result = {
      success: false,
      messageId,
      analysisType: null, // 'ocr' or 'vision'
      extractedText: null,
      description: null,
      confidence: 0,
      provider: null,
      model: null,
    };

    // Step 1: Try OCR if enabled
    const ocrEnabled = settings.ocr_enabled !== 0;
    if (ocrEnabled) {
      const isOcrAvailable = await visionService.checkTesseractAvailable();
      if (isOcrAvailable) {
        try {
          const ocrResult = await visionService.extractTextFromUrl(imagePath, {
            languages: settings.ocr_languages || 'eng+msa+chi_sim',
          });

          const minConfidence = settings.ocr_min_confidence || 0.3;
          const hasValidText = ocrResult.text && ocrResult.text.trim().length > 0;
          const meetsConfidence = ocrResult.confidence >= minConfidence;

          if (hasValidText && meetsConfidence) {
            result = {
              success: true,
              messageId,
              analysisType: 'ocr',
              extractedText: ocrResult.text,
              description: null,
              confidence: ocrResult.confidence,
              language: ocrResult.language,
              duration: ocrResult.duration,
              shouldUpdate: hasValidText && meetsConfidence,
            };

            // Update message if requested and we have valid OCR text
            if (updateMessage && result.shouldUpdate) {
              const existingContent = message.content ? JSON.parse(message.content) : {};
              const updatedContent = JSON.stringify({
                ...existingContent,
                text: ocrResult.text,
              });

              const existingMetadata = message.metadata ? JSON.parse(message.metadata) : {};
              const updatedMetadata = JSON.stringify({
                ...existingMetadata,
                ocrExtracted: true,
                ocrConfidence: ocrResult.confidence,
                ocrLanguage: ocrResult.language,
              });

              db.prepare(`
                UPDATE messages SET content = ?, metadata = ? WHERE id = ?
              `).run(updatedContent, updatedMetadata, messageId);

              result.updated = true;
            }

            logger.info(`Image analysis (OCR) for message ${messageId}: ${ocrResult.text?.substring(0, 50)}...`);
            return res.json(result);
          }
          // OCR ran but found no text or low confidence - fall through to Vision AI
          logger.debug(`OCR found no usable text for message ${messageId}, trying Vision AI`);
        } catch (ocrError) {
          logger.debug(`OCR failed for message ${messageId}: ${ocrError.message}, trying Vision AI`);
        }
      }
    }

    // Step 2: Fall back to Vision AI
    const visionEnabled = settings.vision_enabled !== 0;
    if (visionEnabled) {
      try {
        const { getVisionAIService } = require('../services/vision/VisionAIService.cjs');
        const visionAI = getVisionAIService();

        const visionResult = await visionAI.analyzeImage(imagePath, {
          userId: req.user.id,
        });

        if (visionResult.success && visionResult.content) {
          result = {
            success: true,
            messageId,
            analysisType: 'vision',
            extractedText: null,
            description: visionResult.content,
            confidence: 1.0, // Vision AI doesn't provide confidence
            provider: visionResult.provider,
            model: visionResult.model,
            level: visionResult.level,
            duration: visionResult.duration,
            shouldUpdate: true,
          };

          // Update message if requested
          if (updateMessage) {
            const existingContent = message.content ? JSON.parse(message.content) : {};
            const updatedContent = JSON.stringify({
              ...existingContent,
              text: visionResult.content,
            });

            const existingMetadata = message.metadata ? JSON.parse(message.metadata) : {};
            const updatedMetadata = JSON.stringify({
              ...existingMetadata,
              visionDescription: true,
              visionProvider: visionResult.provider,
              visionModel: visionResult.model,
            });

            db.prepare(`
              UPDATE messages SET content = ?, metadata = ? WHERE id = ?
            `).run(updatedContent, updatedMetadata, messageId);

            result.updated = true;
          }

          logger.info(`Image analysis (Vision AI) for message ${messageId} via ${visionResult.provider}`);
          return res.json(result);
        }
      } catch (visionError) {
        logger.warn(`Vision AI failed for message ${messageId}: ${visionError.message}`);
        result.visionError = visionError.message;
      }
    }

    // Neither OCR nor Vision AI produced results
    if (!ocrEnabled && !visionEnabled) {
      return res.json({
        success: false,
        messageId,
        error: 'Both OCR and Vision AI are disabled in settings',
        bothDisabled: true,
      });
    }

    // Return partial failure info
    res.json({
      success: false,
      messageId,
      error: 'Could not analyze image',
      ocrEnabled,
      visionEnabled,
      ...result,
    });
  } catch (error) {
    logger.error(`Image analysis failed for message: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// Vision AI (Image Analysis with AI)
// ========================================

/**
 * GET /api/superbrain/vision/status
 * Get Vision AI service status and provider availability
 */
router.get('/vision/status', async (req, res) => {
  try {
    const { getVisionAIService } = require('../services/vision/VisionAIService.cjs');
    const visionAI = getVisionAIService();
    const status = await visionAI.getStatus(req.user.id);

    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    logger.error(`Failed to get Vision AI status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get Vision AI status' });
  }
});

/**
 * GET /api/superbrain/vision/models
 * Get available vision models from synced database tables (no hardcoded lists)
 */
router.get('/vision/models', async (req, res) => {
  try {
    const db = getDatabase();

    // Get vision models from synced database tables
    const visionModels = {
      ollama: [],
      openrouter: [],
      'gemini-cli': [], // Gemini CLI doesn't have a models table, user configures manually
    };

    // Fetch Ollama vision models
    try {
      const ollamaModels = db.prepare(`
        SELECT id, name FROM ollama_models
        WHERE supports_vision = 1
        ORDER BY name
      `).all();
      visionModels.ollama = ollamaModels.map(m => m.id);
    } catch (e) {
      logger.debug(`No Ollama vision models in DB: ${e.message}`);
    }

    // Fetch OpenRouter vision models (prioritize free models)
    try {
      const openrouterModels = db.prepare(`
        SELECT id, name, is_free FROM openrouter_models
        WHERE supports_vision = 1
        ORDER BY
          CASE WHEN is_free = 1 THEN 0 ELSE 1 END,
          name
        LIMIT 50
      `).all();
      visionModels.openrouter = openrouterModels.map(m => m.id);
    } catch (e) {
      logger.debug(`No OpenRouter vision models in DB: ${e.message}`);
    }

    res.json({
      success: true,
      visionModels,
      providerTypes: Object.keys(visionModels).map(providerType => ({
        type: providerType,
        name: {
          'ollama': 'Ollama (Local)',
          'openrouter': 'OpenRouter',
          'gemini-cli': 'Gemini CLI',
        }[providerType] || providerType,
        models: visionModels[providerType],
        note: visionModels[providerType].length === 0
          ? 'Sync models first via Settings > Integrations'
          : null,
      })),
    });
  } catch (error) {
    logger.error(`Failed to get Vision models: ${error.message}`);
    res.status(500).json({ error: 'Failed to get Vision models' });
  }
});

/**
 * GET /api/superbrain/vision/providers
 * Get user's configured vision-capable providers from ai_providers table
 */
router.get('/vision/providers', async (req, res) => {
  try {
    const { getVisionAIService } = require('../services/vision/VisionAIService.cjs');
    const visionAI = getVisionAIService();
    const userProviders = visionAI.getUserVisionProviders(req.user.id);
    const settings = visionAI.getUserVisionSettings(req.user.id);

    res.json({
      success: true,
      providers: userProviders.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        isDefault: p.isDefault,
        visionCapable: p.visionCapable,
        visionModels: p.visionModels,
      })),
      currentSettings: {
        visionEnabled: settings.visionEnabled,
        fallbackChain: settings.fallbackChain,
      },
      total: userProviders.length,
    });
  } catch (error) {
    logger.error(`Failed to get Vision providers: ${error.message}`);
    res.status(500).json({ error: 'Failed to get Vision providers' });
  }
});

/**
 * POST /api/superbrain/vision/analyze
 * Analyze an image using Vision AI with 3-level fallback
 */
router.post('/vision/analyze', async (req, res) => {
  try {
    const { imagePath, prompt } = req.body;

    if (!imagePath) {
      return res.status(400).json({ error: 'imagePath is required' });
    }

    const { getVisionAIService } = require('../services/vision/VisionAIService.cjs');
    const visionAI = getVisionAIService();

    const result = await visionAI.analyzeImage(imagePath, {
      userId: req.user.id,
      prompt,
    });

    if (result.success) {
      res.json({
        success: true,
        content: result.content,
        provider: result.provider,
        model: result.model,
        level: result.level,
        duration: result.duration,
      });
    } else {
      res.status(422).json({
        success: false,
        reason: result.reason,
        errors: result.errors,
      });
    }
  } catch (error) {
    logger.error(`Vision AI analysis failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/superbrain/vision/prompt
 * Get current Vision AI prompt and available presets
 */
router.get('/vision/prompt', (req, res) => {
  try {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT vision_ai_prompt FROM superbrain_settings WHERE user_id = ?
    `).get(req.user.id);

    // Prompt presets for different use cases
    const presets = {
      default: {
        name: 'Default (Balanced)',
        description: 'General-purpose image analysis with OCR',
        prompt: `Analyze this image and provide a detailed description. Include:
1. Main subject/content of the image
2. Any text visible in the image (transcribe it exactly)
3. Key visual elements (colors, objects, people, etc.)
4. Context or purpose (if apparent)

Keep the description concise but informative (max 200 words).`,
      },
      ocrFocused: {
        name: 'OCR Focused',
        description: 'Prioritize text extraction from documents/screenshots',
        prompt: `Extract and transcribe ALL text visible in this image.
Focus on:
1. Every piece of text, including small or partially visible text
2. Maintain the original formatting/structure if possible
3. Note any text that is unclear or hard to read
4. Describe any logos, labels, or UI elements with text

If no text is found, describe what the image shows.`,
      },
      descriptive: {
        name: 'Descriptive',
        description: 'Rich visual description for accessibility',
        prompt: `Provide a comprehensive visual description of this image for someone who cannot see it. Include:
1. Overall scene composition and setting
2. Main subjects (people, objects, animals)
3. Colors, lighting, and mood
4. Background elements
5. Any text or signage
6. Spatial relationships between elements

Be thorough but organized.`,
      },
      concise: {
        name: 'Concise',
        description: 'Brief one-liner description',
        prompt: `Describe this image in one clear sentence. Focus on the most important element or action.`,
      },
      technical: {
        name: 'Technical/Screenshot',
        description: 'For code, UI, or technical screenshots',
        prompt: `Analyze this technical image/screenshot. Identify:
1. Type of content (code, UI, diagram, chart, etc.)
2. Key information or data shown
3. Any text, labels, or code (transcribe exactly)
4. UI elements or controls visible
5. Any errors, warnings, or highlights

Be precise and technical in your description.`,
      },
      document: {
        name: 'Document',
        description: 'For scanned documents, receipts, forms',
        prompt: `Extract all information from this document image:
1. Document type (receipt, form, letter, etc.)
2. All text content (preserve structure)
3. Key data fields (dates, amounts, names, etc.)
4. Any stamps, signatures, or handwriting
5. Logo or letterhead if present

Format the extracted information clearly.`,
      },
    };

    res.json({
      success: true,
      currentPrompt: row?.vision_ai_prompt || presets.default.prompt,
      isCustom: !!row?.vision_ai_prompt,
      presets,
    });
  } catch (error) {
    logger.error(`Failed to get Vision AI prompt: ${error.message}`);
    res.status(500).json({ error: 'Failed to get Vision AI prompt' });
  }
});

/**
 * PUT /api/superbrain/vision/prompt
 * Update Vision AI prompt (custom or from preset)
 */
router.put('/vision/prompt', (req, res) => {
  try {
    const { prompt, preset } = req.body;
    const db = getDatabase();

    let newPrompt = prompt;

    // If preset is specified, use the preset prompt
    if (preset && !prompt) {
      const presets = {
        default: `Analyze this image and provide a detailed description. Include:
1. Main subject/content of the image
2. Any text visible in the image (transcribe it exactly)
3. Key visual elements (colors, objects, people, etc.)
4. Context or purpose (if apparent)

Keep the description concise but informative (max 200 words).`,
        ocrFocused: `Extract and transcribe ALL text visible in this image.
Focus on:
1. Every piece of text, including small or partially visible text
2. Maintain the original formatting/structure if possible
3. Note any text that is unclear or hard to read
4. Describe any logos, labels, or UI elements with text

If no text is found, describe what the image shows.`,
        descriptive: `Provide a comprehensive visual description of this image for someone who cannot see it. Include:
1. Overall scene composition and setting
2. Main subjects (people, objects, animals)
3. Colors, lighting, and mood
4. Background elements
5. Any text or signage
6. Spatial relationships between elements

Be thorough but organized.`,
        concise: `Describe this image in one clear sentence. Focus on the most important element or action.`,
        technical: `Analyze this technical image/screenshot. Identify:
1. Type of content (code, UI, diagram, chart, etc.)
2. Key information or data shown
3. Any text, labels, or code (transcribe exactly)
4. UI elements or controls visible
5. Any errors, warnings, or highlights

Be precise and technical in your description.`,
        document: `Extract all information from this document image:
1. Document type (receipt, form, letter, etc.)
2. All text content (preserve structure)
3. Key data fields (dates, amounts, names, etc.)
4. Any stamps, signatures, or handwriting
5. Logo or letterhead if present

Format the extracted information clearly.`,
      };

      if (presets[preset]) {
        newPrompt = presets[preset];
      } else {
        return res.status(400).json({ error: `Unknown preset: ${preset}` });
      }
    }

    if (!newPrompt) {
      return res.status(400).json({ error: 'Either prompt or preset is required' });
    }

    // Update or insert
    const existing = db.prepare(`
      SELECT user_id FROM superbrain_settings WHERE user_id = ?
    `).get(req.user.id);

    if (existing) {
      db.prepare(`
        UPDATE superbrain_settings SET vision_ai_prompt = ? WHERE user_id = ?
      `).run(newPrompt, req.user.id);
    } else {
      db.prepare(`
        INSERT INTO superbrain_settings (user_id, vision_ai_prompt) VALUES (?, ?)
      `).run(req.user.id, newPrompt);
    }

    logger.info(`Vision AI prompt updated for user ${req.user.id}`);

    res.json({
      success: true,
      prompt: newPrompt,
      preset: preset || null,
    });
  } catch (error) {
    logger.error(`Failed to update Vision AI prompt: ${error.message}`);
    res.status(500).json({ error: 'Failed to update Vision AI prompt' });
  }
});

/**
 * DELETE /api/superbrain/vision/prompt
 * Reset Vision AI prompt to default
 */
router.delete('/vision/prompt', (req, res) => {
  try {
    const db = getDatabase();

    db.prepare(`
      UPDATE superbrain_settings SET vision_ai_prompt = NULL WHERE user_id = ?
    `).run(req.user.id);

    logger.info(`Vision AI prompt reset to default for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Vision AI prompt reset to default',
    });
  } catch (error) {
    logger.error(`Failed to reset Vision AI prompt: ${error.message}`);
    res.status(500).json({ error: 'Failed to reset Vision AI prompt' });
  }
});

// ========================================
// Voice Transcription Endpoints
// ========================================

/**
 * GET /api/superbrain/transcription/status
 * Get voice transcription service status (local + cloud)
 */
router.get('/transcription/status', async (req, res) => {
  try {
    // Local Whisper status
    let localStatus = { available: false, whisperAvailable: false, ffmpegAvailable: false };
    try {
      const { localWhisperService } = require('../services/voice/LocalWhisperService.cjs');
      localStatus = await localWhisperService.getStatus();
    } catch (e) {
      logger.debug(`LocalWhisperService not available: ${e.message}`);
    }

    // Cloud transcription status
    let cloudStatus = { transcriptionEnabled: false, fallbackChain: [], availableProviders: [] };
    try {
      const { getVoiceTranscriptionService } = require('../services/voice/VoiceTranscriptionService.cjs');
      const service = getVoiceTranscriptionService();
      cloudStatus = await service.getStatus(req.user.id);
    } catch (e) {
      logger.debug(`VoiceTranscriptionService not available: ${e.message}`);
    }

    res.json({
      local: localStatus,
      cloud: cloudStatus,
    });
  } catch (error) {
    logger.error(`Failed to get transcription status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get transcription status' });
  }
});

/**
 * GET /api/superbrain/transcription/providers
 * Get user's configured providers that support audio transcription
 */
router.get('/transcription/providers', (req, res) => {
  try {
    const { getVoiceTranscriptionService } = require('../services/voice/VoiceTranscriptionService.cjs');
    const service = getVoiceTranscriptionService();
    const providers = service.getUserTranscriptionProviders(req.user.id);
    const settings = service.getUserTranscriptionSettings(req.user.id);

    res.json({
      providers,
      currentSettings: {
        transcriptionEnabled: settings.transcriptionEnabled,
        transcriptionAutoExtract: settings.transcriptionAutoExtract,
        transcriptionLanguage: settings.transcriptionLanguage,
        fallbackChain: settings.fallbackChain,
      },
    });
  } catch (error) {
    logger.error(`Failed to get transcription providers: ${error.message}`);
    res.status(500).json({ error: 'Failed to get transcription providers' });
  }
});

/**
 * POST /api/superbrain/transcription/transcribe
 * Transcribe an audio file (manual trigger or re-transcribe)
 */
router.post('/transcription/transcribe', async (req, res) => {
  try {
    const { messageId, audioPath, language } = req.body;

    if (!messageId && !audioPath) {
      return res.status(400).json({ error: 'Either messageId or audioPath is required' });
    }

    let resolvedPath = audioPath;

    // Resolve audio path from message ID
    if (messageId && !audioPath) {
      const db = getDatabase();

      // Try media_cache first
      const cached = db.prepare(`
        SELECT local_path FROM media_cache
        WHERE message_id = ? AND expires_at > datetime('now')
      `).get(messageId);

      if (cached?.local_path) {
        resolvedPath = cached.local_path;
      } else {
        // Try message media_local_path
        const msg = db.prepare(`
          SELECT media_local_path, media_url FROM messages WHERE id = ?
        `).get(messageId);

        if (msg?.media_local_path) {
          resolvedPath = msg.media_local_path;
        } else {
          return res.status(404).json({ error: 'Audio file not found for message' });
        }
      }
    }

    // Try local Whisper first
    let result = null;
    try {
      const { localWhisperService } = require('../services/voice/LocalWhisperService.cjs');
      const isAvailable = await localWhisperService.checkWhisperAvailable();
      const ffmpegAvailable = await localWhisperService.checkFfmpegAvailable();
      if (isAvailable && ffmpegAvailable) {
        result = await localWhisperService.transcribe(resolvedPath, { language: language || 'auto' });
        if (result?.text?.trim()) {
          result.success = true;
        } else {
          result = null;
        }
      }
    } catch (localErr) {
      logger.debug(`Local whisper failed, trying cloud: ${localErr.message}`);
    }

    // Fall through to cloud
    if (!result) {
      const { getVoiceTranscriptionService } = require('../services/voice/VoiceTranscriptionService.cjs');
      const service = getVoiceTranscriptionService();
      result = await service.transcribeAudio(resolvedPath, {
        userId: req.user.id,
        language: language || 'auto',
      });
    }

    // Update message content if messageId provided and transcription succeeded
    if (messageId && result?.success && result.text) {
      try {
        const db = getDatabase();
        const transcriptionText = result.text;
        db.prepare(`
          UPDATE messages
          SET content = ?,
              metadata = json_set(COALESCE(metadata, '{}'),
                '$.voiceTranscription', json('true'),
                '$.transcriptionProvider', ?,
                '$.transcriptionModel', ?,
                '$.transcriptionLanguage', ?,
                '$.autoAnalyzed', json('true'))
          WHERE id = ?
        `).run(
          `[Voice Transcription]: ${transcriptionText}`,
          result.provider || 'local_whisper',
          result.model || null,
          result.language || 'auto',
          messageId
        );
      } catch (updateErr) {
        logger.warn(`Failed to update message with transcription: ${updateErr.message}`);
      }
    }

    res.json(result);
  } catch (error) {
    logger.error(`Transcription failed: ${error.message}`);
    res.status(500).json({ error: 'Transcription failed', details: error.message });
  }
});

// ========================================
// Effective Failover Chain Endpoint
// ========================================

/**
 * GET /api/superbrain/settings/failover-chain
 * Get the effective failover chain for all tiers
 * This merges customFailoverChain with individual tier settings
 */
router.get('/settings/failover-chain', (req, res) => {
  try {
    const db = getDatabase();
    const userId = req.user.id;

    const row = db.prepare(`
      SELECT * FROM superbrain_settings WHERE user_id = ?
    `).get(userId);

    const settings = formatUserSettings(row);
    const effectiveChain = buildEffectiveFailoverChain(settings);

    res.json({
      effectiveChain,
      hasCustomChain: !!settings.customFailoverChain,
      validProviders: VALID_PROVIDERS,
      validTiers: VALID_TIERS,
    });

  } catch (error) {
    logger.error(`Failed to get effective failover chain: ${error.message}`);
    res.status(500).json({ error: 'Failed to get effective failover chain' });
  }
});

// ========================================
// SuperBrain Knowledge Tool (AI-to-AI)
// ========================================

/**
 * POST /api/superbrain/knowledge/query
 * Knowledge query endpoint for AI-to-AI communication
 *
 * This endpoint allows AI_01 (Flow Generator) to ask SuperBrain for node schema information.
 * SuperBrain queries the RAG and returns formatted knowledge.
 *
 * Used by: FlowBuilder AI Generator (AI_01) when it needs node property details
 */
router.post('/knowledge/query', async (req, res) => {
  try {
    const { query, context, limit = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    logger.info(`[SuperBrain Knowledge] Query from AI: "${query.substring(0, 100)}..."`);

    // Query the FlowSchemaRAG
    const { getFlowSchemaRAG } = require('../services/flow/FlowSchemaRAG.cjs');
    const flowSchemaRAG = getFlowSchemaRAG();

    // Ensure initialized
    await flowSchemaRAG.initialize();

    // Search for relevant schemas
    const results = await flowSchemaRAG.querySchemas(query, limit);

    if (results.length === 0) {
      // No results found, provide a helpful response
      return res.json({
        found: false,
        message: 'No relevant node schemas found for your query.',
        suggestions: [
          'Try asking about a specific node type (e.g., "ai:response", "trigger:message_received")',
          'Ask about node categories (e.g., "trigger nodes", "AI nodes", "logic nodes")',
          'Ask about variables (e.g., "how to access node outputs", "variable reference")',
        ],
        query,
      });
    }

    // Format the knowledge response
    const formattedKnowledge = results.map(r => ({
      content: r.content,
      nodeType: r.nodeType,
      category: r.category,
      relevanceScore: r.score,
    }));

    // Build a summary for AI_01
    const summary = formattedKnowledge.map(k =>
      k.content.split('\n').slice(0, 10).join('\n')
    ).join('\n\n---\n\n');

    logger.info(`[SuperBrain Knowledge] Found ${results.length} relevant schemas`);

    res.json({
      found: true,
      resultCount: results.length,
      knowledge: formattedKnowledge,
      summary,
      query,
    });

  } catch (error) {
    logger.error(`[SuperBrain Knowledge] Query failed: ${error.message}`);
    res.status(500).json({ error: 'Knowledge query failed: ' + error.message });
  }
});

/**
 * GET /api/superbrain/knowledge/nodes
 * Get all available node types (for AI_01 reference)
 */
router.get('/knowledge/nodes', async (req, res) => {
  try {
    const { getFlowSchemaRAG, NODE_SCHEMAS } = require('../services/flow/FlowSchemaRAG.cjs');

    // Return a compact list of all node types with basic info
    const nodes = Object.entries(NODE_SCHEMAS).map(([nodeType, schema]) => ({
      type: nodeType,
      title: schema.title,
      category: schema.category,
      description: schema.description,
      requiredFields: schema.config.fields.filter(f => f.required).map(f => f.name),
    }));

    res.json({
      nodes,
      categories: [...new Set(nodes.map(n => n.category))],
      totalCount: nodes.length,
    });

  } catch (error) {
    logger.error(`[SuperBrain Knowledge] Failed to get nodes: ${error.message}`);
    res.status(500).json({ error: 'Failed to get node list: ' + error.message });
  }
});

/**
 * POST /api/superbrain/knowledge/node-details
 * Get detailed information about a specific node type
 */
router.post('/knowledge/node-details', async (req, res) => {
  try {
    const { nodeType } = req.body;

    if (!nodeType) {
      return res.status(400).json({ error: 'nodeType is required' });
    }

    const { NODE_SCHEMAS } = require('../services/flow/FlowSchemaRAG.cjs');

    // Handle both formats: "ai:response" and "ai_response"
    const normalizedType = nodeType.replace('_', ':');
    const schema = NODE_SCHEMAS[normalizedType];

    if (!schema) {
      // Try to find partial matches
      const matches = Object.keys(NODE_SCHEMAS).filter(k =>
        k.includes(nodeType) || nodeType.includes(k.split(':')[1])
      );

      return res.status(404).json({
        error: `Node type "${nodeType}" not found`,
        didYouMean: matches.slice(0, 5),
        availableTypes: Object.keys(NODE_SCHEMAS),
      });
    }

    res.json({
      nodeType: normalizedType,
      ...schema,
    });

  } catch (error) {
    logger.error(`[SuperBrain Knowledge] Failed to get node details: ${error.message}`);
    res.status(500).json({ error: 'Failed to get node details: ' + error.message });
  }
});

// ========================================
// SuperAdmin: FlowSchemaRAG Management
// ========================================

/**
 * GET /api/superbrain/admin/schema-rag/status
 * Get FlowSchemaRAG status and sync statistics (superadmin only)
 */
router.get('/admin/schema-rag/status', requireSuperadmin, async (req, res) => {
  try {
    const { getFlowSchemaRAG } = require('../services/flow/FlowSchemaRAG.cjs');
    const flowSchemaRAG = getFlowSchemaRAG();

    // Ensure initialized
    await flowSchemaRAG.initialize();

    const status = flowSchemaRAG.getStatus();

    res.json({
      success: true,
      status,
      message: 'FlowSchemaRAG status retrieved successfully'
    });

  } catch (error) {
    logger.error(`[SuperAdmin] Failed to get FlowSchemaRAG status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get FlowSchemaRAG status: ' + error.message });
  }
});

/**
 * POST /api/superbrain/admin/schema-rag/resync
 * Force resync all FlowBuilder schemas (superadmin only)
 */
router.post('/admin/schema-rag/resync', requireSuperadmin, async (req, res) => {
  try {
    const { getFlowSchemaRAG } = require('../services/flow/FlowSchemaRAG.cjs');
    const flowSchemaRAG = getFlowSchemaRAG();

    // Ensure initialized
    await flowSchemaRAG.initialize();

    logger.info(`[SuperAdmin] Force resync requested by user ${req.user.id}`);

    const syncStats = await flowSchemaRAG.forceResync();

    res.json({
      success: true,
      message: 'FlowSchemaRAG force resync completed',
      syncStats,
      performedBy: req.user.id,
      performedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`[SuperAdmin] Failed to resync FlowSchemaRAG: ${error.message}`);
    res.status(500).json({ error: 'Failed to resync FlowSchemaRAG: ' + error.message });
  }
});

/**
 * GET /api/superbrain/admin/schema-rag/documents
 * List all documents in the FlowBuilder Schema folder (superadmin only)
 */
router.get('/admin/schema-rag/documents', requireSuperadmin, async (req, res) => {
  try {
    const { getFlowSchemaRAG } = require('../services/flow/FlowSchemaRAG.cjs');
    const { getDatabase } = require('../services/database.cjs');

    const flowSchemaRAG = getFlowSchemaRAG();
    await flowSchemaRAG.initialize();

    const libraryId = flowSchemaRAG.getLibraryId();
    const folderId = flowSchemaRAG.getFolderId();
    const db = getDatabase();

    // Query by both library_id and folder_id for proper isolation
    const documents = db.prepare(`
      SELECT
        kd.id,
        kd.title,
        kd.source_type,
        kd.created_at,
        kd.updated_at,
        kd.metadata,
        (SELECT COUNT(*) FROM knowledge_chunks WHERE document_id = kd.id) as chunk_count
      FROM knowledge_documents kd
      WHERE kd.library_id = ? AND kd.folder_id = ?
      ORDER BY kd.title
    `).all(libraryId, folderId);

    res.json({
      libraryId,
      folderId,
      documentCount: documents.length,
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        sourceType: doc.source_type,
        chunkCount: doc.chunk_count,
        metadata: JSON.parse(doc.metadata || '{}'),
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
      }))
    });

  } catch (error) {
    logger.error(`[SuperAdmin] Failed to get schema documents: ${error.message}`);
    res.status(500).json({ error: 'Failed to get schema documents: ' + error.message });
  }
});

// ========================================
// SuperAdmin: AgenticSchemaRAG Management
// ========================================

/**
 * GET /api/superbrain/admin/agentic-schema-rag/status
 * Get AgenticSchemaRAG status and sync statistics (superadmin only)
 */
router.get('/admin/agentic-schema-rag/status', requireSuperadmin, async (req, res) => {
  try {
    const { getAgenticSchemaRAG } = require('../services/agentic/AgenticSchemaRAG.cjs');
    const agenticSchemaRAG = getAgenticSchemaRAG();

    // Ensure initialized
    await agenticSchemaRAG.initialize();

    const stats = agenticSchemaRAG.getStats();

    res.json({
      success: true,
      initialized: agenticSchemaRAG.initialized,
      libraryId: agenticSchemaRAG.libraryId,
      folderId: agenticSchemaRAG.folderId,
      stats,
      message: 'AgenticSchemaRAG status retrieved successfully'
    });

  } catch (error) {
    logger.error(`[SuperAdmin] Failed to get AgenticSchemaRAG status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get AgenticSchemaRAG status: ' + error.message });
  }
});

/**
 * POST /api/superbrain/admin/agentic-schema-rag/resync
 * Force resync all Agentic AI schemas (superadmin only)
 */
router.post('/admin/agentic-schema-rag/resync', requireSuperadmin, async (req, res) => {
  try {
    const { getAgenticSchemaRAG } = require('../services/agentic/AgenticSchemaRAG.cjs');
    const agenticSchemaRAG = getAgenticSchemaRAG();

    logger.info(`[SuperAdmin] Agentic Schema RAG force resync requested by user ${req.user.id}`);

    const syncStats = await agenticSchemaRAG.resync();

    res.json({
      success: true,
      message: 'AgenticSchemaRAG force resync completed',
      syncStats,
      performedBy: req.user.id,
      performedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`[SuperAdmin] Failed to resync AgenticSchemaRAG: ${error.message}`);
    res.status(500).json({ error: 'Failed to resync AgenticSchemaRAG: ' + error.message });
  }
});

/**
 * POST /api/superbrain/knowledge/agentic/query
 * Query the Agentic AI schema knowledge base
 * Used by AI agents when they need to create or manage other agents
 */
router.post('/knowledge/agentic/query', async (req, res) => {
  try {
    const { query, category, limit = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    logger.info(`[SuperBrain Agentic Knowledge] Query: "${query.substring(0, 100)}..."`);

    const { getAgenticSchemaRAG, AGENTIC_SCHEMAS } = require('../services/agentic/AgenticSchemaRAG.cjs');
    const agenticSchemaRAG = getAgenticSchemaRAG();

    // Ensure initialized
    await agenticSchemaRAG.initialize();

    // Simple keyword matching for now (can be enhanced with vector search later)
    const queryLower = query.toLowerCase();
    const results = [];

    for (const [schemaId, schema] of Object.entries(AGENTIC_SCHEMAS)) {
      // Filter by category if specified
      if (category && schema.category !== category) continue;

      // Calculate relevance score
      let score = 0;

      // Check title
      if (schema.title.toLowerCase().includes(queryLower)) score += 10;

      // Check description
      if (schema.description.toLowerCase().includes(queryLower)) score += 5;

      // Check keywords
      for (const keyword of schema.keywords) {
        if (queryLower.includes(keyword) || keyword.includes(queryLower)) {
          score += 3;
        }
      }

      // Check content
      if (schema.content.toLowerCase().includes(queryLower)) score += 1;

      if (score > 0) {
        results.push({
          schemaId,
          title: schema.title,
          category: schema.category,
          description: schema.description,
          content: schema.content,
          keywords: schema.keywords,
          score
        });
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    if (topResults.length === 0) {
      return res.json({
        found: false,
        message: 'No relevant Agentic AI schemas found for your query.',
        availableCategories: [...new Set(Object.values(AGENTIC_SCHEMAS).map(s => s.category))],
        suggestion: 'Try querying about: creation, communication, monitoring, team, knowledge, routing, scheduling, autonomy'
      });
    }

    res.json({
      found: true,
      count: topResults.length,
      results: topResults,
      query
    });

  } catch (error) {
    logger.error(`[SuperBrain Agentic Knowledge] Query failed: ${error.message}`);
    res.status(500).json({ error: 'Agentic knowledge query failed: ' + error.message });
  }
});

/**
 * GET /api/superbrain/knowledge/agentic/schemas
 * Get all available Agentic AI schema categories
 */
router.get('/knowledge/agentic/schemas', async (req, res) => {
  try {
    const { AGENTIC_SCHEMAS } = require('../services/agentic/AgenticSchemaRAG.cjs');

    const schemas = Object.entries(AGENTIC_SCHEMAS).map(([schemaId, schema]) => ({
      id: schemaId,
      title: schema.title,
      category: schema.category,
      description: schema.description,
      keywords: schema.keywords
    }));

    const categories = [...new Set(schemas.map(s => s.category))];

    res.json({
      totalCount: schemas.length,
      categories,
      schemas: schemas.reduce((acc, s) => {
        if (!acc[s.category]) acc[s.category] = [];
        acc[s.category].push(s);
        return acc;
      }, {})
    });

  } catch (error) {
    logger.error(`[SuperBrain Agentic Knowledge] Failed to get schemas: ${error.message}`);
    res.status(500).json({ error: 'Failed to get Agentic schemas: ' + error.message });
  }
});

/**
 * GET /api/superbrain/knowledge/agentic/schema/:schemaId
 * Get detailed information about a specific Agentic AI schema
 */
router.get('/knowledge/agentic/schema/:schemaId', async (req, res) => {
  try {
    const { schemaId } = req.params;
    const { AGENTIC_SCHEMAS } = require('../services/agentic/AgenticSchemaRAG.cjs');

    const schema = AGENTIC_SCHEMAS[schemaId];

    if (!schema) {
      const availableIds = Object.keys(AGENTIC_SCHEMAS);
      return res.status(404).json({
        error: `Schema "${schemaId}" not found`,
        availableSchemas: availableIds,
        suggestion: 'Use format like "creation:profile" or "communication:ai-to-ai"'
      });
    }

    res.json({
      schemaId,
      ...schema
    });

  } catch (error) {
    logger.error(`[SuperBrain Agentic Knowledge] Failed to get schema: ${error.message}`);
    res.status(500).json({ error: 'Failed to get Agentic schema: ' + error.message });
  }
});

// Export helpers for use in other modules
module.exports = router;
module.exports.migrateFailoverChain = migrateFailoverChain;
module.exports.validateFailoverChain = validateFailoverChain;
module.exports.buildEffectiveFailoverChain = buildEffectiveFailoverChain;
module.exports.VALID_PROVIDERS = VALID_PROVIDERS;
module.exports.VALID_TIERS = VALID_TIERS;
