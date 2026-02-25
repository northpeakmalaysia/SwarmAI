/**
 * FlowBuilder Components
 *
 * Visual workflow editor for SwarmAI automation flows.
 * Built with React Flow (@xyflow/react).
 *
 * @example
 * ```tsx
 * import {
 *   FlowCanvas,
 *   NodePalette,
 *   NodeConfigPanel,
 *   ExecutionPreview,
 *   nodeTypes,
 * } from '@/components/flowbuilder';
 * ```
 */

// Main components
export { default as FlowCanvas } from './FlowCanvas';
export { default as NodePalette } from './NodePalette';
export { default as NodeConfigPanel } from './NodeConfigPanel';
export { default as ExecutionPreview } from './ExecutionPreview';
export { default as AiFlowGeneratorModal } from './AiFlowGeneratorModal';

// Execution components
export { ExecutionPanel, DebugPanel } from './execution';

// Version management components
export { VersionHistoryPanel } from './versions';

// Template library components
export { TemplateLibraryModal } from './templates';

// Node components and types
export {
  TriggerNode,
  ActionNode,
  AINode,
  SwarmNode,
  nodeTypes,
  nodeDefinitions,
  nodesByCategory,
  categoryInfo,
} from './nodes';

export type {
  TriggerNodeData,
  ActionNodeData,
  AINodeData,
  SwarmNodeData,
  NodeDefinition,
  NodeType,
} from './nodes';
