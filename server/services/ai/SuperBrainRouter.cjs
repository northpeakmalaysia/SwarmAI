/**
 * Super Brain Router
 *
 * Central intelligence router that orchestrates all AI providers.
 * Automatically selects optimal provider based on task classification
 * and executes with configurable failover chains.
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const { getTaskClassifier, TASK_TIERS } = require('./TaskClassifier.cjs');
const { getProviderStrategy, PROVIDERS } = require('./ProviderStrategy.cjs');
const { getOllamaProvider } = require('./providers/OllamaProvider.cjs');
const { getOpenRouterProvider } = require('./providers/OpenRouterProvider.cjs');
const { getCLIAIProvider } = require('./providers/CLIAIProvider.cjs');

/**
 * Provider health status
 */
const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
};

class SuperBrainRouter {
  constructor(options = {}) {
    this.taskClassifier = getTaskClassifier();
    this.providerStrategy = getProviderStrategy();
    this.ollamaProvider = getOllamaProvider();
    this.openRouterProvider = getOpenRouterProvider();
    this.cliProvider = getCLIAIProvider();

    this.failoverConfig = null; // Loaded from FailoverConfigService
    this.healthCheckInterval = options.healthCheckInterval || 60000; // 1 minute
    this.providerHealth = new Map();
    this.requestMetrics = new Map();

    // Start health monitoring
    if (options.enableHealthCheck !== false) {
      this.startHealthMonitoring();
    }
  }

  /**
   * Set failover configuration service
   * @param {Object} failoverConfigService - FailoverConfigService instance
   */
  setFailoverConfig(failoverConfigService) {
    this.failoverConfig = failoverConfigService;
  }

  /**
   * Set workspace manager for CLI provider
   * @param {Object} workspaceManager - WorkspaceManager instance
   */
  setWorkspaceManager(workspaceManager) {
    this.cliProvider.setWorkspaceManager(workspaceManager);
  }

  /**
   * Get user's CLI settings from database
   * @param {string} userId - User ID
   * @param {string} cliType - CLI type (claude, gemini, opencode)
   * @returns {Object}
   */
  getCLISettings(userId, cliType) {
    try {
      const db = getDatabase();

      const settings = db.prepare(`
        SELECT preferred_model, fallback_model, timeout_seconds, max_tokens, temperature, settings
        FROM cli_settings
        WHERE user_id = ? AND cli_type = ?
      `).get(userId, cliType);

      if (settings) {
        return {
          model: settings.preferred_model,
          fallbackModel: settings.fallback_model,
          timeout: settings.timeout_seconds ? settings.timeout_seconds * 1000 : null,
          maxTokens: settings.max_tokens,
          temperature: settings.temperature,
          settings: settings.settings ? JSON.parse(settings.settings) : {},
        };
      }

      // Return defaults
      return {
        model: null,
        fallbackModel: null,
        timeout: 3600000, // 60 minutes default for CLI tasks
        maxTokens: null,
        temperature: null,
        settings: {},
      };
    } catch (error) {
      logger.warn(`Error getting CLI settings for ${cliType}:`, error.message);
      return {
        model: null,
        timeout: 3600000,
        settings: {},
      };
    }
  }

  /**
   * Get user's AI provider settings from database
   * @param {string} userId - User ID
   * @param {string} providerType - Provider type (ollama, openrouter, etc.)
   * @returns {Object|null}
   */
  getUserProviderSettings(userId, providerType) {
    try {
      const db = getDatabase();

      const provider = db.prepare(`
        SELECT config, base_url, models
        FROM ai_providers
        WHERE user_id = ? AND type = ?
        LIMIT 1
      `).get(userId, providerType);

      if (!provider) return null;

      return {
        config: provider.config ? JSON.parse(provider.config) : {},
        baseUrl: provider.base_url,
        models: provider.models ? JSON.parse(provider.models) : [],
      };
    } catch (error) {
      logger.debug(`Failed to get user provider settings: ${error.message}`);
      return null;
    }
  }

  /**
   * Get user's SuperBrain settings from superbrain_settings table
   * This includes preferred models for each tier (user-configured via Task Routing)
   * @param {string} userId - User ID
   * @returns {Object}
   */
  getSuperBrainSettings(userId) {
    const defaults = {
      trivialTierProvider: 'ollama',
      simpleTierProvider: 'openrouter',
      moderateTierProvider: 'openrouter',
      complexTierProvider: 'openrouter',
      criticalTierProvider: 'cli-claude',
      trivialTierModel: null,
      simpleTierModel: null,
      moderateTierModel: null,
      complexTierModel: null,
      criticalTierModel: null,
      customFailoverChain: null,
    };

    try {
      const db = getDatabase();

      const row = db.prepare(`
        SELECT
          trivial_tier_provider, simple_tier_provider, moderate_tier_provider,
          complex_tier_provider, critical_tier_provider,
          trivial_tier_model, simple_tier_model, moderate_tier_model,
          complex_tier_model, critical_tier_model,
          custom_failover_chain
        FROM superbrain_settings
        WHERE user_id = ?
      `).get(userId);

      if (!row) return defaults;

      return {
        trivialTierProvider: row.trivial_tier_provider || defaults.trivialTierProvider,
        simpleTierProvider: row.simple_tier_provider || defaults.simpleTierProvider,
        moderateTierProvider: row.moderate_tier_provider || defaults.moderateTierProvider,
        complexTierProvider: row.complex_tier_provider || defaults.complexTierProvider,
        criticalTierProvider: row.critical_tier_provider || defaults.criticalTierProvider,
        trivialTierModel: row.trivial_tier_model || defaults.trivialTierModel,
        simpleTierModel: row.simple_tier_model || defaults.simpleTierModel,
        moderateTierModel: row.moderate_tier_model || defaults.moderateTierModel,
        complexTierModel: row.complex_tier_model || defaults.complexTierModel,
        criticalTierModel: row.critical_tier_model || defaults.criticalTierModel,
        customFailoverChain: row.custom_failover_chain ? JSON.parse(row.custom_failover_chain) : null,
      };
    } catch (error) {
      logger.debug(`Failed to get SuperBrain settings: ${error.message}`);
      return defaults;
    }
  }

