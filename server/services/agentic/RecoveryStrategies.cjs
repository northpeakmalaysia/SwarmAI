/**
 * RecoveryStrategies — Phase 1: Self-Correction Engine
 * =====================================================
 * Wraps tool execution with automatic error recovery.
 *
 * Flow: attempt → if fail, analyze → if recoverable, retry with backoff →
 *       if still fail, try alternatives → return enriched result
 *
 * Usage:
 *   const { getRecoveryStrategies } = require('./RecoveryStrategies.cjs');
 *   const recovery = getRecoveryStrategies();
 *   const result = await recovery.executeWithRecovery(executeTool, 'searchWeb', params, context);
 */

const { logger } = require('../logger.cjs');
const { getErrorAnalyzer, STRATEGIES } = require('./ErrorAnalyzer.cjs');

class RecoveryStrategies {
  constructor() {
    this.maxTotalAttempts = 3; // Max total attempts including retries + alternatives
  }

  /**
   * Execute a tool with automatic recovery on failure.
   *
   * @param {Function} executeTool - async (toolName, params, context) => { success, result, error }
   * @param {string} toolName - Tool to execute
   * @param {Object} params - Tool parameters
   * @param {Object} context - Execution context { agenticId, userId, ... }
   * @returns {{ success, result, error, recoveryApplied, attempts, recovery?, usedAlternativeTool? }}
   */
  async executeWithRecovery(executeTool, toolName, params, context = {}) {
    const analyzer = getErrorAnalyzer();
    let attempt = 0;
    let lastError = null;
    let recoveryApplied = false;
    let usedAlternativeTool = null;

    // Phase 7: Idempotency check — prevent duplicate side-effect execution
    try {
      const { getIdempotencyService } = require('./IdempotencyService.cjs');
      const idempotency = getIdempotencyService();
      const cached = idempotency.checkDuplicate(context.agenticId, toolName, params);
      if (cached) {
        logger.info(`[Recovery] Idempotency hit for ${toolName} — returning cached result`);
        return { ...cached, recoveryApplied: false, attempts: 0 };
      }
      // Mark as pending before first attempt
      idempotency.recordPending(context.agenticId, toolName, params);
    } catch (idErr) { /* idempotency is best-effort */ }

    // Attempt 1: Original tool
    attempt++;
    const firstResult = await this._safeExecute(executeTool, toolName, params, context);

    if (firstResult.success) {
      // Phase 7: Record successful result for idempotency
      try {
        const { getIdempotencyService } = require('./IdempotencyService.cjs');
        getIdempotencyService().recordComplete(context.agenticId, toolName, params, firstResult);
      } catch (idErr) { /* best-effort */ }

      return {
        ...firstResult,
        recoveryApplied: false,
        attempts: attempt,
      };
    }

    // First attempt failed — analyze the error
    lastError = firstResult.error;
    const analysis = analyzer.analyze(toolName, lastError, { agentId: context.agenticId, attempt });

    if (!analysis.recoverable) {
      // Not recoverable — return with error analysis
      return {
        ...firstResult,
        recoveryApplied: false,
        attempts: attempt,
        recovery: {
          errorType: analysis.errorType,
          strategy: analysis.strategy,
          suggestion: analysis.suggestion,
          alternatives: analysis.alternatives,
        },
      };
    }

    // Strategy: retry with backoff
    if (analysis.strategy === STRATEGIES.RETRY_BACKOFF || analysis.strategy === STRATEGIES.RETRY_DELAY) {
      const delay = analysis.retryConfig.delay || 1000;
      logger.info(`[Recovery] ${toolName}: ${analysis.strategy} — waiting ${delay}ms (attempt ${attempt})`);
      await this._sleep(delay);

      attempt++;
      const retryResult = await this._safeExecute(executeTool, toolName, params, context);

      if (retryResult.success) {
        // Phase 7: Record successful retry for idempotency
        try {
          const { getIdempotencyService } = require('./IdempotencyService.cjs');
          getIdempotencyService().recordComplete(context.agenticId, toolName, params, retryResult);
        } catch (idErr) { /* best-effort */ }

        return {
          ...retryResult,
          recoveryApplied: true,
          attempts: attempt,
          recovery: {
            errorType: analysis.errorType,
            strategy: analysis.strategy,
            retriedAfterMs: delay,
          },
        };
      }

      lastError = retryResult.error;
      recoveryApplied = true;
    }

    // Phase 7: Strategy: adjust parameters and retry
    if (attempt < this.maxTotalAttempts) {
      const adjustedParams = analyzer.suggestParamAdjustment(toolName, params, analysis.errorType);
      if (adjustedParams) {
        attempt++;
        logger.info(`[Recovery] ${toolName}: trying adjusted params (attempt ${attempt})`);
        const adjustedResult = await this._safeExecute(executeTool, toolName, adjustedParams, context);

        if (adjustedResult.success) {
          // Record idempotency for adjusted params too
          try {
            const { getIdempotencyService } = require('./IdempotencyService.cjs');
            getIdempotencyService().recordComplete(context.agenticId, toolName, params, adjustedResult);
          } catch (idErr) { /* best-effort */ }

          return {
            ...adjustedResult,
            recoveryApplied: true,
            attempts: attempt,
            recovery: {
              errorType: analysis.errorType,
              strategy: STRATEGIES.ADJUST_PARAMS,
              adjustedParams: Object.keys(adjustedParams),
            },
          };
        }
        lastError = adjustedResult.error;
        recoveryApplied = true;
      }
    }

    // Strategy: try alternative tool
    if (attempt < this.maxTotalAttempts && analysis.alternatives.length > 0) {
      for (const altTool of analysis.alternatives) {
        if (attempt >= this.maxTotalAttempts) break;

        attempt++;
        logger.info(`[Recovery] ${toolName} failed — trying alternative: ${altTool} (attempt ${attempt})`);

        // Map params to alternative tool (best-effort, keep same params)
        const altParams = this._mapParamsToAlternative(toolName, altTool, params);
        const altResult = await this._safeExecute(executeTool, altTool, altParams, context);

        if (altResult.success) {
          return {
            ...altResult,
            recoveryApplied: true,
            attempts: attempt,
            usedAlternativeTool: altTool,
            recovery: {
              errorType: analysis.errorType,
              strategy: STRATEGIES.TRY_ALTERNATIVE,
              originalTool: toolName,
              alternativeTool: altTool,
            },
          };
        }

        lastError = altResult.error;
      }
    }

    // All recovery attempts exhausted
    logger.warn(`[Recovery] ${toolName}: all ${attempt} attempts exhausted. Final error: ${lastError}`);
    return {
      success: false,
      result: null,
      error: lastError,
      recoveryApplied,
      attempts: attempt,
      recovery: {
        errorType: analysis.errorType,
        strategy: 'exhausted',
        suggestion: analysis.suggestion,
        alternatives: analysis.alternatives,
        totalAttempts: attempt,
      },
    };
  }

