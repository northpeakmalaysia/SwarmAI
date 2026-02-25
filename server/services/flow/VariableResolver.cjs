/**
 * Variable Resolver
 *
 * Handles template variable resolution in flow configurations.
 * Supports patterns like {{input.fieldName}}, {{node.nodeId.field}}, {{var.name}},
 * {{env.VARIABLE}}, and {{time.*}} functions.
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../logger.cjs');

// Allowlist for environment variables (security measure)
const ALLOWED_ENV_VARS = ['NODE_ENV', 'TZ', 'LANG'];

// Weekday names for {{time.weekday}}
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Month names for {{MONTHNAME}}
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Built-in variables (WhatsBots style)
 * These are resolved without prefix, e.g., {{TODAY}}, {{UUID}}
 */
const BUILT_IN_VARIABLES = {
  // Date/Time - dd-mm-yyyy format (WhatsBots style)
  TODAY: () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  },
  TIME: () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  },
  DATETIME: () => {
    const d = new Date();
    const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    return `${date} ${time}`;
  },
  TIMESTAMP: () => Math.floor(Date.now() / 1000),
  HOUR: () => new Date().getHours(),
  MINUTE: () => new Date().getMinutes(),
  SECOND: () => new Date().getSeconds(),
  DAY: () => new Date().getDate(),
  MONTH: () => new Date().getMonth() + 1,
  YEAR: () => new Date().getFullYear(),
  DATENUM: () => new Date().getDate(),
  MONTHNUM: () => new Date().getMonth() + 1,
  WEEKNUM: () => {
    const d = new Date();
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = d - start;
    const oneWeek = 604800000;
    return Math.ceil((diff / oneWeek) + 1);
  },
  DAYNAME: () => WEEKDAY_NAMES[new Date().getDay()].toUpperCase(),
  MONTHNAME: () => MONTH_NAMES[new Date().getMonth()].toUpperCase(),
  TIMEZONE: () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = -new Date().getTimezoneOffset() / 60;
    const sign = offset >= 0 ? '+' : '';
    return `${tz.replace('/', '_')}_GMT_${sign}${offset}`;
  },

  // System
  RANDOM: () => Math.floor(Math.random() * 1000000),
  UUID: () => uuidv4(),
  GUID: () => uuidv4(), // Alias

  // Item/Loop (set during loop execution)
  // These are placeholders - actual values set in context
};

/**
 * VariableResolver class for template resolution
 */
