/**
 * Custom Tool Node
 *
 * FlowBuilder node that executes custom Python tools created by AI agents.
 * Dynamically loads tools from the database and runs them in the PythonSandbox.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { getPythonSandbox } = require('../../../agentic/PythonSandbox.cjs');
const { getDatabase } = require('../../../database.cjs');
const { logger } = require('../../../logger.cjs');

/**
 * CustomToolNode Executor
 *
 * Executes a custom Python tool from the database.
 *
 * Configuration (node.data):
 * - toolId: string (required) - The ID of the custom tool to execute
 * - inputs: object (optional) - Input parameters for the tool (can use {{}} templates)
 * - timeout: number (optional) - Execution timeout in ms (default: 30000)
 *
 * Output:
 * - result: The parsed JSON result from the tool execution
 * - executionTime: Time taken to execute in ms
 * - toolName: Name of the executed tool
 */
class CustomToolNode extends BaseNodeExecutor {
  constructor() {
    super('agentic:customTool', 'agentic');
  }

  validate(node) {
    const errors = [];

    if (!node.data?.toolId) {
      errors.push('Tool ID is required');
    }

    return errors;
  }

  async execute(context) {
    const { node, userId } = context;
    const toolId = this.getRequired(node.data, 'toolId');
    const inputsTemplate = this.getOptional(node.data, 'inputs', {});
    const timeout = this.getOptional(node.data, 'timeout', 30000);

    try {
      // Get tool from database
      const db = getDatabase();
      const tool = db.prepare(`
        SELECT t.*, w.workspace_path
        FROM custom_tools t
        LEFT JOIN agentic_workspaces w ON t.workspace_id = w.id
        WHERE t.id = ? AND t.is_active = 1
      `).get(toolId);

      if (!tool) {
        return this.failure(`Tool not found or inactive: ${toolId}`, 'TOOL_NOT_FOUND');
      }

      // Check ownership if userId provided
      if (userId && tool.user_id !== userId) {
        return this.failure('Access denied to this tool', 'ACCESS_DENIED');
      }

      // Resolve template variables in inputs
      let resolvedInputs = {};
      if (typeof inputsTemplate === 'object') {
        for (const [key, value] of Object.entries(inputsTemplate)) {
          if (typeof value === 'string') {
            resolvedInputs[key] = this.resolveTemplate(value, context);
          } else {
            resolvedInputs[key] = value;
          }
        }
      } else if (typeof inputsTemplate === 'string') {
        // If inputs is a JSON string template, resolve and parse
        const resolvedString = this.resolveTemplate(inputsTemplate, context);
        try {
          resolvedInputs = JSON.parse(resolvedString);
        } catch {
          resolvedInputs = {};
        }
      }

      // Execute in sandbox
      const sandbox = getPythonSandbox({ timeout });
      const result = await sandbox.executeTool(tool, resolvedInputs, tool.workspace_path);

      if (result.status !== 'success') {
        return this.failure(
          result.error || 'Tool execution failed',
          result.status === 'timeout' ? 'TIMEOUT' : 'EXECUTION_ERROR',
          result.status === 'timeout' // timeout is recoverable
        );
      }

      // Parse output
      let parsedOutput = result.output;
      try {
        if (result.output && typeof result.output === 'string') {
          parsedOutput = JSON.parse(result.output);
        }
      } catch {
        // Keep as string
      }

      // Extract result from wrapper
      const toolResult = parsedOutput?.result !== undefined ? parsedOutput.result : parsedOutput;

      logger.info(`CustomToolNode executed: ${tool.name} (${result.executionTime}ms)`);

      return this.success({
        result: toolResult,
        executionTime: result.executionTime,
        toolName: tool.name,
        toolId: tool.id,
      });

    } catch (error) {
      logger.error(`CustomToolNode error: ${error.message}`);
      return this.failure(error.message, 'EXECUTION_ERROR');
    }
  }
}

/**
 * DynamicCustomToolNode
 *
 * Factory for creating custom tool nodes dynamically.
 * Each custom tool in the database can be represented as its own node type.
 */
