/**
 * Flow Execution Engine (v2)
 *
 * Executes visual workflows defined in the FlowBuilder with:
 * - Parallel branch execution support
 * - Enhanced error handling with retry policies
 * - Circuit breaker protection
 * - Isolated execution context per flow
 * - Real-time progress events via WebSocket
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { VariableResolver } = require('./VariableResolver.cjs');
const { BaseNodeExecutor } = require('./BaseNodeExecutor.cjs');

// Import new core modules
const { ExecutionContext, FlowError, FlowTimeoutError, FlowCancelledError } = require('./core/ExecutionContext.cjs');
const { ParallelExecutionManager, ParallelMode } = require('./core/ParallelExecutionManager.cjs');
const { getErrorHandler, ErrorStrategy } = require('./middleware/ErrorHandler.cjs');
const { getCircuitBreaker, CircuitBreaker } = require('./middleware/CircuitBreaker.cjs');
const { getSwarmServiceBridge } = require('./SwarmServiceBridge.cjs');

// Lazy load SuperBrain to avoid circular dependencies
let _superBrain = null;
function getSuperBrain() {
  if (!_superBrain) {
    try {
      const { getSuperBrainRouter } = require('../ai/SuperBrainRouter.cjs');
      _superBrain = getSuperBrainRouter();
    } catch (e) {
      // SuperBrain not available
    }
  }
  return _superBrain;
}

// Trigger node types that can start flow execution
const TRIGGER_NODE_TYPES = [
  'trigger:manual',
  'trigger:schedule',
  'trigger:webhook',
  'trigger:message',
  'manual',
  'schedule',
  'webhook',
];

/**
 * FlowExecutionEngine executes visual workflows with enhanced features.
 */
class FlowExecutionEngine extends EventEmitter {
  /**
   * @param {Object} [services] - Optional services available to node executors
   */
  constructor(services = {}) {
    super();
    this.nodeExecutors = new Map();
    this.variableResolver = new VariableResolver();
    this.activeExecutions = new Map();
    this.services = services;

    // Initialize middleware
    this.errorHandler = getErrorHandler();
    this.circuitBreaker = getCircuitBreaker();
    this.parallelManager = new ParallelExecutionManager(this);

    // Auto-register built-in nodes
    this.registerBuiltInNodes();
  }

  /**
   * Register all built-in node executors
   */
  registerBuiltInNodes() {
    try {
      const { registerAllNodes } = require('./nodes/index.cjs');
      const count = registerAllNodes(this);
      logger.info(`FlowExecutionEngine: Registered ${count} node executors`);
    } catch (error) {
      logger.warn(`FlowExecutionEngine: Could not auto-register nodes: ${error.message}`);
    }
  }

  /**
   * Register a node executor
   * @param {BaseNodeExecutor} executor - The node executor to register
   */
  registerNode(executor) {
    if (!executor || !executor.type) {
      throw new Error('Executor must have a type property');
    }

    const type = executor.type;
    if (this.nodeExecutors.has(type)) {
      logger.debug(`Overwriting node executor: ${type}`);
    }
    this.nodeExecutors.set(type, executor);
    logger.debug(`Registered node executor: ${type}`);
  }

  /**
   * Get a registered node executor
   * @param {string} type - Node type
   * @returns {BaseNodeExecutor|undefined}
   */
  getNodeExecutor(type) {
    return this.nodeExecutors.get(type);
  }

  /**
   * Get all registered node types
   * @returns {string[]}
   */
  getRegisteredNodeTypes() {
    return Array.from(this.nodeExecutors.keys());
  }

