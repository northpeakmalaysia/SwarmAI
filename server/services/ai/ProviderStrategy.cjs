/**
 * Provider Strategy Service
 *
 * Maps task complexity tiers to provider preferences and manages
 * the selection logic for the Super Brain router.
 */

const { logger } = require('../logger.cjs');
const { TASK_TIERS } = require('./TaskClassifier.cjs');

/**
 * Available AI providers
 *
 * Note: OpenRouter is a single provider - users configure their own model
 * preferences via Task Routing settings (customFailoverChain).
 * The `:free` suffix on models is informational only.
 */
const PROVIDERS = {
  // Local providers
  OLLAMA: 'ollama',

  // OpenRouter (single provider - user configures models via Task Routing)
  OPENROUTER: 'openrouter',

  // CLI AI providers (Main Brain)
  CLI_CLAUDE: 'cli-claude',
  CLI_GEMINI: 'cli-gemini',
  CLI_OPENCODE: 'cli-opencode',
};

/**
 * Provider capabilities and characteristics
 *
 * Note: Cost is indicative only. For OpenRouter, actual cost depends on
 * which models the user configures in their Task Routing settings.
 */
const PROVIDER_PROFILES = {
  [PROVIDERS.OLLAMA]: {
    name: 'Ollama (Local)',
    type: 'local',
    cost: 'free',
    latency: 'low',
    capabilities: ['translation', 'summarization', 'simple_qa', 'formatting', 'chat', 'completion'],
    maxTokens: 4096,
    requiresAuth: false,
    isLocal: true,
    description: 'Run open-source LLMs locally with no API costs',
  },
  [PROVIDERS.OPENROUTER]: {
    name: 'OpenRouter',
    type: 'api',
    cost: 'variable', // Cost depends on user's model selection
    latency: 'medium',
    capabilities: ['chat', 'completion', 'summarization', 'qa', 'code', 'analysis', 'reasoning', 'vision'],
    maxTokens: 128000,
    requiresAuth: true,
    requiresApiKey: true,
    supportsMultiModel: true,
    description: 'Access 200+ AI models through a single API - configure models in Task Routing',
  },
  [PROVIDERS.CLI_CLAUDE]: {
    name: 'Claude CLI',
    type: 'cli',
    cost: 'paid',
    latency: 'high',
    capabilities: ['agentic', 'code', 'analysis', 'reasoning', 'research', 'autonomous'],
    maxTokens: 200000,
    requiresAuth: true,
    requiresSuperadmin: true,
    description: 'Claude Code CLI for agentic coding tasks',
  },
  [PROVIDERS.CLI_GEMINI]: {
    name: 'Gemini CLI',
    type: 'cli',
    cost: 'free',
    latency: 'high',
    capabilities: ['agentic', 'code', 'analysis', 'reasoning', 'multimodal'],
    maxTokens: 100000,
    requiresAuth: true,
    requiresSuperadmin: true,
    description: 'Gemini CLI for agentic tasks with multimodal support',
  },
  [PROVIDERS.CLI_OPENCODE]: {
    name: 'OpenCode CLI',
    type: 'cli',
    cost: 'free',
    latency: 'medium',
    capabilities: ['code', 'agentic', 'automation', 'analysis', 'reasoning', 'multimodal'],
    maxTokens: 128000,
    requiresAuth: true,
    requiresSuperadmin: true,
    supportsMultiProvider: true,
    supportsMultiModel: true,
    description: 'Free AI coding assistant with agentic capabilities and multi-provider support',
  },
};

/**
 * Default provider strategy mapping task tiers to provider chains
 *
 * IMPORTANT: This is only used as a fallback when users have not configured
 * their own Task Routing settings. Users should configure their preferred
 * providers and models per tier in SuperBrain Settings → Task Routing.
 */
const DEFAULT_STRATEGY = {
  [TASK_TIERS.TRIVIAL]: [
    PROVIDERS.OLLAMA,
    PROVIDERS.OPENROUTER,
    PROVIDERS.CLI_OPENCODE,
  ],
  [TASK_TIERS.SIMPLE]: [
    PROVIDERS.OPENROUTER,
    PROVIDERS.OLLAMA,
    PROVIDERS.CLI_OPENCODE,
  ],
  [TASK_TIERS.MODERATE]: [
    PROVIDERS.OPENROUTER,
    PROVIDERS.CLI_OPENCODE,
    PROVIDERS.CLI_GEMINI,
  ],
  [TASK_TIERS.COMPLEX]: [
    PROVIDERS.CLI_CLAUDE,
    PROVIDERS.CLI_GEMINI,
    PROVIDERS.CLI_OPENCODE,
    PROVIDERS.OPENROUTER,
  ],
  [TASK_TIERS.CRITICAL]: [
    PROVIDERS.CLI_CLAUDE,
    PROVIDERS.CLI_GEMINI,
    PROVIDERS.CLI_OPENCODE,
    PROVIDERS.OPENROUTER,
  ],
};

