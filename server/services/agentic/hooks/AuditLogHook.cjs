/**
 * Audit Log Hook
 * ==============
 * HookRegistry hook that captures existing events and writes transparent
 * audit log entries via AuditLogService.
 *
 * Listens to:
 *   message:incoming  → audit:incoming
 *   reasoning:start   → audit:reasoning_start
 *   reasoning:end     → audit:reasoning_think (final summary)
 *   reasoning:tool_call → audit:tool_call + audit:tool_result
 *
 * Priority 900 (before SessionLoggerHook at 999).
 */

const { logger } = require('../../logger.cjs');

/**
 * Register all AuditLogHook handlers on the given HookRegistry.
 * @param {import('../HookRegistry.cjs').HookRegistry} registry
 */
function registerAuditLogHook(registry) {
  const { getAuditLogService } = require('../AuditLogService.cjs');
  const auditLog = getAuditLogService();

  // --- message:incoming → audit:incoming ---
  registry.register('message:incoming', async (context) => {
    try {
      const agenticId = context.agenticId || context.agentId;
      const userId = context.userId;
      if (!agenticId) return context;

      auditLog.log(agenticId, userId, 'incoming', 'INBOUND', {
        platform: context.platform || 'unknown',
        sender: context.sender || context.from || 'unknown',
        preview: (context.content || context.message || '').substring(0, 200),
        isGroup: context.isGroup || false,
        conversationId: context.conversationId || null,
      });
    } catch (e) {
      logger.debug(`[AuditLogHook] message:incoming failed: ${e.message}`);
    }
    return context;
  }, { priority: 900, name: 'AuditLogHook' });

  // --- reasoning:start → audit:reasoning_start ---
  registry.register('reasoning:start', async (context) => {
    try {
      const agenticId = context.agenticId || context.agentId;
      const userId = context.userId;
      if (!agenticId) return context;

      auditLog.log(agenticId, userId, 'reasoning_start', 'INTERNAL', {
        trigger: context.trigger || 'unknown',
        tier: context.tier || null,
        triggerContext: context.triggerContext
          ? JSON.stringify(context.triggerContext).substring(0, 300)
          : null,
      });
    } catch (e) {
      logger.debug(`[AuditLogHook] reasoning:start failed: ${e.message}`);
    }
    return context;
  }, { priority: 900, name: 'AuditLogHook' });

  // --- reasoning:end → audit:reasoning_think ---
  registry.register('reasoning:end', async (context) => {
    try {
      const agenticId = context.agenticId || context.agentId;
      const userId = context.userId;
      if (!agenticId) return context;

      auditLog.log(agenticId, userId, 'reasoning_think', 'INTERNAL', {
        iterations: context.iterations || 0,
        tokensUsed: context.tokensUsed || 0,
        actionsCount: context.actions?.length || 0,
        silent: context.silent || false,
        finalThought: (context.finalThought || '').substring(0, 300),
      });
    } catch (e) {
      logger.debug(`[AuditLogHook] reasoning:end failed: ${e.message}`);
    }
    return context;
  }, { priority: 900, name: 'AuditLogHook' });

  // --- reasoning:tool_call → audit:tool_call + audit:tool_result ---
  registry.register('reasoning:tool_call', async (context) => {
    try {
      const agenticId = context.agenticId || context.agentId;
      const userId = context.userId;
      if (!agenticId) return context;

      // Log tool call
      auditLog.log(agenticId, userId, 'tool_call', 'INTERNAL', {
        toolName: context.tool || 'unknown',
        paramsPreview: context.params
          ? JSON.stringify(context.params).substring(0, 200)
          : '',
      });

      // Log tool result (if available in same event)
      if (context.success !== undefined) {
        auditLog.log(agenticId, userId, 'tool_result', 'INTERNAL', {
          toolName: context.tool || 'unknown',
          success: context.success,
          error: context.error || null,
          resultPreview: context.result
            ? String(context.result).substring(0, 200)
            : null,
        });
      }
    } catch (e) {
      logger.debug(`[AuditLogHook] reasoning:tool_call failed: ${e.message}`);
    }
    return context;
  }, { priority: 900, name: 'AuditLogHook' });

  logger.info('[AuditLogHook] Registered for 4 events (priority 900)');
}

module.exports = { registerAuditLogHook };