  /**
   * Execute a flow with the given options.
   *
   * @param {Object} flow - The flow definition to execute
   * @param {Object} [options] - Execution options
   * @returns {Promise<Object>} The completed flow execution
   */
  async execute(flow, options = {}) {
    // Create execution context
    const context = new ExecutionContext(flow, {
      executionId: options.executionId || uuidv4(),
      input: options.input || {},
      userId: options.userId,
      timeout: options.timeout || 60000,
      services: {
        ...this.services,
        parallelManager: this.parallelManager,
        errorHandler: this.errorHandler,
        circuitBreaker: this.circuitBreaker,
        swarm: getSwarmServiceBridge(),
        ai: getSuperBrain(),
        database: getDatabase(),
      },
      trigger: options.trigger || {
        type: 'manual',
        source: 'api',
        timestamp: new Date().toISOString()
      }
    });

    // Store active execution
    this.activeExecutions.set(context.executionId, context);

    // Emit start event
    this.emit('execution:started', { execution: context.toJSON() });
    this.emitProgress(context, 'started');

    // Save to database
    await this.saveExecution(context);

    try {
      // Start execution
      context.start();
      await this.updateExecution(context.executionId, {
        status: 'running',
        startedAt: new Date(context.startTime).toISOString()
      });

      // Execute with timeout
      await Promise.race([
        this.executeFlowGraph(context),
        this.createTimeoutPromise(context)
      ]);

      // Mark as completed
      context.complete();
      const finalOutput = context.collectFinalOutput();

      await this.updateExecution(context.executionId, {
        status: 'completed',
        completedAt: new Date(context.endTime).toISOString(),
        outputs: JSON.stringify(finalOutput)
      });

      this.emit('execution:completed', { execution: context.toJSON() });
      this.emitProgress(context, 'completed');

      return context.toJSON();

    } catch (error) {
      context.fail(error);

      // Note: 'timeout' is not a valid DB status, use 'failed' instead
      // The error message will indicate it was a timeout
      const status = error instanceof FlowCancelledError ? 'cancelled' : 'failed';

      await this.updateExecution(context.executionId, {
        status,
        completedAt: new Date(context.endTime).toISOString(),
        error: error.message
      });

      this.emit('execution:failed', { execution: context.toJSON(), error });
      this.emitProgress(context, 'failed');

      return context.toJSON();

    } finally {
      this.activeExecutions.delete(context.executionId);
    }
  }

  /**
   * Execute the flow graph
   * @private
   */
  async executeFlowGraph(context) {
    const { flow } = context;
    const { nodes, edges } = flow;

    // Find trigger nodes
    const triggerNodes = nodes.filter(n =>
      TRIGGER_NODE_TYPES.some(t => n.type === t || n.type.startsWith('trigger'))
    );

    if (triggerNodes.length === 0) {
      // Find nodes with no incoming edges
      const nodesWithIncoming = new Set(edges.map(e => e.target));
      const startNodes = nodes.filter(n => !nodesWithIncoming.has(n.id));

      if (startNodes.length > 0) {
        triggerNodes.push(...startNodes);
      } else if (nodes.length > 0) {
        triggerNodes.push(nodes[0]);
      }
    }

    // Execute from each trigger node
    for (const triggerNode of triggerNodes) {
      context.checkAborted();
      context.checkTimeout();

      await this.executeNodeChain(triggerNode, context, new Set());
    }
  }