/**
 * Cost-optimized strategy (prioritizes local/free providers)
 *
 * DEPRECATED: Users should configure their own Task Routing settings.
 * This preset is kept for backwards compatibility only.
 */
const COST_OPTIMIZED_STRATEGY = {
  [TASK_TIERS.TRIVIAL]: [
    PROVIDERS.OLLAMA,
    PROVIDERS.OPENROUTER,
    PROVIDERS.CLI_OPENCODE,
  ],
  [TASK_TIERS.SIMPLE]: [
    PROVIDERS.OLLAMA,
    PROVIDERS.OPENROUTER,
    PROVIDERS.CLI_OPENCODE,
  ],
  [TASK_TIERS.MODERATE]: [
    PROVIDERS.OPENROUTER,
    PROVIDERS.CLI_OPENCODE,
    PROVIDERS.CLI_GEMINI,
  ],
  [TASK_TIERS.COMPLEX]: [
    PROVIDERS.CLI_OPENCODE,
    PROVIDERS.CLI_GEMINI,
    PROVIDERS.OPENROUTER,
  ],
  [TASK_TIERS.CRITICAL]: [
    PROVIDERS.CLI_OPENCODE,
    PROVIDERS.CLI_GEMINI,
    PROVIDERS.CLI_CLAUDE,
  ],
};

/**
 * Quality-optimized strategy (prioritizes powerful models)
 *
 * DEPRECATED: Users should configure their own Task Routing settings.
 * This preset is kept for backwards compatibility only.
 */
const QUALITY_OPTIMIZED_STRATEGY = {
  [TASK_TIERS.TRIVIAL]: [
    PROVIDERS.OPENROUTER,
    PROVIDERS.OLLAMA,
    PROVIDERS.CLI_OPENCODE,
  ],
  [TASK_TIERS.SIMPLE]: [
    PROVIDERS.OPENROUTER,
    PROVIDERS.CLI_OPENCODE,
    PROVIDERS.OLLAMA,
  ],
  [TASK_TIERS.MODERATE]: [
    PROVIDERS.CLI_CLAUDE,
    PROVIDERS.OPENROUTER,
    PROVIDERS.CLI_OPENCODE,
  ],
  [TASK_TIERS.COMPLEX]: [
    PROVIDERS.CLI_CLAUDE,
    PROVIDERS.OPENROUTER,
    PROVIDERS.CLI_OPENCODE,
  ],
  [TASK_TIERS.CRITICAL]: [
    PROVIDERS.CLI_CLAUDE,
    PROVIDERS.CLI_OPENCODE,
    PROVIDERS.OPENROUTER,
  ],
};

/**
 * Strategy presets
 */
const STRATEGY_PRESETS = {
  default: DEFAULT_STRATEGY,
  cost: COST_OPTIMIZED_STRATEGY,
  quality: QUALITY_OPTIMIZED_STRATEGY,
};

class ProviderStrategy {
  constructor(options = {}) {
    this.strategy = options.strategy || { ...DEFAULT_STRATEGY };
    this.providerProfiles = { ...PROVIDER_PROFILES };
    this.providerStatus = new Map(); // Track provider availability
  }

  /**
   * Get provider chain for a task tier
   * @param {string} tier - Task complexity tier
   * @param {Object} options - Selection options
   * @returns {string[]} Ordered list of providers to try
   */
  getProviderChain(tier, options = {}) {
    const {
      excludeProviders = [],
      requireLocal = false,
      requireFree = false,
      requireCLI = false,
      customChain = null,
    } = options;

    // Use custom chain if provided
    if (customChain && Array.isArray(customChain)) {
      return this.filterChain(customChain, { excludeProviders, requireLocal, requireFree, requireCLI });
    }

    // Get default chain for tier
    let chain = this.strategy[tier] || this.strategy[TASK_TIERS.SIMPLE];

    // Apply filters
    chain = this.filterChain(chain, { excludeProviders, requireLocal, requireFree, requireCLI });

    // Filter out unavailable providers
    chain = chain.filter(provider => {
      const status = this.providerStatus.get(provider);
      return !status || status.available !== false;
    });

    return chain;
  }

  /**
   * Filter provider chain based on requirements
   */
  filterChain(chain, options) {
    const { excludeProviders, requireLocal, requireFree, requireCLI } = options;

    return chain.filter(provider => {
      // Exclude specific providers
      if (excludeProviders.includes(provider)) {
        return false;
      }

      const profile = this.providerProfiles[provider];
      if (!profile) return false;

      // Require local providers only
      if (requireLocal && !profile.isLocal) {
        return false;
      }

      // Require free providers only
      if (requireFree && profile.cost !== 'free') {
        return false;
      }

      // Require CLI providers only
      if (requireCLI && profile.type !== 'cli') {
        return false;
      }

      return true;
    });
  }

