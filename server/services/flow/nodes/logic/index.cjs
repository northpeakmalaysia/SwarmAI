/**
 * Logic Nodes Index
 *
 * Provides logic and control flow nodes for the FlowBuilder:
 * - ConditionNode: If/else branching
 * - SwitchNode: Multi-way branching
 * - DelayNode: Timed delay
 * - SetVariableNode: Variable assignment
 * - LoopNode: Iteration/looping
 * - ErrorHandlerNode: Error handling wrapper
 * - ParallelNode: Fork into parallel branches
 * - MergeNode: Join parallel branches
 * - SubflowNode: Execute another flow as subflow
 * - RetryNode: Retry on failure with backoff
 */

const { ConditionNode } = require('./ConditionNode.cjs');
const { SwitchNode } = require('./SwitchNode.cjs');
const { DelayNode } = require('./DelayNode.cjs');
const { SetVariableNode } = require('./SetVariableNode.cjs');
const { LoopNode } = require('./LoopNode.cjs');
const { ErrorHandlerNode } = require('./ErrorHandlerNode.cjs');
const { ParallelNode } = require('./ParallelNode.cjs');
const { MergeNode } = require('./MergeNode.cjs');
const { SubflowNode } = require('./SubflowNode.cjs');
const { RetryNode } = require('./RetryNode.cjs');

module.exports = {
  // Core logic nodes
  ConditionNode,
  SwitchNode,
  DelayNode,
  SetVariableNode,
  LoopNode,
  ErrorHandlerNode,

  // Enhanced flow control nodes
  ParallelNode,
  MergeNode,
  SubflowNode,
  RetryNode,
};