  /**
   * Safe execution wrapper — catches thrown errors.
   * @private
   */
  async _safeExecute(executeTool, toolName, params, context) {
    try {
      return await executeTool(toolName, params, context);
    } catch (error) {
      return {
        success: false,
        result: null,
        error: error.message || String(error),
      };
    }
  }

  /**
   * Map parameters from one tool to an alternative.
   * Best-effort: keeps matching param names and adds defaults for the alternative.
   * @private
   */
  _mapParamsToAlternative(originalTool, altTool, params) {
    const mapped = { ...params };

    // searchWeb → ragQuery: map 'query' to 'query' (same field name)
    if (originalTool === 'searchWeb' && altTool === 'ragQuery') {
      // ragQuery uses 'query' just like searchWeb — no mapping needed
      return mapped;
    }

    // ragQuery → searchWeb: same field
    if (originalTool === 'ragQuery' && altTool === 'searchWeb') {
      return mapped;
    }

    // sendWhatsApp → sendEmail: map 'to' phone to email if available
    if (originalTool === 'sendWhatsApp' && altTool === 'sendEmail') {
      // Keep message/body, but contact will need to be resolved by the tool executor
      if (mapped.message && !mapped.body) mapped.body = mapped.message;
      if (mapped.subject == null) mapped.subject = 'Message from your AI assistant';
      return mapped;
    }

    // sendEmail → sendWhatsApp: map body to message
    if (originalTool === 'sendEmail' && altTool === 'sendWhatsApp') {
      if (mapped.body && !mapped.message) mapped.message = mapped.body;
      return mapped;
    }

    // Default: return params as-is (best-effort)
    return mapped;
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton
let _instance = null;

function getRecoveryStrategies() {
  if (!_instance) {
    _instance = new RecoveryStrategies();
    logger.info('[RecoveryStrategies] Initialized');
  }
  return _instance;
}

module.exports = {
  RecoveryStrategies,
  getRecoveryStrategies,
};
