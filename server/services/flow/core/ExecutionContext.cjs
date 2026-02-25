/**
 * Execution Context
 *
 * Provides isolated state management for each flow execution.
 * Features:
 * - Isolated variable scope per execution
 * - Node output storage
 * - Abort signal handling
 * - Timeout management
 * - Event emission for progress tracking
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../../logger.cjs');

// Allowed environment variables (security whitelist)
const ALLOWED_ENV_VARS = ['NODE_ENV', 'TZ', 'LANG'];

/**
 * FlowError - Custom error class for flow execution errors
 */
class FlowError extends Error {
  constructor(message, code, recoverable = false) {
    super(message);
    this.name = 'FlowError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

class FlowTimeoutError extends FlowError {
  constructor(executionId, timeout) {
    super(`Flow execution timed out after ${timeout}ms`, 'EXECUTION_TIMEOUT', false);
    this.name = 'FlowTimeoutError';
    this.executionId = executionId;
    this.timeout = timeout;
  }
}

class FlowCancelledError extends FlowError {
  constructor(executionId) {
    super('Flow execution was cancelled', 'EXECUTION_CANCELLED', false);
    this.name = 'FlowCancelledError';
    this.executionId = executionId;
  }
}

/**
 * ExecutionContext provides isolated state for a single flow execution.
 */
class ExecutionContext extends EventEmitter {
  /**
   * @param {Object} flow - The flow definition
   * @param {Object} [options] - Execution options
   * @param {Object} [options.input] - Input data for the flow
   * @param {string} [options.userId] - User ID for tracking
   * @param {string} [options.executionId] - Custom execution ID
   * @param {number} [options.timeout] - Execution timeout in ms
   * @param {Object} [options.services] - Services available to nodes
   * @param {Object} [options.trigger] - Trigger information
   */
  constructor(flow, options = {}) {
    super();

    // Execution identification
    this.executionId = options.executionId || uuidv4();
    this.flowId = flow.id;
    this.userId = options.userId;

    // Flow definition (parsed)
    this.flow = this.parseFlow(flow);

    // Trigger information
    this.trigger = options.trigger || {
      type: 'manual',
      source: 'api',
      timestamp: new Date().toISOString()
    };

    // Input data (immutable)
    this.input = Object.freeze({ ...options.input });

    // Flow variables (mutable)
    this.variables = this.initializeVariables(flow);

    // Node outputs storage
    this.nodeOutputs = {};

    // Execution tracking
    this.executedNodes = new Set();
    this.nodeExecutions = [];
    this.status = 'pending';

    // Timing
    this.startTime = null;
    this.endTime = null;
    this.timeout = options.timeout || 60000;

    // Abort controller for cancellation
    this.abortController = new AbortController();

    // Services access
    this.services = options.services || {};

    // Progress tracking
    this.completedNodeCount = 0;
    this.totalNodeCount = this.flow.nodes.filter(n => !n.disabled).length;

    // Subflow tracking (for recursion prevention)
    this.subflowStack = options.subflowStack || [];

    // Branch tracking for parallel execution
    this.branchId = options.branchId || null;
    this.parentContext = options.parentContext || null;
  }

  /**
   * Parse flow definition (handle JSON strings)
   * @param {Object} flow
   * @returns {Object}
   */
  parseFlow(flow) {
    let nodes = flow.nodes;
    let edges = flow.edges;

    if (typeof nodes === 'string') {
      try {
        nodes = JSON.parse(nodes);
      } catch (e) {
        nodes = [];
      }
    }

    if (typeof edges === 'string') {
      try {
        edges = JSON.parse(edges);
      } catch (e) {
        edges = [];
      }
    }

    return {
      ...flow,
      nodes: nodes || [],
      edges: edges || []
    };
  }

  /**
   * Initialize flow variables with defaults
   * @param {Object} flow
   * @returns {Object}
   */
  initializeVariables(flow) {
    let variables = flow.variables;

    if (typeof variables === 'string') {
      try {
        variables = JSON.parse(variables);
      } catch (e) {
        variables = {};
      }
    }

    return { ...(variables || {}) };
  }

  /**
   * Start execution
   */
  start() {
    this.status = 'running';
    this.startTime = Date.now();
    this.emit('started', this.getProgressEvent('started'));
  }

  /**
   * Mark execution as completed
   * @param {Object} [output] - Final output
   */
  complete(output) {
    this.status = 'completed';
    this.endTime = Date.now();
    this.emit('completed', this.getProgressEvent('completed', null, output));
  }

  /**
   * Mark execution as failed
   * @param {Error} error
   */
  fail(error) {
    this.status = 'failed';
    this.endTime = Date.now();
    this.emit('failed', this.getProgressEvent('failed', null, null, error));
  }

  /**
   * Get node by ID
   * @param {string} nodeId
   * @returns {Object|undefined}
   */
  getNode(nodeId) {
    return this.flow.nodes.find(n => n.id === nodeId);
  }

  /**
   * Store node output
   * @param {string} nodeId
   * @param {Object} output
   */
  setNodeOutput(nodeId, output) {
    this.nodeOutputs[nodeId] = output;
    this.emit('node:output', { nodeId, output });
  }

  /**
   * Get node output
   * @param {string} nodeId
   * @returns {Object|undefined}
   */
  getNodeOutput(nodeId) {
    return this.nodeOutputs[nodeId];
  }

  /**
   * Update flow variable
   * @param {string} name
   * @param {*} value
   */
  setVariable(name, value) {
    this.variables[name] = value;
    this.emit('variable:updated', { name, value });
  }

  /**
   * Get flow variable
   * @param {string} name
   * @returns {*}
   */
  getVariable(name) {
    return this.variables[name];
  }

  /**
   * Mark node as executed
   * @param {string} nodeId
   */
  markNodeExecuted(nodeId) {
    this.executedNodes.add(nodeId);
    this.completedNodeCount++;
  }

  /**
   * Check if node was executed
   * @param {string} nodeId
   * @returns {boolean}
   */
  isNodeExecuted(nodeId) {
    return this.executedNodes.has(nodeId);
  }

  /**
   * Record node execution result
   * @param {Object} nodeExecution
   */
  recordNodeExecution(nodeExecution) {
    this.nodeExecutions.push(nodeExecution);
  }

  /**
   * Get context for variable resolution
   * @returns {Object}
   */
  getResolverContext() {
    return {
      input: this.input,
      variables: this.variables,
      nodes: this.nodeOutputs,
      env: this.getAllowedEnv(),
      execution: {
        id: this.executionId,
        flowId: this.flowId,
        startTime: this.startTime,
        branchId: this.branchId
      }
    };
  }

  /**
   * Get allowed environment variables
   * @returns {Object}
   */
  getAllowedEnv() {
    const env = {};
    for (const key of ALLOWED_ENV_VARS) {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
    }
    return env;
  }

  /**
   * Create context for node execution
   * @param {Object} node
   * @returns {Object}
   */
  createNodeContext(node) {
    return {
      executionId: this.executionId,
      flow: this.flow,
      node,
      input: { ...this.input, ...this.nodeOutputs },
      variables: this.variables,
      previousResults: this.nodeOutputs,
      services: this.services,
      userId: this.userId,
      logger: this.createNodeLogger(node.id),
      abortSignal: this.abortController.signal,
      branchId: this.branchId,
      subflowStack: this.subflowStack
    };
  }

  /**
   * Create logger for a specific node
   * @param {string} nodeId
   * @returns {Object}
   */
  createNodeLogger(nodeId) {
    return {
      debug: (msg) => logger.debug(`[${this.executionId}][${nodeId}] ${msg}`),
      info: (msg) => logger.info(`[${this.executionId}][${nodeId}] ${msg}`),
      warn: (msg) => logger.warn(`[${this.executionId}][${nodeId}] ${msg}`),
      error: (msg) => logger.error(`[${this.executionId}][${nodeId}] ${msg}`)
    };
  }

  /**
   * Check timeout
   * @throws {FlowTimeoutError} If timeout exceeded
   */
  checkTimeout() {
    if (!this.startTime) return;

    const elapsed = Date.now() - this.startTime;
    if (elapsed > this.timeout) {
      this.abort();
      throw new FlowTimeoutError(this.executionId, this.timeout);
    }
  }

  /**
   * Check if aborted
   * @returns {boolean}
   */
  isAborted() {
    return this.abortController.signal.aborted;
  }

  /**
   * Abort execution
   */
  abort() {
    this.abortController.abort();
    this.status = 'cancelled';
    this.endTime = Date.now();
  }

  /**
   * Check abort and throw if aborted
   * @throws {FlowCancelledError} If aborted
   */
  checkAborted() {
    if (this.isAborted()) {
      throw new FlowCancelledError(this.executionId);
    }
  }

  /**
   * Get execution duration in ms
   * @returns {number|null}
   */
  getDuration() {
    if (!this.startTime) return null;
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  /**
   * Get progress percentage
   * @returns {number}
   */
  getProgress() {
    if (this.totalNodeCount === 0) return 100;
    return Math.round((this.completedNodeCount / this.totalNodeCount) * 100);
  }

  /**
   * Get progress event payload
   * @param {string} type
   * @param {Object} [node]
   * @param {Object} [output]
   * @param {Error} [error]
   * @returns {Object}
   */
  getProgressEvent(type, node = null, output = null, error = null) {
    return {
      executionId: this.executionId,
      flowId: this.flowId,
      type,
      nodeId: node?.id,
      nodeType: node?.type,
      status: this.status,
      progress: {
        completedNodes: this.completedNodeCount,
        totalNodes: this.totalNodeCount,
        percentage: this.getProgress()
      },
      duration: this.getDuration(),
      output,
      error: error ? { code: error.code, message: error.message } : null,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get next node IDs based on edges
   * @param {string} sourceNodeId
   * @param {Object} [result] - Execution result for conditional routing
   * @returns {string[]}
   */
  getNextNodeIds(sourceNodeId, result = null) {
    const nextIds = [];

    for (const edge of this.flow.edges) {
      if (edge.source !== sourceNodeId) continue;

      // Check for conditional routing
      if (edge.sourceHandle && result?.nextNodes) {
        // Only follow edges matching the output condition
        const handleKey = edge.sourceHandle.toLowerCase();
        if (result.nextNodes.includes(handleKey)) {
          nextIds.push(edge.target);
        }
      } else if (!result?.nextNodes) {
        // No specific routing, follow all edges
        nextIds.push(edge.target);
      }
    }

    return nextIds;
  }

  /**
   * Collect final output from terminal nodes
   * @returns {Object}
   */
  collectFinalOutput() {
    const { nodes, edges } = this.flow;

    // Find terminal nodes (no outgoing edges)
    const nodesWithOutgoing = new Set(edges.map(e => e.source));
    const terminalNodes = nodes.filter(n => !nodesWithOutgoing.has(n.id));

    const output = {};

    for (const node of terminalNodes) {
      if (this.nodeOutputs[node.id]) {
        output[node.id] = this.nodeOutputs[node.id];
      }
    }

    // If no terminal outputs, return all outputs
    if (Object.keys(output).length === 0) {
      return { ...this.nodeOutputs };
    }

    return output;
  }

  /**
   * Create child context for parallel branch
   * @param {string} branchId
   * @returns {ExecutionContext}
   */
  createBranchContext(branchId) {
    const childContext = new ExecutionContext(this.flow, {
      input: this.input,
      userId: this.userId,
      executionId: `${this.executionId}-${branchId}`,
      timeout: this.timeout - this.getDuration(),
      services: this.services,
      trigger: this.trigger,
      subflowStack: this.subflowStack,
      branchId,
      parentContext: this
    });

    // Share node outputs for reading (but writes go to child)
    childContext.nodeOutputs = { ...this.nodeOutputs };
    childContext.variables = { ...this.variables };

    return childContext;
  }

  /**
   * Merge branch context back into parent
   * @param {ExecutionContext} branchContext
   */
  mergeBranchContext(branchContext) {
    // Merge node outputs
    Object.assign(this.nodeOutputs, branchContext.nodeOutputs);

    // Merge variables
    Object.assign(this.variables, branchContext.variables);

    // Merge node executions
    this.nodeExecutions.push(...branchContext.nodeExecutions);

    // Update counts
    this.completedNodeCount += branchContext.completedNodeCount;
  }

  /**
   * Get execution summary
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.executionId,
      flowId: this.flowId,
      userId: this.userId,
      status: this.status,
      trigger: this.trigger,
      input: this.input,
      output: this.collectFinalOutput(),
      variables: this.variables,
      nodeExecutions: this.nodeExecutions,
      progress: {
        completed: this.completedNodeCount,
        total: this.totalNodeCount,
        percentage: this.getProgress()
      },
      duration: this.getDuration(),
      startedAt: this.startTime ? new Date(this.startTime).toISOString() : null,
      completedAt: this.endTime ? new Date(this.endTime).toISOString() : null
    };
  }
}

module.exports = {
  ExecutionContext,
  FlowError,
  FlowTimeoutError,
  FlowCancelledError
};
