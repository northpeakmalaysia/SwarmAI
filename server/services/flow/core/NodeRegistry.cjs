/**
 * Node Registry
 *
 * Centralized registry for all flow node executors with:
 * - Auto-discovery from node folders
 * - Static metadata extraction via getMetadata()
 * - JSON Schema generation for validation
 * - Dynamic node registration
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../../logger.cjs');

/**
 * NodeRegistry manages all node executors with enhanced metadata support.
 */
class NodeRegistry {
  constructor() {
    this.executors = new Map();      // type -> executor instance
    this.metadata = new Map();        // type -> metadata object
    this.schemas = new Map();         // type -> JSON Schema
    this.categories = new Map();      // category -> [types]
    this.initialized = false;
  }

  /**
   * Auto-discover and register nodes from the nodes directory
   * @param {string} basePath - Base path to nodes directory
   * @returns {number} Number of nodes registered
   */
  async discoverNodes(basePath) {
    const categories = ['triggers', 'ai', 'logic', 'messaging', 'web', 'data', 'agentic', 'swarm'];
    let count = 0;

    for (const category of categories) {
      const categoryPath = path.join(basePath, category);

      if (!fs.existsSync(categoryPath)) {
        logger.debug(`Category directory not found: ${category}`);
        continue;
      }

      const files = fs.readdirSync(categoryPath);

      for (const file of files) {
        if (!file.endsWith('Node.cjs') && !file.endsWith('Node.js')) {
          continue;
        }

        try {
          const filePath = path.join(categoryPath, file);
          const module = require(filePath);

          // Handle both default export and named exports
          const ExecutorClass = module.default || module[Object.keys(module).find(k => k.endsWith('Node'))] || module;

          if (typeof ExecutorClass === 'function') {
            const executor = new ExecutorClass();
            this.register(executor);
            count++;
          }
        } catch (error) {
          logger.error(`Failed to load node from ${file}: ${error.message}`);
        }
      }
    }

    this.initialized = true;
    logger.info(`NodeRegistry: Discovered ${count} nodes`);
    return count;
  }

  /**
   * Register a node executor with metadata extraction
   * @param {BaseNodeExecutor} executor - The node executor instance
   */
  register(executor) {
    if (!executor || !executor.type) {
      throw new Error('Executor must have a type property');
    }

    const type = executor.type;
    const category = executor.category || 'unknown';

    // Store executor
    if (this.executors.has(type)) {
      logger.warn(`Overwriting existing node executor: ${type}`);
    }
    this.executors.set(type, executor);

    // Extract and store metadata
    const metadata = this.extractMetadata(executor);
    this.metadata.set(type, metadata);

    // Generate and store JSON Schema
    if (metadata.properties) {
      const schema = this.generateJsonSchema(metadata);
      this.schemas.set(type, schema);
    }

    // Track by category
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category).push(type);

