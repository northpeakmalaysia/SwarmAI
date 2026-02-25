/**
 * Enhanced FlowCanvas Component
 *
 * Features:
 * - Snap-to-grid with configurable grid size
 * - Smart alignment guides when dragging
 * - Connection validation
 * - Execution state visualization per node
 * - Keyboard shortcuts with undo/redo/clipboard
 * - Auto-layout options
 * - Mini-map with execution highlighting
 * - Status bar with save indicator
 */

import React, { useCallback, useRef, useMemo, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
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
  applyNodeChanges,
  applyEdgeChanges,
  XYPosition,
  Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Lock,
  Unlock,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Grid,
  Undo2,
  Redo2,
  Copy,
  Scissors,
  Clipboard,
  Save,
  Cloud,
  CloudOff,
  Play,
  Square,
  Eye,
  EyeOff,
  LayoutGrid,
  AlignVerticalJustifyCenter,
  AlignHorizontalJustifyCenter,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { nodeTypes } from './nodes'
import { useFlowStore, NodeExecutionState } from '../../stores/flowStore'

// ============================================================================
// Types
// ============================================================================

interface FlowCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onNodeSelect?: (node: Node | null) => void
  onNodeDelete?: (nodeId: string) => void
  onEdgeDelete?: (edgeId: string) => void
  onNodeDrop?: (type: string, position: XYPosition, data: Record<string, unknown>) => void
  isLocked?: boolean
  onLockToggle?: () => void
  executingNodeId?: string | null
}

interface AlignmentGuide {
  position: number
  orientation: 'horizontal' | 'vertical'
  type: 'center' | 'start' | 'end'
}

// ============================================================================
// Constants
// ============================================================================

const SNAP_THRESHOLD = 5
const ALIGNMENT_THRESHOLD = 8

const defaultEdgeOptions = {
  style: {
    strokeWidth: 2,
    stroke: '#6366f1',
  },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#6366f1',
  },
  animated: false,
}

const connectionLineStyle = {
  strokeWidth: 2,
  stroke: '#6366f1',
  strokeDasharray: '5 5',
}

// Node status colors for execution visualization
const executionColors: Record<string, string> = {
  pending: '#6b7280',
  running: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
  skipped: '#9ca3af',
}

// ============================================================================
// Helper Functions
// ============================================================================

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

function findAlignmentGuides(
  draggingNode: Node,
  otherNodes: Node[],
  threshold: number
): AlignmentGuide[] {
  const guides: AlignmentGuide[] = []
  const draggingCenter = {
    x: draggingNode.position.x + (draggingNode.measured?.width ?? 200) / 2,
    y: draggingNode.position.y + (draggingNode.measured?.height ?? 80) / 2,
  }

  for (const node of otherNodes) {
    if (node.id === draggingNode.id) continue

    const nodeCenter = {
      x: node.position.x + (node.measured?.width ?? 200) / 2,
      y: node.position.y + (node.measured?.height ?? 80) / 2,
    }

    // Horizontal center alignment
    if (Math.abs(draggingCenter.x - nodeCenter.x) < threshold) {
      guides.push({
        position: nodeCenter.x,
        orientation: 'vertical',
        type: 'center',
      })
    }

    // Vertical center alignment
    if (Math.abs(draggingCenter.y - nodeCenter.y) < threshold) {
      guides.push({
        position: nodeCenter.y,
        orientation: 'horizontal',
        type: 'center',
      })
    }

    // Left edge alignment
    if (Math.abs(draggingNode.position.x - node.position.x) < threshold) {
      guides.push({
        position: node.position.x,
        orientation: 'vertical',
        type: 'start',
      })
    }

    // Top edge alignment
    if (Math.abs(draggingNode.position.y - node.position.y) < threshold) {
      guides.push({
        position: node.position.y,
        orientation: 'horizontal',
        type: 'start',
      })
    }
  }

  return guides
}

