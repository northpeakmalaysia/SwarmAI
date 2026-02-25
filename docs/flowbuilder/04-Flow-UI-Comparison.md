# Flow UI Comparison

## Executive Summary

This document compares the Flow UI implementation, focusing on the visual canvas, drag-and-drop functionality, connections, controls, and visual feedback systems in both FlowBuilder implementations.

**Key Finding:** Both implementations use ReactFlow (@xyflow/react) as the base library, but the current implementation (SwarmAI) has significantly enhanced UX with execution highlighting, lock/unlock functionality, custom controls, and better visual feedback. The old implementation has a simpler, more basic canvas with minimal customization.

---

## 1. Old Implementation Analysis (WhatsBots)

### Architecture Overview

**Location:** `D:\source\AI\WhatsBots\src\components\automation\FlowBuilder\`

**Key Files:**
- `FlowCanvas.tsx` (182 lines) - Simple ReactFlow wrapper
- `FlowSidebar.tsx` (463 lines) - Node palette with search
- `FlowBuilderView.tsx` (898 lines) - Main container
- `flowbuilder.css` - Custom styles

### FlowCanvas Implementation

**Basic ReactFlow Wrapper:**

```typescript
import React from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const FlowCanvas: React.FC<{
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
}> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
}) => {
  return (
    <div className="flow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={FLOW_NODE_TYPES}  // From nodeRegistry
        snapToGrid={true}
        snapGrid={[15, 15]}
        fitView
        className="flowbuilder-canvas"
      >
        {/* Background grid */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#666"
        />

        {/* Standard controls (zoom, fit view) */}
        <Controls />

        {/* Minimap */}
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(node) => {
            // Color based on node type
            if (node.type.startsWith('trigger-')) return '#10b981';
            if (node.type.startsWith('action-')) return '#3b82f6';
            if (node.type.startsWith('control-')) return '#f59e0b';
            return '#6366f1';
          }}
        />
      </ReactFlow>
    </div>
  );
};

