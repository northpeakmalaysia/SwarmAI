/**
 * Retry Node
 *
 * Wraps a sequence of nodes with retry logic.
 * Automatically retries on failure with configurable backoff.
 *
 * Features:
 * - Configurable retry count and delay
 * - Multiple backoff strategies (constant, linear, exponential)
 * - Retry on specific error types
 * - Circuit breaker integration
 * - Fallback action on final failure
 * - Retry state tracking
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class RetryNode extends BaseNodeExecutor {
  constructor() {
    super('logic:retry', 'logic');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'logic:retry',
      label: 'Retry',
      description: 'Retry on failure with configurable backoff',
      icon: 'RefreshCw',
      category: 'logic',
      color: 'orange',
      properties: {
        maxRetries: {
          type: 'number',
          label: 'Max Retries',
          description: 'Maximum number of retry attempts',
          default: 3,
          min: 1,
          max: 10
        },
        backoffStrategy: {
          type: 'select',
          label: 'Backoff Strategy',
          description: 'How to increase delay between retries',
          options: [
            { value: 'constant', label: 'Constant - Same delay each time' },
            { value: 'linear', label: 'Linear - Increase by base delay each time' },
            { value: 'exponential', label: 'Exponential - Double delay each time' }
          ],
          default: 'exponential'
        },
        baseDelay: {
          type: 'number',
          label: 'Base Delay (ms)',
          description: 'Initial delay between retries',
          default: 1000,
          min: 100,
          max: 60000
        },
        maxDelay: {
          type: 'number',
          label: 'Max Delay (ms)',
          description: 'Maximum delay between retries',
          default: 30000,
          min: 1000,
          max: 300000
        },
        jitter: {
          type: 'boolean',
          label: 'Add Jitter',
          description: 'Add random variation to delay (prevents thundering herd)',
          default: true
        },
        retryOn: {
          type: 'multiselect',
          label: 'Retry On',
          description: 'Error types to retry on',
          options: [
            { value: 'timeout', label: 'Timeout Errors' },
            { value: 'network', label: 'Network Errors' },
            { value: 'rateLimit', label: 'Rate Limit (429)' },
            { value: 'serverError', label: 'Server Errors (5xx)' },
            { value: 'transient', label: 'Transient Errors' },
            { value: 'all', label: 'All Errors' }
          ],
          default: ['timeout', 'network', 'rateLimit', 'transient']
        },
        noRetryOn: {
          type: 'array',
          label: 'No Retry On',
          description: 'Error codes that should not be retried',
          itemSchema: { type: 'text', label: 'Error Code' }
        },
        onFinalFailure: {
          type: 'select',
          label: 'On Final Failure',
          description: 'Action when all retries are exhausted',
          options: [
            { value: 'fail', label: 'Fail - Stop flow with error' },
            { value: 'continue', label: 'Continue - Use fallback and continue' },
            { value: 'fallback', label: 'Fallback - Execute fallback branch' }
          ],
          default: 'fail'
        },
        fallbackValue: {
          type: 'json',
          label: 'Fallback Value',
          description: 'Value to use when retries exhausted (for continue mode)',
          showWhen: { onFinalFailure: 'continue' }
        },
        useCircuitBreaker: {
          type: 'boolean',
          label: 'Use Circuit Breaker',
          description: 'Integrate with circuit breaker pattern',
          default: false
        },
        circuitBreakerKey: {
          type: 'text',
          label: 'Circuit Breaker Key',
          description: 'Identifier for circuit breaker state',
          showWhen: { useCircuitBreaker: true },
          placeholder: 'api:external-service'
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Result In',
          placeholder: 'retryResult'
        }
      },
      outputs: {
        success: { label: 'Success', type: 'default' },
        exhausted: { label: 'Retries Exhausted', type: 'conditional' },
        fallback: { label: 'Fallback', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        maxRetries: 3,
        backoffStrategy: 'exponential',
        baseDelay: 1000,
        maxDelay: 30000,
        jitter: true,
        retryOn: ['timeout', 'network', 'rateLimit', 'transient'],
        noRetryOn: [],
        onFinalFailure: 'fail',
        fallbackValue: null,
        useCircuitBreaker: false,
        circuitBreakerKey: '',
        storeInVariable: ''
      })
    };
  }

  /**
   * Validate node configuration
   */
  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (data.maxRetries !== undefined && data.maxRetries < 1) {
      errors.push('Max retries must be at least 1');
    }

    if (data.baseDelay !== undefined && data.baseDelay < 100) {
      errors.push('Base delay must be at least 100ms');
    }

    if (data.useCircuitBreaker && !data.circuitBreakerKey) {
      errors.push('Circuit breaker key is required when circuit breaker is enabled');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      maxRetries,
      backoffStrategy,
      baseDelay,
      maxDelay,
      jitter,
      retryOn,
      noRetryOn,
      onFinalFailure,
      fallbackValue,
      useCircuitBreaker,
      circuitBreakerKey,
      storeInVariable
    } = context.node.data;

    // Get the next node to wrap with retry logic
    const nextNodeId = this.getNextNodeId(context);

    if (!nextNodeId) {
      return this.failure('No node connected to retry', 'NO_TARGET_NODE');
    }

    const retryState = {
      attempts: 0,
      errors: [],
      startedAt: Date.now()
    };

    try {
      // Check circuit breaker if enabled
      if (useCircuitBreaker) {
        const circuitBreaker = context.services?.circuitBreaker;
        if (circuitBreaker && !circuitBreaker.canExecute(circuitBreakerKey)) {
          throw new Error('Circuit breaker is open');
        }
      }

      // Attempt execution with retries
      let lastError;
      let result;

      while (retryState.attempts < maxRetries) {
        retryState.attempts++;

        try {
          context.logger.info(`Retry attempt ${retryState.attempts}/${maxRetries}`);

          // Execute the wrapped node
          result = await this.executeWrappedNode(context, nextNodeId);

          // Success - record and break
          if (result.success) {
            if (useCircuitBreaker) {
              const circuitBreaker = context.services?.circuitBreaker;
              circuitBreaker?.recordSuccess(circuitBreakerKey);
            }

            const output = {
              success: true,
              attempts: retryState.attempts,
              result: result.output,
              duration: Date.now() - retryState.startedAt
            };

            if (storeInVariable) {
              context.variables[storeInVariable] = output;
            }

            return this.success(output, ['success']);
          }

          // Failure - check if retryable
          lastError = result.error;
          retryState.errors.push({
            attempt: retryState.attempts,
            error: lastError,
            timestamp: new Date().toISOString()
          });

          // Check if this error should be retried
          if (!this.shouldRetry(lastError, retryOn, noRetryOn)) {
            context.logger.info(`Error not retryable: ${lastError.code || lastError.message}`);
            break;
          }

          // Calculate delay for next attempt
          if (retryState.attempts < maxRetries) {
            const delay = this.calculateDelay(
              retryState.attempts,
              backoffStrategy,
              baseDelay,
              maxDelay,
              jitter
            );
            context.logger.info(`Waiting ${delay}ms before retry...`);
            await this.delay(delay);
          }

        } catch (error) {
          lastError = { message: error.message, code: error.code };
          retryState.errors.push({
            attempt: retryState.attempts,
            error: lastError,
            timestamp: new Date().toISOString()
          });

          if (!this.shouldRetry(lastError, retryOn, noRetryOn)) {
            break;
          }

          if (retryState.attempts < maxRetries) {
            const delay = this.calculateDelay(
              retryState.attempts,
              backoffStrategy,
              baseDelay,
              maxDelay,
              jitter
            );
            await this.delay(delay);
          }
        }
      }

      // All retries exhausted
      context.logger.warn(`All ${maxRetries} retries exhausted`);

      if (useCircuitBreaker) {
        const circuitBreaker = context.services?.circuitBreaker;
        circuitBreaker?.recordFailure(circuitBreakerKey);
      }

      // Handle final failure
      const failureOutput = {
        success: false,
        attempts: retryState.attempts,
        errors: retryState.errors,
        lastError,
        duration: Date.now() - retryState.startedAt
      };

      switch (onFinalFailure) {
        case 'continue':
          failureOutput.fallbackUsed = true;
          failureOutput.result = fallbackValue;
          if (storeInVariable) {
            context.variables[storeInVariable] = failureOutput;
          }
          return this.success(failureOutput, ['exhausted']);

        case 'fallback':
          return this.success(failureOutput, ['fallback']);

        case 'fail':
        default:
          return this.failure(
            `All ${maxRetries} retries exhausted: ${lastError?.message}`,
            'RETRIES_EXHAUSTED',
            false,
            ['exhausted']
          );
      }

    } catch (error) {
      context.logger.error(`Retry node failed: ${error.message}`);
      return this.failure(error.message, 'RETRY_ERROR', true);
    }
  }

  /**
   * Get the next connected node ID
   * @private
   */
  getNextNodeId(context) {
    const edges = context.flow?.edges || [];
    const nodeId = context.node.id;

    const edge = edges.find(e => e.source === nodeId);
    return edge?.target;
  }

  /**
   * Execute the wrapped node
   * @private
   */
  async executeWrappedNode(context, nodeId) {
    const node = context.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const executor = context.services?.flowEngine?.getNodeExecutor(node.type);
    if (!executor) {
      throw new Error(`No executor for node type: ${node.type}`);
    }

    const nodeContext = context.createNodeContext(node);
    return await executor.execute(nodeContext);
  }

  /**
   * Determine if error should be retried
   * @private
   */
  shouldRetry(error, retryOn, noRetryOn) {
    // Check explicit no-retry codes
    if (noRetryOn && noRetryOn.includes(error.code)) {
      return false;
    }

    // Check if all errors should be retried
    if (retryOn.includes('all')) {
      return true;
    }

    const errorMessage = (error.message || '').toLowerCase();
    const errorCode = error.code || '';

    // Check specific error types
    if (retryOn.includes('timeout')) {
      if (errorMessage.includes('timeout') || errorCode.includes('TIMEOUT')) {
        return true;
      }
    }

    if (retryOn.includes('network')) {
      if (errorMessage.includes('network') || errorMessage.includes('econnrefused') ||
          errorMessage.includes('enotfound') || errorCode.includes('NETWORK')) {
        return true;
      }
    }

    if (retryOn.includes('rateLimit')) {
      if (errorMessage.includes('rate limit') || errorMessage.includes('429') ||
          errorCode.includes('RATE_LIMIT')) {
        return true;
      }
    }

    if (retryOn.includes('serverError')) {
      if (errorMessage.includes('500') || errorMessage.includes('502') ||
          errorMessage.includes('503') || errorMessage.includes('504') ||
          errorCode.includes('SERVER_ERROR')) {
        return true;
      }
    }

    if (retryOn.includes('transient')) {
      if (error.transient || error.recoverable ||
          errorCode.includes('TRANSIENT') || errorCode.includes('TEMPORARY')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate delay for next retry
   * @private
   */
  calculateDelay(attempt, strategy, baseDelay, maxDelay, useJitter) {
    let delay;

    switch (strategy) {
      case 'constant':
        delay = baseDelay;
        break;

      case 'linear':
        delay = baseDelay * attempt;
        break;

      case 'exponential':
        delay = baseDelay * Math.pow(2, attempt - 1);
        break;

      default:
        delay = baseDelay;
    }

    // Cap at max delay
    delay = Math.min(delay, maxDelay);

    // Add jitter (±20%)
    if (useJitter) {
      const jitterRange = delay * 0.2;
      delay += Math.random() * jitterRange * 2 - jitterRange;
    }

    return Math.round(delay);
  }

  /**
   * Delay execution
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { RetryNode };
