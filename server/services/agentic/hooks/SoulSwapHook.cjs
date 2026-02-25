/**
 * Soul Swap Hook
 * ==============
 * Built-in hook that reloads the PersonalityService cache when an agent wakes up.
 * This ensures agents always use the latest personality configuration.
 *
 * Priority: 50 (runs early, before other hooks that may depend on personality)
 */

const { logger } = require('../../logger.cjs');

/**
 * Register the SoulSwapHook on the given HookRegistry.
 * @param {import('../HookRegistry.cjs').HookRegistry} registry
 */
function registerSoulSwapHook(registry) {
  registry.register('agent:wake_up', async (context) => {
    const agentId = context.agenticId || context.agentId;
    if (!agentId) return context;

    try {
      const { getPersonalityService } = require('../PersonalityService.cjs');
      const personality = getPersonalityService();

      // Force reload personality cache for this agent
      if (personality.invalidateCache) {
        personality.invalidateCache(agentId);
        logger.debug(`[SoulSwapHook] Reloaded personality cache for agent ${agentId}`);
      } else if (personality.cache) {
        // Fallback: manually clear cache entry
        personality.cache.delete(agentId);
        logger.debug(`[SoulSwapHook] Cleared personality cache for agent ${agentId}`);
      }
    } catch (e) {
      logger.debug(`[SoulSwapHook] Personality reload skipped: ${e.message}`);
    }

    return context;
  }, { priority: 50, name: 'SoulSwapHook' });

  logger.info('[SoulSwapHook] Registered for agent:wake_up');
}

module.exports = {
  registerSoulSwapHook,
};
