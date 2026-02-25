/**
 * Self-Healing Hook
 * =================
 * Listens to reasoning:end events and checks for high error rates.
 * If failure rate exceeds threshold, triggers SelfHealingService
 * to analyze and potentially auto-heal the agent.
 *
 * Registered at priority 900 (before SessionLoggerHook at 999,
 * after application hooks at default 100).
 *
 * Fire-and-forget: never blocks the reasoning loop.
 *
 * Cooldown: 30-min per agent to prevent healing spam. If DB shows
 * an active healing session, a short 5-min cooldown is set instead
 * to avoid repeated DB queries.
 */

const { logger } = require('../../logger.cjs');

const ERROR_RATE_THRESHOLD = 0.40; // 40% of actions failed → trigger healing
const MIN_ACTIONS_FOR_CHECK = 3;   // Need at least 3 actions to evaluate
const COOLDOWN_MS = 30 * 60 * 1000;        // 30 minutes default cooldown
const SHORT_COOLDOWN_MS = 5 * 60 * 1000;   // 5 minutes (active healing or failure retry)

// In-memory cooldown map: agentId → expiry timestamp
const cooldowns = new Map();

const ACTIVE_STATUSES = new Set([
  'analyzing', 'proposing_fix', 'applying_fix', 'testing', 'awaiting_approval',
]);

/**
 * Check if there's an active healing session in the DB for this agent.
 * Returns true if one exists (meaning we should skip triggering).
 */
function hasActiveHealingInDB(agentId) {
  try {
    const { getDatabase } = require('../../database.cjs');
    const db = getDatabase();
    const row = db.prepare(`
      SELECT id FROM agentic_self_healing_log
      WHERE agentic_id = ? AND status IN ('analyzing', 'proposing_fix', 'applying_fix', 'testing', 'awaiting_approval')
      ORDER BY created_at DESC LIMIT 1
    `).get(agentId);
    return !!row;
  } catch {
    return false; // Table may not exist yet
  }
}

/**
 * Register the self-healing hook with the HookRegistry.
 * @param {Object} registry - HookRegistry instance
 */
function registerSelfHealingHook(registry) {
  registry.register('reasoning:end', async (context) => {
    try {
      const { actions, agenticId, userId } = context;

      // Skip if not enough data
      if (!actions || !agenticId || !Array.isArray(actions) || actions.length < MIN_ACTIONS_FOR_CHECK) {
        return context;
      }

      // Count failures
      const failedActions = actions.filter(a =>
        a.status === 'failed' || a.success === false ||
        (a.result && a.result.success === false)
      );
      const errorRate = failedActions.length / actions.length;

      // Only trigger if error rate exceeds threshold
      if (errorRate < ERROR_RATE_THRESHOLD) {
        return context;
      }

      // --- Cooldown check ---
      const now = Date.now();
      const cooldownExpiry = cooldowns.get(agenticId);
      if (cooldownExpiry && now < cooldownExpiry) {
        logger.debug(`[SelfHealingHook] Skipping agent ${agenticId} - cooldown active (${Math.round((cooldownExpiry - now) / 1000)}s remaining)`);
        return context;
      }

      // --- DB dedup: check for active healing session ---
      if (hasActiveHealingInDB(agenticId)) {
        logger.debug(`[SelfHealingHook] Skipping agent ${agenticId} - active healing session in DB`);
        // Set short cooldown to avoid repeated DB queries
        cooldowns.set(agenticId, now + SHORT_COOLDOWN_MS);
        return context;
      }

      // Set full cooldown immediately (before async call)
      cooldowns.set(agenticId, now + COOLDOWN_MS);

      logger.info(`[SelfHealingHook] High error rate detected for agent ${agenticId}: ${Math.round(errorRate * 100)}% (${failedActions.length}/${actions.length})`);

      // Trigger self-healing analysis (async, non-blocking)
      const { getSelfHealingService } = require('../SelfHealingService.cjs');
      const healer = getSelfHealingService();

      healer.analyzeAndHeal(agenticId, userId, {
        trigger: 'hook',
        triggerContext: {
          errorRate: Math.round(errorRate * 100),
          failedTools: failedActions.map(a => a.tool || a.action).filter(Boolean),
          totalActions: actions.length,
          failedActions: failedActions.length,
        },
      }).catch(err => {
        logger.debug(`[SelfHealingHook] Analysis failed (non-critical): ${err.message}`);
        // Shorten cooldown to 5 min so retry happens sooner
        cooldowns.set(agenticId, Date.now() + SHORT_COOLDOWN_MS);
      });
    } catch (e) {
      // Never crash the reasoning loop
      logger.debug(`[SelfHealingHook] Hook error (non-critical): ${e.message}`);
    }

    return context; // Always pass through unmodified
  }, { priority: 900, name: 'SelfHealingHook' });

  logger.info('[SelfHealingHook] Registered on reasoning:end (priority 900, 30-min cooldown)');
}

module.exports = { registerSelfHealingHook };