  /**
   * Build AI classifier config from user's superbrain_settings.
   * Returns null if mode is 'local' (keyword-based, no AI needed).
   * @param {string} userId
   * @returns {Object|null} { providerChain, timeout, taskRoutingInfo }
   */
  _buildClassifierConfig(userId) {
    // Short TTL cache to avoid DB query on every message (30s)
    const cacheKey = `classifier:${userId}`;
    const cached = this._classifierConfigCache?.get(cacheKey);
    if (cached && (Date.now() - cached.ts < 30000)) return cached.value;
    if (!this._classifierConfigCache) this._classifierConfigCache = new Map();

    try {
      const db = getDatabase();
      const row = db.prepare(`
        SELECT classifier_mode, classifier_chain, classifier_provider_1, classifier_model_1,
               classifier_provider_2, classifier_model_2, custom_failover_chain
        FROM superbrain_settings WHERE user_id = ?
      `).get(userId);

      if (!row || row.classifier_mode !== 'ai') {
        this._classifierConfigCache.set(cacheKey, { value: null, ts: Date.now() });
        return null;
      }

      // Read chain: prefer classifier_chain JSON, fall back to legacy fixed columns
      let chainEntries = [];
      if (row.classifier_chain) {
        try { chainEntries = JSON.parse(row.classifier_chain); } catch (_) {}
      }
      if (chainEntries.length === 0) {
        // Legacy: build from fixed columns
        if (row.classifier_provider_1) chainEntries.push({ provider: row.classifier_provider_1, model: row.classifier_model_1 });
        if (row.classifier_provider_2) chainEntries.push({ provider: row.classifier_provider_2, model: row.classifier_model_2 });
      }

      // Build provider chain by resolving each entry
      const providerChain = [];
      for (const entry of chainEntries) {
        if (!entry.provider) continue;
        // "local" is a special sentinel — means use keyword-based classification at this position
        if (entry.provider === 'local') {
          providerChain.push({ type: 'local', name: 'Local (Keyword)' });
          continue;
        }
        const resolved = this._resolveClassifierProvider(entry.provider, entry.model || null, userId);
        if (resolved) providerChain.push(resolved);
      }

      // Auto-append a local Ollama safety net if the chain only has cloud/remote models.
      // This prevents total classifier failure when cloud models are rate-limited (429).
      const hasLocalOllama = providerChain.some(p =>
        p.type === 'ollama' && p.model && !p.model.includes(':cloud') && !p.model.includes('-cloud')
      );
      if (!hasLocalOllama && providerChain.length > 0) {
        // Append a truly-local Ollama model as safety net for classification.
        // qwen3:8b is preferred (better instruction following for JSON output).
        const localFallbackModel = 'qwen3:8b';
        providerChain.push({
          type: 'ollama',
          baseUrl: 'http://host.docker.internal:11434',
          model: localFallbackModel,
          name: 'LocalOllama (auto-fallback)',
        });
        logger.debug(`[SuperBrain] Classifier chain: auto-appended local Ollama fallback (${localFallbackModel})`);
      }

      // Build task routing info string so the AI knows available providers
      let taskRoutingInfo = '';
      try {
        const chain = row.custom_failover_chain ? JSON.parse(row.custom_failover_chain) : {};
        const tierSummary = Object.entries(chain).map(([tier, entries]) => {
          const providers = entries.map(e => `${e.provider}${e.model ? '/' + e.model.split('/').pop() : ''}`).join(', ');
          return `  ${tier}: ${providers}`;
        }).join('\n');
        if (tierSummary) {
          taskRoutingInfo = `Available Task Routing tiers and their providers:\n${tierSummary}`;
        }
      } catch (_) {}

      const config = providerChain.length > 0
        ? { providerChain, timeout: 15000, taskRoutingInfo }
        : null;
      this._classifierConfigCache.set(cacheKey, { value: config, ts: Date.now() });
      return config;
    } catch (err) {
      logger.debug(`[SuperBrain] Failed to build classifier config: ${err.message}`);
      this._classifierConfigCache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }
  }

  /**
   * Resolve a classifier provider name into connection details.
   * @private
   */
  _resolveClassifierProvider(providerName, model, userId) {
    try {
      // Check system providers first
      const systemProviders = {
        'ollama': { type: 'ollama', baseUrl: 'http://host.docker.internal:11434', model },
        'openrouter': { type: 'openrouter', model, name: 'openrouter' },
      };
      if (systemProviders[providerName]) {
        const sp = systemProviders[providerName];
        if (sp.type === 'openrouter') {
          // Get API key using same lookup as OpenRouterProvider.getApiKey()
          const db = getDatabase();
          const orProvider = db.prepare(
            "SELECT api_key FROM ai_providers WHERE user_id = ? AND type = 'openrouter' AND api_key IS NOT NULL ORDER BY is_default DESC LIMIT 1"
          ).get(userId);
          if (orProvider?.api_key) {
            return { ...sp, apiKey: orProvider.api_key };
          }
          return null;
        }
        return sp;
      }

      // Custom provider from ai_providers table
      const customProvider = this.getCustomProvider(providerName, userId);
      if (!customProvider || !customProvider.isActive) return null;

      switch (customProvider.type) {
        case 'ollama':
          return { type: 'ollama', baseUrl: customProvider.baseUrl || 'http://host.docker.internal:11434', model, name: customProvider.name };
        case 'openrouter':
          return { type: 'openrouter', apiKey: customProvider.config?.apiKey, model, name: customProvider.name };
        case 'google':
          return { type: 'google', apiKey: customProvider.config?.apiKey, baseUrl: customProvider.baseUrl, model, name: customProvider.name };
        case 'local-agent': {
          const lagConfig = typeof customProvider.config === 'string' ? JSON.parse(customProvider.config) : (customProvider.config || {});
          return {
            type: 'local-agent',
            localAgentId: lagConfig.localAgentId,
            localProviderType: lagConfig.providerType || 'ollama',
            localBaseUrl: lagConfig.baseUrl || 'http://localhost:11434',
            model,
            name: customProvider.name,
          };
        }
        default:
          return null; // CLI providers not suitable for 5s classifier timeout
      }
    } catch (err) {
      logger.debug(`[SuperBrain] Failed to resolve classifier provider "${providerName}": ${err.message}`);
      return null;
    }
  }

  /**
   * Get user's AI translation/rephrase settings
   * @param {string} userId - User ID
   * @returns {Object}
   */
  getUserAISettings(userId) {
    const defaults = {
      translationLanguage: 'en',
      translationModel: null,
      rephraseModel: null,
      rephraseStyle: 'professional',
      autoTranslate: false,
      showOriginalWithTranslation: true,
    };

    try {
      const db = getDatabase();

      const setting = db.prepare(`
        SELECT value FROM settings
        WHERE user_id = ? AND key = 'ai_translation_settings'
      `).get(userId);

      if (!setting || !setting.value) return defaults;

      return { ...defaults, ...JSON.parse(setting.value) };
    } catch (error) {
      logger.debug(`Failed to get user AI settings: ${error.message}`);
      return defaults;
    }
  }

