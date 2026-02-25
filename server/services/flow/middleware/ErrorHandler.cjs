/**
 * Error Handler Middleware
 *
 * Centralized error handling for flow execution with:
 * - Configurable error strategies (retry, fallback, skip, stop)
 * - Exponential backoff for retries
 * - Error categorization and recovery assessment
 */

const { logger } = require('../../logger.cjs');

/**
 * Error handling strategies
 */
const ErrorStrategy = {
  RETRY: 'retry',       // Retry the node with backoff
  FALLBACK: 'fallback', // Execute fallback node
  SKIP: 'skip',         // Skip the node and continue
  STOP: 'stop'          // Stop execution with error
};

/**
 * Backoff strategies for retries
 */
const BackoffStrategy = {
  CONSTANT: 'constant',       // Same delay each time
  LINEAR: 'linear',           // Delay increases linearly
  EXPONENTIAL: 'exponential'  // Delay doubles each time
};

/**
 * Error categories for classification
 */
const ErrorCategory = {
  TRANSIENT: 'transient',     // Temporary errors (network, rate limit)
  PERMANENT: 'permanent',     // Permanent errors (auth, not found)
  TIMEOUT: 'timeout',         // Timeout errors
  VALIDATION: 'validation',   // Input validation errors
  INTERNAL: 'internal'        // Internal system errors
};

/**
 * FlowErrorHandler provides centralized error handling for flow execution.
 */
class FlowErrorHandler {
  /**
   * @param {Object} [options] - Handler configuration
   * @param {string} [options.defaultStrategy='stop'] - Default error strategy
   * @param {number} [options.maxRetries=3] - Maximum retry attempts
   * @param {string} [options.backoffStrategy='exponential'] - Backoff strategy
   * @param {number} [options.baseDelay=1000] - Base delay in ms for retries
   * @param {number} [options.maxDelay=30000] - Maximum delay in ms
   */
  constructor(options = {}) {
    this.defaultStrategy = options.defaultStrategy || ErrorStrategy.STOP;
    this.maxRetries = options.maxRetries || 3;
    this.backoffStrategy = options.backoffStrategy || BackoffStrategy.EXPONENTIAL;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;

    // Error code to category mapping
    this.errorCategories = new Map([
      // Transient errors
      ['TIMEOUT', ErrorCategory.TRANSIENT],
      ['RATE_LIMIT', ErrorCategory.TRANSIENT],
      ['CONNECTION_ERROR', ErrorCategory.TRANSIENT],
      ['SERVICE_UNAVAILABLE', ErrorCategory.TRANSIENT],
      ['NETWORK_ERROR', ErrorCategory.TRANSIENT],

      // Permanent errors
      ['AUTH_ERROR', ErrorCategory.PERMANENT],
      ['NOT_FOUND', ErrorCategory.PERMANENT],
      ['FORBIDDEN', ErrorCategory.PERMANENT],
      ['INVALID_CONFIG', ErrorCategory.PERMANENT],

      // Timeout errors
      ['EXECUTION_TIMEOUT', ErrorCategory.TIMEOUT],
      ['BRANCH_TIMEOUT', ErrorCategory.TIMEOUT],
      ['NODE_TIMEOUT', ErrorCategory.TIMEOUT],

      // Validation errors
      ['VALIDATION_ERROR', ErrorCategory.VALIDATION],
      ['MISSING_REQUIRED', ErrorCategory.VALIDATION],
      ['INVALID_INPUT', ErrorCategory.VALIDATION],

      // Internal errors
      ['EXECUTION_ERROR', ErrorCategory.INTERNAL],
      ['INTERNAL_ERROR', ErrorCategory.INTERNAL]
    ]);
  }

  /**
   * Handle a node execution error
   *
   * @param {Error} error - The error that occurred
   * @param {Object} node - The node that failed
   * @param {ExecutionContext} context - Execution context
   * @param {number} [retryCount=0] - Current retry count
   * @returns {Promise<Object>} Action to take
   */
  async handleNodeError(error, node, context, retryCount = 0) {
    const nodeConfig = node.data?.errorHandling || {};
    const strategy = nodeConfig.strategy || this.defaultStrategy;
    const errorCategory = this.categorizeError(error);

    logger.error(`Node error [${node.id}]: ${error.message}`, {
      nodeId: node.id,
      nodeType: node.type,
      errorCode: error.code,
      errorCategory,
      retryCount
    });

    // Check if error is recoverable
    const isRecoverable = this.isRecoverable(error, errorCategory);

    switch (strategy) {
      case ErrorStrategy.RETRY:
        if (isRecoverable) {
          return this.handleRetry(error, node, context, retryCount, nodeConfig);
        }
        // Not recoverable, fall through to fallback or stop
        if (nodeConfig.fallbackNodeId) {
          return this.handleFallback(error, node, context, nodeConfig);
        }
        return this.handleStop(error, node);

      case ErrorStrategy.FALLBACK:
        return this.handleFallback(error, node, context, nodeConfig);

      case ErrorStrategy.SKIP:
        return this.handleSkip(error, node, context);

      case ErrorStrategy.STOP:
      default:
        return this.handleStop(error, node);
    }
  }

