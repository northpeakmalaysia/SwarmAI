/**
 * CostTrackingService
 * ====================
 * Tracks AI usage costs and token consumption for Agentic profiles.
 *
 * Features:
 * - Track tokens per request (input/output)
 * - Calculate costs based on provider pricing
 * - Daily/monthly budget enforcement
 * - Usage analytics and reporting
 * - Alert on budget thresholds
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

// Pricing per 1M tokens (approximate, varies by model)
const PRICING = {
  // OpenRouter free models
  'free': { input: 0, output: 0 },

  // OpenAI via OpenRouter
  'gpt-4': { input: 30, output: 60 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4o': { input: 5, output: 15 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },

  // Anthropic via OpenRouter
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-3.5-sonnet': { input: 3, output: 15 },

  // Meta Llama (OpenRouter)
  'llama-3.1-405b': { input: 3, output: 3 },
  'llama-3.1-70b': { input: 0.52, output: 0.75 },
  'llama-3.1-8b': { input: 0.06, output: 0.06 },

  // Mistral
  'mistral-large': { input: 3, output: 9 },
  'mistral-medium': { input: 2.7, output: 8.1 },
  'mistral-small': { input: 1, output: 3 },

  // Local models (free)
  'ollama': { input: 0, output: 0 },
  'local': { input: 0, output: 0 },

  // CLI providers (typically free/personal accounts)
  'cli-claude': { input: 0, output: 0 },
  'cli-gemini': { input: 0, output: 0 },
  'cli-opencode': { input: 0, output: 0 },

  // Default fallback
  'default': { input: 1, output: 3 },
};

class CostTrackingService {
  constructor() {
    this.tableEnsured = false;
    try {
      this.ensureTable();
    } catch (e) {
      // Will retry on first query
    }
  }

  /**
   * Ensure the usage tracking table exists
   */
  ensureTable() {
    try {
      const db = this.getDb(); // direct call for bootstrap

      db.exec(`
        CREATE TABLE IF NOT EXISTS agentic_usage_log (
          id TEXT PRIMARY KEY,
          agentic_id TEXT NOT NULL,
          user_id TEXT NOT NULL,

          -- Request details
          request_type TEXT NOT NULL,
          provider TEXT,
          model TEXT,

          -- Token counts
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,

          -- Cost calculation
          cost_usd REAL DEFAULT 0.0,

          -- Context
          task_id TEXT,
          conversation_id TEXT,
          source TEXT,

          -- Metadata
          metadata TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),

          FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_usage_agentic ON agentic_usage_log(agentic_id);
        CREATE INDEX IF NOT EXISTS idx_usage_user ON agentic_usage_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_usage_date ON agentic_usage_log(agentic_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_usage_provider ON agentic_usage_log(provider, model);
      `);

      this.tableEnsured = true;
      logger.debug('Usage tracking table ensured');
    } catch (error) {
      // Table may already exist or DB not ready yet
      logger.debug(`Usage table check: ${error.message}`);
    }
  }

  /**
   * Get database, ensuring table exists
   */
  getDb() {
    if (!this.tableEnsured) {
      this.ensureTable();
    }
    return getDatabase();
  }

  /**
   * Get pricing for a model
   * @param {string} model - Model name
   * @param {string} provider - Provider name
   * @returns {Object} Pricing per 1M tokens
   */
  getPricing(model, provider) {
    // Check if it's a free model
    if (model && model.includes(':free')) {
      return PRICING['free'];
    }

    // Check provider type
    if (provider === 'ollama' || provider === 'local') {
      return PRICING['local'];
    }

    if (provider && provider.startsWith('cli-')) {
      return PRICING[provider] || PRICING['default'];
    }

    // Match by model name
    const modelLower = (model || '').toLowerCase();

    for (const [key, pricing] of Object.entries(PRICING)) {
      if (modelLower.includes(key.toLowerCase())) {
        return pricing;
      }
    }

    return PRICING['default'];
  }

  /**
   * Calculate cost for token usage
   * @param {number} inputTokens - Input token count
   * @param {number} outputTokens - Output token count
   * @param {string} model - Model name
   * @param {string} provider - Provider name
   * @returns {number} Cost in USD
   */
  calculateCost(inputTokens, outputTokens, model, provider) {
    const pricing = this.getPricing(model, provider);
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    return Math.round((inputCost + outputCost) * 1000000) / 1000000; // Round to 6 decimals
  }

  /**
   * Record usage for an agentic profile
   * @param {Object} params - Usage parameters
   * @returns {Object} Usage record
   */
  recordUsage({
    agenticId,
    userId,
    requestType = 'completion',
    provider,
    model,
    inputTokens = 0,
    outputTokens = 0,
    taskId = null,
    conversationId = null,
    source = null,
    metadata = {}
  }) {
    try {
      const db = this.getDb();

      const totalTokens = inputTokens + outputTokens;
      const costUsd = this.calculateCost(inputTokens, outputTokens, model, provider);

      const usageId = uuidv4();

      db.prepare(`
        INSERT INTO agentic_usage_log (
          id, agentic_id, user_id, request_type, provider, model,
          input_tokens, output_tokens, total_tokens, cost_usd,
          task_id, conversation_id, source, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        usageId,
        agenticId,
        userId,
        requestType,
        provider || null,
        model || null,
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd,
        taskId,
        conversationId,
        source,
        JSON.stringify(metadata)
      );

      // Update daily budget used on profile
      db.prepare(`
        UPDATE agentic_profiles
        SET daily_budget_used = daily_budget_used + ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(costUsd, agenticId);

      logger.debug(`Recorded usage for ${agenticId}: ${totalTokens} tokens, $${costUsd.toFixed(6)}`);

      // Check budget threshold
      this.checkBudgetThreshold(agenticId, userId);

      return {
        id: usageId,
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd,
      };

    } catch (error) {
      logger.error(`Failed to record usage: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if budget threshold is exceeded and trigger alert
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   */
  checkBudgetThreshold(agenticId, userId) {
    try {
      const db = this.getDb();

      const profile = db.prepare(`
        SELECT daily_budget, daily_budget_used, name, master_contact_id
        FROM agentic_profiles WHERE id = ?
      `).get(agenticId);

      if (!profile) return;

      const usagePercent = (profile.daily_budget_used / profile.daily_budget) * 100;

      // Alert at 80% and 100%
      if (usagePercent >= 100) {
        logger.warn(`Budget EXCEEDED for ${profile.name}: ${usagePercent.toFixed(1)}%`);

        // Log hierarchy event
        const logTableExists = db.prepare(`
          SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='agentic_hierarchy_log'
        `).get().count > 0;

        if (logTableExists) {
          db.prepare(`
            INSERT INTO agentic_hierarchy_log (id, user_id, event_type, parent_agentic_id, details)
            VALUES (?, ?, 'budget_exceeded', ?, ?)
          `).run(
            uuidv4(),
            userId,
            agenticId,
            JSON.stringify({
              budget: profile.daily_budget,
              used: profile.daily_budget_used,
              percent: usagePercent
            })
          );
        }

      } else if (usagePercent >= 80) {
        logger.info(`Budget warning for ${profile.name}: ${usagePercent.toFixed(1)}%`);
      }

    } catch (error) {
      logger.error(`Budget check failed: ${error.message}`);
    }
  }

  /**
   * Get usage summary for an agentic profile
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object} Usage summary
   */
  getUsageSummary(agenticId, userId, options = {}) {
    const { period = 'day', startDate, endDate } = options;

    try {
      const db = this.getDb();

      // Calculate date range
      let dateFilter = '';
      const params = [agenticId, userId];

      if (startDate && endDate) {
        dateFilter = "AND created_at BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (period === 'day') {
        dateFilter = "AND date(created_at) = date('now')";
      } else if (period === 'week') {
        dateFilter = "AND created_at >= datetime('now', '-7 days')";
      } else if (period === 'month') {
        dateFilter = "AND created_at >= datetime('now', '-30 days')";
      }

      // Get totals
      const totals = db.prepare(`
        SELECT
          COUNT(*) as request_count,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost
        FROM agentic_usage_log
        WHERE agentic_id = ? AND user_id = ?
        ${dateFilter}
      `).get(...params);

      // Get by provider/model
      const byModel = db.prepare(`
        SELECT
          provider,
          model,
          COUNT(*) as request_count,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost
        FROM agentic_usage_log
        WHERE agentic_id = ? AND user_id = ?
        ${dateFilter}
        GROUP BY provider, model
        ORDER BY total_cost DESC
      `).all(...params);

      // Get by request type
      const byType = db.prepare(`
        SELECT
          request_type,
          COUNT(*) as request_count,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost
        FROM agentic_usage_log
        WHERE agentic_id = ? AND user_id = ?
        ${dateFilter}
        GROUP BY request_type
        ORDER BY total_cost DESC
      `).all(...params);

      // Get daily breakdown (last 7 days)
      const dailyBreakdown = db.prepare(`
        SELECT
          date(created_at) as date,
          COUNT(*) as request_count,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost
        FROM agentic_usage_log
        WHERE agentic_id = ? AND user_id = ?
        AND created_at >= datetime('now', '-7 days')
        GROUP BY date(created_at)
        ORDER BY date DESC
      `).all(agenticId, userId);

      // Get budget info
      const profile = db.prepare(`
        SELECT daily_budget, daily_budget_used FROM agentic_profiles WHERE id = ?
      `).get(agenticId);

      return {
        period,
        totals: {
          requestCount: totals.request_count,
          inputTokens: totals.total_input_tokens,
          outputTokens: totals.total_output_tokens,
          totalTokens: totals.total_tokens,
          totalCost: Math.round(totals.total_cost * 1000000) / 1000000,
        },
        byModel,
        byType,
        dailyBreakdown,
        budget: {
          daily: profile?.daily_budget || 10.0,
          used: profile?.daily_budget_used || 0,
          remaining: Math.max(0, (profile?.daily_budget || 10.0) - (profile?.daily_budget_used || 0)),
          percentUsed: profile ? ((profile.daily_budget_used / profile.daily_budget) * 100) : 0,
        },
      };

    } catch (error) {
      logger.error(`Failed to get usage summary: ${error.message}`);
      return null;
    }
  }

  /**
   * Get recent usage logs
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   * @param {number} limit - Max records to return
   * @returns {Array} Usage logs
   */
  getRecentUsage(agenticId, userId, limit = 50) {
    try {
      const db = this.getDb();

      const logs = db.prepare(`
        SELECT * FROM agentic_usage_log
        WHERE agentic_id = ? AND user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(agenticId, userId, limit);

      return logs.map(log => ({
        id: log.id,
        agenticId: log.agentic_id,
        requestType: log.request_type,
        provider: log.provider,
        model: log.model,
        inputTokens: log.input_tokens,
        outputTokens: log.output_tokens,
        totalTokens: log.total_tokens,
        costUsd: log.cost_usd,
        taskId: log.task_id,
        conversationId: log.conversation_id,
        source: log.source,
        metadata: JSON.parse(log.metadata || '{}'),
        createdAt: log.created_at,
      }));

    } catch (error) {
      logger.error(`Failed to get recent usage: ${error.message}`);
      return [];
    }
  }

  /**
   * Reset daily budget used (should be called by cron job)
   */
  resetDailyBudgets() {
    try {
      const db = this.getDb();

      const result = db.prepare(`
        UPDATE agentic_profiles
        SET daily_budget_used = 0,
            updated_at = datetime('now')
        WHERE daily_budget_used > 0
      `).run();

      logger.info(`Reset daily budgets for ${result.changes} profiles`);

      return { reset: result.changes };

    } catch (error) {
      logger.error(`Failed to reset budgets: ${error.message}`);
      return { reset: 0, error: error.message };
    }
  }

  /**
   * Update budget settings for a profile
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   * @param {Object} settings - Budget settings
   */
  updateBudgetSettings(agenticId, userId, { dailyBudget }) {
    try {
      const db = this.getDb();

      db.prepare(`
        UPDATE agentic_profiles
        SET daily_budget = ?,
            updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(dailyBudget, agenticId, userId);

      return { success: true };

    } catch (error) {
      logger.error(`Failed to update budget: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
const costTrackingService = new CostTrackingService();

module.exports = {
  CostTrackingService,
  costTrackingService,
  PRICING,
};