  /**
   * Execute a node and its downstream nodes
   * @param {Object} node - The node to execute
   * @param {ExecutionContext} context - Execution context
   * @param {Set} executedNodes - Already executed node IDs
   */
  async executeNodeChain(node, context, executedNodes) {
    // Check if already executed or aborted
    if (context.isNodeExecuted(node.id) || context.isAborted()) {
      return;
    }

    context.markNodeExecuted(node.id);
    executedNodes.add(node.id);

    // Get executor - try multiple type formats for compatibility
    // Frontend uses { type: 'trigger', data: { subtype: 'manual' } }
    // Backend registers { type: 'trigger:manual' }
    let executor = this.nodeExecutors.get(node.type);

    // If not found, try compound type with subtype
    if (!executor && node.data?.subtype) {
      const compoundType = `${node.type}:${node.data.subtype}`;
      executor = this.nodeExecutors.get(compoundType);
      if (executor) {
        logger.debug(`Resolved executor for ${node.type} via compound type: ${compoundType}`);
      }
    }

    // Try mapping common subtypes to backend executor types
    if (!executor && node.data?.subtype) {
      const subtypeMap = {
        // Triggers
        'manual': 'trigger:manual',
        'schedule': 'trigger:schedule',
        'webhook': 'trigger:webhook',
        'message_received': 'trigger:message',
        'email_received': 'trigger:message',
        'event': 'trigger:manual',
        // AI nodes
        'ai_response': 'ai:chatCompletion',
        'ai_with_rag': 'ai:ragQuery',
        'ai_router': 'ai:router',
        'ai_classify': 'ai:classifyIntent',
        'ai_translate': 'ai:translate',
        'ai_summarize': 'ai:summarize',
        'ai_rephrase': 'ai:rephrase',
        'sentiment_analysis': 'ai:classifyIntent',
        'extract_entities': 'ai:classifyIntent',
        'summarize_memory': 'ai:summarize',
        'superbrain': 'ai:superBrain',
        // Actions - messaging
        'send_message': 'messaging:sendText',
        'send_email': 'messaging:sendText',
        'send_whatsapp': 'messaging:sendWhatsApp',
        'send_telegram': 'messaging:sendTelegram',
        'send_media': 'messaging:sendMedia',
        'wait_for_reply': 'messaging:waitForReply',
        // Actions - logic
        'condition': 'logic:condition',
        'delay': 'logic:delay',
        'set_variable': 'logic:setVariable',
        'loop': 'logic:loop',
        'switch': 'logic:switch',
        'transform': 'logic:setVariable',
        'subflow': 'logic:subflow',
        'parallel': 'logic:parallel',
        'merge': 'logic:merge',
        'retry': 'logic:retry',
        'error_handler': 'logic:errorHandler',
        // Actions - web
        'http_request': 'web:httpRequest',
        'web_fetch': 'web:httpRequest',
        // Actions - data
        'data_query': 'data:query',
        'data_insert': 'data:insert',
        'data_update': 'data:update',
        // Swarm nodes
        'agent_query': 'swarm:queryAgent',
        'swarm_broadcast': 'swarm:broadcast',
        'agent_handoff': 'swarm:handoff',
        'swarm_consensus': 'swarm:consensus',
        'swarm_task': 'swarm:task',
        'find_agent': 'swarm:findAgent',
        'swarm_status': 'swarm:status',
        // Agentic
        'custom_tool': 'agentic:customTool',
      };

      const mappedType = subtypeMap[node.data.subtype];
      if (mappedType) {
        executor = this.nodeExecutors.get(mappedType);
        if (executor) {
          logger.debug(`Resolved executor for ${node.type}/${node.data.subtype} via mapping: ${mappedType}`);
        }
      }
    }

    let result;

    if (executor) {
      // Emit node started
      this.emit('node:started', {
        executionId: context.executionId,
        nodeId: node.id,
        nodeType: node.type
      });
      this.emitProgress(context, 'node_started', node);

      // Resolve variables in node data
      const resolverContext = context.getResolverContext();
      const resolvedData = this.variableResolver.resolveObject(node.data || {}, resolverContext);
      const resolvedNode = { ...node, data: resolvedData };

      // Create node-specific context
      const nodeContext = context.createNodeContext(resolvedNode);

      try {
        // Check circuit breaker
        const circuitKey = CircuitBreaker.nodeKey(node.type);
        if (!this.circuitBreaker.canExecute(circuitKey)) {
          throw new FlowError(`Circuit breaker open for ${node.type}`, 'CIRCUIT_OPEN', true);
        }

        // Validate node configuration
        const validationErrors = executor.validate(resolvedNode);
        if (validationErrors.length > 0) {
          throw new FlowError(`Validation failed: ${validationErrors.join(', ')}`, 'VALIDATION_ERROR');
        }

        // Execute with circuit breaker protection
        result = await this.circuitBreaker.execute(circuitKey, async () => {
          return executor.execute(nodeContext);
        });

      } catch (error) {
        // Handle error with middleware
        const action = await this.errorHandler.handleNodeError(error, node, context);

        if (action.action === 'retry') {
          // Retry logic is handled in errorHandler.wrap()
          result = { success: false, error: { message: error.message }, continueExecution: false };
        } else if (action.action === 'skip') {
          result = action.output ? { success: true, output: action.output, continueExecution: true } : this.createSkipResult(error);
        } else if (action.action === 'redirect' && action.targetNodeId) {
          // Execute fallback node
          const fallbackNode = context.getNode(action.targetNodeId);
          if (fallbackNode) {
            await this.executeNodeChain(fallbackNode, context, executedNodes);
          }
          result = { success: true, output: { redirected: true }, continueExecution: true };
        } else {
          result = { success: false, error: { code: error.code, message: error.message }, continueExecution: false };
        }
      }
    } else {
      // No executor found - skip with warning
      logger.warn(`No executor found for node type: ${node.type}`);
      result = {
        success: true,
        output: { skipped: true, reason: `No executor for ${node.type}` },
        continueExecution: true
      };
    }

    // Store output
    if (result.output) {
      context.setNodeOutput(node.id, result.output);
    }

    // Update variables
    if (result.variableUpdates) {
      for (const [name, value] of Object.entries(result.variableUpdates)) {
        context.setVariable(name, value);
      }
    }

    // Record node execution
    context.recordNodeExecution({
      nodeId: node.id,
      nodeType: node.type,
      status: result.success ? 'completed' : 'failed',
      output: result.output,
      error: result.error,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });

    // Emit node completed
    this.emit('node:completed', {
      executionId: context.executionId,
      nodeId: node.id,
      nodeType: node.type,
      result
    });
    this.emitProgress(context, 'node_completed', node);

    // Check if we should continue
    if (!result.continueExecution) {
      if (!result.success) {
        throw new FlowError(result.error?.message || 'Node execution failed', 'NODE_FAILED');
      }
      return;
    }

    // Find and execute next nodes
    const nextNodeIds = result.nextNodes || context.getNextNodeIds(node.id, result);

    // Check for parallel execution node
    if (node.type === 'logic:parallel' && nextNodeIds.length > 1) {
      // Execute branches in parallel
      const parallelResult = await this.parallelManager.executeBranches({
        executionId: context.executionId,
        branches: nextNodeIds,
        mode: node.data?.mode || ParallelMode.ALL,
        timeout: (node.data?.timeout || 30) * 1000,
        continueOnError: node.data?.continueOnError || false,
        context
      });

      // Store parallel results
      context.setNodeOutput(`${node.id}_parallel`, parallelResult);
      return;
    }

    // Execute next nodes sequentially
    for (const nextNodeId of nextNodeIds) {
      const nextNode = context.getNode(nextNodeId);
      if (nextNode && !context.isNodeExecuted(nextNodeId)) {
        await this.executeNodeChain(nextNode, context, executedNodes);
      }
    }
  }

