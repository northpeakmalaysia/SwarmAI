/**
 * Failover Configuration Service
 *
 * Manages superadmin-configurable failover hierarchy for AI providers.
 * Allows customization of which providers are used for each task tier.
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const { TASK_TIERS } = require('./TaskClassifier.cjs');
const { PROVIDERS } = require('./ProviderStrategy.cjs');

/**
 * Default failover hierarchy
 */
/**
 * Default failover hierarchy
 * OpenCode CLI included in all tiers as it supports multi-provider/multi-model
 */
const DEFAULT_HIERARCHY = {
  [TASK_TIERS.TRIVIAL]: [PROVIDERS.OLLAMA, PROVIDERS.OPENROUTER, PROVIDERS.CLI_OPENCODE],
  [TASK_TIERS.SIMPLE]: [PROVIDERS.OPENROUTER, PROVIDERS.OLLAMA, PROVIDERS.CLI_OPENCODE],
  [TASK_TIERS.MODERATE]: [PROVIDERS.OPENROUTER, PROVIDERS.CLI_OPENCODE, PROVIDERS.CLI_GEMINI],
  [TASK_TIERS.COMPLEX]: [PROVIDERS.CLI_CLAUDE, PROVIDERS.CLI_GEMINI, PROVIDERS.CLI_OPENCODE, PROVIDERS.OPENROUTER],
  [TASK_TIERS.CRITICAL]: [PROVIDERS.CLI_CLAUDE, PROVIDERS.CLI_GEMINI, PROVIDERS.CLI_OPENCODE, PROVIDERS.OPENROUTER],
};

/**
 * Valid providers for validation
 */
const VALID_PROVIDERS = Object.values(PROVIDERS);

class FailoverConfigService {
  constructor() {
    this.cachedConfig = null;
    this.cacheExpiry = null;
    this.cacheDuration = 60000; // 1 minute cache
  }

  /**
   * Get current failover configuration
   * @returns {Promise<Object>}
   */
  async getConfig() {
    // Check cache
    if (this.cachedConfig && this.cacheExpiry && Date.now() < this.cacheExpiry) {
      return this.cachedConfig;
    }

    try {
      const db = getDatabase();

      const config = db.prepare(`
        SELECT * FROM ai_failover_config
        WHERE active = 1
        ORDER BY updated_at DESC
        LIMIT 1
      `).get();

      if (config) {
        this.cachedConfig = JSON.parse(config.hierarchy);
        this.cacheExpiry = Date.now() + this.cacheDuration;
        return this.cachedConfig;
      }
    } catch (error) {
      logger.debug(`Could not get failover config from DB: ${error.message}`);
    }

    // Return default if no config found
    return { ...DEFAULT_HIERARCHY };
  }

  /**
   * Update failover configuration
   * @param {string} userId - User ID (must be superadmin)
   * @param {Object} hierarchy - New hierarchy configuration
   * @returns {Promise<Object>}
   */
  async updateConfig(userId, hierarchy) {
    // Validate user is superadmin
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user || (user.role !== 'admin' && !user.is_superuser)) {
      throw new Error('Only superadmin can update failover configuration');
    }

    // Validate hierarchy structure
    this.validateHierarchy(hierarchy);

    // Deactivate existing config
    db.prepare(`
      UPDATE ai_failover_config
      SET active = 0, updated_at = datetime('now')
      WHERE active = 1
    `).run();