  /**
   * Get the best provider for a specific task
   * @param {string} tier - Task complexity tier
   * @param {Object} requirements - Task requirements
   * @returns {Object} Best provider with profile
   */
  selectProvider(tier, requirements = {}) {
    const {
      preferFree = true,
      preferLocal = false,
      requiredCapability = null,
      excludeProviders = [],
    } = requirements;

    // Build selection options
    const options = {
      excludeProviders,
      requireFree: preferFree && tier !== TASK_TIERS.CRITICAL,
      requireLocal: preferLocal && tier === TASK_TIERS.TRIVIAL,
    };

    // Get provider chain
    const chain = this.getProviderChain(tier, options);

    // If capability required, filter by capability
    let candidates = chain;
    if (requiredCapability) {
      candidates = chain.filter(provider => {
        const profile = this.providerProfiles[provider];
        return profile && profile.capabilities.includes(requiredCapability);
      });

      // Fall back to original chain if no capability match
      if (candidates.length === 0) {
        candidates = chain;
      }
    }

    // Return first available provider
    const selectedProvider = candidates[0] || chain[0] || PROVIDERS.OPENROUTER;
    const profile = this.providerProfiles[selectedProvider];

    return {
      provider: selectedProvider,
      profile,
      fallbacks: candidates.slice(1),
    };
  }

  /**
   * Update provider availability status
   * @param {string} provider - Provider ID
   * @param {Object} status - Status information
   */
  updateProviderStatus(provider, status) {
    this.providerStatus.set(provider, {
      ...status,
      lastUpdated: new Date().toISOString(),
    });
    logger.debug(`Provider ${provider} status updated: ${JSON.stringify(status)}`);
  }

  /**
   * Get provider profile
   * @param {string} provider - Provider ID
   * @returns {Object} Provider profile
   */
  getProviderProfile(provider) {
    return this.providerProfiles[provider] || null;
  }

  /**
   * Get all available providers
   * @returns {Object} All provider profiles
   */
  getAllProviders() {
    return { ...this.providerProfiles };
  }

  /**
   * Set custom strategy
   * @param {Object} strategy - Custom strategy mapping
   */
  setStrategy(strategy) {
    this.strategy = { ...DEFAULT_STRATEGY, ...strategy };
    logger.info('Provider strategy updated');
  }

  /**
   * Apply a strategy preset
   * @param {string} presetName - Preset name ('default', 'cost', 'quality')
   */
  applyPreset(presetName) {
    const preset = STRATEGY_PRESETS[presetName];
    if (preset) {
      this.strategy = { ...preset };
      logger.info(`Applied strategy preset: ${presetName}`);
    } else {
      logger.warn(`Unknown strategy preset: ${presetName}`);
    }
  }

  /**
   * Get current strategy
   * @returns {Object} Current strategy mapping
   */
  getStrategy() {
    return { ...this.strategy };
  }

  /**
   * Get providers by type
   * @param {string} type - Provider type ('local', 'api', 'cli')
   * @returns {string[]} Provider IDs
   */
  getProvidersByType(type) {
    return Object.entries(this.providerProfiles)
      .filter(([_, profile]) => profile.type === type)
      .map(([id]) => id);
  }

  /**
   * Get providers by cost
   * @param {string} cost - Cost type ('free', 'paid')
   * @returns {string[]} Provider IDs
   */
  getProvidersByCost(cost) {
    return Object.entries(this.providerProfiles)
      .filter(([_, profile]) => profile.cost === cost)
      .map(([id]) => id);
  }

  /**
   * Check if provider requires superadmin
   * @param {string} provider - Provider ID
   * @returns {boolean}
   */
  requiresSuperadmin(provider) {
    const profile = this.providerProfiles[provider];
    return profile?.requiresSuperadmin === true;
  }

  /**
   * Check if provider is authenticated
   * @param {string} provider - Provider ID
   * @returns {boolean}
   */
  isProviderAuthenticated(provider) {
    const status = this.providerStatus.get(provider);
    return status?.authenticated === true;
  }
}

// Singleton instance
let providerStrategyInstance = null;

function getProviderStrategy(options = {}) {
  if (!providerStrategyInstance) {
    providerStrategyInstance = new ProviderStrategy(options);
  }
  return providerStrategyInstance;
}

module.exports = {
  ProviderStrategy,
  getProviderStrategy,
  PROVIDERS,
  PROVIDER_PROFILES,
  DEFAULT_STRATEGY,
  COST_OPTIMIZED_STRATEGY,
  QUALITY_OPTIMIZED_STRATEGY,
  STRATEGY_PRESETS,
};