export default FlowCanvas;
```

### Node Visual Components

**Node Types:** Only 5 base components

| Component | Used For | Visual Style |
|-----------|----------|--------------|
| `TriggerNode` | All trigger nodes | Green theme |
| `ActionNode` | Action nodes | Blue theme |
| `ControlNode` | Control flow nodes | Amber theme |
| `SwitchNode` | Switch/condition nodes | Purple theme |
| `AiRouterNode` | AI Router nodes | Violet theme |

**Basic Node Component:**

```typescript
const ActionNode: React.FC<NodeProps> = ({ data, selected }) => {
  return (
    <div className={`flow-node action-node ${selected ? 'selected' : ''}`}>
      <div className="node-header">
        <Send className="node-icon" />
        <span className="node-label">{data.label}</span>
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
```

### Drag and Drop

**From Sidebar to Canvas:**

```typescript
// In FlowSidebar.tsx
const handleDragStart = (event: React.DragEvent, nodeType: string) => {
  event.dataTransfer.setData('application/reactflow', nodeType);
  event.dataTransfer.effectAllowed = 'move';
};

// In FlowCanvas.tsx
const handleDrop = (event: React.DragEvent) => {
  event.preventDefault();
  const nodeType = event.dataTransfer.getData('application/reactflow');

  if (!nodeType) return;

  // Get position
  const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
  const position = {
    x: event.clientX - reactFlowBounds.left,
    y: event.clientY - reactFlowBounds.top,
  };

  // Create new node
  const newNode = {
    id: `node_${Date.now()}`,
    type: nodeType,
    position,
    data: { label: getNodeLabel(nodeType), config: {} },
  };

  onNodeAdd(newNode);
};
```

### Edge Styling

**Simple Static Styles:**

```typescript
const defaultEdgeOptions = {
  style: {
    strokeWidth: 2,
    stroke: '#6366f1',
  },
  animated: false,  // No animation by default
};
```

### Controls

**Standard ReactFlow Controls:**
- Zoom in/out buttons
- Fit view button
- Interactive minimap
- No custom controls

### Visual Feedback

**Minimal Feedback:**
- Selected nodes have border highlight
- No execution state visualization
- No loading indicators
- No error highlighting
- Static edge colors

### MiniMap

**Basic MiniMap:**

```typescript
<MiniMap
  nodeStrokeWidth={3}
  nodeColor={(node) => {
    if (node.type.startsWith('trigger-')) return '#10b981';
    if (node.type.startsWith('action-')) return '#3b82f6';
    return '#6366f1';
  }}
/>
```

### Strengths

1. **Simple and Clean:** Minimal UI, easy to understand
2. **Snap to Grid:** Nodes align nicely
3. **MiniMap:** Helps navigate large flows
4. **Standard Controls:** Familiar zoom/fit controls
5. **Color-Coded Nodes:** Easy to distinguish node categories

### Weaknesses

1. **No Execution Visualization:** Can't see which nodes are running
2. **No Lock Mode:** Can't prevent accidental edits
3. **Static Edges:** No animation or state indication
4. **Limited Controls:** Only standard ReactFlow controls
5. **No Selection Features:** No multi-select actions
6. **No Visual Validation:** No indication of invalid connections
7. **Basic Styling:** Generic node appearance
8. **No Keyboard Shortcuts:** Limited keyboard interaction

---

## 2. Current Implementation Analysis (SwarmAI)

### Architecture Overview

**Location:** `d:\source\AI\SwarmAI\frontend\src\components\flowbuilder\`

**Key Files:**
- `FlowCanvas.tsx` (444 lines) - Enhanced ReactFlow with custom controls
- `NodePalette.tsx` (323 lines) - Organized node catalog
- `FlowBuilderPage.tsx` (600 lines) - Full-screen editor
- Node components in `nodes/` folder

### FlowCanvas Implementation

**Advanced ReactFlow Wrapper:**

```typescript
import React, { useCallback, useRef, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  BackgroundVariant,
  useReactFlow,
  ReactFlowInstance,
  SelectionMode,
  ConnectionMode,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Lock, Unlock, ZoomIn, ZoomOut, Maximize2, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { nodeTypes } from './nodes';

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  onNodeSelect?: (node: Node | null) => void;
  onNodeDelete?: (nodeId: string) => void;
  onEdgeDelete?: (edgeId: string) => void;
  onNodeDrop?: (type: string, position: { x: number; y: number }, data: Record<string, unknown>) => void;
  isLocked?: boolean;
  onLockToggle?: () => void;
  executingNodeId?: string | null;
}
```

### Custom Controls Component

**FlowControls with Lock/Delete:**

```typescript
interface FlowControlsProps {
  isLocked: boolean;
  onLockToggle: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
}

const FlowControls: React.FC<FlowControlsProps> = ({
  isLocked,
  onLockToggle,
  onFitView,
  onZoomIn,
  onZoomOut,
  onDeleteSelected,
  hasSelection,
}) => {
  return (
    <div className="flex flex-col gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 shadow-lg">
      {/* Zoom In */}
      <button
        onClick={onZoomIn}
        className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
        title="Zoom In"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      {/* Zoom Out */}
      <button
        onClick={onZoomOut}
        className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
        title="Zoom Out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      {/* Fit View */}
      <button
        onClick={onFitView}
        className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
        title="Fit View"
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      <div className="h-px bg-slate-700 my-1" />

      {/* Lock/Unlock */}
      <button
        onClick={onLockToggle}
        className={cn(
          'p-2 rounded transition-colors',
          isLocked
            ? 'text-amber-400 bg-amber-500/20 hover:bg-amber-500/30'
            : 'text-gray-400 hover:text-white hover:bg-slate-700'
        )}
        title={isLocked ? 'Unlock Canvas' : 'Lock Canvas'}
      >
        {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
      </button>

      {/* Delete Selected (only show when something is selected) */}
      {hasSelection && (
        <>
          <div className="h-px bg-slate-700 my-1" />
          <button
            onClick={onDeleteSelected}
            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors"
            title="Delete Selected"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
};
```

### Lock Mode Implementation

**Canvas Lock Functionality:**

```typescript
const FlowCanvas: React.FC<FlowCanvasProps> = ({
  // ... props
  isLocked = false,
  executingNodeId,
}) => {
  // Handle node changes with lock check
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isLocked) {
        // Allow selection changes even when locked
        const selectionChanges = changes.filter((c) => c.type === 'select');
        if (selectionChanges.length > 0) {
          onNodesChange(selectionChanges);
        }
        return;
      }
      onNodesChange(changes);
    },
    [isLocked, onNodesChange]
  );

  // Handle edge changes (with lock check)
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isLocked) return;
      onEdgesChange(changes);
    },
    [isLocked, onEdgesChange]
  );

  // Handle connection (with lock check)
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (isLocked) return;
      onConnect(connection);
    },
    [isLocked, onConnect]
  );

  // Handle drop (with lock check)
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (isLocked) {
        return;  // Block drops when locked
      }

      // ... rest of drop logic
    },
    [isLocked, onNodeDrop]
  );

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
      <ReactFlow
        // ... other props
        panOnDrag={!isLocked}
        zoomOnScroll={!isLocked}
        zoomOnPinch={!isLocked}
        zoomOnDoubleClick={!isLocked}
        nodesDraggable={!isLocked}
        nodesConnectable={!isLocked}
        elementsSelectable={true}  // Always allow selection
        className={cn('bg-slate-900', isLocked && 'cursor-not-allowed')}
      >
        {/* ... children */}

        {/* Lock Indicator */}
        {isLocked && (
          <Panel position="top-center" className="!mt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/50 rounded-full text-amber-400 text-sm">
              <Lock className="w-4 h-4" />
              Canvas Locked
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
};
```

### Execution Visualization

**Highlight Executing Nodes:**

```typescript
// Update node styles for execution highlighting
const styledNodes = useMemo(() => {
  return nodes.map((node) => {
    if (node.id === executingNodeId) {
      return {
        ...node,
        style: {
          ...node.style,
          boxShadow: '0 0 20px rgba(99, 102, 241, 0.5)',  // Glow effect
        },
      };
    }
    return node;
  });
}, [nodes, executingNodeId]);

// Style edges - always animated, highlight active edges during execution
const styledEdges = useMemo(() => {
  return edges.map((edge) => {
    const isActive = edge.source === executingNodeId || edge.target === executingNodeId;
    return {
      ...edge,
      animated: true,  // Always animated
      className: 'animated',
      style: {
        ...edge.style,
        stroke: isActive ? '#22c55e' : '#6366f1',  // Green when active
        strokeWidth: isActive ? 3 : 2,
      },
    };
  });
}, [edges, executingNodeId]);

return (
  <ReactFlow
    nodes={styledNodes}      // Use styled nodes
    edges={styledEdges}      // Use styled edges
    // ...
  />
);
```

### Edge Styling and Animation

**Animated Edges with Arrow Markers:**

```typescript
// Custom edge styles
const defaultEdgeOptions = {
  style: {
    strokeWidth: 2,
    stroke: '#6366f1',  // Indigo color
  },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#6366f1',
  },
  animated: true,  // Always animated
};