    // Insert new config
    const configId = uuidv4();
    db.prepare(`
      INSERT INTO ai_failover_config (id, user_id, hierarchy, active, created_at, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(configId, userId, JSON.stringify(hierarchy));

    // Clear cache
    this.cachedConfig = null;
    this.cacheExpiry = null;

    logger.info(`Failover config updated by user ${userId}`);

    return {
      id: configId,
      hierarchy,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate hierarchy structure
   * @param {Object} hierarchy - Hierarchy to validate
   */
  validateHierarchy(hierarchy) {
    if (!hierarchy || typeof hierarchy !== 'object') {
      throw new Error('Hierarchy must be an object');
    }

    const validTiers = Object.values(TASK_TIERS);

    for (const [tier, providers] of Object.entries(hierarchy)) {
      // Validate tier
      if (!validTiers.includes(tier)) {
        throw new Error(`Invalid tier: ${tier}. Valid tiers: ${validTiers.join(', ')}`);
      }

      // Validate providers array
      if (!Array.isArray(providers)) {
        throw new Error(`Providers for tier ${tier} must be an array`);
      }

      if (providers.length === 0) {
        throw new Error(`Tier ${tier} must have at least one provider`);
      }

      // Validate each provider
      for (const provider of providers) {
        if (!VALID_PROVIDERS.includes(provider)) {
          throw new Error(`Invalid provider: ${provider}. Valid providers: ${VALID_PROVIDERS.join(', ')}`);
        }
      }
    }

    // Ensure all required tiers are present
    for (const tier of validTiers) {
      if (!hierarchy[tier]) {
        throw new Error(`Missing required tier: ${tier}`);
      }
    }
  }

  /**
   * Get failover chain for a specific tier
   * @param {string} tier - Task tier
   * @returns {Promise<string[]>}
   */
  async getChainForTier(tier) {
    const config = await this.getConfig();
    return config[tier] || DEFAULT_HIERARCHY[tier] || [PROVIDERS.OPENROUTER];
  }

  /**
   * Reset to default configuration
   * @param {string} userId - User ID (must be superadmin)
   * @returns {Promise<Object>}
   */
  async resetToDefault(userId) {
    return await this.updateConfig(userId, { ...DEFAULT_HIERARCHY });
  }

  /**
   * Get configuration history
   * @param {number} limit - Number of entries to return
   * @returns {Promise<Object[]>}
   */
  async getHistory(limit = 10) {
    try {
      const db = getDatabase();

      const history = db.prepare(`
        SELECT fc.*, u.name as user_name, u.email as user_email
        FROM ai_failover_config fc
        LEFT JOIN users u ON fc.user_id = u.id
        ORDER BY fc.created_at DESC
        LIMIT ?
      `).all(limit);

      return history.map(entry => ({
        id: entry.id,
        hierarchy: JSON.parse(entry.hierarchy),
        active: entry.active === 1,
        updatedBy: {
          id: entry.user_id,
          name: entry.user_name,
          email: entry.user_email,
        },
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
      }));
    } catch (error) {
      logger.debug(`Could not get config history: ${error.message}`);
      return [];
    }
  }

  /**
   * Preview what providers would be used for a task
   * @param {string} task - Task description
   * @returns {Promise<Object>}
   */
  async previewProviders(task) {
    const { getTaskClassifier } = require('./TaskClassifier.cjs');
    const classifier = getTaskClassifier();

    const classification = classifier.classify(task);
    const chain = await this.getChainForTier(classification.tier);

    return {
      task,
      tier: classification.tier,
      confidence: classification.confidence,
      providerChain: chain,
      analysis: classification.analysis,
    };
  }

  /**
   * Get default hierarchy
   * @returns {Object}
   */
  getDefaultHierarchy() {
    return { ...DEFAULT_HIERARCHY };
  }

  /**
   * Get valid tiers
   * @returns {string[]}
   */
  getValidTiers() {
    return Object.values(TASK_TIERS);
  }

  /**
   * Get valid providers
   * @returns {string[]}
   */
  getValidProviders() {
    return [...VALID_PROVIDERS];
  }

  /**
   * Clear config cache
   */
  clearCache() {
    this.cachedConfig = null;
    this.cacheExpiry = null;
  }
}

// Singleton instance
let failoverConfigServiceInstance = null;

function getFailoverConfigService() {
  if (!failoverConfigServiceInstance) {
    failoverConfigServiceInstance = new FailoverConfigService();
  }
  return failoverConfigServiceInstance;
}

module.exports = {
  FailoverConfigService,
  getFailoverConfigService,
  DEFAULT_HIERARCHY,
};