  /**
   * Process a request through the Super Brain
   * @param {Object} request - Request object
   * @param {Object} options - Processing options
   * @returns {Promise<Object>}
   */
  async process(request, options = {}) {
    const requestId = uuidv4();
    const startTime = Date.now();

    const {
      task,
      messages,
      userId,
      forceProvider,
      forceTier,
      preferFree = true,
      maxRetries = 3,
      tools, // OpenAI-format tool definitions for native function calling
    } = request;

    logger.debug(`SuperBrain processing request ${requestId}`);

    try {
      // Step 1: Classify task (local keyword-based, instant)
      const taskText = task || messages?.[messages.length - 1]?.content || '';
      let classification = this.taskClassifier.classify(taskText, {
        forceTier,
        hasRAG: options.hasRAG,
        isAgentic: options.isAgentic,
      });

      // Step 1b: Optional AI-based classification override
      // Skip when forceTier is set (caller already knows the tier) or no userId
      if (userId && !forceTier) {
        try {
          const classifierConfig = this._buildClassifierConfig(userId);
          if (classifierConfig) {
            classification = await this.taskClassifier.classifyWithAI(taskText, classifierConfig, classification);
            logger.info(`SuperBrain: AI classifier → "${classification.tier}" (source: ${classification.source}, provider: ${classification.classifierProvider || 'n/a'})`);
          }
        } catch (classifierErr) {
          logger.warn(`SuperBrain: AI classifier error, using local: ${classifierErr.message}`);
        }
      }

      // When forceTier is set (e.g., from ReasoningLoop's tier classification),
      // override the classifier's result. The classifier re-classifies the full
      // system prompt which inflates complexity (22K chars of tool defs → "complex").
      if (forceTier && classification.tier !== forceTier) {
        logger.info(`SuperBrain: forceTier override: "${classification.tier}" → "${forceTier}" (classifier scored system prompt, not user message)`);
        classification.tier = forceTier;
      }

      // Log at INFO level for visibility in production logs
      logger.info(`SuperBrain: Task classified as "${classification.tier}" (confidence: ${classification.confidence.toFixed(2)}, source: ${classification.source || 'local'})`);

      // Step 2: Get provider chain
      const providerChain = await this.getProviderChain(classification.tier, {
        forceProvider,
        preferFree,
        userId,
      });

      if (providerChain.length === 0) {
        throw new Error(`No available providers for tier "${classification.tier}" - check provider configuration and availability`);
      }

      // Step 3: Execute with failover
      const result = await this.executeWithFailover(
        request,
        providerChain,
        {
          ...options,
          classification,
          maxRetries,
        }
      );

      // Non-blocking usage tracking to ai_usage table
      setImmediate(() => {
        try {
          const db = getDatabase();
          const inputTokens  = result.usage?.promptTokens    || 0;
          const outputTokens = result.usage?.completionTokens || 0;
          if (inputTokens > 0 || outputTokens > 0) {
            const costUsd = this._estimateCost(inputTokens, outputTokens, result.model, result.provider);
            db.prepare(`
              INSERT INTO ai_usage (id, user_id, provider, model, input_tokens, output_tokens, cost, agent_id, conversation_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(
              uuidv4(),
              userId || 'system',
              result.provider || null,
              result.model || null,
              inputTokens,
              outputTokens,
              costUsd,
              request.agentId || null,
              request.conversationId || null
            );
          }
        } catch (trackErr) {
          logger.debug(`Usage tracking skipped: ${trackErr.message}`);
        }
      });

      // Record metrics
      this.recordMetrics(requestId, {
        tier: classification.tier,
        provider: result.provider,
        duration: Date.now() - startTime,
        success: true,
      });

      return {
        requestId,
        ...result,
        classification,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`SuperBrain request ${requestId} failed: ${error.message}`);

      this.recordMetrics(requestId, {
        duration: Date.now() - startTime,
        success: false,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Get provider chain for a task tier
   * @param {string} tier - Task tier
   * @param {Object} options - Options
   * @returns {Promise<string[]>}
   */
  async getProviderChain(tier, options = {}) {
    const { forceProvider, preferFree, userId } = options;

    // Track all providers checked for debugging
    const providerChecks = [];

    // If provider is forced, use only that provider (wrap in new format)
    if (forceProvider) {
      return [{ provider: forceProvider, model: null, isPrimary: true }];
    }

    // Get user's SuperBrain settings to check for custom failover chain
    const userSettings = userId ? this.getSuperBrainSettings(userId) : null;

    // Check for user's custom failover chain first (new format with provider+model)
    if (userSettings?.customFailoverChain?.[tier]?.length > 0) {
      const customChain = userSettings.customFailoverChain[tier];
      logger.debug(`Using user's custom failover chain for tier ${tier}: ${customChain.length} entries`);

      // Filter by availability
      const availableChain = [];
      for (const entry of customChain) {
        const providerId = typeof entry === 'string' ? entry : entry.provider;
        const availability = await this.isProviderAvailableWithReason(providerId, userId);
        providerChecks.push({ provider: providerId, available: availability.available, reason: availability.reason, source: 'customChain' });
        if (availability.available) {
          // Ensure entry is in new format
          if (typeof entry === 'string') {
            availableChain.push({ provider: entry, model: null, isPrimary: availableChain.length === 0 });
          } else {
            availableChain.push(entry);
          }
        }
      }

      // Log provider check results
      if (availableChain.length === 0) {
        logger.error(`SuperBrain: No providers available for tier "${tier}" from custom chain:`);
        providerChecks.forEach((check, idx) => {
          logger.error(`  ${idx + 1}. ${check.provider} - ${check.available ? '✓ Available' : '✗ Unavailable'} (${check.reason})`);
        });
      } else {
        logger.info(`SuperBrain: Provider chain for tier "${tier}" (custom):`);
        availableChain.forEach((entry, idx) => {
          const isPrimary = idx === 0 ? ' [PRIMARY]' : ' [FALLBACK]';
          const modelInfo = entry.model ? ` → model: ${entry.model}` : ' → model: (auto-select)';
          logger.info(`  ${idx + 1}. ${entry.provider}${modelInfo}${isPrimary}`);
        });
      }
      return availableChain;
    }

    // No custom chain - build from individual tier settings + user's preferred models
    const tierProviderKey = `${tier}TierProvider`;
    const tierModelKey = `${tier}TierModel`;
    const primaryProvider = userSettings?.[tierProviderKey] || this.getDefaultProviderForTier(tier);
    const primaryModel = userSettings?.[tierModelKey] || null;

    // Build chain: primary first, then user's preferred models, then system defaults
    const chain = [];
    const addedProviders = new Set();

    // Add primary from user's Task Routing settings
    if (primaryProvider) {
      const primaryAvailability = await this.isProviderAvailableWithReason(primaryProvider, userId);
      providerChecks.push({ provider: primaryProvider, available: primaryAvailability.available, reason: primaryAvailability.reason, source: 'primary' });
      if (primaryAvailability.available) {
        chain.push({ provider: primaryProvider, model: primaryModel, isPrimary: true });
        addedProviders.add(primaryProvider);
        logger.info(`SuperBrain: Primary provider for tier "${tier}": ${primaryProvider}${primaryModel ? ` (model: ${primaryModel})` : ''}`);
      } else {
        logger.info(`SuperBrain: Primary provider "${primaryProvider}" not available, checking fallbacks`);
      }
    }

    // Get system default chain for this tier
    let systemDefaults = this.providerStrategy.getProviderChain(tier, {
      requireFree: preferFree && tier !== TASK_TIERS.CRITICAL,
    });

    // Override system defaults with admin failover config if available
    if (this.failoverConfig) {
      try {
        const adminHierarchy = await this.failoverConfig.getConfig();
        if (adminHierarchy && adminHierarchy[tier]) {
          systemDefaults = adminHierarchy[tier];
        }
      } catch (error) {
        logger.warn(`Failed to load admin failover config: ${error.message}`);
      }
    }

    // Add system defaults as final fallbacks (exclude already added providers)
    // Model selection is handled by Task Routing settings - fallbacks use provider defaults
    for (const providerId of systemDefaults) {
      if (!addedProviders.has(providerId)) {
        const availability = await this.isProviderAvailableWithReason(providerId, userId);
        providerChecks.push({ provider: providerId, available: availability.available, reason: availability.reason, source: 'systemDefault' });
        if (availability.available) {
          chain.push({ provider: providerId, model: null, isPrimary: false });
          addedProviders.add(providerId);
        }
      }
    }

    // Log provider check results
    if (chain.length === 0) {
      logger.error(`SuperBrain: No providers available for tier "${tier}". Provider availability checks:`);
      providerChecks.forEach((check, idx) => {
        logger.error(`  ${idx + 1}. ${check.provider} - ${check.available ? '✓ Available' : '✗ Unavailable'} (${check.reason}) [${check.source}]`);
      });
    } else {
      // Log the full provider chain with models
      logger.info(`SuperBrain: Provider chain for tier "${tier}":`);
      chain.forEach((entry, idx) => {
        const isPrimary = idx === 0 ? ' [PRIMARY]' : ' [FALLBACK]';
        const modelInfo = entry.model ? ` → model: ${entry.model}` : ' → model: (auto-select)';
        logger.info(`  ${idx + 1}. ${entry.provider}${modelInfo}${isPrimary}`);
      });

      // Also log unavailable providers for debugging
      const unavailable = providerChecks.filter(c => !c.available);
      if (unavailable.length > 0) {
        logger.debug(`SuperBrain: Unavailable providers for tier "${tier}":`);
        unavailable.forEach(check => {
          logger.debug(`  - ${check.provider}: ${check.reason}`);
        });
      }
    }

    return chain;
  }

  /**
   * Get default provider for a tier
   * Note: Users should configure their own providers via Task Routing settings
   */
  getDefaultProviderForTier(tier) {
    const defaults = {
      trivial: PROVIDERS.OLLAMA,
      simple: PROVIDERS.OPENROUTER,
      moderate: PROVIDERS.OPENROUTER,
      complex: PROVIDERS.OPENROUTER,
      critical: PROVIDERS.CLI_CLAUDE,
    };
    return defaults[tier] || PROVIDERS.OPENROUTER;
  }

  /**
   * Get custom provider from ai_providers table
   * @param {string} providerNameOrId - Provider name or ID
   * @param {string} userId - User ID
   * @returns {Object|null}
   */
  getCustomProvider(providerNameOrId, userId) {
    try {
      const db = getDatabase();

      // Try to find by name first (case-insensitive), then by ID
      const provider = db.prepare(`
        SELECT id, name, type, base_url, api_key, is_active, config
        FROM ai_providers
        WHERE user_id = ? AND (LOWER(name) = LOWER(?) OR id = ?)
        LIMIT 1
      `).get(userId, providerNameOrId, providerNameOrId);

      if (provider) {
        return {
          id: provider.id,
          name: provider.name,
          type: provider.type,
          baseUrl: provider.base_url,
          apiKey: provider.api_key,
          isActive: provider.is_active === 1,
          config: provider.config ? JSON.parse(provider.config) : {},
        };
      }

      return null;
    } catch (error) {
      logger.debug(`Failed to get custom provider: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a provider is available with detailed reason
   * @param {string} provider - Provider ID or custom provider name
   * @param {string} userId - User ID
   * @returns {Promise<{available: boolean, reason: string}>}
   */
  async isProviderAvailableWithReason(provider, userId) {
    // Check health status first
    const health = this.providerHealth.get(provider);
    if (health?.status === HEALTH_STATUS.UNHEALTHY) {
      return { available: false, reason: `health status: ${HEALTH_STATUS.UNHEALTHY} (last error: ${health.lastError || 'unknown'})` };
    }

    switch (provider) {
      case PROVIDERS.OLLAMA: {
        const available = await this.ollamaProvider.isAvailable();
        return { available, reason: available ? 'OK' : 'Ollama service not running or unreachable' };
      }

      case PROVIDERS.OPENROUTER:
      case 'openrouter-free':
      case 'openrouter-paid': {
        const available = await this.openRouterProvider.isAvailable(userId);
        return { available, reason: available ? 'OK' : 'OpenRouter API key not configured or invalid' };
      }

      case PROVIDERS.CLI_CLAUDE: {
        const available = this.cliProvider.isAuthenticated('claude');
        return { available, reason: available ? 'OK' : 'Claude CLI not authenticated (run: claude auth login)' };
      }

      case PROVIDERS.CLI_GEMINI: {
        const available = this.cliProvider.isAuthenticated('gemini');
        return { available, reason: available ? 'OK' : 'Gemini CLI not authenticated (run: gemini auth login)' };
      }

      case PROVIDERS.CLI_OPENCODE: {
        const available = this.cliProvider.isAuthenticated('opencode');
        return { available, reason: available ? 'OK' : 'OpenCode CLI not authenticated (run: opencode auth login)' };
      }

      default: {
        // Check if it's a custom provider from ai_providers table
        if (userId) {
          const customProvider = this.getCustomProvider(provider, userId);
          if (customProvider) {
            if (!customProvider.isActive) {
              return { available: false, reason: `Custom provider "${customProvider.name}" is disabled` };
            }

            // Validate based on provider type
            switch (customProvider.type) {
              case 'ollama': {
                const available = await this.ollamaProvider.isAvailable();
                return { available, reason: available ? `OK (custom: ${customProvider.name})` : `Ollama service not running at ${customProvider.baseUrl || 'default'}` };
              }
              case 'openrouter': {
                const available = await this.openRouterProvider.isAvailable(userId);
                return { available, reason: available ? `OK (custom: ${customProvider.name})` : 'OpenRouter API key not configured or invalid' };
              }
              case 'local-agent': {
                // Local Agent AI provider — check if the agent is online via WebSocket
                try {
                  const lagConfig = customProvider.config ? (typeof customProvider.config === 'string' ? JSON.parse(customProvider.config) : customProvider.config) : {};
                  const { getLocalAgentGateway } = require('../LocalAgentGateway.cjs');
                  const gateway = getLocalAgentGateway();
                  const isOnline = gateway.isOnline(lagConfig.localAgentId);
                  return { available: isOnline, reason: isOnline ? `OK (Local Agent: ${customProvider.name})` : `Local Agent "${customProvider.name}" is offline or not connected` };
                } catch (lagErr) {
                  return { available: false, reason: `Local Agent check failed: ${lagErr.message}` };
                }
              }
              case 'google': {
                // Google AI provider — check if API key is configured
                const hasKey = customProvider.config?.apiKey || false;
                return { available: !!hasKey, reason: hasKey ? `OK (custom: ${customProvider.name})` : 'Google AI API key not configured' };
              }
              default:
                return { available: false, reason: `Custom provider "${customProvider.name}" has unsupported type: ${customProvider.type}` };
            }
          }
        }

        return { available: false, reason: `Unknown provider: ${provider} (not a system provider or custom provider)` };
      }
    }
  }

  /**
   * Check if a provider is available
   * @param {string} provider - Provider ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async isProviderAvailable(provider, userId) {
    const result = await this.isProviderAvailableWithReason(provider, userId);
    return result.available;
  }

  /**
   * Execute request with failover
   * @param {Object} request - Request object
   * @param {Array<{provider: string, model: string|null}>} providerChain - Provider chain with models
   * @param {Object} options - Execution options
   * @returns {Promise<Object>}
   */
  async executeWithFailover(request, providerChain, options = {}) {
    const { maxRetries = 3 } = options;
    let lastError;
    let attempts = 0;
    const totalProviders = providerChain.length;

    for (let i = 0; i < providerChain.length; i++) {
      const entry = providerChain[i];
      if (attempts >= maxRetries) {
        break;
      }

      // Handle both old format (string) and new format ({ provider, model })
      const providerId = typeof entry === 'string' ? entry : entry.provider;
      const overrideModel = typeof entry === 'object' ? entry.model : null;
      const isFirst = i === 0;

      try {
        if (isFirst) {
          logger.info(`SuperBrain: Executing with provider "${providerId}"${overrideModel ? ` (model: ${overrideModel})` : ''}`);
        } else {
          logger.info(`SuperBrain: Failover → trying provider ${i + 1}/${totalProviders}: "${providerId}"${overrideModel ? ` (model: ${overrideModel})` : ''}`);
        }

        const result = await this.executeOnProvider(request, providerId, {
          ...options,
          overrideModel, // Pass the model from failover chain
        });

        // Treat empty content as soft failure - UNLESS native tool calls are present
        if (!result.content && !result.usedNativeTools && providerChain.length > 1 && i < providerChain.length - 1) {
          logger.warn(`SuperBrain: Provider "${providerId}" returned empty content - trying next provider`);
          continue;
        }

        // Agentic mode: validate that the response contains structured tool calls.
        // Models that can't produce {"action":"...","params":{...}} JSON will return
        // text describing what they WANT to do (meta-talk) but no actual tool calls.
        // Treat this as a soft failure so CLI providers (which CAN do tool calling) get a chance.
        // SKIP this check if native tool calls were returned (model used function calling correctly).
        if (options.isAgentic && !result.usedNativeTools && result.content && providerChain.length > 1 && i < providerChain.length - 1) {
          const content = result.content.trim();
          // Quick check: does the response contain a JSON object with "action" field?
          const hasToolCall = /"action"\s*:\s*"/.test(content);
          if (!hasToolCall) {
            // Check if it's a legitimate text-only response (respond/done/silent as plain text)
            // vs. meta-talk about tool calling (model can't produce structured output)
            const isMetaTalk = /tool.?call|json.?format|output.?format|structured|function.?call/i.test(content)
              && content.length < 500; // Short meta-talk responses, not real lengthy answers
            if (isMetaTalk) {
              logger.warn(`SuperBrain: Provider "${providerId}" returned meta-talk about tool calling without actual tool calls (${content.length} chars) - trying next provider`);
              continue;
            }
          }
        }

        // Mark provider as healthy
        this.updateProviderHealth(providerId, HEALTH_STATUS.HEALTHY);

        if (!isFirst) {
          logger.info(`SuperBrain: ✓ Failover successful with provider "${providerId}"`);
        }

        return {
          ...result,
          provider: providerId,
          model: overrideModel || result.model,
          attemptedProviders: providerChain
            .slice(0, i + 1)
            .map(e => typeof e === 'string' ? e : e.provider),
        };
      } catch (error) {
        lastError = error;

        logger.warn(`SuperBrain: ✗ Provider "${providerId}" failed: ${error.message}`);

        // Update provider health based on error
        this.handleProviderError(providerId, error);

        // Notify user of credit/rate-limit issues (not transient network errors)
        if (error.message && (error.message.includes('credits') || error.message.includes('429') || error.message.toLowerCase().includes('rate limit'))) {
          try {
            const { emitUserNotification } = require('../notificationEmitter.cjs');
            emitUserNotification(request.userId, {
              type: 'warning',
              title: `Provider "${providerId}" Issue`,
              message: error.message.substring(0, 200),
              duration: 8000,
            });
          } catch (_) { /* best-effort */ }
        }

        // Non-retryable errors (credits, auth) are definitive failures -
        // don't count against retry budget. Save retries for transient errors.
        if (!this.isNonRetryableError(error)) {
          attempts++;
        }
        // Always try next provider in chain
        continue;
      }
    }

    // Log final failure
    const triedProviders = providerChain.map(e => typeof e === 'string' ? e : e.provider).join(', ');
    logger.error(`SuperBrain: All providers in chain failed. Tried: [${triedProviders}] (${attempts} transient retries used)`);

    // Notify user that all providers exhausted
    try {
      const { emitUserNotification } = require('../notificationEmitter.cjs');
      emitUserNotification(request.userId, {
        type: 'error',
        title: 'AI Provider Failure',
        message: `All providers failed for ${options?.classification?.tier || 'unknown'} task. Last error: ${lastError?.message?.substring(0, 200) || 'Unknown'}`,
        duration: 10000,
      });
    } catch (_) { /* best-effort */ }

    throw lastError || new Error('All providers failed');
  }

  /**
   * Execute on a specific provider
   * @param {Object} request - Request object
   * @param {string} provider - Provider ID
   * @param {Object} options - Options
   * @returns {Promise<Object>}
   */
  async executeOnProvider(request, provider, options = {}) {
    const { task, messages, userId } = request;
    const chatMessages = messages || [{ role: 'user', content: task }];

    // Get user's SuperBrain settings (includes preferred models)
    const superBrainSettings = userId ? this.getSuperBrainSettings(userId) : null;

    // Get tier-specific model and provider based on classification
    const tier = options.classification?.tier;

    // Map tier to configured provider
    const tierProviderMap = {
      trivial: superBrainSettings?.trivialTierProvider,
      simple: superBrainSettings?.simpleTierProvider,
      moderate: superBrainSettings?.moderateTierProvider,
      complex: superBrainSettings?.complexTierProvider,
      critical: superBrainSettings?.criticalTierProvider,
    };
    const tierConfiguredProvider = tier ? tierProviderMap[tier] : null;

    // Map tier to configured model
    const tierModelMap = {
      trivial: superBrainSettings?.trivialTierModel,
      simple: superBrainSettings?.simpleTierModel,
      moderate: superBrainSettings?.moderateTierModel,
      complex: superBrainSettings?.complexTierModel,
      critical: superBrainSettings?.criticalTierModel,
    };
    const tierConfiguredModel = tier ? tierModelMap[tier] : null;

    // IMPORTANT: Only use tier-specific model if current provider matches tier's configured provider
    // This prevents Ollama models (e.g., qwen3:4b) being passed to OpenRouter during failover
    const isMatchingProvider = tierConfiguredProvider === provider;
    const tierSpecificModel = isMatchingProvider ? tierConfiguredModel : null;

    // Model format validation helpers
    const isOllamaModelFormat = (model) => model && !model.includes('/'); // qwen3:4b, llama3.2:latest
    const isOpenRouterModelFormat = (model) => model && model.includes('/'); // meta-llama/llama-3.3-8b:free

    // Get overrideModel from failover chain (highest priority when set)
    const { overrideModel } = options;

    // Log provider matching for debugging
    if (tier && !isMatchingProvider && !overrideModel) {
      logger.debug(`Failover: tier=${tier} configured for ${tierConfiguredProvider}, but executing on ${provider} - using provider defaults`);
    }
    if (overrideModel) {
      logger.debug(`Using override model from failover chain: ${overrideModel}`);
    }

    // Model selection priority:
    // 1. overrideModel from failover chain (explicit model in chain config)
    // 2. Tier-specific model (ONLY if provider matches tier's configured provider)
    // 3. Preferred free/paid model from settings (based on provider type)
    // 4. Explicitly passed options.model
    // 5. Provider's auto-selection (fallback)

    switch (provider) {
      case PROVIDERS.OLLAMA: {
        // Validate model format for Ollama (should NOT contain '/')
        // Priority: overrideModel > tierSpecificModel > options.model
        let ollamaModel = overrideModel || tierSpecificModel;
        if (ollamaModel && !isOllamaModelFormat(ollamaModel)) {
          logger.warn(`Invalid Ollama model format: ${ollamaModel} - using default`);
          ollamaModel = null;
        }
        return await this.ollamaProvider.chat(chatMessages, {
          ...options,
          model: ollamaModel || options.model,
          systemPrompt: request.systemPrompt,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        });
      }

      case PROVIDERS.OPENROUTER:
      // Legacy support: accept old provider IDs during migration
      case 'openrouter-free':
      case 'openrouter-paid': {
        // Validate model format for OpenRouter (should contain '/')
        // Priority: overrideModel > tierSpecificModel > options.model > auto-select
        let validModel = overrideModel || tierSpecificModel;
        if (validModel && !isOpenRouterModelFormat(validModel)) {
          logger.warn(`Invalid OpenRouter model format: ${validModel} - using auto-select`);
          validModel = null;
        }
        const selectedModel = validModel || options.model;

        // Extract user's fallback models from customFailoverChain for this tier
        // Task Routing: Users configure ALL their model preferences here - no free/paid filtering
        let userFallbackModels = [];
        if (tier && superBrainSettings?.customFailoverChain?.[tier]) {
          userFallbackModels = superBrainSettings.customFailoverChain[tier]
            .filter(entry => {
              // Include all openrouter entries - user decides which models to use
              const isOpenRouter = entry.provider === 'openrouter' ||
                entry.provider === 'openrouter-free' ||
                entry.provider === 'openrouter-paid' ||
                entry.provider?.startsWith('openrouter');
              return isOpenRouter && entry.model;
            })
            .map(entry => entry.model)
            .filter(model => model && isOpenRouterModelFormat(model));
        }

        // Log model selection for debugging
        logger.info(`SuperBrain: OpenRouter - model selected: ${selectedModel || '(auto-select)'} (override: ${overrideModel || 'none'}, tierModel: ${tierSpecificModel || 'none'}, userFallbacks: ${userFallbackModels.length})`);
        return await this.openRouterProvider.chat(chatMessages, {
          ...options,
          userId,
          model: selectedModel,
          userFallbackModels, // Pass user's configured fallback models
          systemPrompt: request.systemPrompt,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          tools: request.tools, // Native tool calling (if model supports it)
        });
      }

      case PROVIDERS.CLI_CLAUDE: {
        const claudeSettings = this.getCLISettings(userId, 'claude');
        // Priority: overrideModel from failover chain > getCLISettings model
        const claudeModel = overrideModel || claudeSettings.model;
        if (overrideModel) {
          logger.info(`SuperBrain: CLI Claude - using override model from Task Routing: ${overrideModel}`);
        }
        return await this.cliProvider.chat(chatMessages, {
          ...options,
          userId,
          cliType: 'claude',
          timeout: claudeSettings.timeout || options.timeout,
          context: {
            ...options.context,
            ...claudeSettings.settings,
            model: claudeModel,
          },
        });
      }

      case PROVIDERS.CLI_GEMINI: {
        const geminiSettings = this.getCLISettings(userId, 'gemini');
        // Priority: overrideModel from failover chain > getCLISettings model
        const geminiModel = overrideModel || geminiSettings.model;
        if (overrideModel) {
          logger.info(`SuperBrain: CLI Gemini - using override model from Task Routing: ${overrideModel}`);
        }
        return await this.cliProvider.chat(chatMessages, {
          ...options,
          userId,
          cliType: 'gemini',
          timeout: geminiSettings.timeout || options.timeout,
          context: {
            ...options.context,
            ...geminiSettings.settings,
            model: geminiModel,
          },
        });
      }

      case PROVIDERS.CLI_OPENCODE: {
        const opencodeSettings = this.getCLISettings(userId, 'opencode');
        // Priority: overrideModel from failover chain > getCLISettings model
        const opencodeModel = overrideModel || opencodeSettings.model;
        if (overrideModel) {
          logger.info(`SuperBrain: CLI OpenCode - using override model from Task Routing: ${overrideModel}`);
        }
        return await this.cliProvider.chat(chatMessages, {
          ...options,
          userId,
          cliType: 'opencode',
          timeout: opencodeSettings.timeout || options.timeout,
          context: {
            ...options.context,
            provider: opencodeSettings.settings?.provider,
            ...opencodeSettings.settings,
            model: opencodeModel, // Must be AFTER spread to take priority
          },
        });
      }

      default: {
        // Check if it's a custom provider from ai_providers table
        if (userId) {
          const customProvider = this.getCustomProvider(provider, userId);
          if (customProvider) {
            logger.info(`SuperBrain: Using custom provider "${customProvider.name}" (type: ${customProvider.type})`);

            // Route to the correct underlying provider based on type
            switch (customProvider.type) {
              case 'ollama': {
                let ollamaModel = overrideModel || tierSpecificModel;
                if (ollamaModel && !isOllamaModelFormat(ollamaModel)) {
                  logger.warn(`Invalid Ollama model format: ${ollamaModel} - using default`);
                  ollamaModel = null;
                }
                return await this.ollamaProvider.chat(chatMessages, {
                  ...options,
                  model: ollamaModel || options.model,
                  systemPrompt: request.systemPrompt,
                  temperature: request.temperature,
                  maxTokens: request.maxTokens,
                  baseUrl: customProvider.baseUrl, // Use custom base URL if configured
                });
              }
              case 'openrouter': {
                let validModel = overrideModel || tierSpecificModel;
                if (validModel && !isOpenRouterModelFormat(validModel)) {
                  logger.warn(`Invalid OpenRouter model format: ${validModel} - using auto-select`);
                  validModel = null;
                }
                const selectedModel = validModel || options.model;

                logger.info(`SuperBrain: Custom OpenRouter provider "${customProvider.name}" - model: ${selectedModel || '(auto-select)'}`);
                return await this.openRouterProvider.chat(chatMessages, {
                  ...options,
                  userId,
                  model: selectedModel,
                  apiKey: customProvider.apiKey, // Use this provider's specific API key
                  systemPrompt: request.systemPrompt,
                  temperature: request.temperature,
                  maxTokens: request.maxTokens,
                });
              }
              case 'local-agent': {
                const lagConfig = JSON.parse(customProvider.config || '{}');
                const { getLocalAgentGateway } = require('../LocalAgentGateway.cjs');
                const lagGateway = getLocalAgentGateway();

                if (!lagGateway.isOnline(lagConfig.localAgentId)) {
                  throw new Error(`Local Agent offline for provider "${customProvider.name}"`);
                }

                const lagModel = overrideModel || tierSpecificModel || options.model;
                logger.info(`SuperBrain: Routing to Local Agent "${customProvider.name}" - model: ${lagModel}`);

                const lagResult = await lagGateway.sendCommand(lagConfig.localAgentId, 'aiChat', {
                  provider: lagConfig.providerType, // 'ollama' or 'lmstudio'
                  baseUrl: lagConfig.baseUrl,
                  model: lagModel,
                  messages: chatMessages,
                  options: {
                    temperature: request.temperature,
                    maxTokens: request.maxTokens,
                    systemPrompt: request.systemPrompt,
                  },
                }, 120000); // 120s timeout for local AI inference

                return {
                  content: lagResult.content,
                  model: lagResult.model,
                  provider: customProvider.name,
                  usage: lagResult.usage || {},
                  metadata: { ...(lagResult.metadata || {}), viaLocalAgent: true, localAgentId: lagConfig.localAgentId },
                };
              }
              default:
                throw new Error(`Custom provider "${customProvider.name}" has unsupported type: ${customProvider.type}`);
            }
          }
        }

        throw new Error(`Unknown provider: ${provider}`);
      }
    }
  }

  /**
   * Check if error is non-retryable
   * @param {Error} error - Error object
   * @returns {boolean}
   */
  isNonRetryableError(error) {
    // Don't retry auth errors
    if (error.status === 401 || error.status === 403) {
      return true;
    }

    // Don't retry payment/credits errors (still failover to next provider though)
    if (error.status === 402 || error.message?.includes('credits exhausted') || error.message?.includes('Insufficient credits')) {
      return true;
    }

    // Don't retry if CLI not authenticated
    if (error.message?.includes('not authenticated')) {
      return true;
    }

    // Don't retry CLI error output (error content was returned as stdout)
    if (error.message?.includes('returned error output')) {
      return true;
    }

    return false;
  }

  /**
   * Handle provider error and update health
   * @param {string} provider - Provider ID
   * @param {Error} error - Error object
   */
  handleProviderError(provider, error) {
    const current = this.providerHealth.get(provider) || {
      consecutiveErrors: 0,
      lastError: null,
    };

    current.consecutiveErrors++;
    current.lastError = error.message;
    current.lastErrorTime = new Date().toISOString();

    // Mark as unhealthy after 3 consecutive errors
    if (current.consecutiveErrors >= 3) {
      current.status = HEALTH_STATUS.UNHEALTHY;
    } else {
      current.status = HEALTH_STATUS.DEGRADED;
    }

    this.providerHealth.set(provider, current);
    this.providerStrategy.updateProviderStatus(provider, { available: current.status !== HEALTH_STATUS.UNHEALTHY });
  }

  /**
   * Update provider health status
   * @param {string} provider - Provider ID
   * @param {string} status - Health status
   */
  updateProviderHealth(provider, status) {
    this.providerHealth.set(provider, {
      status,
      consecutiveErrors: 0,
      lastCheck: new Date().toISOString(),
    });

    this.providerStrategy.updateProviderStatus(provider, { available: status === HEALTH_STATUS.HEALTHY });
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckInterval);

    // Initial health check
    this.performHealthChecks();
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform health checks on all providers
   */
  async performHealthChecks() {
    logger.debug('Performing provider health checks');

    // Check Ollama
    try {
      const ollamaAvailable = await this.ollamaProvider.isAvailable();
      this.updateProviderHealth(
        PROVIDERS.OLLAMA,
        ollamaAvailable ? HEALTH_STATUS.HEALTHY : HEALTH_STATUS.UNHEALTHY
      );
    } catch {
      this.updateProviderHealth(PROVIDERS.OLLAMA, HEALTH_STATUS.UNHEALTHY);
    }

    // Check CLI authentications
    const cliStatus = this.cliProvider.getAuthStatus();
    for (const [cliType, status] of Object.entries(cliStatus)) {
      const provider = `cli-${cliType}`;
      this.updateProviderHealth(
        provider,
        status.authenticated ? HEALTH_STATUS.HEALTHY : HEALTH_STATUS.UNHEALTHY
      );
    }

    // OpenRouter is always available if configured (no active check needed)
  }

  /**
   * Record request metrics
   * @param {string} requestId - Request ID
   * @param {Object} metrics - Metrics data
   */
  recordMetrics(requestId, metrics) {
    this.requestMetrics.set(requestId, {
      ...metrics,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 1000 metrics
    if (this.requestMetrics.size > 1000) {
      const oldestKey = this.requestMetrics.keys().next().value;
      this.requestMetrics.delete(oldestKey);
    }
  }

  /**
   * Get provider status
   * @returns {Object}
   */
  getProviderStatus() {
    const status = {};

    for (const provider of Object.values(PROVIDERS)) {
      const health = this.providerHealth.get(provider);
      const profile = this.providerStrategy.getProviderProfile(provider);

      status[provider] = {
        name: profile?.name || provider,
        type: profile?.type || 'unknown',
        cost: profile?.cost || 'unknown',
        health: health?.status || HEALTH_STATUS.UNKNOWN,
        lastCheck: health?.lastCheck || null,
        lastError: health?.lastError || null,
      };
    }

    return status;
  }

  /**
   * Get request metrics summary
   * @returns {Object}
   */
  getMetricsSummary() {
    const metrics = Array.from(this.requestMetrics.values());

    const summary = {
      totalRequests: metrics.length,
      successRate: 0,
      averageDuration: 0,
      providerUsage: {},
      tierDistribution: {},
    };

    if (metrics.length === 0) return summary;

    const successful = metrics.filter(m => m.success);
    summary.successRate = successful.length / metrics.length;
    summary.averageDuration = metrics.reduce((sum, m) => sum + (m.duration || 0), 0) / metrics.length;

    // Provider usage
    for (const m of metrics) {
      if (m.provider) {
        summary.providerUsage[m.provider] = (summary.providerUsage[m.provider] || 0) + 1;
      }
      if (m.tier) {
        summary.tierDistribution[m.tier] = (summary.tierDistribution[m.tier] || 0) + 1;
      }
    }

    return summary;
  }

  // ============================================
  // Message Processing Capabilities
  // ============================================

  /**
   * Supported languages for translation
   */
  static SUPPORTED_LANGUAGES = {
    en: 'English',
    ms: 'Malay',
    zh: 'Chinese',
    ta: 'Tamil',
    hi: 'Hindi',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    ja: 'Japanese',
    ko: 'Korean',
    ar: 'Arabic',
    id: 'Indonesian',
    th: 'Thai',
    vi: 'Vietnamese',
    pt: 'Portuguese',
    ru: 'Russian',
    it: 'Italian',
    nl: 'Dutch',
    tr: 'Turkish',
    pl: 'Polish',
  };

  /**
   * Rephrase style presets
   */
  static REPHRASE_STYLES = {
    professional: 'Professional and formal tone',
    casual: 'Casual and friendly tone',
    concise: 'Brief and to the point',
    detailed: 'Comprehensive and thorough',
    friendly: 'Warm and approachable',
    formal: 'Very formal and business-like',
  };

  /**
   * Clean markdown formatting from AI response
   * @param {string} text - Text to clean
   * @returns {string}
   */
  cleanMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold **text**
      .replace(/__(.*?)__/g, '$1')       // Remove italic __text__
      .replace(/```[\s\S]*?```/g, '')    // Remove code blocks
      .replace(/`([^`]*)`/g, '$1')       // Remove inline code
      .replace(/^#+\s*/gm, '')           // Remove headers
      .replace(/^[-*]\s+/gm, '')         // Remove list markers
      .replace(/^\d+\.\s+/gm, '')        // Remove numbered lists
      .replace(/\n{3,}/g, '\n\n')        // Reduce multiple newlines
      .trim();
  }

  /**
   * Translate a message to target language
   * @param {Object} options - Translation options
   * @returns {Promise<Object>}
   */
  async translateMessage(options = {}) {
    const { message, targetLanguage, userId } = options;

    if (!message || !targetLanguage) {
      throw new Error('message and targetLanguage are required');
    }

    const languageName = SuperBrainRouter.SUPPORTED_LANGUAGES[targetLanguage];
    if (!languageName) {
      throw new Error(`Unsupported language: ${targetLanguage}`);
    }

    const systemPrompt = `You are a professional translator. Your ONLY task is to translate text into ${languageName}.
Output ONLY the translated text.
Do NOT include any explanations, notes, or the original text.
Do NOT use markdown formatting.
Keep the tone and meaning exactly the same.`;

    const userPrompt = `Translate the following text to ${languageName}:\n\n${message}`;

    try {
      const result = await this.process({
        task: userPrompt,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        userId,
        forceTier: 'simple', // Translation is a simple task
      }, {
        temperature: 0.3,
        maxTokens: 500,
      });

      let translatedMessage = result.content || result.response || '';

      // Clean up any quotes or extra formatting
      translatedMessage = translatedMessage
        .replace(/^["']|["']$/g, '')
        .trim();

      return {
        success: true,
        translatedMessage,
        sourceLanguage: 'auto',
        targetLanguage,
        provider: result.provider,
        classification: result.classification,
      };
    } catch (error) {
      logger.warn(`Translation failed: ${error.message}`);
      return {
        success: false,
        translatedMessage: message,
        error: error.message,
      };
    }
  }

  /**
   * Rephrase/polish a message for better clarity
   * @param {Object} options - Rephrase options
   * @returns {Promise<Object>}
   */
  async rephraseMessage(options = {}) {
    const { message, targetLanguage, platform = 'whatsapp', style = 'professional', userId } = options;

    if (!message) {
      throw new Error('message is required');
    }

    // Platform-specific context
    const platformContext = platform === 'telegram'
      ? 'Telegram messaging'
      : platform === 'email'
        ? 'email communication'
        : 'WhatsApp messaging';

    // Style context
    const styleDescription = SuperBrainRouter.REPHRASE_STYLES[style] || SuperBrainRouter.REPHRASE_STYLES.professional;

    // Build system prompt based on whether translation is needed
    let systemPrompt;
    if (targetLanguage && SuperBrainRouter.SUPPORTED_LANGUAGES[targetLanguage]) {
      const languageName = SuperBrainRouter.SUPPORTED_LANGUAGES[targetLanguage];
      systemPrompt = `You are a helpful assistant that rephrases and translates messages for ${platformContext}.
Your task: Rephrase and translate the given message into ${languageName}.
Style: ${styleDescription}
Rules:
- Make it clear, professional, and well-written.
- Keep it concise and suitable for ${platformContext}.
- Do NOT use markdown formatting (no **, __, ##, etc.).
- Do NOT use code blocks or special formatting.
- Use plain text only with standard punctuation.
- Only output the rephrased and translated message.
- Do NOT explain anything, do NOT add extra text or notes.`;
    } else {
      systemPrompt = `You are a helpful assistant that rephrases and polishes messages for ${platformContext}.
Your task: Rephrase and polish the given message.
Style: ${styleDescription}
Rules:
- Make it clear, professional, and well-written.
- Keep it concise and suitable for ${platformContext}.
- Do NOT use markdown formatting (no **, __, ##, etc.).
- Do NOT use code blocks or special formatting.
- Use plain text only with standard punctuation.
- Only output the rephrased and polished message.
- Do NOT explain anything, do NOT add extra text or notes.`;
    }

    const userPrompt = `Rephrase this message:\n\n${message}`;

    try {
      const result = await this.process({
        task: userPrompt,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        userId,
        forceTier: 'simple', // Rephrasing is a simple task
      }, {
        temperature: 0.5,
        maxTokens: 500,
      });

      let rephrasedMessage = result.content || result.response || '';

      // Clean any markdown that slipped through
      rephrasedMessage = this.cleanMarkdown(rephrasedMessage);

      return {
        success: true,
        rephrasedMessage,
        platform,
        style,
        provider: result.provider,
        classification: result.classification,
      };
    } catch (error) {
      logger.warn(`Rephrase failed: ${error.message}`);

      // Basic fallback: just clean up the message
      const fallbackMessage = message
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/([.!?])\s*([a-z])/g, (_, p, c) => `${p} ${c.toUpperCase()}`);

      return {
        success: false,
        rephrasedMessage: fallbackMessage.charAt(0).toUpperCase() + fallbackMessage.slice(1),
        error: error.message,
      };
    }
  }

  /**
   * Transform message content (detect URLs, extract embeds)
   * @param {Object} options - Transform options
   * @returns {Object}
   */
  transformMessage(options = {}) {
    const { message } = options;

    if (!message) {
      return { content: '', embeds: [] };
    }

    const embeds = [];
    const URL_REGEX = /(https?:\/\/[^\s<]+)/gi;
    const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const TIKTOK_REGEX = /tiktok\.com\/@[^/]+\/video\/(\d+)|tiktok\.com\/t\/([a-zA-Z0-9]+)/;
    const IMAGE_REGEX = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i;

    const urls = message.match(URL_REGEX) || [];

    for (const url of urls) {
      // YouTube
      const ytMatch = url.match(YOUTUBE_REGEX);
      if (ytMatch) {
        embeds.push({
          type: 'youtube',
          url,
          videoId: ytMatch[1],
          embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
        });
        continue;
      }

      // TikTok
      const ttMatch = url.match(TIKTOK_REGEX);
      if (ttMatch) {
        embeds.push({
          type: 'tiktok',
          url,
          videoId: ttMatch[1] || ttMatch[2],
        });
        continue;
      }

      // Image
      if (IMAGE_REGEX.test(url)) {
        embeds.push({
          type: 'image',
          url,
        });
        continue;
      }

      // Generic link
      embeds.push({
        type: 'link',
        url,
      });
    }

    return {
      content: message,
      embeds,
      hasEmbeds: embeds.length > 0,
    };
  }

  /**
   * Get supported languages
   * @returns {Array}
   */
  getSupportedLanguages() {
    return Object.entries(SuperBrainRouter.SUPPORTED_LANGUAGES).map(([code, name]) => ({
      code,
      name,
    }));
  }

  /**
   * Get rephrase styles
   * @returns {Object}
   */
  getRephraseStyles() {
    return SuperBrainRouter.REPHRASE_STYLES;
  }

  /**
   * Get router info
   * @returns {Object}
   */
  getInfo() {
    return {
      name: 'Super Brain Router',
      providers: this.getProviderStatus(),
      metrics: this.getMetricsSummary(),
      healthCheckInterval: this.healthCheckInterval,
      capabilities: {
        translation: true,
        rephrase: true,
        transform: true,
        supportedLanguages: Object.keys(SuperBrainRouter.SUPPORTED_LANGUAGES).length,
        rephraseStyles: Object.keys(SuperBrainRouter.REPHRASE_STYLES).length,
      },
    };
  }

  /**
   * Direct access to task classifier
   * @returns {Object}
   */
  get classifier() {
    return this.taskClassifier;
  }

  /**
   * Direct access to provider strategy
   * @returns {Object}
   */
  get strategy() {
    return this.providerStrategy;
  }

  /**
   * Estimate cost for usage tracking (lightweight, no external dependency)
   * @private
   */
  _estimateCost(inputTokens, outputTokens, model, provider) {
    const modelStr = (model || '').toLowerCase();
    const providerStr = (provider || '').toLowerCase();
    if (modelStr.includes(':free') || providerStr === 'ollama' || providerStr.startsWith('cli-')) {
      return 0;
    }
    const PRICING = {
      'gpt-4o': { in: 5, out: 15 },
      'gpt-4o-mini': { in: 0.15, out: 0.60 },
      'gpt-3.5': { in: 0.50, out: 1.50 },
      'claude-3-opus': { in: 15, out: 75 },
      'claude-3-sonnet': { in: 3, out: 15 },
      'claude-3-haiku': { in: 0.25, out: 1.25 },
      'claude-3.5': { in: 3, out: 15 },
      'llama-3.1-405b': { in: 3, out: 3 },
      'llama-3.1-70b': { in: 0.52, out: 0.75 },
      'llama-3.1-8b': { in: 0.06, out: 0.06 },
      'mistral-large': { in: 3, out: 9 },
    };
    const match = Object.entries(PRICING).find(([key]) => modelStr.includes(key));
    const rates = match ? match[1] : { in: 1, out: 3 };
    return Math.round(((inputTokens / 1e6) * rates.in + (outputTokens / 1e6) * rates.out) * 1e6) / 1e6;
  }
}

// Singleton instance
let superBrainRouterInstance = null;

function getSuperBrainRouter(options = {}) {
  if (!superBrainRouterInstance) {
    superBrainRouterInstance = new SuperBrainRouter(options);
  }
  return superBrainRouterInstance;
}

module.exports = {
  SuperBrainRouter,
  getSuperBrainRouter,
  HEALTH_STATUS,
};
