/**
 * ErrorAnalyzer — Phase 1: Self-Correction Engine
 * ================================================
 * Classifies tool execution errors and determines recovery strategies.
 *
 * Error taxonomy: NETWORK, VALIDATION, PERMISSION, RATE_LIMIT, NOT_FOUND, TIMEOUT, INTERNAL
 * Recovery strategies: retry_backoff, retry_delay, adjust_params, try_alternative, escalate, fail_graceful
 *
 * Usage:
 *   const { getErrorAnalyzer } = require('./ErrorAnalyzer.cjs');
 *   const analyzer = getErrorAnalyzer();
 *   const analysis = analyzer.analyze('searchWeb', error, { agentId, attempt: 1 });
 */

const { logger } = require('../logger.cjs');

// Error type constants
const ERROR_TYPES = {
  NETWORK: 'NETWORK',
  VALIDATION: 'VALIDATION',
  PERMISSION: 'PERMISSION',
  RATE_LIMIT: 'RATE_LIMIT',
  NOT_FOUND: 'NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  INTERNAL: 'INTERNAL',
  UNKNOWN: 'UNKNOWN',
};

// Recovery strategy constants
const STRATEGIES = {
  RETRY_BACKOFF: 'retry_backoff',
  RETRY_DELAY: 'retry_delay',
  ADJUST_PARAMS: 'adjust_params',
  TRY_ALTERNATIVE: 'try_alternative',
  ESCALATE: 'escalate',
  FAIL_GRACEFUL: 'fail_graceful',
};

class ErrorAnalyzer {
  constructor() {
    // Error patterns → error type mapping
    this.errorPatterns = [
      // Network errors
      { pattern: /ECONNREFUSED/i, type: ERROR_TYPES.NETWORK, recoverable: true },
      { pattern: /ECONNRESET/i, type: ERROR_TYPES.NETWORK, recoverable: true },
      { pattern: /ENOTFOUND/i, type: ERROR_TYPES.NETWORK, recoverable: true },
      { pattern: /ETIMEDOUT/i, type: ERROR_TYPES.TIMEOUT, recoverable: true },
      { pattern: /ESOCKETTIMEDOUT/i, type: ERROR_TYPES.TIMEOUT, recoverable: true },
      { pattern: /network\s*(error|failure)/i, type: ERROR_TYPES.NETWORK, recoverable: true },
      { pattern: /fetch failed/i, type: ERROR_TYPES.NETWORK, recoverable: true },
      { pattern: /connection refused/i, type: ERROR_TYPES.NETWORK, recoverable: true },
      { pattern: /socket hang up/i, type: ERROR_TYPES.NETWORK, recoverable: true },

      // Rate limiting
      { pattern: /429/i, type: ERROR_TYPES.RATE_LIMIT, recoverable: true },
      { pattern: /rate.?limit/i, type: ERROR_TYPES.RATE_LIMIT, recoverable: true },
      { pattern: /too many requests/i, type: ERROR_TYPES.RATE_LIMIT, recoverable: true },
      { pattern: /quota exceeded/i, type: ERROR_TYPES.RATE_LIMIT, recoverable: true },
      { pattern: /throttl/i, type: ERROR_TYPES.RATE_LIMIT, recoverable: true },

      // Timeout
      { pattern: /timeout/i, type: ERROR_TYPES.TIMEOUT, recoverable: true },
      { pattern: /timed?\s*out/i, type: ERROR_TYPES.TIMEOUT, recoverable: true },
      { pattern: /deadline exceeded/i, type: ERROR_TYPES.TIMEOUT, recoverable: true },

      // Not found
      { pattern: /not found/i, type: ERROR_TYPES.NOT_FOUND, recoverable: false },
      { pattern: /404/i, type: ERROR_TYPES.NOT_FOUND, recoverable: false },
      { pattern: /no results/i, type: ERROR_TYPES.NOT_FOUND, recoverable: false },
      { pattern: /does not exist/i, type: ERROR_TYPES.NOT_FOUND, recoverable: false },
      { pattern: /could not find/i, type: ERROR_TYPES.NOT_FOUND, recoverable: false },

      // Permission
      { pattern: /permission denied/i, type: ERROR_TYPES.PERMISSION, recoverable: false },
      { pattern: /unauthorized/i, type: ERROR_TYPES.PERMISSION, recoverable: false },
      { pattern: /forbidden/i, type: ERROR_TYPES.PERMISSION, recoverable: false },
      { pattern: /403/i, type: ERROR_TYPES.PERMISSION, recoverable: false },
      { pattern: /401/i, type: ERROR_TYPES.PERMISSION, recoverable: false },
      { pattern: /access denied/i, type: ERROR_TYPES.PERMISSION, recoverable: false },
      { pattern: /not allowed/i, type: ERROR_TYPES.PERMISSION, recoverable: false },

      // Validation
      { pattern: /invalid/i, type: ERROR_TYPES.VALIDATION, recoverable: false },
      { pattern: /missing.*param/i, type: ERROR_TYPES.VALIDATION, recoverable: false },
      { pattern: /required.*field/i, type: ERROR_TYPES.VALIDATION, recoverable: false },
      { pattern: /bad request/i, type: ERROR_TYPES.VALIDATION, recoverable: false },
      { pattern: /malformed/i, type: ERROR_TYPES.VALIDATION, recoverable: false },

      // Internal
      { pattern: /internal.*error/i, type: ERROR_TYPES.INTERNAL, recoverable: true },
      { pattern: /500/i, type: ERROR_TYPES.INTERNAL, recoverable: true },
      { pattern: /502/i, type: ERROR_TYPES.NETWORK, recoverable: true },
      { pattern: /503/i, type: ERROR_TYPES.NETWORK, recoverable: true },
      { pattern: /504/i, type: ERROR_TYPES.TIMEOUT, recoverable: true },
    ];

    // Tool alternatives for fallback
    this.toolAlternatives = {
      searchWeb: ['ragQuery'],
      ragQuery: ['searchWeb'],
      sendWhatsApp: ['sendEmail', 'sendTelegram'],
      sendEmail: ['sendWhatsApp', 'sendTelegram'],
      sendTelegram: ['sendWhatsApp', 'sendEmail'],
      aiChat: ['aiSummarize'],
      aiSummarize: ['aiChat'],
      aiClassify: ['aiExtract', 'aiChat'],
      aiExtract: ['aiClassify', 'aiChat'],
      searchContacts: ['getConversations'],
      delegateTask: ['sendAgentMessage'],
      sendAgentMessage: ['delegateTask'],
    };

    // Default retry configs by error type
    this.retryConfigs = {
      [ERROR_TYPES.NETWORK]: { maxRetries: 2, baseDelay: 1000, backoffMultiplier: 2 },
      [ERROR_TYPES.RATE_LIMIT]: { maxRetries: 2, baseDelay: 3000, backoffMultiplier: 3 },
      [ERROR_TYPES.TIMEOUT]: { maxRetries: 1, baseDelay: 2000, backoffMultiplier: 2 },
      [ERROR_TYPES.INTERNAL]: { maxRetries: 1, baseDelay: 1500, backoffMultiplier: 2 },
      [ERROR_TYPES.NOT_FOUND]: { maxRetries: 0, baseDelay: 0, backoffMultiplier: 0 },
      [ERROR_TYPES.PERMISSION]: { maxRetries: 0, baseDelay: 0, backoffMultiplier: 0 },
      [ERROR_TYPES.VALIDATION]: { maxRetries: 0, baseDelay: 0, backoffMultiplier: 0 },
      [ERROR_TYPES.UNKNOWN]: { maxRetries: 1, baseDelay: 1000, backoffMultiplier: 2 },
    };
  }