    logger.debug(`Registered node: ${type} (${category})`);
  }

  /**
   * Extract metadata from executor
   * @param {BaseNodeExecutor} executor
   * @returns {Object} Metadata object
   */
  extractMetadata(executor) {
    // Check for static getMetadata method
    const ExecutorClass = executor.constructor;
    if (typeof ExecutorClass.getMetadata === 'function') {
      return ExecutorClass.getMetadata();
    }

    // Fallback to basic metadata
    return {
      type: executor.type,
      category: executor.category,
      label: this.typeToLabel(executor.type),
      description: '',
      icon: 'Circle',
      color: this.getCategoryColor(executor.category),
      properties: {},
      outputs: {
        default: { label: 'Output', type: 'default' }
      }
    };
  }

  /**
   * Generate JSON Schema from metadata properties
   * @param {Object} metadata
   * @returns {Object} JSON Schema
   */
  generateJsonSchema(metadata) {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      title: metadata.label || metadata.type,
      description: metadata.description || '',
      properties: {},
      required: []
    };

    for (const [key, prop] of Object.entries(metadata.properties || {})) {
      schema.properties[key] = this.propertyToSchema(prop);
      if (prop.required) {
        schema.required.push(key);
      }
    }

    return schema;
  }

  /**
   * Convert property definition to JSON Schema
   * @param {Object} prop
   * @returns {Object} JSON Schema property
   */
  propertyToSchema(prop) {
    const schema = {
      title: prop.label || '',
      description: prop.description || ''
    };

    switch (prop.type) {
      case 'text':
      case 'textarea':
      case 'variable':
      case 'cron':
        schema.type = 'string';
        if (prop.placeholder) schema.examples = [prop.placeholder];
        break;

      case 'number':
        schema.type = 'number';
        if (prop.min !== undefined) schema.minimum = prop.min;
        if (prop.max !== undefined) schema.maximum = prop.max;
        if (prop.default !== undefined) schema.default = prop.default;
        break;

      case 'boolean':
      case 'checkbox':
        schema.type = 'boolean';
        if (prop.default !== undefined) schema.default = prop.default;
        break;

      case 'select':
        schema.type = 'string';
        if (prop.options) {
          schema.enum = prop.options.map(o => o.value);
        }
        if (prop.default !== undefined) schema.default = prop.default;
        break;

      case 'multiselect':
        schema.type = 'array';
        schema.items = { type: 'string' };
        if (prop.options) {
          schema.items.enum = prop.options.map(o => o.value);
        }
        break;

      case 'json':
        schema.type = 'object';
        schema.additionalProperties = true;
        break;

      case 'array':
        schema.type = 'array';
        schema.items = prop.itemSchema ? this.propertyToSchema(prop.itemSchema) : {};
        break;

      case 'model':
      case 'provider':
      case 'agent':
      case 'contact':
      case 'library':
        schema.type = 'string';
        schema.format = prop.type;
        break;

      case 'datetime':
        schema.type = 'string';
        schema.format = 'date-time';
        break;

      default:
        schema.type = 'string';
    }

    return schema;
  }

  /**
   * Get executor by type
   * @param {string} type
   * @returns {BaseNodeExecutor|undefined}
   */
  get(type) {
    return this.executors.get(type);
  }

  /**
   * Get metadata by type
   * @param {string} type
   * @returns {Object|undefined}
   */
  getMetadata(type) {
    return this.metadata.get(type);
  }

  /**
   * Get JSON Schema by type
   * @param {string} type
   * @returns {Object|undefined}
   */
  getSchema(type) {
    return this.schemas.get(type);
  }

  /**
   * Get all executors
   * @returns {Map}
   */
  getAll() {
    return this.executors;
  }

  /**
   * Get all metadata as array
   * @returns {Object[]}
   */
  getAllMetadata() {
    return Array.from(this.metadata.values());
  }

  /**
   * Get executors by category
   * @param {string} category
   * @returns {BaseNodeExecutor[]}
   */
  getByCategory(category) {
    const types = this.categories.get(category) || [];
    return types.map(type => this.executors.get(type)).filter(Boolean);
  }

  /**
   * Get all categories
   * @returns {string[]}
   */
  getCategories() {
    return Array.from(this.categories.keys());
  }

  /**
   * Get all registered types
   * @returns {string[]}
   */
  getTypes() {
    return Array.from(this.executors.keys());
  }

  /**
   * Check if a type is registered
   * @param {string} type
   * @returns {boolean}
   */
  has(type) {
    return this.executors.has(type);
  }

  /**
   * Validate node data against schema
   * @param {string} type
   * @param {Object} data
   * @returns {string[]} Array of validation errors
   */
  validateNodeData(type, data) {
    const errors = [];
    const metadata = this.metadata.get(type);

    if (!metadata) {
      return [`Unknown node type: ${type}`];
    }

    const properties = metadata.properties || {};

    for (const [key, prop] of Object.entries(properties)) {
      const value = data[key];

      // Check required
      if (prop.required && (value === undefined || value === null || value === '')) {
        errors.push(`${prop.label || key} is required`);
        continue;
      }

      // Skip validation for undefined optional fields
      if (value === undefined || value === null) {
        continue;
      }

      // Type-specific validation
      switch (prop.type) {
        case 'number':
          if (typeof value !== 'number' && isNaN(Number(value))) {
            errors.push(`${prop.label || key} must be a number`);
          } else {
            const num = Number(value);
            if (prop.min !== undefined && num < prop.min) {
              errors.push(`${prop.label || key} must be at least ${prop.min}`);
            }
            if (prop.max !== undefined && num > prop.max) {
              errors.push(`${prop.label || key} must be at most ${prop.max}`);
            }
          }
          break;

        case 'select':
          if (prop.options && !prop.options.some(o => o.value === value)) {
            errors.push(`${prop.label || key} has invalid value`);
          }
          break;
      }
    }

    return errors;
  }

  /**
   * Convert type to human-readable label
   * @param {string} type
   * @returns {string}
   */
  typeToLabel(type) {
    // "trigger:manual" -> "Manual Trigger"
    // "ai:chatCompletion" -> "Chat Completion"
    const parts = type.split(':');
    const name = parts[parts.length - 1];
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim();
  }

  /**
   * Get default color for category
   * @param {string} category
   * @returns {string}
   */
  getCategoryColor(category) {
    const colors = {
      trigger: 'amber',
      triggers: 'amber',
      ai: 'violet',
      logic: 'blue',
      messaging: 'emerald',
      web: 'cyan',
      data: 'orange',
      agentic: 'rose',
      swarm: 'pink'
    };
    return colors[category] || 'gray';
  }

  /**
   * Export registry for API response
   * @returns {Object}
   */
  toJSON() {
    const result = {
      categories: {},
      types: []
    };

    for (const [category, types] of this.categories) {
      result.categories[category] = types.map(type => ({
        type,
        ...this.metadata.get(type)
      }));
    }

    result.types = this.getAllMetadata();

    return result;
  }
}

// Singleton instance
let registryInstance = null;

/**
 * Get the NodeRegistry singleton
 * @returns {NodeRegistry}
 */
function getNodeRegistry() {
  if (!registryInstance) {
    registryInstance = new NodeRegistry();
  }
  return registryInstance;
}

/**
 * Initialize registry with auto-discovery
 * @param {string} [basePath] - Base path to nodes directory
 * @returns {Promise<NodeRegistry>}
 */
async function initializeRegistry(basePath) {
  const registry = getNodeRegistry();

  if (!registry.initialized) {
    const nodesPath = basePath || path.join(__dirname, '..', 'nodes');
    await registry.discoverNodes(nodesPath);
  }

  return registry;
}

module.exports = {
  NodeRegistry,
  getNodeRegistry,
  initializeRegistry
};
