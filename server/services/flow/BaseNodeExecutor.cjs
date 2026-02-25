/**
 * Base Node Executor
 *
 * Foundation class for all FlowBuilder node executors.
 * Provides common functionality for node execution including:
 * - Result helpers (success, failure, skip)
 * - Configuration access helpers (getRequired, getOptional)
 * - Optional node validation
 *
 * All concrete node executors should extend this class.
 */

/**
 * Base class for all node executors.
 *
 * @example
 * class ManualTriggerExecutor extends BaseNodeExecutor {
 *   constructor() {
 *     super('trigger:manual', 'trigger');
 *   }
 *
 *   async execute(context) {
 *     return this.success({
 *       triggeredAt: new Date().toISOString(),
 *       triggeredBy: context.input.userId || 'unknown',
 *     });
 *   }
 * }
 */
class BaseNodeExecutor {
  /**
   * @param {string} type - The unique type identifier for this node executor
   * @param {string} category - The category this node belongs to (trigger, ai, logic, messaging, etc.)
   */
  constructor(type, category) {
    if (!type) {
      throw new Error('Node type is required');
    }
    if (!category) {
      throw new Error('Node category is required');
    }
    this.type = type;
    this.category = category;
  }

  /**
   * Execute the node with the given context.
   * This is the main method that concrete executors must implement.
   *
   * @param {NodeExecutionContext} context - The execution context
   * @returns {Promise<NodeExecutionResult>} The execution result
   * @abstract
   */
  async execute(context) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Validate the node configuration.
   * Override this method to provide custom validation logic.
   *
   * @param {Object} node - The flow node to validate
   * @returns {string[]} Array of validation error messages (empty if valid)
   */
  validate(node) {
    return [];
  }

  /**
   * Create a successful execution result.
   *
   * @param {Object} output - The output data from this node's execution
   * @param {string[]} [nextNodes] - Optional array of node IDs to execute next (for conditional branching)
   * @returns {NodeExecutionResult} A successful result
   *
   * @example
   * return this.success({ messageId: msg.id, sentAt: new Date().toISOString() });
   *
   * // With specific next nodes (for branching)
   * return this.success({ condition: 'matched' }, ['node-true-branch']);
   */
  success(output, nextNodes) {
    return {
      success: true,
      output: output || {},
      nextNodes,
      continueExecution: true,
    };
  }

  /**
   * Create a failed execution result.
   *
   * @param {string} message - Human-readable error message
   * @param {string} [code='EXECUTION_ERROR'] - Error code for programmatic handling
   * @param {boolean} [recoverable=false] - Whether the error can be recovered via retry
   * @returns {NodeExecutionResult} A failed result
   *
   * @example
   * return this.failure('Invalid API key provided', 'AUTH_ERROR', false);
   * return this.failure('Connection timeout', 'TIMEOUT', true); // recoverable
   */
  failure(message, code = 'EXECUTION_ERROR', recoverable = false) {
    return {
      success: false,
      output: {},
      error: {
        code,
        message,
        recoverable,
      },
      continueExecution: false,
    };
  }

  /**
   * Create a skipped execution result.
   * Use this when a node should be skipped but execution should continue.
   *
   * @param {string} reason - Human-readable reason for skipping
   * @returns {NodeExecutionResult} A skipped result (success=true, continueExecution=true)
   *
   * @example
   * if (!context.input.shouldProcess) {
   *   return this.skip('Processing flag is false');
   * }
   */
  skip(reason) {
    return {
      success: true,
      output: {
        skipped: true,
        reason,
      },
      continueExecution: true,
    };
  }

  /**
   * Get a required configuration value from the data object.
   * Throws an error if the value is missing or undefined.
   *
   * @template T
   * @param {Object} data - The data object to retrieve the value from
   * @param {string} key - The key to look up
   * @returns {T} The value
   * @throws {Error} If the key is missing or undefined
   *
   * @example
   * const url = this.getRequired(context.node.data, 'url');
   * const retryCount = this.getRequired(context.node.data, 'retries');
   */
  getRequired(data, key) {
    const value = data[key];
    if (value === undefined || value === null) {
      throw new Error(`Required configuration '${key}' is missing`);
    }
    return value;
  }

  /**
   * Get an optional configuration value from the data object.
   * Returns the default value if the key is missing, null, or undefined.
   *
   * @template T
   * @param {Object} data - The data object to retrieve the value from
   * @param {string} key - The key to look up
   * @param {T} defaultValue - The value to return if the key is missing
   * @returns {T} The value or default value
   *
   * @example
   * const timeout = this.getOptional(context.node.data, 'timeout', 30000);
   * const retries = this.getOptional(context.node.data, 'retries', 3);
   */
  getOptional(data, key, defaultValue) {
    const value = data[key];
    if (value === undefined || value === null) {
      return defaultValue;
    }
    return value;
  }

  /**
   * Get nested value from an object using dot notation path.
   *
   * @param {Object} obj - The object to traverse
   * @param {string} path - Dot-separated path (e.g., 'user.profile.name')
   * @returns {*} The nested value or undefined
   */
  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;

    const parts = typeof path === 'string' ? path.split('.') : path;
    let current = obj;

    for (const key of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Resolve template variables in a string.
   * Supports {{input.field}}, {{node.nodeId.field}}, {{var.name}} patterns.
   *
   * @param {string} template - The template string
   * @param {NodeExecutionContext} context - The execution context
   * @returns {string} The resolved string
   */
  resolveTemplate(template, context) {
    if (typeof template !== 'string') {
      return template;
    }

    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const parts = path.trim().split('.');
      const prefix = parts[0];
      let value;

      switch (prefix) {
        case 'input':
        case 'inputs':
          value = this.getNestedValue(context.input, parts.slice(1));
          break;
        case 'var':
        case 'variables':
          value = this.getNestedValue(context.variables, parts.slice(1));
          break;
        case 'node':
        case 'nodes':
          if (parts.length >= 2) {
            const nodeOutput = context.previousResults[parts[1]];
            value = parts.length > 2
              ? this.getNestedValue(nodeOutput, parts.slice(2))
              : nodeOutput;
          }
          break;
        default:
          // Try variables first, then input
          value = this.getNestedValue(context.variables, parts);
          if (value === undefined) {
            value = this.getNestedValue(context.input, parts);
          }
      }

      if (value !== undefined && value !== null) {
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
      return match; // Keep original if not found
    });
  }
}

/**
 * Check if an object is a BaseNodeExecutor instance.
 *
 * @param {*} obj - The object to check
 * @returns {boolean} True if the object is a BaseNodeExecutor
 */
function isBaseNodeExecutor(obj) {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'type' in obj &&
    'category' in obj &&
    'execute' in obj &&
    typeof obj.execute === 'function'
  );
}

module.exports = {
  BaseNodeExecutor,
  isBaseNodeExecutor,
};
