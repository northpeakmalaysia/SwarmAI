/**
 * Flow Core Module Index
 *
 * Exports all core components for the FlowBuilder module.
 */

const { NodeRegistry, getNodeRegistry, initializeRegistry } = require('./NodeRegistry.cjs');
const { ExecutionContext, FlowError, FlowTimeoutError, FlowCancelledError } = require('./ExecutionContext.cjs');
const { ParallelExecutionManager, ParallelMode } = require('./ParallelExecutionManager.cjs');

module.exports = {
  // Node Registry
  NodeRegistry,
  getNodeRegistry,
  initializeRegistry,

  // Execution Context
  ExecutionContext,
  FlowError,
  FlowTimeoutError,
  FlowCancelledError,

  // Parallel Execution
  ParallelExecutionManager,
  ParallelMode
};