  /**
   * Handle retry strategy
   * @private
   */
  async handleRetry(error, node, context, retryCount, config) {
    const maxRetries = config.maxRetries || this.maxRetries;

    if (retryCount >= maxRetries) {
      logger.warn(`Max retries reached for node ${node.id}`);

      // Escalate to fallback or stop
      if (config.fallbackNodeId) {
        return this.handleFallback(error, node, context, config);
      }
      return this.handleStop(error, node);
    }

    const delay = this.calculateBackoff(retryCount, config);

    logger.info(`Retrying node ${node.id} in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);

    // Wait for backoff delay
    await this.sleep(delay);

    return {
      action: 'retry',
      retryCount: retryCount + 1,
      delay,
      continueExecution: true
    };
  }

  /**
   * Handle fallback strategy
   * @private
   */
  handleFallback(error, node, context, config) {
    if (!config.fallbackNodeId) {
      logger.warn(`No fallback node configured for ${node.id}`);
      return this.handleStop(error, node);
    }

    const fallbackNode = context.getNode(config.fallbackNodeId);
    if (!fallbackNode) {
      logger.error(`Fallback node not found: ${config.fallbackNodeId}`);
      return this.handleStop(error, node);
    }

    logger.info(`Redirecting to fallback node: ${config.fallbackNodeId}`);

    return {
      action: 'redirect',
      targetNodeId: config.fallbackNodeId,
      originalError: {
        code: error.code || 'EXECUTION_ERROR',
        message: error.message,
        nodeId: node.id
      },
      continueExecution: true
    };
  }

  /**
   * Handle skip strategy
   * @private
   */
  handleSkip(error, node, context) {
    logger.warn(`Skipping node ${node.id} due to error: ${error.message}`);

    return {
      action: 'skip',
      skippedNodeId: node.id,
      error: {
        code: error.code || 'EXECUTION_ERROR',
        message: error.message
      },
      output: {
        skipped: true,
        reason: error.message
      },
      continueExecution: true
    };
  }

  /**
   * Handle stop strategy
   * @private
   */
  handleStop(error, node) {
    return {
      action: 'stop',
      error: {
        code: error.code || 'EXECUTION_ERROR',
        message: error.message,
        nodeId: node.id,
        nodeType: node.type
      },
      continueExecution: false
    };
  }

  /**
   * Categorize an error based on its code
   * @param {Error} error
   * @returns {string}
   */
  categorizeError(error) {
    const code = error.code || 'EXECUTION_ERROR';
    return this.errorCategories.get(code) || ErrorCategory.INTERNAL;
  }

  /**
   * Check if an error is recoverable
   * @param {Error} error
   * @param {string} category
   * @returns {boolean}
   */
  isRecoverable(error, category) {
    // Check explicit recoverable flag
    if (error.recoverable !== undefined) {
      return error.recoverable;
    }

    // Transient and timeout errors are recoverable
    return category === ErrorCategory.TRANSIENT || category === ErrorCategory.TIMEOUT;
  }

  /**
   * Calculate backoff delay
   * @param {number} retryCount
   * @param {Object} config
   * @returns {number}
   */
  calculateBackoff(retryCount, config) {
    const baseDelay = config.baseDelay || this.baseDelay;
    const strategy = config.backoffStrategy || this.backoffStrategy;
    let delay;

    switch (strategy) {
      case BackoffStrategy.CONSTANT:
        delay = baseDelay;
        break;
      case BackoffStrategy.LINEAR:
        delay = baseDelay * (retryCount + 1);
        break;
      case BackoffStrategy.EXPONENTIAL:
      default:
        delay = baseDelay * Math.pow(2, retryCount);
    }

    // Add jitter (0-10% random)
    const jitter = delay * Math.random() * 0.1;
    delay = Math.floor(delay + jitter);

    // Cap at max delay
    return Math.min(delay, this.maxDelay);
  }

  /**
   * Sleep for specified duration
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create error result for a node
   * @param {Error} error
   * @param {Object} node
   * @returns {Object}
   */
  createErrorResult(error, node) {
    return {
      success: false,
      output: {},
      error: {
        code: error.code || 'EXECUTION_ERROR',
        message: error.message,
        recoverable: error.recoverable || false,
        nodeId: node.id,
        nodeType: node.type
      },
      continueExecution: false
    };
  }

  /**
   * Wrap an async function with error handling
   * @param {Function} fn - Async function to wrap
   * @param {Object} node - Node for context
   * @param {ExecutionContext} context - Execution context
   * @returns {Function}
   */
  wrap(fn, node, context) {
    return async (...args) => {
      let retryCount = 0;

      while (true) {
        try {
          return await fn(...args);
        } catch (error) {
          const action = await this.handleNodeError(error, node, context, retryCount);

          if (action.action === 'retry') {
            retryCount = action.retryCount;
            continue;
          }

          if (action.action === 'skip') {
            return {
              success: true,
              output: action.output,
              continueExecution: true
            };
          }

          if (action.action === 'redirect') {
            return {
              success: true,
              output: action.originalError,
              nextNodes: [action.targetNodeId],
              continueExecution: true
            };
          }

          // Stop
          throw error;
        }
      }
    };
  }
}

// Singleton instance
let handlerInstance = null;

/**
 * Get the FlowErrorHandler singleton
 * @param {Object} [options]
 * @returns {FlowErrorHandler}
 */
function getErrorHandler(options) {
  if (!handlerInstance) {
    handlerInstance = new FlowErrorHandler(options);
  }
  return handlerInstance;
}

module.exports = {
  FlowErrorHandler,
  getErrorHandler,
  ErrorStrategy,
  BackoffStrategy,
  ErrorCategory
};