class DynamicCustomToolNode extends BaseNodeExecutor {
  constructor(tool) {
    // Create unique type based on tool
    super(`agentic:tool:${tool.id}`, 'agentic');
    this.tool = tool;
    this.toolName = tool.name;
    this.toolDescription = tool.description;
    this.toolParameters = tool.parameters ? JSON.parse(tool.parameters) : [];
  }

  validate(node) {
    const errors = [];

    // Validate required parameters
    for (const param of this.toolParameters) {
      if (param.required && !node.data?.[param.name]) {
        errors.push(`Required parameter '${param.name}' is missing`);
      }
    }

    return errors;
  }

  async execute(context) {
    const { node, userId } = context;

    try {
      // Build inputs from node data based on tool parameters
      const inputs = {};
      for (const param of this.toolParameters) {
        let value = node.data?.[param.name];

        // Resolve templates
        if (typeof value === 'string') {
          value = this.resolveTemplate(value, context);
        }

        // Type conversion
        if (value !== undefined) {
          switch (param.type) {
            case 'number':
              value = Number(value);
              break;
            case 'boolean':
              value = value === true || value === 'true';
              break;
            case 'array':
            case 'object':
              if (typeof value === 'string') {
                try {
                  value = JSON.parse(value);
                } catch {
                  // Keep as string
                }
              }
              break;
          }
        } else if (param.default !== undefined) {
          value = param.default;
        }

        inputs[param.name] = value;
      }

      // Execute in sandbox
      const sandbox = getPythonSandbox();
      const result = await sandbox.executeTool(this.tool, inputs, this.tool.workspace_path);

      if (result.status !== 'success') {
        return this.failure(
          result.error || 'Tool execution failed',
          result.status === 'timeout' ? 'TIMEOUT' : 'EXECUTION_ERROR'
        );
      }

      // Parse and extract result
      let parsedOutput = result.output;
      try {
        if (result.output && typeof result.output === 'string') {
          parsedOutput = JSON.parse(result.output);
        }
      } catch {
        // Keep as string
      }

      const toolResult = parsedOutput?.result !== undefined ? parsedOutput.result : parsedOutput;

      return this.success({
        result: toolResult,
        executionTime: result.executionTime,
        toolName: this.toolName,
      });

    } catch (error) {
      logger.error(`DynamicCustomToolNode error: ${error.message}`);
      return this.failure(error.message, 'EXECUTION_ERROR');
    }
  }

  /**
   * Get node metadata for FlowBuilder UI
   */
  getMetadata() {
    return {
      type: this.type,
      category: this.category,
      name: this.toolName,
      description: this.toolDescription,
      icon: 'tool',
      color: '#8B5CF6', // Purple for custom tools
      inputs: this.toolParameters.map(p => ({
        name: p.name,
        type: p.type || 'string',
        description: p.description,
        required: p.required || false,
        default: p.default,
      })),
      outputs: [
        { name: 'result', type: 'any', description: 'Tool execution result' },
        { name: 'executionTime', type: 'number', description: 'Execution time in ms' },
      ],
    };
  }
}

/**
 * Load all active custom tools as dynamic nodes
 * @param {string} [userId] - Optional user ID to filter tools
 * @returns {Array<DynamicCustomToolNode>}
 */
function loadCustomToolNodes(userId = null) {
  try {
    const db = getDatabase();

    let query = `
      SELECT t.*, w.workspace_path
      FROM custom_tools t
      LEFT JOIN agentic_workspaces w ON t.workspace_id = w.id
      WHERE t.is_active = 1
    `;

    const params = [];
    if (userId) {
      query += ' AND t.user_id = ?';
      params.push(userId);
    }

    const tools = db.prepare(query).all(...params);

    return tools.map(tool => new DynamicCustomToolNode(tool));

  } catch (error) {
    logger.error(`Failed to load custom tool nodes: ${error.message}`);
    return [];
  }
}

/**
 * Get custom tools metadata for FlowBuilder UI
 * @param {string} [userId] - Optional user ID to filter tools
 * @returns {Array<Object>}
 */
function getCustomToolsMetadata(userId = null) {
  const nodes = loadCustomToolNodes(userId);
  return nodes.map(node => node.getMetadata());
}

module.exports = {
  CustomToolNode,
  DynamicCustomToolNode,
  loadCustomToolNodes,
  getCustomToolsMetadata,
};
