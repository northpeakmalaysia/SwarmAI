/**
 * Set Variable Node
 *
 * Sets one or more variables in the flow execution context.
 * Variables can be referenced by subsequent nodes using {{var.name}} syntax.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SetVariableNode extends BaseNodeExecutor {
  constructor() {
    super('logic:setVariable', 'logic');
  }

  async execute(context) {
    const { node } = context;
    const data = node.data || {};

    const setVariables = {};

    // Handle single variable mode
    if (data.name) {
      const name = String(data.name).trim();
      let value = data.value;

      // Resolve template if value is a string
      if (typeof value === 'string') {
        value = this.resolveTemplate(value, context);
      }

      // Apply transformation if specified
      value = this.applyTransformation(value, data.transform);

      setVariables[name] = value;

      // Actually set the variable in context
      if (context.variables) {
        context.variables[name] = value;
      }
    }

    // Handle multiple variables mode
    if (Array.isArray(data.variables)) {
      for (const varDef of data.variables) {
        if (!varDef.name) continue;

        const name = String(varDef.name).trim();
        let value = varDef.value;

        // Resolve template if value is a string
        if (typeof value === 'string') {
          value = this.resolveTemplate(value, context);
        }

        // Apply transformation if specified
        value = this.applyTransformation(value, varDef.transform);

        setVariables[name] = value;

        // Actually set the variable in context
        if (context.variables) {
          context.variables[name] = value;
        }
      }
    }

    // Handle object mode (set multiple at once from an object)
    if (data.fromObject) {
      const sourceObj = this.resolveTemplate(data.fromObject, context);

      if (typeof sourceObj === 'object' && sourceObj !== null) {
        for (const [key, value] of Object.entries(sourceObj)) {
          setVariables[key] = value;
          if (context.variables) {
            context.variables[key] = value;
          }
        }
      }
    }

    const variableCount = Object.keys(setVariables).length;

    if (variableCount === 0) {
      return this.skip('No variables to set');
    }

    return this.success({
      variablesSet: setVariables,
      count: variableCount,
      setAt: new Date().toISOString(),
    });
  }

  applyTransformation(value, transform) {
    if (!transform) return value;

    switch (transform) {
      case 'toString':
        return String(value);

      case 'toNumber':
        const num = Number(value);
        return isNaN(num) ? value : num;

      case 'toBoolean':
        if (value === 'true' || value === '1' || value === 1) return true;
        if (value === 'false' || value === '0' || value === 0) return false;
        return Boolean(value);

      case 'toArray':
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch {
            return value.split(',').map(s => s.trim());
          }
        }
        return [value];

      case 'toObject':
        if (typeof value === 'object' && value !== null) return value;
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return { value };
          }
        }
        return { value };

      case 'toUpperCase':
        return String(value).toUpperCase();

      case 'toLowerCase':
        return String(value).toLowerCase();

      case 'trim':
        return String(value).trim();

      case 'parseJSON':
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;

      case 'stringify':
        return JSON.stringify(value);

      default:
        return value;
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Must have at least one way to set variables
    const hasName = data.name && String(data.name).trim();
    const hasVariables = Array.isArray(data.variables) && data.variables.length > 0;
    const hasFromObject = data.fromObject;

    if (!hasName && !hasVariables && !hasFromObject) {
      errors.push('At least one variable definition is required (name, variables array, or fromObject)');
    }

    // Validate variable names (no special characters that could cause issues)
    const validateName = (name) => {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        errors.push(`Invalid variable name: ${name}. Must start with a letter or underscore and contain only letters, numbers, and underscores.`);
      }
    };

    if (hasName) {
      validateName(String(data.name).trim());
    }

    if (hasVariables) {
      for (const varDef of data.variables) {
        if (varDef.name) {
          validateName(String(varDef.name).trim());
        }
      }
    }

    return errors;
  }
}

module.exports = { SetVariableNode };