  /**
   * Analyze a tool execution error and determine recovery strategy.
   *
   * @param {string} toolName - The tool that failed
   * @param {string|Error} error - The error message or Error object
   * @param {Object} context - { agentId, attempt, maxAttempts }
   * @returns {{ errorType, recoverable, strategy, alternatives, suggestion, retryConfig }}
   */
  analyze(toolName, error, context = {}) {
    const errorStr = typeof error === 'string' ? error : (error?.message || String(error));
    const attempt = context.attempt || 1;

    // Classify the error
    const errorType = this._classifyError(errorStr);
    const retryConfig = this.retryConfigs[errorType] || this.retryConfigs[ERROR_TYPES.UNKNOWN];
    const alternatives = this.toolAlternatives[toolName] || [];

    // Determine recovery strategy
    let strategy = STRATEGIES.FAIL_GRACEFUL;
    let recoverable = false;
    let suggestion = '';

    if (errorType === ERROR_TYPES.NETWORK || errorType === ERROR_TYPES.INTERNAL) {
      if (attempt <= retryConfig.maxRetries) {
        strategy = STRATEGIES.RETRY_BACKOFF;
        recoverable = true;
        suggestion = `Retry ${toolName} with exponential backoff (attempt ${attempt}/${retryConfig.maxRetries})`;
      } else if (alternatives.length > 0) {
        strategy = STRATEGIES.TRY_ALTERNATIVE;
        recoverable = true;
        suggestion = `Try alternative tool: ${alternatives[0]}`;
      } else {
        suggestion = `${toolName} failed after ${attempt} attempts with ${errorType}. No alternatives available.`;
      }
    } else if (errorType === ERROR_TYPES.RATE_LIMIT) {
      if (attempt <= retryConfig.maxRetries) {
        strategy = STRATEGIES.RETRY_DELAY;
        recoverable = true;
        suggestion = `Rate limited — wait ${retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1)}ms before retry`;
      } else if (alternatives.length > 0) {
        strategy = STRATEGIES.TRY_ALTERNATIVE;
        recoverable = true;
        suggestion = `Rate limit exceeded for ${toolName}. Try: ${alternatives[0]}`;
      }
    } else if (errorType === ERROR_TYPES.TIMEOUT) {
      if (attempt <= retryConfig.maxRetries) {
        strategy = STRATEGIES.RETRY_BACKOFF;
        recoverable = true;
        suggestion = `${toolName} timed out. Retrying with longer timeout.`;
      } else if (alternatives.length > 0) {
        strategy = STRATEGIES.TRY_ALTERNATIVE;
        recoverable = true;
        suggestion = `${toolName} keeps timing out. Try: ${alternatives[0]}`;
      }
    } else if (errorType === ERROR_TYPES.NOT_FOUND) {
      if (alternatives.length > 0) {
        strategy = STRATEGIES.TRY_ALTERNATIVE;
        recoverable = true;
        suggestion = `${toolName} returned not found. Try searching with: ${alternatives[0]}`;
      } else {
        suggestion = `${toolName}: resource not found. Verify the parameters and try a different approach.`;
      }
    } else if (errorType === ERROR_TYPES.VALIDATION) {
      strategy = STRATEGIES.ADJUST_PARAMS;
      suggestion = `${toolName} rejected parameters. Check required fields and data types.`;
    } else if (errorType === ERROR_TYPES.PERMISSION) {
      strategy = STRATEGIES.ESCALATE;
      suggestion = `${toolName} requires permissions not available. Consider requesting approval or using an alternative approach.`;
    }

    const analysis = {
      errorType,
      recoverable,
      strategy,
      alternatives,
      suggestion,
      retryConfig: {
        ...retryConfig,
        delay: retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, Math.max(0, attempt - 1)),
      },
      originalError: errorStr.substring(0, 500),
    };

