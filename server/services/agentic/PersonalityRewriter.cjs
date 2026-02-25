/**
 * PersonalityRewriter
 *
 * Centralized utility to apply agent personality to any raw text output.
 * Uses PersonalityService for the system prompt and SuperBrainRouter
 * for LLM rewriting. Includes caching, fallback, and cost optimization.
 */

const { getPersonalityService } = require('./PersonalityService.cjs');
const { logger } = require('../logger.cjs');

// In-memory cache: key = hash(profileId + rawText) -> rewritten text
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX = 200;

// Context hints for different notification types
const CONTEXT_HINTS = {
  notification: 'This is a notification message to the user.',
  email_notification: 'This is a notification about a new incoming email. Summarize it naturally.',
  task_update: 'This is an update about a task status change.',
  health_report: 'This is a system health/status summary report.',
  daily_report: 'This is a daily activity report.',
  health_check: 'This is a periodic system health check update.',
  approval_request: 'This is an approval request requiring user action.',
  error_alert: 'This is a critical error alert - maintain urgency.',
  budget_warning: 'This is a budget usage warning.',
  startup: 'This is a startup/initialization announcement.',
  report: 'This is a generated report.',
};

// Map notification types to context keys
const TYPE_TO_CONTEXT = {
  new_email: 'email_notification',
  task_completed: 'task_update',
  task_failed: 'error_alert',
  critical_error: 'error_alert',
  agent_status_change: 'notification',
  platform_disconnect: 'error_alert',
  platform_connect: 'notification',
  daily_report: 'daily_report',
  health_check: 'health_check',
  health_summary: 'health_check',
  weekly_report: 'daily_report',
  approval_needed: 'approval_request',
  approval_reminder: 'approval_request',
  budget_warning: 'budget_warning',
  budget_exceeded: 'budget_warning',
  startup: 'startup',
  test: 'notification',
  out_of_scope: 'notification',
};

/**
 * Apply agent personality to raw text.
 *
 * @param {Object} options
 * @param {string} options.profileId  - Agentic profile ID (for personality lookup)
 * @param {string} options.userId     - User ID (for SuperBrain routing / rate limits)
 * @param {string} options.rawText    - The original static text to rewrite
 * @param {string} options.context    - What kind of output (e.g. 'notification', 'email_notification')
 * @param {string} [options.notificationType] - Notification type (auto-maps to context if context not provided)
 * @param {string} [options.tier='trivial'] - Force tier for cost control
 * @param {boolean} [options.useCache=true] - Whether to use cache
 * @returns {Promise<string>} Rewritten text, or rawText on failure
 */
async function applyPersonality({ profileId, userId, rawText, context, notificationType, tier = 'trivial', useCache = true }) {
  // Guard: missing args or very short text
  if (!profileId || !userId || !rawText || rawText.length < 10) {
    return rawText;
  }

  // Resolve context from notification type if not explicitly provided
  const resolvedContext = context || TYPE_TO_CONTEXT[notificationType] || 'notification';

  try {
    // 1. Check cache
    const cacheKey = `${profileId}:${simpleHash(rawText)}`;
    if (useCache && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.ts < CACHE_TTL) {
        logger.debug('PersonalityRewriter: cache hit');
        return cached.text;
      }
      cache.delete(cacheKey);
    }

    // 2. Get personality - check if any custom personality is set
    const personalityService = getPersonalityService();
    let personality;
    try {
      personality = personalityService.getPersonality(profileId);
    } catch (e) {
      // Profile not found or no personality columns yet
      logger.debug(`PersonalityRewriter: no personality for ${profileId}: ${e.message}`);
      return rawText;
    }

    const hasAnyCustom = personality.hasCustom && Object.values(personality.hasCustom).some(v => v);
    if (!hasAnyCustom) {
      // No custom personality configured - skip AI call
      return rawText;
    }

    // 3. Generate system prompt from personality files
    const systemPrompt = personalityService.generateSystemPrompt(profileId);
    if (!systemPrompt) {
      return rawText;
    }

    // 4. Build rewrite instruction
    const rewriteInstruction = buildRewritePrompt(rawText, resolvedContext);

    // 5. Get SuperBrainRouter (lazy require to avoid circular deps at startup)
    const { getSuperBrainRouter } = require('../ai/SuperBrainRouter.cjs');
    const superBrain = getSuperBrainRouter();
    if (!superBrain) {
      logger.debug('PersonalityRewriter: SuperBrain not available');
      return rawText;
    }

    // 6. Call SuperBrain with low-cost tier
    const result = await superBrain.process({
      task: rewriteInstruction,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rewriteInstruction },
      ],
      userId,
      forceTier: tier,
    }, {
      temperature: 0.4,
      maxTokens: 500,
    });

    const rewritten = (result.content || result.response || '').trim();
    if (!rewritten || rewritten.length < 5) {
      logger.debug('PersonalityRewriter: AI returned empty/short result, using original');
      return rawText;
    }

    // 7. Cache result
    if (useCache) {
      if (cache.size >= CACHE_MAX) {
        // Evict oldest entry
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      cache.set(cacheKey, { text: rewritten, ts: Date.now() });
    }

    logger.debug(`PersonalityRewriter: rewrote ${resolvedContext} (${rawText.length} -> ${rewritten.length} chars)`);
    return rewritten;

  } catch (error) {
    // Graceful fallback: return original text
    logger.warn(`PersonalityRewriter failed (${resolvedContext}): ${error.message}`);
    return rawText;
  }
}

/**
 * Build the rewrite prompt for the AI.
 */
function buildRewritePrompt(rawText, context) {
  const hint = CONTEXT_HINTS[context] || 'This is a system-generated message.';

  return `Rewrite the following message in your own voice and personality style.

RULES:
- Keep ALL data, numbers, names, timestamps, and facts EXACTLY as they are
- Do NOT add information that is not in the original
- Do NOT remove any data points
- Make it feel like YOU are personally delivering this update
- Keep it concise - similar length to the original (not longer)
- Match the urgency level of the original
- Use natural language, not bullet points or raw data dumps
- ${hint}

ORIGINAL MESSAGE:
${rawText}

YOUR VERSION:`;
}

/**
 * Simple string hash for cache keys (non-cryptographic, just for dedup).
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Clear the rewrite cache.
 */
function clearCache() {
  cache.clear();
  logger.debug('PersonalityRewriter: cache cleared');
}

module.exports = {
  applyPersonality,
  clearCache,
  TYPE_TO_CONTEXT,
};