// ============================================================================
// Control Panel Component
// ============================================================================

interface FlowControlsProps {
  isLocked: boolean
  onLockToggle: () => void
  onFitView: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onDeleteSelected: () => void
  hasSelection: boolean
  snapToGrid: boolean
  onToggleSnap: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  hasClipboard: boolean
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  isSaving: boolean
  hasUnsavedChanges: boolean
  autoSaveEnabled: boolean
}

const FlowControls: React.FC<FlowControlsProps> = ({
  isLocked,
  onLockToggle,
  onFitView,
  onZoomIn,
  onZoomOut,
  onDeleteSelected,
  hasSelection,
  snapToGrid,
  onToggleSnap,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasClipboard,
  onCopy,
  onCut,
  onPaste,
  isSaving,
  hasUnsavedChanges,
  autoSaveEnabled,
}) => {
  const ControlButton = ({
    onClick,
    disabled,
    active,
    title,
    children,
    variant = 'default',
  }: {
    onClick: () => void
    disabled?: boolean
    active?: boolean
    title: string
    children: React.ReactNode
    variant?: 'default' | 'danger' | 'success'
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-2 rounded transition-all duration-150',
        disabled && 'opacity-40 cursor-not-allowed',
        !disabled && variant === 'default' && 'text-gray-400 hover:text-white hover:bg-slate-700',
        !disabled && variant === 'danger' && 'text-red-400 hover:text-red-300 hover:bg-red-500/20',
        !disabled && variant === 'success' && 'text-green-400 hover:text-green-300 hover:bg-green-500/20',
        active && 'bg-indigo-500/20 text-indigo-400'
      )}
      title={title}
    >
      {children}
    </button>
  )

  const Divider = () => <div className="h-px bg-slate-700 my-1" />

  return (
    <div className="flex flex-col gap-0.5 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg p-1.5 shadow-xl">
      {/* Zoom Controls */}
      <ControlButton onClick={onZoomIn} title="Zoom In (Ctrl +)">
        <ZoomIn className="w-4 h-4" />
      </ControlButton>
      <ControlButton onClick={onZoomOut} title="Zoom Out (Ctrl -)">
        <ZoomOut className="w-4 h-4" />
      </ControlButton>
      <ControlButton onClick={onFitView} title="Fit View (Ctrl 0)">
        <Maximize2 className="w-4 h-4" />
      </ControlButton>

      <Divider />

      {/* Undo/Redo */}
      <ControlButton onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl Z)">
        <Undo2 className="w-4 h-4" />
      </ControlButton>
      <ControlButton onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl Shift Z)">
        <Redo2 className="w-4 h-4" />
      </ControlButton>

      <Divider />

      {/* Clipboard */}
      <ControlButton onClick={onCopy} disabled={!hasSelection} title="Copy (Ctrl C)">
        <Copy className="w-4 h-4" />
      </ControlButton>
      <ControlButton onClick={onCut} disabled={!hasSelection || isLocked} title="Cut (Ctrl X)">
        <Scissors className="w-4 h-4" />
      </ControlButton>
      <ControlButton onClick={onPaste} disabled={!hasClipboard || isLocked} title="Paste (Ctrl V)">
        <Clipboard className="w-4 h-4" />
      </ControlButton>

      <Divider />

      {/* Canvas Settings */}
      <ControlButton onClick={onToggleSnap} active={snapToGrid} title="Snap to Grid">
        <Grid className="w-4 h-4" />
      </ControlButton>
      <ControlButton
        onClick={onLockToggle}
        active={isLocked}
        title={isLocked ? 'Unlock Canvas' : 'Lock Canvas'}
      >
        {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
      </ControlButton>

      {hasSelection && !isLocked && (
        <>
          <Divider />
          <ControlButton onClick={onDeleteSelected} title="Delete Selected (Del)" variant="danger">
            <Trash2 className="w-4 h-4" />
          </ControlButton>
        </>
      )}

      {/* Save Status Indicator */}
      <Divider />
      <div
        className={cn(
          'p-2 rounded flex items-center justify-center',
          isSaving && 'text-blue-400',
          !isSaving && hasUnsavedChanges && 'text-amber-400',
          !isSaving && !hasUnsavedChanges && 'text-green-400'
        )}
        title={
          isSaving
            ? 'Saving...'
            : hasUnsavedChanges
              ? 'Unsaved changes'
              : autoSaveEnabled
                ? 'Auto-save enabled'
                : 'All changes saved'
        }
      >
        {isSaving ? (
          <Cloud className="w-4 h-4 animate-pulse" />
        ) : hasUnsavedChanges ? (
          <CloudOff className="w-4 h-4" />
        ) : (
          <Save className="w-4 h-4" />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Execution Controls Component
// ============================================================================

interface ExecutionControlsProps {
  isExecuting: boolean
  onExecute: () => void
  onCancel: () => void
  showDebugPanel: boolean
  onToggleDebug: () => void
}

const ExecutionControls: React.FC<ExecutionControlsProps> = ({
  isExecuting,
  onExecute,
  onCancel,
  showDebugPanel,
  onToggleDebug,
}) => (
  <div className="flex items-center gap-2 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg p-1.5 shadow-xl">
    {!isExecuting ? (
      <button
        onClick={onExecute}
        className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
        title="Execute Flow"
      >
        <Play className="w-4 h-4" />
        <span className="text-sm font-medium">Run</span>
      </button>
    ) : (
      <button
        onClick={onCancel}
        className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
        title="Stop Execution"
      >
        <Square className="w-4 h-4" />
        <span className="text-sm font-medium">Stop</span>
      </button>
    )}
    <button
      onClick={onToggleDebug}
      className={cn(
        'p-2 rounded transition-colors',
        showDebugPanel
          ? 'bg-indigo-500/20 text-indigo-400'
          : 'text-gray-400 hover:text-white hover:bg-slate-700'
      )}
      title={showDebugPanel ? 'Hide Debug Panel' : 'Show Debug Panel'}
    >
      {showDebugPanel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  </div>
)

// ============================================================================
// Alignment Guides Overlay
// ============================================================================

interface AlignmentGuidesProps {
  guides: AlignmentGuide[]
  viewport: Viewport
}

const AlignmentGuides: React.FC<AlignmentGuidesProps> = ({ guides, viewport }) => {
  if (guides.length === 0) return null

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-50"
      style={{ overflow: 'visible' }}
    >
      {guides.map((guide, index) => (
        <line
          key={index}
          x1={guide.orientation === 'vertical' ? guide.position * viewport.zoom + viewport.x : 0}
          y1={guide.orientation === 'horizontal' ? guide.position * viewport.zoom + viewport.y : 0}
          x2={guide.orientation === 'vertical' ? guide.position * viewport.zoom + viewport.x : '100%'}
          y2={guide.orientation === 'horizontal' ? guide.position * viewport.zoom + viewport.y : '100%'}
          stroke="#6366f1"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.8"
        />
      ))}
    </svg>
  )
}

// ============================================================================
// Main FlowCanvas Component
// ============================================================================

const FlowCanvas: React.FC<FlowCanvasProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeSelect,
  onNodeDelete,
  onEdgeDelete,
  onNodeDrop,
  isLocked = false,
  onLockToggle,
}) => {
  // Refs
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)

  // Store selectors
  const {
    snapToGrid: snapEnabled,
    gridSize,
    showMinimap,
    showDebugPanel,
    viewport,
    nodeExecutionStates,
    hasUnsavedChanges,
    isSaving,
    isExecuting,
    autoSaveEnabled,
    currentFlow,
    currentExecution,

    // Actions
    toggleSnapToGrid,
    toggleMinimap,
    toggleDebugPanel,
    setViewport,
    undo,
    redo,
    canUndo,
    canRedo,
    copySelected,
    cutSelected,
    paste,
    hasClipboard,
    selectNode,
    selectMultipleNodes,
    clearSelection,
    executeFlow,
    cancelExecution,
  } = useFlowStore()

  // Local state
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)

  // Computed values
  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes])
  const selectedEdges = useMemo(() => edges.filter((e) => e.selected), [edges])
  const hasSelection = selectedNodes.length > 0 || selectedEdges.length > 0

  // Handle selection changes
  const handleSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[]; edges: Edge[] }) => {
      if (selected.length === 1) {
        selectNode(selected[0].id)
        onNodeSelect?.(selected[0])
      } else if (selected.length > 1) {
        selectMultipleNodes(selected.map((n) => n.id))
        onNodeSelect?.(null)
      } else {
        clearSelection()
        onNodeSelect?.(null)
      }
    },
    [selectNode, selectMultipleNodes, clearSelection, onNodeSelect]
  )

  // Handle node click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id)
      onNodeSelect?.(node)
    },
    [selectNode, onNodeSelect]
  )

  // Handle pane click
  const handlePaneClick = useCallback(() => {
    clearSelection()
    onNodeSelect?.(null)
  }, [clearSelection, onNodeSelect])

  // Handle node drag with snap-to-grid and alignment guides
  const handleNodeDrag = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setDraggingNodeId(node.id)

      if (snapEnabled) {
        // Find alignment guides
        const guides = findAlignmentGuides(node, nodes, ALIGNMENT_THRESHOLD)
        setAlignmentGuides(guides)
      }
    },
    [nodes, snapEnabled]
  )

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setDraggingNodeId(null)
      setAlignmentGuides([])

      if (snapEnabled) {
        // Apply snap to grid
        const snappedPosition = {
          x: snapToGrid(node.position.x, gridSize),
          y: snapToGrid(node.position.y, gridSize),
        }

        if (snappedPosition.x !== node.position.x || snappedPosition.y !== node.position.y) {
          const change: NodeChange = {
            type: 'position',
            id: node.id,
            position: snappedPosition,
          }
          onNodesChange([change])
        }
      }
    },
    [snapEnabled, gridSize, onNodesChange]
  )

  // Handle drop from palette
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (isLocked || !reactFlowInstance.current) return

      const data = event.dataTransfer.getData('application/reactflow')
      if (!data) return

      try {
        const { type, data: nodeData } = JSON.parse(data)

        let position = reactFlowInstance.current.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        })

        // Apply snap to grid if enabled
        if (snapEnabled) {
          position = {
            x: snapToGrid(position.x, gridSize),
            y: snapToGrid(position.y, gridSize),
          }
        }

        onNodeDrop?.(type, position, nodeData)
      } catch (error) {
        console.error('Failed to parse drop data:', error)
      }
    },
    [isLocked, snapEnabled, gridSize, onNodeDrop]
  )

  // Handle connection with validation
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (isLocked) return

      // Validate connection
      if (!connection.source || !connection.target) return
      if (connection.source === connection.target) return

      // Check for duplicate connections
      const isDuplicate = edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.sourceHandle === connection.sourceHandle &&
          e.targetHandle === connection.targetHandle
      )
      if (isDuplicate) return

      onConnect(connection)
    },
    [isLocked, edges, onConnect]
  )

  // Handle node changes with lock check
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isLocked) {
        // Allow only selection changes when locked
        const allowedChanges = changes.filter((c) => c.type === 'select')
        if (allowedChanges.length > 0) {
          onNodesChange(allowedChanges)
        }
        return
      }
      onNodesChange(changes)
    },
    [isLocked, onNodesChange]
  )

  // Handle edge changes with lock check
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isLocked) return
      onEdgesChange(changes)
    },
    [isLocked, onEdgesChange]
  )

  // Handle viewport changes
  const handleViewportChange = useCallback(
    (viewport: Viewport) => {
      setViewport(viewport)
    },
    [setViewport]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isInput = ['INPUT', 'TEXTAREA'].includes((event.target as Element)?.tagName)
      if (isInput) return

      const isCtrl = event.ctrlKey || event.metaKey

      // Delete
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isLocked) {
        selectedNodes.forEach((node) => onNodeDelete?.(node.id))
        selectedEdges.forEach((edge) => onEdgeDelete?.(edge.id))
        event.preventDefault()
      }

      // Undo
      if (isCtrl && event.key === 'z' && !event.shiftKey) {
        undo()
        event.preventDefault()
      }

      // Redo
      if (isCtrl && ((event.key === 'z' && event.shiftKey) || event.key === 'y')) {
        redo()
        event.preventDefault()
      }

      // Copy
      if (isCtrl && event.key === 'c') {
        copySelected()
        event.preventDefault()
      }

      // Cut
      if (isCtrl && event.key === 'x' && !isLocked) {
        cutSelected()
        event.preventDefault()
      }

      // Paste
      if (isCtrl && event.key === 'v' && !isLocked) {
        paste()
        event.preventDefault()
      }

      // Select All
      if (isCtrl && event.key === 'a') {
        selectMultipleNodes(nodes.map((n) => n.id))
        event.preventDefault()
      }

      // Zoom controls
      if (isCtrl && event.key === '0') {
        reactFlowInstance.current?.fitView({ padding: 0.2 })
        event.preventDefault()
      }
      if (isCtrl && (event.key === '=' || event.key === '+')) {
        reactFlowInstance.current?.zoomIn()
        event.preventDefault()
      }
      if (isCtrl && event.key === '-') {
        reactFlowInstance.current?.zoomOut()
        event.preventDefault()
      }

      // Escape to clear selection
      if (event.key === 'Escape') {
        clearSelection()
        onNodeSelect?.(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isLocked,
    selectedNodes,
    selectedEdges,
    nodes,
    undo,
    redo,
    copySelected,
    cutSelected,
    paste,
    selectMultipleNodes,
    clearSelection,
    onNodeDelete,
    onEdgeDelete,
    onNodeSelect,
  ])

  // Zoom functions
  const handleZoomIn = useCallback(() => reactFlowInstance.current?.zoomIn(), [])
  const handleZoomOut = useCallback(() => reactFlowInstance.current?.zoomOut(), [])
  const handleFitView = useCallback(() => reactFlowInstance.current?.fitView({ padding: 0.2 }), [])

  // Delete function
  const handleDeleteSelected = useCallback(() => {
    if (isLocked) return
    selectedNodes.forEach((node) => onNodeDelete?.(node.id))
    selectedEdges.forEach((edge) => onEdgeDelete?.(edge.id))
  }, [isLocked, selectedNodes, selectedEdges, onNodeDelete, onEdgeDelete])

  // Execute function
  const handleExecute = useCallback(async () => {
    if (!currentFlow?.id) return
    try {
      await executeFlow(currentFlow.id)
    } catch (error) {
      console.error('Execution failed:', error)
    }
  }, [currentFlow?.id, executeFlow])

  // Cancel function
  const handleCancel = useCallback(async () => {
    if (!currentExecution?.id) return
    try {
      await cancelExecution(currentExecution.id)
    } catch (error) {
      console.error('Cancel failed:', error)
    }
  }, [currentExecution?.id, cancelExecution])

  // Style nodes with execution state
  const styledNodes = useMemo(() => {
    return nodes.map((node) => {
      const executionState = nodeExecutionStates[node.id]
      const statusColor = executionState ? executionColors[executionState.status] : null

      return {
        ...node,
        style: {
          ...node.style,
          ...(statusColor && {
            boxShadow: `0 0 0 2px ${statusColor}, 0 0 20px ${statusColor}40`,
          }),
          ...(executionState?.status === 'running' && {
            animation: 'pulse 1.5s ease-in-out infinite',
          }),
        },
        data: {
          ...node.data,
          executionState,
        },
      }
    })
  }, [nodes, nodeExecutionStates])

  // Style edges
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      const sourceState = nodeExecutionStates[edge.source]
      const targetState = nodeExecutionStates[edge.target]

      const isActive =
        sourceState?.status === 'running' ||
        (sourceState?.status === 'completed' && targetState?.status === 'running')

      return {
        ...edge,
        animated: isActive,
        style: {
          ...edge.style,
          stroke: isActive ? '#22c55e' : '#6366f1',
          strokeWidth: isActive ? 3 : 2,
        },
      }
    })
  }, [edges, nodeExecutionStates])

  return (
    <div ref={reactFlowWrapper} className="relative w-full h-full">
      {/* Alignment Guides Overlay */}
      {draggingNodeId && (
        <AlignmentGuides guides={alignmentGuides} viewport={viewport} />
      )}

      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={handlePaneClick}
        onSelectionChange={handleSelectionChange}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onViewportChange={handleViewportChange}
        onInit={(instance) => {
          reactFlowInstance.current = instance as unknown as ReactFlowInstance | null
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
        snapToGrid={snapEnabled}
        snapGrid={[gridSize, gridSize]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className={cn('bg-slate-900', isLocked && 'cursor-not-allowed')}
        proOptions={{ hideAttribution: true }}
      >
        {/* Background Grid */}
        <Background
          variant={snapEnabled ? BackgroundVariant.Lines : BackgroundVariant.Dots}
          gap={gridSize}
          size={snapEnabled ? 1 : 1}
          color={snapEnabled ? '#334155' : '#374151'}
          className="!bg-slate-900"
        />

        {/* MiniMap */}
        {showMinimap && (
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={(node) => {
              const executionState = nodeExecutionStates[node.id]
              if (executionState) {
                return executionColors[executionState.status]
              }

              // Default colors by node category
              const type = node.type?.split(':')[0] || 'default'
              switch (type) {
                case 'trigger':
                  return '#f59e0b'
                case 'ai':
                  return '#8b5cf6'
                case 'messaging':
                  return '#3b82f6'
                case 'logic':
                  return '#10b981'
                case 'swarm':
                  return '#06b6d4'
                case 'data':
                  return '#f97316'
                default:
                  return '#6366f1'
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
        )}

        {/* Control Panel */}
        <Panel position="bottom-left" className="!m-4">
          <FlowControls
            isLocked={isLocked}
            onLockToggle={() => onLockToggle?.()}
            onFitView={handleFitView}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onDeleteSelected={handleDeleteSelected}
            hasSelection={hasSelection}
            snapToGrid={snapEnabled}
            onToggleSnap={toggleSnapToGrid}
            canUndo={canUndo()}
            canRedo={canRedo()}
            onUndo={undo}
            onRedo={redo}
            hasClipboard={hasClipboard()}
            onCopy={copySelected}
            onCut={cutSelected}
            onPaste={paste}
            isSaving={isSaving}
            hasUnsavedChanges={hasUnsavedChanges}
            autoSaveEnabled={autoSaveEnabled}
          />
        </Panel>

        {/* Execution controls moved to main toolbar in FlowBuilderPage */}

        {/* Lock Indicator */}
        {isLocked && (
          <Panel position="top-center" className="!mt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/50 rounded-full text-amber-400 text-sm">
              <Lock className="w-4 h-4" />
              Canvas Locked
            </div>
          </Panel>
        )}

        {/* Execution Status Indicator */}
        {isExecuting && (
          <Panel position="top-center" className="!mt-14">
            <div className="flex items-center gap-2 px-4 py-2 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm font-medium">Executing Flow...</span>
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}

export default FlowCanvas