    logger.debug(`[ErrorAnalyzer] ${toolName}: ${errorType} → ${strategy} (attempt ${attempt}, recoverable=${recoverable})`);
    return analysis;
  }

  /**
   * Get alternative tools for a given tool.
   * @param {string} toolName
   * @returns {string[]}
   */
  getAlternatives(toolName) {
    return this.toolAlternatives[toolName] || [];
  }

  /**
   * Phase 7: Suggest parameter adjustments for recoverable errors.
   * Returns adjusted params or null if no adjustment possible.
   *
   * @param {string} toolName - The tool that failed
   * @param {Object} params - Original parameters
   * @param {string} errorType - Classified error type
   * @returns {Object|null} Adjusted params or null
   */
  suggestParamAdjustment(toolName, params, errorType) {
    if (!params || typeof params !== 'object') return null;
    const adjusted = { ...params };
    let changed = false;

    if (errorType === ERROR_TYPES.NOT_FOUND) {
      // Shorten query — keep first 3 words
      if (adjusted.query && typeof adjusted.query === 'string' && adjusted.query.split(/\s+/).length > 3) {
        adjusted.query = adjusted.query.split(/\s+/).slice(0, 3).join(' ');
        changed = true;
      }
      // Increase limit if available
      if (typeof adjusted.limit === 'number' && adjusted.limit < 50) {
        adjusted.limit = Math.min(adjusted.limit * 2, 50);
        changed = true;
      }
      // Increase topK for RAG queries
      if (typeof adjusted.topK === 'number' && adjusted.topK < 20) {
        adjusted.topK = Math.min(adjusted.topK * 2, 20);
        changed = true;
      }
    }

    if (errorType === ERROR_TYPES.VALIDATION) {
      // Truncate long strings
      for (const key of Object.keys(adjusted)) {
        if (typeof adjusted[key] === 'string' && adjusted[key].length > 5000) {
          adjusted[key] = adjusted[key].substring(0, 5000);
          changed = true;
        }
      }
      // Clean recipient format (remove spaces/dashes from phone numbers)
      if (adjusted.to && typeof adjusted.to === 'string') {
        const cleaned = adjusted.to.replace(/[\s\-()]/g, '');
        if (cleaned !== adjusted.to) {
          adjusted.to = cleaned;
          changed = true;
        }
      }
      if (adjusted.recipient && typeof adjusted.recipient === 'string') {
        const cleaned = adjusted.recipient.replace(/[\s\-()]/g, '');
        if (cleaned !== adjusted.recipient) {
          adjusted.recipient = cleaned;
          changed = true;
        }
      }
    }

    return changed ? adjusted : null;
  }

  /**
   * Classify error string into an error type.
   * @private
   */
  _classifyError(errorStr) {
    for (const { pattern, type } of this.errorPatterns) {
      if (pattern.test(errorStr)) {
        return type;
      }
    }
    return ERROR_TYPES.UNKNOWN;
  }
}

// Singleton
let _instance = null;

function getErrorAnalyzer() {
  if (!_instance) {
    _instance = new ErrorAnalyzer();
    logger.info('[ErrorAnalyzer] Initialized');
  }
  return _instance;
}

module.exports = {
  ErrorAnalyzer,
  getErrorAnalyzer,
  ERROR_TYPES,
  STRATEGIES,
};
