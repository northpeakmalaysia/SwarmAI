/**
 * Swarm Intelligence Components
 *
 * Components for visualizing and managing swarm intelligence features.
 *
 * @example
 * ```tsx
 * import {
 *   SwarmHealthMetrics,
 *   AgentStatusGrid,
 *   CollaborationGraph,
 *   HandoffQueue,
 *   ConsensusPanel,
 *   TaskList,
 *   SwarmVisualization,
 * } from '@/components/swarm';
 * ```
 */

// Health Metrics
export { SwarmHealthMetrics, default as SwarmHealthMetricsComponent } from './SwarmHealthMetrics';
export type { SwarmHealthMetricsProps } from './SwarmHealthMetrics';

// Agent Status Grid
export { AgentStatusGrid, default as AgentStatusGridComponent } from './AgentStatusGrid';
export type { AgentStatusGridProps } from './AgentStatusGrid';

// Collaboration Graph
export { CollaborationGraph, default as CollaborationGraphComponent } from './CollaborationGraph';
export type { CollaborationGraphProps } from './CollaborationGraph';

// Handoff Queue
export { HandoffQueue, default as HandoffQueueComponent } from './HandoffQueue';
export type { HandoffQueueProps, Handoff, HandoffStatus } from './HandoffQueue';

// Consensus Panel
export { ConsensusPanel, default as ConsensusPanelComponent } from './ConsensusPanel';
export type {
  ConsensusPanelProps,
  ConsensusRequest,
  ConsensusOption,
  ConsensusStatus,
} from './ConsensusPanel';

// Task List
export { TaskList, default as TaskListComponent } from './TaskList';
export type { TaskListProps, TaskType } from './TaskList';

// Swarm Visualization (existing component)
export { default as SwarmVisualization } from './SwarmVisualization';

// Create Task Modal
export { CreateTaskModal, default as CreateTaskModalComponent } from './CreateTaskModal';
export type { CreateTaskModalProps } from './CreateTaskModal';

// Create Consensus Modal
export { CreateConsensusModal, default as CreateConsensusModalComponent } from './CreateConsensusModal';
export type { CreateConsensusModalProps } from './CreateConsensusModal';
