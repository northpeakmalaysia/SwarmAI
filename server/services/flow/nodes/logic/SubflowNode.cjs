/**
 * Subflow Node
 *
 * Executes another flow as a subflow within the current flow.
 * Enables flow composition and reusability.
 *
 * Features:
 * - Execute any saved flow as a subflow
 * - Pass input variables to subflow
 * - Receive output from subflow
 * - Isolated or shared context options
 * - Error handling and timeout
 * - Recursive subflow support (with depth limit)
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { getDatabase } = require('../../../database.cjs');

class SubflowNode extends BaseNodeExecutor {
  constructor() {
    super('logic:subflow', 'logic');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'logic:subflow',
      label: 'Subflow',
      description: 'Execute another flow as a subflow',
      icon: 'Workflow',
      category: 'logic',
      color: 'purple',
      properties: {
        flowId: {
          type: 'select',
          label: 'Flow to Execute',
          description: 'Select the flow to execute as a subflow',
          required: true,
          dynamic: true, // Options loaded dynamically from database
          options: [] // Populated at runtime
        },
        inputMapping: {
          type: 'array',
          label: 'Input Mapping',
          description: 'Map variables to pass to the subflow',
          itemSchema: {
            type: 'object',
            properties: {
              sourceVariable: { type: 'text', label: 'Source Variable', showVariablePicker: true },
              targetInput: { type: 'text', label: 'Subflow Input Name' }
            }
          }
        },
        outputMapping: {
          type: 'array',
          label: 'Output Mapping',
          description: 'Map subflow outputs to variables',
          itemSchema: {
            type: 'object',
            properties: {
              sourceOutput: { type: 'text', label: 'Subflow Output Name' },
              targetVariable: { type: 'text', label: 'Target Variable' }
            }
          }
        },
        contextMode: {
          type: 'select',
          label: 'Context Mode',
          description: 'How to handle execution context',
          options: [
            { value: 'isolated', label: 'Isolated - Fresh context for subflow' },
            { value: 'inherit', label: 'Inherit - Share parent context (read-only)' },
            { value: 'shared', label: 'Shared - Full access to parent context' }
          ],
          default: 'isolated'
        },
        timeout: {
          type: 'number',
          label: 'Timeout (seconds)',
          description: 'Maximum execution time for subflow',
          default: 60,
          min: 1,
          max: 600
        },
        maxDepth: {
          type: 'number',
          label: 'Max Recursion Depth',
          description: 'Maximum depth for nested subflows',
          default: 5,
          min: 1,
          max: 10
        },
        onError: {
          type: 'select',
          label: 'On Error',
          description: 'How to handle subflow errors',
          options: [
            { value: 'fail', label: 'Fail - Stop parent flow' },
            { value: 'continue', label: 'Continue - Use default output and continue' },
            { value: 'skip', label: 'Skip - Skip this node and continue' }
          ],
          default: 'fail'
        },
        defaultOutput: {
          type: 'json',
          label: 'Default Output',
          description: 'Default output to use on error (when onError is "continue")',
          showWhen: { onError: 'continue' }
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Result In',
          placeholder: 'subflowResult'
        }
      },
      outputs: {
        default: { label: 'Completed', type: 'default' },
        error: { label: 'Error', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        flowId: '',
        inputMapping: [],
        outputMapping: [],
        contextMode: 'isolated',
        timeout: 60,
        maxDepth: 5,
        onError: 'fail',
        defaultOutput: null,
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

    if (!data.flowId) {
      errors.push('Flow ID is required');
    }

    if (data.timeout !== undefined && data.timeout < 1) {
      errors.push('Timeout must be at least 1 second');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      flowId,
      inputMapping,
      outputMapping,
      contextMode,
      timeout,
      maxDepth,
      onError,
      defaultOutput,
      storeInVariable
    } = context.node.data;

    if (!flowId) {
      return this.failure('Flow ID is required', 'MISSING_FLOW_ID');
    }

    // Check recursion depth
    const currentDepth = (context.subflowDepth || 0) + 1;
    if (currentDepth > maxDepth) {
      return this.failure(
        `Maximum subflow depth (${maxDepth}) exceeded`,
        'MAX_DEPTH_EXCEEDED'
      );
    }

    try {
      // Load the subflow definition
      const subflow = await this.loadFlow(flowId, context.userId);

      if (!subflow) {
        return this.failure(`Flow not found: ${flowId}`, 'FLOW_NOT_FOUND');
      }

      context.logger.info(`Executing subflow: ${subflow.name} (depth: ${currentDepth})`);

      // Build subflow input
      const subflowInput = this.buildSubflowInput(inputMapping, context);

      // Build subflow context
      const subflowContext = this.buildSubflowContext(context, subflow, {
        input: subflowInput,
        contextMode,
        depth: currentDepth
      });

      // Get execution engine
      const engine = context.services?.flowEngine;

      if (!engine) {
        return this.failure('Flow execution engine not available', 'ENGINE_UNAVAILABLE');
      }

      // Execute subflow with timeout
      const result = await Promise.race([
        engine.execute(subflow, {
          executionId: `${context.executionId}_sub_${currentDepth}`,
          input: subflowInput,
          userId: context.userId,
          timeout: timeout * 1000,
          subflowDepth: currentDepth
        }),
        this.createTimeoutPromise(timeout)
      ]);

      // Handle timeout
      if (result.timedOut) {
        throw new Error(`Subflow timed out after ${timeout} seconds`);
      }

      // Handle subflow failure
      if (result.status === 'failed') {
        throw new Error(result.error || 'Subflow execution failed');
      }

      // Map outputs to variables
      const mappedOutputs = this.mapOutputs(outputMapping, result.outputs, context);

      // Build output
      const output = {
        flowId,
        flowName: subflow.name,
        status: result.status,
        executionId: result.executionId,
        outputs: mappedOutputs,
        duration: result.duration,
        depth: currentDepth,
        completedAt: new Date().toISOString()
      };

      // Store in variable if specified
      if (storeInVariable) {
        context.variables[storeInVariable] = output;
      }

      return this.success(output);

    } catch (error) {
      context.logger.error(`Subflow failed: ${error.message}`);

      // Handle error based on configuration
      switch (onError) {
        case 'continue':
          return this.success({
            flowId,
            status: 'error',
            error: error.message,
            outputs: defaultOutput || {},
            usedDefault: true
          });

        case 'skip':
          return {
            success: true,
            output: {
              skipped: true,
              reason: error.message
            },
            continueExecution: true
          };

        case 'fail':
        default:
          return this.failure(error.message, 'SUBFLOW_ERROR', true, ['error']);
      }
    }
  }

  /**
   * Load flow from database
   * @private
   */
  async loadFlow(flowId, userId) {
    const db = getDatabase();

    const flow = db.prepare(`
      SELECT * FROM flows
      WHERE id = ? AND (user_id = ? OR is_public = 1)
    `).get(flowId, userId);

    if (!flow) {
      return null;
    }

    // Parse JSON fields
    return {
      ...flow,
      nodes: JSON.parse(flow.nodes || '[]'),
      edges: JSON.parse(flow.edges || '[]'),
      variables: JSON.parse(flow.variables || '{}')
    };
  }

  /**
   * Build input for subflow from mapping
   * @private
   */
  buildSubflowInput(mapping, context) {
    const input = {};

    if (!mapping || !Array.isArray(mapping)) {
      return input;
    }

    for (const map of mapping) {
      if (map.sourceVariable && map.targetInput) {
        const value = this.resolveTemplate(`{{${map.sourceVariable}}}`, context);
        input[map.targetInput] = value;
      }
    }

    return input;
  }

  /**
   * Build context for subflow execution
   * @private
   */
  buildSubflowContext(parentContext, subflow, options) {
    const { input, contextMode, depth } = options;

    const context = {
      flow: subflow,
      input,
      subflowDepth: depth,
      parentExecutionId: parentContext.executionId
    };

    switch (contextMode) {
      case 'inherit':
        // Read-only copy of parent variables
        context.variables = { ...parentContext.variables };
        break;

      case 'shared':
        // Direct reference to parent variables
        context.variables = parentContext.variables;
        break;

      case 'isolated':
      default:
        // Fresh variables
        context.variables = {};
        break;
    }

    return context;
  }

  /**
   * Map subflow outputs to parent context
   * @private
   */
  mapOutputs(mapping, outputs, context) {
    const result = {};

    if (!mapping || !Array.isArray(mapping)) {
      return outputs || {};
    }

    for (const map of mapping) {
      if (map.sourceOutput && map.targetVariable) {
        const value = outputs?.[map.sourceOutput];
        result[map.targetVariable] = value;
        context.variables[map.targetVariable] = value;
      }
    }

    return result;
  }

  /**
   * Create a timeout promise
   * @private
   */
  createTimeoutPromise(timeoutSeconds) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ timedOut: true });
      }, timeoutSeconds * 1000);
    });
  }
}

module.exports = { SubflowNode };
