/**
 * Error Handler Node
 *
 * Catches and handles errors from previous nodes in the flow.
 * Supports retry logic with exponential backoff and fallback actions.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class ErrorHandlerNode extends BaseNodeExecutor {
  constructor() {
    super('logic:errorHandler', 'logic');
  }

  async execute(context) {
    const { input, node } = context;
    const data = node.data || {};

    // Get error information from input (should be populated when an error occurs)
    const error = input.error || {};
    const hasError = !!error.message;

    // Error handler configuration
    const retryCount = parseInt(data.retryCount, 10) || 0;
    const retryDelay = parseInt(data.retryDelay, 10) || 1000; // milliseconds
    const retryBackoff = parseFloat(data.retryBackoff) || 2; // exponential multiplier
    const fallbackAction = data.fallbackAction || 'stop';

    // Initialize retry state
    const retryState = {
      attempts: input.retryAttempts || 0,
      maxRetries: retryCount,
      recovered: false,
      shouldRetry: false,
    };

    if (!hasError) {
      // No error - normal execution
      return this.success({
        hasError: false,
        recovered: false,
        retryAttempts: 0,
        action: 'none',
      });
    }

    // Error occurred - decide what to do
    retryState.shouldRetry = retryState.attempts < retryCount;

    if (retryState.shouldRetry) {
      // Calculate delay with exponential backoff
      const delay = retryDelay * Math.pow(retryBackoff, retryState.attempts);

      return this.success({
        hasError: true,
        error: {
          message: error.message || 'Unknown error',
          code: error.code || 'ERROR',
          nodeId: error.nodeId || 'unknown',
          stack: error.stack,
        },
        retryAttempts: retryState.attempts + 1,
        maxRetries: retryCount,
        retryDelay: Math.round(delay),
        action: 'retry',
        recovered: false,
        shouldWait: true,
        waitMs: delay,
      });
    }

    // Max retries exceeded - apply fallback action
    const fallbackResult = {
      hasError: true,
      error: {
        message: error.message || 'Unknown error',
        code: error.code || 'ERROR',
        nodeId: error.nodeId || 'unknown',
        stack: error.stack,
      },
      retryAttempts: retryState.attempts,
      maxRetries: retryCount,
      recovered: false,
      action: fallbackAction,
    };

    switch (fallbackAction) {
      case 'continue':
        // Continue flow execution despite error
        fallbackResult.recovered = true;
        fallbackResult.message = 'Error caught and flow continued';
        return this.success(fallbackResult);

      case 'route':
        // Route to fallback node
        fallbackResult.fallbackNodeId = data.fallbackNodeId;
        fallbackResult.message = 'Error caught, routing to fallback node';
        return this.success(fallbackResult);

      case 'stop':
      default:
        // Stop flow execution
        fallbackResult.message = 'Error caught, flow stopped';
        return this.failure(
          `Flow stopped after ${retryState.attempts} retry attempts: ${error.message}`,
          error.code || 'MAX_RETRIES_EXCEEDED',
          fallbackResult
        );
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Retry count validation
    if (data.retryCount !== undefined) {
      const count = parseInt(data.retryCount, 10);
      if (isNaN(count) || count < 0) {
        errors.push('Retry count must be a non-negative number');
      } else if (count > 10) {
        errors.push('Retry count cannot exceed 10 for safety');
      }
    }

    // Retry delay validation
    if (data.retryDelay !== undefined) {
      const delay = parseInt(data.retryDelay, 10);
      if (isNaN(delay) || delay < 0) {
        errors.push('Retry delay must be a non-negative number');
      } else if (delay > 60000) {
        errors.push('Retry delay cannot exceed 60,000ms (1 minute)');
      }
    }

    // Retry backoff validation
    if (data.retryBackoff !== undefined) {
      const backoff = parseFloat(data.retryBackoff);
      if (isNaN(backoff) || backoff < 1) {
        errors.push('Retry backoff must be >= 1');
      } else if (backoff > 10) {
        errors.push('Retry backoff cannot exceed 10 (too aggressive)');
      }
    }

    // Fallback action validation
    if (data.fallbackAction) {
      if (!['continue', 'stop', 'route'].includes(data.fallbackAction)) {
        errors.push('Fallback action must be one of: continue, stop, route');
      }

      if (data.fallbackAction === 'route' && !data.fallbackNodeId) {
        errors.push('Fallback node ID is required when fallback action is "route"');
      }
    }

    // Error source validation (optional)
    if (data.errorSource && typeof data.errorSource !== 'string') {
      errors.push('Error source must be a string (node ID)');
    }

    return errors;
  }

  /**
   * Get metadata for FlowBuilder UI
   */
  static getMetadata() {
    return {
      type: 'logic:errorHandler',
      category: 'logic',
      name: 'Error Handler',
      description: 'Catch and handle errors with retry logic and fallback actions',
      icon: 'alert-triangle',
      properties: [
        {
          name: 'retryCount',
          type: 'number',
          label: 'Retry Count',
          description: 'Number of times to retry failed operation',
          default: 3,
          min: 0,
          max: 10,
        },
        {
          name: 'retryDelay',
          type: 'number',
          label: 'Retry Delay (ms)',
          description: 'Initial delay between retries in milliseconds',
          default: 1000,
          min: 0,
          max: 60000,
        },
        {
          name: 'retryBackoff',
          type: 'number',
          label: 'Backoff Multiplier',
          description: 'Exponential backoff multiplier (delay *= backoff ^ attempt)',
          default: 2,
          min: 1,
          max: 10,
          step: 0.5,
        },
        {
          name: 'fallbackAction',
          type: 'select',
          label: 'Fallback Action',
          description: 'What to do after max retries exceeded',
          required: true,
          options: [
            { value: 'stop', label: 'Stop Flow (fail)' },
            { value: 'continue', label: 'Continue Flow (ignore error)' },
            { value: 'route', label: 'Route to Fallback Node' },
          ],
          default: 'stop',
        },
        {
          name: 'fallbackNodeId',
          type: 'string',
          label: 'Fallback Node ID',
          description: 'Node to route to if fallback action is "route"',
          required: true,
          visibleWhen: 'fallbackAction === "route"',
        },
        {
          name: 'errorSource',
          type: 'string',
          label: 'Error Source (Optional)',
          description: 'Specific node ID to catch errors from (leave empty for all)',
          placeholder: 'node-id',
        },
      ],
      outputs: [
        {
          name: 'hasError',
          type: 'boolean',
          description: 'Whether an error occurred',
        },
        {
          name: 'error',
          type: 'object',
          description: 'Error details',
          properties: [
            { name: 'message', type: 'string' },
            { name: 'code', type: 'string' },
            { name: 'nodeId', type: 'string' },
            { name: 'stack', type: 'string' },
          ],
        },
        {
          name: 'retryAttempts',
          type: 'number',
          description: 'Number of retry attempts made',
        },
        {
          name: 'maxRetries',
          type: 'number',
          description: 'Maximum retries configured',
        },
        {
          name: 'retryDelay',
          type: 'number',
          description: 'Calculated retry delay (with backoff)',
        },
        {
          name: 'action',
          type: 'string',
          description: 'Action taken (none, retry, continue, route, stop)',
        },
        {
          name: 'recovered',
          type: 'boolean',
          description: 'Whether error was successfully handled',
        },
        {
          name: 'shouldWait',
          type: 'boolean',
          description: 'Whether to wait before retry',
        },
        {
          name: 'waitMs',
          type: 'number',
          description: 'Milliseconds to wait before retry',
        },
        {
          name: 'fallbackNodeId',
          type: 'string',
          description: 'Fallback node ID (if action is route)',
        },
      ],
    };
  }
}

module.exports = { ErrorHandlerNode };