class VariableResolver {
  constructor() {
    this.variablePattern = /\{\{([^}]+)\}\}/g;
  }

  /**
   * Resolve all {{}} patterns in a string
   *
   * @param {string} template - The template string
   * @param {ResolverContext} context - The resolution context
   * @returns {string} The resolved string
   */
  resolve(template, context) {
    if (typeof template !== 'string') {
      return template;
    }

    const resolverCtx = this.normalizeContext(context);

    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      try {
        const value = this.resolvePath(path.trim(), resolverCtx);
        if (value !== undefined) {
          return typeof value === 'object' ? JSON.stringify(value) : String(value);
        }
        logger.warn(`Variable resolution failed for path: ${path}`);
        return match;
      } catch (error) {
        logger.warn(`Variable resolution error for ${path}: ${error.message}`);
        return match;
      }
    });
  }

  /**
   * Recursively resolve templates in objects/arrays
   *
   * @template T
   * @param {T} obj - The object to resolve
   * @param {ResolverContext} context - The resolution context
   * @returns {T} The resolved object
   */
  resolveObject(obj, context) {
    const resolverCtx = this.normalizeContext(context);
    return this.resolveObjectInternal(obj, resolverCtx);
  }

  /**
   * Internal recursive object resolution
   * @private
   */
  resolveObjectInternal(obj, context) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.resolve(obj, context);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.resolveObjectInternal(item, context));
    }

    if (typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveObjectInternal(value, context);
      }
      return result;
    }

    return obj;
  }

  /**
   * Check if string contains templates
   *
   * @param {string} str - The string to check
   * @returns {boolean} True if string contains {{}} patterns
   */
  hasTemplates(str) {
    if (typeof str !== 'string') return false;
    return /\{\{([^}]+)\}\}/.test(str);
  }

  /**
   * Extract all template paths from a string
   *
   * @param {string} template - The template string
   * @returns {string[]} Array of unique paths found
   */
  extractPaths(template) {
    if (typeof template !== 'string') return [];

    const paths = [];
    const pattern = /\{\{([^}]+)\}\}/g;
    let match;

    while ((match = pattern.exec(template)) !== null) {
      paths.push(match[1].trim());
    }

    return [...new Set(paths)];
  }

  /**
   * Resolve a single path to its value
   * @private
   */
  resolvePath(path, context) {
    const parts = path.split('.');
    const prefix = parts[0];

    // Check for built-in variables first (WhatsBots style: {{TODAY}}, {{RANDOM}}, etc.)
    const upperPath = path.toUpperCase();
    if (BUILT_IN_VARIABLES[upperPath]) {
      return BUILT_IN_VARIABLES[upperPath]();
    }

    // Check for special loop context variables
    if (path === 'item' || path === 'ITEM') {
      return context.item !== undefined ? context.item : context.variables?.item;
    }
    if (path === 'index' || path === 'INDEX') {
      return context.index !== undefined ? context.index : context.variables?.index;
    }

    // Check for previousOutput (WhatsBots style shorthand)
    if (path === 'previousOutput' || path === 'PREVIOUSOUTPUT') {
      // Find the most recent node output
      const nodes = context.nodes || {};
      const nodeIds = Object.keys(nodes);
      if (nodeIds.length > 0) {
        const lastOutput = nodes[nodeIds[nodeIds.length - 1]];
        // Auto-extract 'response' field if available
        if (lastOutput?.response) {
          return lastOutput.response;
        }
        return lastOutput;
      }
      return undefined;
    }

    switch (prefix) {
      case 'input':
      case 'inputs':
        return this.getNestedValue(context.input, parts.slice(1));

      case 'node':
      case 'nodes':
        return this.resolveNodePath(parts.slice(1), context);

      case 'var':
      case 'variables':
        return this.getNestedValue(context.variables, parts.slice(1));

      case 'env':
        return this.resolveEnvVariable(parts[1], context);

      case 'time':
      case 'datetime':
        return this.resolveTimeVariable(parts.slice(1));

      case 'meta':
      case 'metadata':
        return this.getNestedValue(context.metadata || {}, parts.slice(1));

      // Trigger variables (WhatsBots style)
      case 'triggerPhone':
      case 'triggerChatId':
      case 'triggerMessage':
      case 'triggerMessageId':
      case 'triggerSenderName':
      case 'triggerIsGroup':
      case 'triggerGroupName':
      case 'triggerHasMedia':
      case 'triggerMediaType':
      case 'fromMe':
        return this.resolveTriggerVariable(prefix, context);

      // Results shorthand (WhatsBots style: {{results.nodeId}})
      case 'results':
        return this.getNestedValue(context.nodes, parts.slice(1));

      default:
        // Try to resolve as variable first, then input
        let value = this.getNestedValue(context.variables, parts);
        if (value === undefined) {
          value = this.getNestedValue(context.input, parts);
        }
        return value;
    }
  }

  /**
   * Resolve trigger variables (WhatsBots style)
   * @private
   */
  resolveTriggerVariable(varName, context) {
    const input = context.input || {};

    const mappings = {
      triggerPhone: input.sender || input.from || input.phone,
      triggerChatId: input.chatId || input.chat || input.sender,
      triggerMessage: input.message || input.text || input.body,
      triggerMessageId: input.messageId || input.id,
      triggerSenderName: input.senderName || input.name || input.pushName,
      triggerIsGroup: input.isGroup || input.fromGroup || false,
      triggerGroupName: input.groupName || input.groupSubject,
      triggerHasMedia: input.hasMedia || !!input.media || !!input.mediaUrl,
      triggerMediaType: input.mediaType || input.type,
      fromMe: input.fromMe || false,
    };

    return mappings[varName];
  }

  /**
   * Resolve node output path
   * @private
   */
  resolveNodePath(parts, context) {
    if (parts.length < 1) {
      logger.warn(`Invalid node path: ${parts.join('.')}`);
      return undefined;
    }

    const nodeId = parts[0];
    const outputPath = parts.slice(1);

    const nodeOutput = context.nodes[nodeId];
    if (nodeOutput === undefined) {
      logger.warn(`Node output not found: ${nodeId}`);
      return undefined;
    }

    if (outputPath.length === 0) {
      return nodeOutput;
    }

    return this.getNestedValue(nodeOutput, outputPath);
  }

  /**
   * Resolve environment variable with allowlist check
   * @private
   */
  resolveEnvVariable(envVar, context) {
    if (!envVar) {
      return undefined;
    }

    if (!ALLOWED_ENV_VARS.includes(envVar)) {
      logger.warn(`Environment variable not allowed: ${envVar}`);
      return undefined;
    }

    // Check context env first, then process.env
    if (context.env && context.env[envVar] !== undefined) {
      return context.env[envVar];
    }

    return process.env[envVar];
  }

  /**
   * Resolve time-related variables
   * @private
   */
  resolveTimeVariable(parts) {
    const now = new Date();
    const func = parts[0] || 'iso';

    switch (func) {
      case 'date':
        // YYYY-MM-DD
        return now.toISOString().split('T')[0];

      case 'time':
        // HH:mm:ss
        return now.toTimeString().split(' ')[0];

      case 'timestamp':
        // Unix timestamp
        return Math.floor(now.getTime() / 1000);

      case 'iso':
      case 'now':
        // ISO 8601 timestamp
        return now.toISOString();

      case 'year':
        return now.getFullYear();

      case 'month':
        // 1-12
        return now.getMonth() + 1;

      case 'day':
        // 1-31
        return now.getDate();

      case 'hour':
        return now.getHours();

      case 'minute':
        return now.getMinutes();

      case 'second':
        return now.getSeconds();

      case 'weekday':
        return WEEKDAY_NAMES[now.getDay()];

      default:
        logger.warn(`Unknown time function: ${func}`);
        return undefined;
    }
  }

  /**
   * Get nested value from object using path parts
   * @private
   */
  getNestedValue(obj, path) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    const parts = typeof path === 'string' ? path.split('.') : path;
    if (!parts || parts.length === 0) {
      return obj;
    }

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
   * Normalize different context formats to standard ResolverContext
   * @private
   */
  normalizeContext(context) {
    // Check if it's an ExecutionContext (legacy format)
    if (context && 'inputs' in context && 'nodeOutputs' in context) {
      return {
        input: context.inputs || {},
        nodes: context.nodeOutputs || {},
        variables: context.variables || {},
        env: {},
        metadata: context.metadata || {},
      };
    }

    // Already in ResolverContext format or similar
    return {
      input: context.input || context.inputs || {},
      nodes: context.nodes || context.nodeOutputs || context.previousResults || {},
      variables: context.variables || {},
      env: context.env || {},
      metadata: context.metadata || {},
    };
  }

  /**
   * Validate template syntax
   *
   * @param {string} template - The template to validate
   * @returns {{valid: boolean, variables: string[], errors: string[]}}
   */
  validateTemplate(template) {
    const variables = [];
    const errors = [];

    if (typeof template !== 'string') {
      return { valid: true, variables, errors };
    }

    let match;
    const regex = /\{\{([^}]+)\}\}/g;

    while ((match = regex.exec(template)) !== null) {
      const varPath = match[1].trim();
      variables.push(varPath);

      if (!varPath) {
        errors.push('Empty variable reference at position ' + match.index);
      } else if (varPath.includes(' ')) {
        errors.push('Variable "' + varPath + '" contains spaces');
      }
    }

    const openCount = (template.match(/\{\{/g) || []).length;
    const closeCount = (template.match(/\}\}/g) || []).length;
    if (openCount !== closeCount) {
      errors.push('Unmatched variable brackets');
    }

    return {
      valid: errors.length === 0,
      variables,
      errors,
    };
  }

  /**
   * Create an execution context
   *
   * @param {string} flowId - The flow ID
   * @param {string} executionId - The execution ID
   * @param {Object} variables - Flow variables
   * @param {Object} inputs - Flow inputs
   * @param {Object} [metadata] - Optional metadata
   * @returns {ExecutionContext}
   */
  createContext(flowId, executionId, variables, inputs, metadata) {
    return {
      flowId,
      executionId,
      variables: variables || {},
      inputs: inputs || {},
      nodeOutputs: {},
      currentNodeId: null,
      startTime: new Date(),
      metadata: metadata || {},
    };
  }

  /**
   * Set node output in context
   *
   * @param {ExecutionContext} context - The execution context
   * @param {string} nodeId - The node ID
   * @param {*} output - The output value
   */
  setNodeOutput(context, nodeId, output) {
    context.nodeOutputs[nodeId] = output;
  }

  /**
   * Set variable in context
   *
   * @param {ExecutionContext} context - The execution context
   * @param {string} name - Variable name
   * @param {*} value - Variable value
   */
  setVariable(context, name, value) {
    context.variables[name] = value;
  }
}

// Export singleton instance
const variableResolver = new VariableResolver();

module.exports = {
  VariableResolver,
  variableResolver,
  BUILT_IN_VARIABLES,
  WEEKDAY_NAMES,
  MONTH_NAMES,
};