  /**
   * Internal method for parallel execution manager
   * @param {Object} startNode - Starting node
   * @param {ExecutionContext} context - Branch context
   * @param {Set} executedNodes - Already executed nodes
   */
  async executeNodeChainInternal(startNode, context, executedNodes) {
    await this.executeNodeChain(startNode, context, executedNodes);
    return context.collectFinalOutput();
  }

  /**
   * Create a skip result
   * @private
   */
  createSkipResult(error) {
    return {
      success: true,
      output: {
        skipped: true,
        reason: error.message
      },
      continueExecution: true
    };
  }

  /**
   * Create a timeout promise
   * @private
   */
  createTimeoutPromise(context) {
    return new Promise((_, reject) => {
      const checkInterval = setInterval(() => {
        try {
          context.checkTimeout();
        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, 1000);

      // Clean up on abort
      context.abortController.signal.addEventListener('abort', () => {
        clearInterval(checkInterval);
        reject(new FlowCancelledError(context.executionId));
      });
    });
  }

  /**
   * Emit progress event
   * @private
   */
  emitProgress(context, type, node = null) {
    const event = context.getProgressEvent(type, node);

    // WebSocket broadcast
    if (global.wsBroadcast) {
      global.wsBroadcast(`flow:${type}`, event);
    }

    // Internal event
    this.emit('progress', event);
  }

  /**
   * Cancel an active execution
   * @param {string} executionId - The execution ID to cancel
   * @returns {boolean} True if cancelled
   */
  cancelExecution(executionId) {
    const context = this.activeExecutions.get(executionId);
    if (context) {
      context.abort();
      this.parallelManager.cancelBranches(executionId);
      return true;
    }
    return false;
  }

  /**
   * Get all currently active executions
   * @returns {Object[]} Array of active flow executions
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values()).map(ctx => ctx.toJSON());
  }

  /**
   * Get execution by ID
   * @param {string} executionId
   * @returns {Object|undefined}
   */
  getExecution(executionId) {
    const context = this.activeExecutions.get(executionId);
    return context ? context.toJSON() : undefined;
  }

  /**
   * Save execution to database
   * @private
   */
  async saveExecution(context) {
    try {
      const db = getDatabase();

      db.prepare(`
        INSERT INTO flow_executions (
          id, flow_id, user_id, status, trigger_type, inputs, outputs,
          node_results, error, started_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        context.executionId,
        context.flowId,
        context.userId,
        context.status,
        context.trigger?.type || 'manual',
        JSON.stringify(context.input),
        JSON.stringify({}),
        JSON.stringify([]),
        null,
        null
      );
    } catch (error) {
      logger.error(`Failed to save execution: ${error.message}`);
    }
  }

  /**
   * Update execution in database
   * @private
   */
  async updateExecution(executionId, updates) {
    try {
      const db = getDatabase();
      const fields = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        fields.push(`${dbKey} = ?`);
        values.push(value);
      }

      if (fields.length > 0) {
        values.push(executionId);
        db.prepare(`UPDATE flow_executions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }
    } catch (error) {
      logger.error(`Failed to update execution: ${error.message}`);
    }
  }

  /**
   * Shutdown the engine
   */
  shutdown() {
    // Cancel all active executions
    for (const [executionId] of this.activeExecutions) {
      this.cancelExecution(executionId);
    }

    // Shutdown circuit breaker
    this.circuitBreaker.shutdown();
  }
}

// Singleton instance
let engineInstance = null;

/**
 * Get the FlowExecutionEngine singleton
 * @param {Object} [services] - Optional services
 * @returns {FlowExecutionEngine}
 */
function getFlowExecutionEngine(services) {
  if (!engineInstance) {
    engineInstance = new FlowExecutionEngine(services);
  } else if (services) {
    // Update services if provided
    Object.assign(engineInstance.services, services);
  }
  return engineInstance;
}

/**
 * Reset the engine singleton (for testing)
 */
function resetFlowExecutionEngine() {
  if (engineInstance) {
    engineInstance.shutdown();
    engineInstance = null;
  }
}

module.exports = {
  FlowExecutionEngine,
  getFlowExecutionEngine,
  resetFlowExecutionEngine
};