const connectionLineStyle = {
  strokeWidth: 2,
  stroke: '#6366f1',
  strokeDasharray: '5 5',  // Dashed line while dragging
};
```

### Keyboard Shortcuts

**Delete, Copy, Paste:**

```typescript
// Handle keyboard shortcuts
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    // Delete selected nodes and edges
    if ((event.key === 'Delete' || event.key === 'Backspace') && !isLocked) {
      // Delete selected nodes
      selectedNodes.forEach((node) => {
        onNodeDelete?.(node.id);
      });
      // Delete selected edges
      selectedEdges.forEach((edge) => {
        onEdgeDelete?.(edge.id);
      });
    }

    // Copy (Ctrl/Cmd + C)
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      // Copy implementation would go here
    }

    // Paste (Ctrl/Cmd + V)
    if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      // Paste implementation would go here
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [selectedNodes, selectedEdges, isLocked, onNodeDelete, onEdgeDelete]);
```

### Enhanced MiniMap

**Color-Coded and Interactive:**

```typescript
<MiniMap
  nodeStrokeWidth={3}
  nodeColor={(node) => {
    switch (node.type) {
      case 'trigger':
        return '#f59e0b';  // Amber for triggers
      case 'action':
        return '#3b82f6';  // Blue for actions
      case 'ai':
        return '#8b5cf6';  // Violet for AI nodes
      case 'swarm':
        return '#06b6d4';  // Cyan for swarm nodes
      default:
        return '#6366f1';  // Indigo default
    }
  }}
  maskColor="rgba(15, 23, 42, 0.7)"
  style={{
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
  }}
  pannable
  zoomable
  position="bottom-right"
