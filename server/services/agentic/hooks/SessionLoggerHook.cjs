/**
 * Session Logger Hook
 * ===================
 * Built-in hook that logs all emitted events to the agentic_activity_log table.
 * Runs at lowest priority (999) so it captures the final state after all other hooks.
 *
 * Registered events: reasoning:start, reasoning:end, reasoning:tool_call,
 *   agent:wake_up, message:incoming, heartbeat:ok, heartbeat:miss
 */

const { logger } = require('../../logger.cjs');

const EVENTS_TO_LOG = [
  'reasoning:start',
  'reasoning:end',
  'reasoning:tool_call',
  'agent:wake_up',
  'message:incoming',
  'heartbeat:ok',
  'heartbeat:miss',
];

/**
 * Register all SessionLoggerHook handlers on the given HookRegistry.
 * @param {import('../HookRegistry.cjs').HookRegistry} registry
 */
function registerSessionLoggerHook(registry) {
  for (const eventName of EVENTS_TO_LOG) {
    registry.register(eventName, async (context) => {
      try {
        const { getDatabase } = require('../../database.cjs');
        const db = getDatabase();
        const crypto = require('crypto');

        const agenticId = context.agenticId || context.agentId || null;
        const userId = context.userId || null;

        if (!agenticId) {
          // Skip logging if no agent context
          return context;
        }

        const id = crypto.randomUUID();
        const metadata = {};

        // Capture relevant fields based on event type
        switch (eventName) {
          case 'reasoning:start':
            metadata.trigger = context.trigger;
            metadata.triggerContext = context.triggerContext ? JSON.stringify(context.triggerContext).substring(0, 500) : null;
            break;
          case 'reasoning:end':
            metadata.iterations = context.iterations;
            metadata.tokensUsed = context.tokensUsed;
            metadata.actionsCount = context.actions?.length || 0;
            metadata.silent = context.silent || false;
            break;
          case 'reasoning:tool_call':
            metadata.tool = context.tool;
            metadata.success = context.success;
            break;
          case 'agent:wake_up':
            metadata.agentCount = context.agentCount;
            metadata.platformCount = context.platformCount;
            break;
          case 'message:incoming':
            metadata.platform = context.platform;
            metadata.sender = context.sender;
            metadata.isGroup = context.isGroup;
            break;
          case 'heartbeat:ok':
          case 'heartbeat:miss':
            metadata.missCount = context.missCount;
            metadata.lastOk = context.lastOk;
            break;
        }

        db.prepare(`
          INSERT INTO agentic_activity_log (
            id, agentic_id, user_id, activity_type, activity_description,
            trigger_type, status, metadata, created_at
          ) VALUES (?, ?, ?, ?, ?, 'hook', 'success', ?, datetime('now'))
        `).run(
          id,
          agenticId,
          userId,
          `hook:${eventName}`,
          `Event: ${eventName}`,
          JSON.stringify(metadata),
        );
      } catch (e) {
        // Never fail - just log
        logger.debug(`[SessionLoggerHook] Failed to log ${eventName}: ${e.message}`);
      }

      // Pass context through unmodified
      return context;
    }, { priority: 999, name: 'SessionLoggerHook' });
  }

  logger.info(`[SessionLoggerHook] Registered for ${EVENTS_TO_LOG.length} events`);
}

module.exports = {
  registerSessionLoggerHook,
};