/>
```

### Node Palette

**Organized Category-Based Palette:**

```typescript
// In NodePalette.tsx
const NodePalette: React.FC = ({ onDragStart }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({
    trigger: true,
    action: true,
    ai: true,
    swarm: true,
  });

  // Filter nodes based on search
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodeDefinitions;

    const query = searchQuery.toLowerCase();
    return nodeDefinitions.filter(
      (node) =>
        node.label.toLowerCase().includes(query) ||
        node.description.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group by category
  const groupedNodes = useMemo(() => {
    return filteredNodes.reduce((acc, node) => {
      if (!acc[node.category]) {
        acc[node.category] = [];
      }
      acc[node.category].push(node);
      return acc;
    }, {} as Record<string, NodeDefinition[]>);
  }, [filteredNodes]);

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          iconLeft={<Search className="w-4 h-4" />}
        />
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {['trigger', 'action', 'ai', 'swarm'].map((category) => {
          const nodes = groupedNodes[category];
          if (!nodes || nodes.length === 0) return null;

          return (
            <CategorySection
              key={category}
              category={category}
              nodes={nodes}
              isExpanded={expandedCategories[category] || !!searchQuery}
              onToggle={() => toggleCategory(category)}
              onDragStart={onDragStart}
            />
          );
        })}
      </div>
    </div>
  );
};
```

### Drag Indicators

**Visual Feedback During Drag:**

```typescript
const PaletteItem: React.FC<{ node: NodeDefinition }> = ({ node, onDragStart }) => {
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg cursor-grab active:cursor-grabbing',
        'border border-transparent transition-all duration-200',
        'hover:border-slate-600 hover:bg-slate-700/50',
        'group select-none'
      )}
    >
      <div className={cn('w-8 h-8 rounded flex items-center justify-center', colors.bg)}>
        <Icon className={cn('w-4 h-4', colors.text)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white font-medium truncate">{node.label}</div>
        <div className="text-xs text-gray-500 truncate">{node.description}</div>
      </div>
      {/* Drag indicator icon */}
      <GripVertical className="w-4 h-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
};
```

### Custom Node Components

**4 Enhanced Node Types:**

| Component | Features | Visual Style |
|-----------|----------|--------------|
| `TriggerNode` | Icon, label, description, handles | Amber theme with glow |
| `ActionNode` | Icon, label, status badge | Blue theme |
| `AINode` | Icon, model badge, label | Violet theme with gradient |
| `SwarmNode` | Icon, agent count, label | Cyan theme |

**Example AINode:**

```typescript
const AINode: React.FC<NodeProps> = ({ data, selected }) => {
  return (
    <div className={cn(
      'bg-slate-800 border-2 rounded-lg shadow-lg min-w-[200px]',
      'transition-all duration-200',
      selected ? 'border-violet-500 ring-2 ring-violet-500/50' : 'border-slate-700',
      'hover:border-violet-400'
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border-b border-slate-700">
        <Sparkles className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-medium text-white">{data.label}</span>
      </div>

      {/* Model Badge */}
      {data.model && (
        <div className="px-3 py-1 text-xs text-violet-300">
          Model: {data.model}
        </div>
      )}

      {/* Handles */}
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-violet-500" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-violet-500" />
    </div>
  );
};
```

### Selection and Multi-Select

**Enhanced Selection Features:**

```typescript
// Get selected nodes
const selectedNodes = useMemo(() => {
  return nodes.filter((n) => n.selected);
}, [nodes]);

// Get selected edges
const selectedEdges = useMemo(() => {
  return edges.filter((e) => e.selected);
}, [edges]);

// Handle selection change
const handleSelectionChange = useCallback(
  ({ nodes: selectedNodes }: { nodes: Node[]; edges: Edge[] }) => {
    if (selectedNodes.length === 1) {
      onNodeSelect?.(selectedNodes[0]);
    } else if (selectedNodes.length === 0) {
      onNodeSelect?.(null);
    }
  },
  [onNodeSelect]
);

// Delete multiple selected items
const handleDeleteSelected = useCallback(() => {
  if (isLocked) return;

  selectedNodes.forEach((node) => {
    onNodeDelete?.(node.id);
  });

  selectedEdges.forEach((edge) => {
    onEdgeDelete?.(edge.id);
  });
}, [selectedNodes, selectedEdges, isLocked]);
```

### ReactFlow Configuration

**Advanced Settings:**

```typescript
<ReactFlow
  nodes={styledNodes}
  edges={styledEdges}
  onNodesChange={handleNodesChange}
  onEdgesChange={handleEdgesChange}
  onConnect={handleConnect}
  onNodeClick={handleNodeClick}
  onPaneClick={handlePaneClick}
  onSelectionChange={handleSelectionChange}
  onDragOver={handleDragOver}
  onDrop={handleDrop}
  onInit={(instance) => {
    reactFlowInstance.current = instance as unknown as ReactFlowInstance | null;
  }}
  nodeTypes={nodeTypes}
  defaultEdgeOptions={defaultEdgeOptions}
  connectionLineStyle={connectionLineStyle}
  connectionMode={ConnectionMode.Loose}
  selectionMode={SelectionMode.Partial}
  selectNodesOnDrag={false}
  panOnScroll
  panOnDrag={!isLocked}
  zoomOnScroll={!isLocked}
  zoomOnPinch={!isLocked}
  zoomOnDoubleClick={!isLocked}
  nodesDraggable={!isLocked}
  nodesConnectable={!isLocked}
  elementsSelectable={true}
  fitView
  fitViewOptions={{ padding: 0.2 }}
  className={cn('bg-slate-900', isLocked && 'cursor-not-allowed')}
  proOptions={{ hideAttribution: true }}
>
  {/* Background, MiniMap, Controls, Panels */}
</ReactFlow>
```

### Strengths

1. **Lock Mode:** Prevent accidental edits during execution
2. **Execution Visualization:** See which nodes are running in real-time
3. **Custom Controls:** Tailored control panel with lock and delete
4. **Animated Edges:** Visual feedback on connections
5. **Keyboard Shortcuts:** Delete, copy, paste support
6. **Enhanced MiniMap:** Better styling and interactivity
7. **Organized Palette:** Category-based node organization with search
8. **Drag Indicators:** Clear visual feedback during drag operations
9. **Multi-Select:** Bulk operations on selected items
10. **Selection Feedback:** Clear visual indication of selected elements
11. **Custom Node Styles:** Rich, context-aware node appearance
12. **Lock Indicator:** Prominent visual feedback when canvas is locked

### Weaknesses

1. **No Grid Snapping:** Nodes don't snap to grid
2. **No Alignment Tools:** Can't align multiple nodes
3. **No Copy/Paste Implementation:** Keyboard shortcuts defined but not implemented
4. **No Zoom Slider:** Only +/- buttons for zoom
5. **No Fullscreen Mode:** Can't maximize canvas area
6. **No Node Templates:** Can't save/load node configurations
7. **No Connection Validation:** No visual feedback for invalid connections

---

## 3. Gap Analysis

### Missing Features in Old Implementation

| Feature | Old | Current | Priority |
|---------|-----|---------|----------|
| Lock Mode | ❌ | ✅ | High |
| Execution Highlighting | ❌ | ✅ | High |
| Custom Controls | ❌ | ✅ | High |
| Animated Edges | ❌ | ✅ | Medium |
| Keyboard Shortcuts | ❌ | ✅ | Medium |
| Delete Selected Button | ❌ | ✅ | Medium |
| Custom Node Styles | Basic | Rich | Medium |
| Organized Palette | Basic | Advanced | Low |
| Drag Indicators | ❌ | ✅ | Low |
| Multi-Select Actions | ❌ | ✅ | Medium |

### Missing Features in Current Implementation

| Feature | Priority | Reason |
|---------|----------|--------|
| Grid Snapping | Medium | Helps with alignment |
| Alignment Tools | Medium | Professional flow design |
| Copy/Paste | High | Essential for productivity |
| Zoom Slider | Low | Nice-to-have |
| Connection Validation | High | Prevent invalid flows |
| Node Templates | Medium | Reusable configurations |

---

## 4. Recommendations

### Immediate Actions (Week 1)

**1. Implement Copy/Paste**

```typescript
// In FlowCanvas.tsx
const [clipboard, setClipboard] = useState<{nodes: Node[], edges: Edge[]} | null>(null);

const handleCopy = useCallback(() => {
  if (selectedNodes.length === 0) return;

  const nodesToCopy = selectedNodes.map(node => ({ ...node }));
  const edgesToCopy = edges.filter(edge =>
    selectedNodes.some(n => n.id === edge.source) &&
    selectedNodes.some(n => n.id === edge.target)
  );

  setClipboard({ nodes: nodesToCopy, edges: edgesToCopy });

  // Show toast notification
  toast.success(`Copied ${nodesToCopy.length} node(s)`);
}, [selectedNodes, edges]);

const handlePaste = useCallback(() => {
  if (!clipboard) return;

  const nodeIdMap = new Map();
  const newNodes = clipboard.nodes.map(node => {
    const newId = `node_${Date.now()}_${Math.random()}`;
    nodeIdMap.set(node.id, newId);

    return {
      ...node,
      id: newId,
      position: {
        x: node.position.x + 50,  // Offset to avoid overlap
        y: node.position.y + 50,
      },
      selected: false,
    };
  });

  const newEdges = clipboard.edges.map(edge => ({
    ...edge,
    id: `edge_${Date.now()}_${Math.random()}`,
    source: nodeIdMap.get(edge.source),
    target: nodeIdMap.get(edge.target),
  }));

  onNodesAdd(newNodes);
  onEdgesAdd(newEdges);

  toast.success(`Pasted ${newNodes.length} node(s)`);
}, [clipboard, onNodesAdd, onEdgesAdd]);

// Update keyboard handler
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      handleCopy();
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      handlePaste();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [handleCopy, handlePaste]);
```

**2. Add Connection Validation**

```typescript
// Validate connections before creating edge
const isValidConnection = useCallback((connection: Connection) => {
  const sourceNode = nodes.find(n => n.id === connection.source);
  const targetNode = nodes.find(n => n.id === connection.target);

  if (!sourceNode || !targetNode) return false;

  // Rule 1: Can't connect node to itself
  if (connection.source === connection.target) {
    toast.error('Cannot connect node to itself');
    return false;
  }

  // Rule 2: Check for existing connection
  const existingEdge = edges.find(e =>
    e.source === connection.source && e.target === connection.target
  );
  if (existingEdge) {
    toast.error('Connection already exists');
    return false;
  }

  // Rule 3: Check for circular dependencies
  if (wouldCreateCycle(connection, nodes, edges)) {
    toast.error('Connection would create a cycle');
    return false;
  }

  // Rule 4: Category-specific rules
  if (sourceNode.type === 'trigger' && targetNode.type === 'trigger') {
    toast.error('Cannot connect trigger to trigger');
    return false;
  }

  return true;
}, [nodes, edges]);

<ReactFlow
  isValidConnection={isValidConnection}
  // ...
/>
```

### Short-Term Enhancements (Week 2-3)

**3. Add Grid Snapping**

```typescript
<ReactFlow
  snapToGrid={true}
  snapGrid={[20, 20]}
  // ...
/>
```

**4. Implement Alignment Tools**

```typescript
const AlignmentToolbar: React.FC<{ selectedNodes: Node[] }> = ({ selectedNodes }) => {
  if (selectedNodes.length < 2) return null;

  const alignLeft = () => {
    const minX = Math.min(...selectedNodes.map(n => n.position.x));
    const aligned = selectedNodes.map(n => ({
      ...n,
      position: { ...n.position, x: minX },
    }));
    onNodesUpdate(aligned);
  };

  const alignTop = () => {
    const minY = Math.min(...selectedNodes.map(n => n.position.y));
    const aligned = selectedNodes.map(n => ({
      ...n,
      position: { ...n.position, y: minY },
    }));
    onNodesUpdate(aligned);
  };

  const distributeHorizontally = () => {
    const sorted = [...selectedNodes].sort((a, b) => a.position.x - b.position.x);
    const totalWidth = sorted[sorted.length - 1].position.x - sorted[0].position.x;
    const gap = totalWidth / (sorted.length - 1);

    const distributed = sorted.map((node, i) => ({
      ...node,
      position: { ...node.position, x: sorted[0].position.x + (gap * i) },
    }));

    onNodesUpdate(distributed);
  };

  return (
    <Panel position="top-left">
      <div className="flex gap-2 bg-slate-800 p-2 rounded-lg border border-slate-700">
        <button onClick={alignLeft} title="Align Left">
          <AlignLeft className="w-4 h-4" />
        </button>
        <button onClick={alignTop} title="Align Top">
          <AlignTop className="w-4 h-4" />
        </button>
        <button onClick={distributeHorizontally} title="Distribute Horizontally">
          <Distribute className="w-4 h-4" />
        </button>
      </div>
    </Panel>
  );
};
```

**5. Add Zoom Slider**

```typescript
const ZoomSlider: React.FC = () => {
  const { zoomTo } = useReactFlow();
  const [zoomLevel, setZoomLevel] = useState(100);

  const handleZoomChange = (value: number) => {
    setZoomLevel(value);
    zoomTo(value / 100);
  };

  return (
    <Panel position="bottom-center">
      <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
        <ZoomOut className="w-4 h-4 text-gray-400" />
        <input
          type="range"
          min="10"
          max="200"
          value={zoomLevel}
          onChange={(e) => handleZoomChange(parseInt(e.target.value))}
          className="w-32"
        />
        <ZoomIn className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-400 ml-2">{zoomLevel}%</span>
      </div>
    </Panel>
  );
};
```

### Long-Term Strategy (Month 2)

**6. Node Templates System**

```typescript
// Save current selection as template
const saveAsTemplate = useCallback((name: string) => {
  const template = {
    id: `template_${Date.now()}`,
    name,
    nodes: selectedNodes,
    edges: edges.filter(e =>
      selectedNodes.some(n => n.id === e.source) &&
      selectedNodes.some(n => n.id === e.target)
    ),
    thumbnail: generateThumbnail(selectedNodes, edges),
  };

  // Save to backend
  await fetch('/api/flows/templates', {
    method: 'POST',
    body: JSON.stringify(template),
  });

  toast.success(`Template "${name}" saved`);
}, [selectedNodes, edges]);

// Template library panel
const TemplateLibrary: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    fetch('/api/flows/templates').then(r => r.json()).then(setTemplates);
  }, []);

  const handleTemplateDrop = (template: Template, position: {x: number, y: number}) => {
    // Insert template at position
    const nodeIdMap = new Map();
    const newNodes = template.nodes.map(node => {
      const newId = `node_${Date.now()}_${Math.random()}`;
      nodeIdMap.set(node.id, newId);

      return {
        ...node,
        id: newId,
        position: {
          x: position.x + node.position.x,
          y: position.y + node.position.y,
        },
      };
    });

    const newEdges = template.edges.map(edge => ({
      ...edge,
      id: `edge_${Date.now()}_${Math.random()}`,
      source: nodeIdMap.get(edge.source),
      target: nodeIdMap.get(edge.target),
    }));

    onNodesAdd(newNodes);
    onEdgesAdd(newEdges);
  };

  return (
    <Panel position="right">
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 w-64">
        <h3 className="text-white font-medium mb-4">Templates</h3>
        <div className="space-y-2">
          {templates.map(template => (
            <div
              key={template.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/template', JSON.stringify(template));
              }}
              className="p-2 bg-slate-700 rounded cursor-grab hover:bg-slate-600"
            >
              <div className="text-sm text-white">{template.name}</div>
              <div className="text-xs text-gray-400">{template.nodes.length} nodes</div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
};
```

---

## 5. Implementation Plan

### Phase 1: Essential Features (Week 1)
- [ ] Implement copy/paste functionality
- [ ] Add connection validation
- [ ] Add visual feedback for invalid connections

### Phase 2: Alignment & Grid (Week 2)
- [ ] Add grid snapping
- [ ] Implement alignment tools
- [ ] Add zoom slider

### Phase 3: Templates & Polish (Week 3-4)
- [ ] Node template system
- [ ] Template library UI
- [ ] Polish animations and transitions

---

## 6. Success Metrics

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Copy/Paste | ❌ | ✅ | Week 1 |
| Connection Validation | ❌ | ✅ | Week 1 |
| Grid Snapping | ❌ | ✅ | Week 2 |
| Alignment Tools | ❌ | ✅ | Week 2 |
| Node Templates | ❌ | ✅ | Week 4 |
| User Satisfaction | N/A | 4.5/5 | Week 4 |

---

**Document Status:** Draft v1.0
**Last Updated:** 2026-02-02
**Next Review:** After Phase 1 completion
