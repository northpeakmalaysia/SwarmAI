/**
 * Enhanced Flow Store
 *
 * Comprehensive state management for the FlowBuilder:
 * - Undo/redo history with configurable depth
 * - Real-time execution tracking per node
 * - Selected node/edge for config panel
 * - Clipboard for copy/paste operations
 * - Viewport state persistence
 * - Auto-save with debouncing
 * - WebSocket integration for live updates
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import api from '../services/api'
import { websocket } from '../services/websocket'
import { extractErrorMessage } from '../lib/utils'
import type { Node, Edge, Viewport } from '@xyflow/react'

// ============================================================================
// Types
// ============================================================================

export interface Flow {
  id: string
  name: string
  description: string
  nodes: Node[]
  edges: Edge[]
  variables?: Record<string, any>
  agentId?: string
  isActive: boolean
  lastRun?: string
  runCount: number
  version?: number
  createdAt: string
  updatedAt: string
}

export interface FlowExecution {
  id: string
  flowId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt: string
  completedAt?: string
  error?: string
  logs: ExecutionLog[]
  nodeStates: Record<string, NodeExecutionState>
  input?: Record<string, any>
  output?: Record<string, any>
  duration?: number
}

export interface ExecutionLog {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  nodeId?: string
  nodeType?: string
  message: string
  data?: any
}

export interface NodeExecutionState {
  nodeId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt?: string
  completedAt?: string
  duration?: number
  input?: any
  output?: any
  error?: string
  retryCount?: number
}

export interface FlowQueueStatus {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

export interface FlowScheduleTriggered {
  scheduleId: string
  flowId: string
  executionId: string
  cronExpression: string
  nextRun?: string
}

// History entry for undo/redo
interface HistoryEntry {
  nodes: Node[]
  edges: Edge[]
  timestamp: number
  action: string
}

// Clipboard content
interface ClipboardContent {
  nodes: Node[]
  edges: Edge[]
  offset: { x: number; y: number }
}

// ============================================================================
// Store State Interface
// ============================================================================

interface FlowState {
  // Flow data
  flows: Flow[]
  currentFlow: Flow | null
  executions: FlowExecution[]
  currentExecution: FlowExecution | null

  // Loading states
  isLoading: boolean
  isSaving: boolean
  isExecuting: boolean
  error: string | null

  // Selection state
  selectedNodeId: string | null
  selectedEdgeId: string | null
  selectedNodeIds: string[]

  // History (undo/redo)
  history: HistoryEntry[]
  historyIndex: number
  maxHistorySize: number

  // Clipboard
  clipboard: ClipboardContent | null

  // Canvas state
  viewport: Viewport
  snapToGrid: boolean
  gridSize: number
  showMinimap: boolean
  showDebugPanel: boolean

  // Execution tracking
  nodeExecutionStates: Record<string, NodeExecutionState>
  executionLogs: ExecutionLog[]

  // Queue status
  queueStatus: FlowQueueStatus | null
  recentScheduleTriggers: FlowScheduleTriggered[]

  // Auto-save
  hasUnsavedChanges: boolean
  lastSavedAt: string | null
  autoSaveEnabled: boolean
  autoSaveDebounceMs: number
  _autoSaveTimer: NodeJS.Timeout | null

  // WebSocket
  _unsubscribe: (() => void) | null

  // ============================================================================
  // Actions - Flow CRUD
  // ============================================================================

  fetchFlows: () => Promise<void>
  fetchFlow: (id: string) => Promise<Flow>
  createFlow: (name: string, description: string) => Promise<Flow>
  updateFlow: (id: string, updates: Partial<Flow>) => Promise<Flow>
  deleteFlow: (id: string) => Promise<void>
  toggleFlowStatus: (id: string) => Promise<Flow>
  duplicateFlow: (id: string) => Promise<Flow>
  setCurrentFlow: (flow: Flow | null) => void

  // ============================================================================
  // Actions - Nodes & Edges
  // ============================================================================

  updateNodes: (nodes: Node[], action?: string) => void
  updateEdges: (edges: Edge[], action?: string) => void
  addNode: (node: Node) => void
  removeNode: (nodeId: string) => void
  updateNodeData: (nodeId: string, data: Partial<Node['data']>) => void
  addEdge: (edge: Edge) => void
  removeEdge: (edgeId: string) => void

  // ============================================================================
  // Actions - Selection
  // ============================================================================

  selectNode: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void
  selectMultipleNodes: (nodeIds: string[]) => void
  clearSelection: () => void

  // ============================================================================
  // Actions - History (Undo/Redo)
  // ============================================================================

  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  clearHistory: () => void
  pushToHistory: (action: string) => void

  // ============================================================================
  // Actions - Clipboard
  // ============================================================================

  copySelected: () => void
  cutSelected: () => void
  paste: (position?: { x: number; y: number }) => void
  hasClipboard: () => boolean

  // ============================================================================
  // Actions - Canvas
  // ============================================================================

  setViewport: (viewport: Viewport) => void
  toggleSnapToGrid: () => void
  setGridSize: (size: number) => void
  toggleMinimap: () => void
  toggleDebugPanel: () => void
  fitView: () => void

  // ============================================================================
  // Actions - Execution
  // ============================================================================

  executeFlow: (id: string, inputs?: Record<string, any>) => Promise<FlowExecution>
  cancelExecution: (executionId: string) => Promise<void>
  updateNodeExecutionState: (nodeId: string, state: Partial<NodeExecutionState>) => void
  addExecutionLog: (log: ExecutionLog) => void
  clearExecutionState: () => void
  setCurrentExecution: (execution: FlowExecution | null) => void

  // ============================================================================
  // Actions - Auto-save
  // ============================================================================

  markAsChanged: () => void
  saveNow: () => Promise<void>
  toggleAutoSave: () => void
  setAutoSaveDebounce: (ms: number) => void

  // ============================================================================
  // Actions - Agent Assignment
  // ============================================================================

  assignFlowToAgent: (flowId: string, agentId: string | null) => Promise<void>
  getFlowsByAgent: (agentId: string) => Promise<Flow[]>
  getFlowAssignmentSummary: () => Promise<{
    byAgent: { agentId: string; agentName: string; flows: { id: string; name: string; status: string }[] }[]
    unassigned: { id: string; name: string; status: string }[]
    totalFlows: number
    assignedCount: number
    unassignedCount: number
  }>

  // ============================================================================
  // Actions - WebSocket
  // ============================================================================

  subscribeToFlowEvents: () => void
  unsubscribeFromFlowEvents: () => void
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useFlowStore = create<FlowState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    flows: [],
    currentFlow: null,
    executions: [],
    currentExecution: null,

    isLoading: false,
    isSaving: false,
    isExecuting: false,
    error: null,

    selectedNodeId: null,
    selectedEdgeId: null,
    selectedNodeIds: [],

    history: [],
    historyIndex: -1,
    maxHistorySize: 50,

    clipboard: null,

    viewport: { x: 0, y: 0, zoom: 1 },
    snapToGrid: true,
    gridSize: 20,
    showMinimap: true,
    showDebugPanel: false,

    nodeExecutionStates: {},
    executionLogs: [],

    queueStatus: null,
    recentScheduleTriggers: [],

    hasUnsavedChanges: false,
    lastSavedAt: null,
    autoSaveEnabled: true,
    autoSaveDebounceMs: 2000,
    _autoSaveTimer: null,

    _unsubscribe: null,

    // ============================================================================
    // Flow CRUD Implementation
    // ============================================================================

    fetchFlows: async () => {
      set({ isLoading: true, error: null })
      try {
        const response = await api.get('/flows')
        const flows = Array.isArray(response.data)
          ? response.data
          : response.data.flows || []
        set({ flows, isLoading: false })
      } catch (error) {
        set({
          error: extractErrorMessage(error, 'Failed to fetch flows'),
          isLoading: false,
          flows: [],
        })
      }
    },

    fetchFlow: async (id) => {
      set({ isLoading: true, error: null })
      try {
        const response = await api.get(`/flows/${id}`)
        const flow = response.data.flow || response.data
        set({
          currentFlow: flow,
          isLoading: false,
          hasUnsavedChanges: false,
          lastSavedAt: new Date().toISOString(),
        })
        get().clearHistory()
        get().pushToHistory('Load flow')
        return flow
      } catch (error) {
        set({ error: extractErrorMessage(error, 'Failed to fetch flow'), isLoading: false })
        throw error
      }
    },

    createFlow: async (name, description) => {
      set({ isLoading: true, error: null })
      try {
        const response = await api.post('/flows', {
          name,
          description,
          nodes: [],
          edges: [],
        })
        const newFlow = response.data.flow || response.data
        set((state) => ({
          flows: [...state.flows, newFlow],
          currentFlow: newFlow,
          isLoading: false,
          hasUnsavedChanges: false,
          lastSavedAt: new Date().toISOString(),
        }))
        get().clearHistory()
        get().pushToHistory('Create flow')
        return newFlow
      } catch (error) {
        set({ error: extractErrorMessage(error, 'Failed to create flow'), isLoading: false })
        throw error
      }
    },

    updateFlow: async (id, updates) => {
      set({ isSaving: true, error: null })
      try {
        const response = await api.put(`/flows/${id}`, updates)
        const updatedFlow = response.data.flow || response.data
        set((state) => ({
          flows: state.flows.map((f) => (f.id === id ? updatedFlow : f)),
          currentFlow: state.currentFlow?.id === id ? updatedFlow : state.currentFlow,
          isSaving: false,
          hasUnsavedChanges: false,
          lastSavedAt: new Date().toISOString(),
        }))
        return updatedFlow
      } catch (error) {
        set({ error: extractErrorMessage(error, 'Failed to update flow'), isSaving: false })
        throw error
      }
    },

    deleteFlow: async (id) => {
      try {
        await api.delete(`/flows/${id}`)
        set((state) => ({
          flows: state.flows.filter((f) => f.id !== id),
          currentFlow: state.currentFlow?.id === id ? null : state.currentFlow,
        }))
      } catch (error) {
        set({ error: extractErrorMessage(error, 'Failed to delete flow') })
        throw error
      }
    },

    toggleFlowStatus: async (id) => {
      try {
        const response = await api.post(`/flows/${id}/toggle`)
        const updatedFlow = response.data.flow || response.data
        set((state) => ({
          flows: state.flows.map((f) => (f.id === id ? { ...f, isActive: updatedFlow.isActive } : f)),
          currentFlow: state.currentFlow?.id === id
            ? { ...state.currentFlow, isActive: updatedFlow.isActive }
            : state.currentFlow,
        }))
        return updatedFlow
      } catch (error) {
        set({ error: extractErrorMessage(error, 'Failed to toggle flow status') })
        throw error
      }
    },

    duplicateFlow: async (id) => {
      set({ isLoading: true, error: null })
      try {
        const sourceFlow = get().flows.find((f) => f.id === id)
        if (!sourceFlow) throw new Error('Flow not found')

        const response = await api.post('/flows', {
          name: `${sourceFlow.name} (Copy)`,
          description: sourceFlow.description,
          nodes: sourceFlow.nodes,
          edges: sourceFlow.edges,
        })
        const newFlow = response.data.flow || response.data
        set((state) => ({
          flows: [...state.flows, newFlow],
          isLoading: false,
        }))
        return newFlow
      } catch (error) {
        set({ error: extractErrorMessage(error, 'Failed to duplicate flow'), isLoading: false })
        throw error
      }
    },

    setCurrentFlow: (flow) => {
      set({
        currentFlow: flow,
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedNodeIds: [],
        hasUnsavedChanges: false,
      })
      if (flow) {
        get().clearHistory()
        get().pushToHistory('Set current flow')
      }
    },

    // ============================================================================
    // Nodes & Edges Implementation
    // ============================================================================

    updateNodes: (nodes, action = 'Update nodes') => {
      const state = get()
      if (!state.currentFlow) return

      get().pushToHistory(action)
      set({
        currentFlow: { ...state.currentFlow, nodes },
      })
      get().markAsChanged()
    },

    updateEdges: (edges, action = 'Update edges') => {
      const state = get()
      if (!state.currentFlow) return

      get().pushToHistory(action)
      set({
        currentFlow: { ...state.currentFlow, edges },
      })
      get().markAsChanged()
    },

    addNode: (node) => {
      const state = get()
      if (!state.currentFlow) return

      get().pushToHistory('Add node')
      set({
        currentFlow: {
          ...state.currentFlow,
          nodes: [...state.currentFlow.nodes, node],
        },
      })
      get().markAsChanged()
    },

    removeNode: (nodeId) => {
      const state = get()
      if (!state.currentFlow) return

      get().pushToHistory('Remove node')
      set({
        currentFlow: {
          ...state.currentFlow,
          nodes: state.currentFlow.nodes.filter((n) => n.id !== nodeId),
          edges: state.currentFlow.edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId
          ),
        },
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        selectedNodeIds: state.selectedNodeIds.filter((id) => id !== nodeId),
      })
      get().markAsChanged()
    },

    updateNodeData: (nodeId, data) => {
      const state = get()
      if (!state.currentFlow) return

      get().pushToHistory('Update node config')
      set({
        currentFlow: {
          ...state.currentFlow,
          nodes: state.currentFlow.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
          ),
        },
      })
      get().markAsChanged()
    },

    addEdge: (edge) => {
      const state = get()
      if (!state.currentFlow) return

      get().pushToHistory('Add connection')
      set({
        currentFlow: {
          ...state.currentFlow,
          edges: [...state.currentFlow.edges, edge],
        },
      })
      get().markAsChanged()
    },

    removeEdge: (edgeId) => {
      const state = get()
      if (!state.currentFlow) return

      get().pushToHistory('Remove connection')
      set({
        currentFlow: {
          ...state.currentFlow,
          edges: state.currentFlow.edges.filter((e) => e.id !== edgeId),
        },
        selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId,
      })
      get().markAsChanged()
    },

    // ============================================================================
    // Selection Implementation
    // ============================================================================

    selectNode: (nodeId) => {
      set({
        selectedNodeId: nodeId,
        selectedEdgeId: null,
        selectedNodeIds: nodeId ? [nodeId] : [],
      })
    },

    selectEdge: (edgeId) => {
      set({
        selectedEdgeId: edgeId,
        selectedNodeId: null,
        selectedNodeIds: [],
      })
    },

    selectMultipleNodes: (nodeIds) => {
      set({
        selectedNodeIds: nodeIds,
        selectedNodeId: nodeIds.length === 1 ? nodeIds[0] : null,
        selectedEdgeId: null,
      })
    },

    clearSelection: () => {
      set({
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedNodeIds: [],
      })
    },

    // ============================================================================
    // History (Undo/Redo) Implementation
    // ============================================================================

    pushToHistory: (action) => {
      const state = get()
      if (!state.currentFlow) return

      const entry: HistoryEntry = {
        nodes: JSON.parse(JSON.stringify(state.currentFlow.nodes)),
        edges: JSON.parse(JSON.stringify(state.currentFlow.edges)),
        timestamp: Date.now(),
        action,
      }

      // Remove any future history if we're not at the end
      const newHistory = state.history.slice(0, state.historyIndex + 1)
      newHistory.push(entry)

      // Limit history size
      if (newHistory.length > state.maxHistorySize) {
        newHistory.shift()
      }

      set({
        history: newHistory,
        historyIndex: newHistory.length - 1,
      })
    },

    undo: () => {
      const state = get()
      if (!state.currentFlow || state.historyIndex <= 0) return

      const newIndex = state.historyIndex - 1
      const entry = state.history[newIndex]

      set({
        currentFlow: {
          ...state.currentFlow,
          nodes: JSON.parse(JSON.stringify(entry.nodes)),
          edges: JSON.parse(JSON.stringify(entry.edges)),
        },
        historyIndex: newIndex,
      })
      get().markAsChanged()
    },

    redo: () => {
      const state = get()
      if (!state.currentFlow || state.historyIndex >= state.history.length - 1) return

      const newIndex = state.historyIndex + 1
      const entry = state.history[newIndex]

      set({
        currentFlow: {
          ...state.currentFlow,
          nodes: JSON.parse(JSON.stringify(entry.nodes)),
          edges: JSON.parse(JSON.stringify(entry.edges)),
        },
        historyIndex: newIndex,
      })
      get().markAsChanged()
    },

    canUndo: () => {
      const state = get()
      return state.historyIndex > 0
    },

    canRedo: () => {
      const state = get()
      return state.historyIndex < state.history.length - 1
    },

    clearHistory: () => {
      set({ history: [], historyIndex: -1 })
    },

    // ============================================================================
    // Clipboard Implementation
    // ============================================================================

    copySelected: () => {
      const state = get()
      if (!state.currentFlow || state.selectedNodeIds.length === 0) return

      const selectedNodes = state.currentFlow.nodes.filter((n) =>
        state.selectedNodeIds.includes(n.id)
      )

      // Get edges that connect selected nodes
      const selectedEdges = state.currentFlow.edges.filter(
        (e) =>
          state.selectedNodeIds.includes(e.source) &&
          state.selectedNodeIds.includes(e.target)
      )

      // Calculate bounding box for offset
      const minX = Math.min(...selectedNodes.map((n) => n.position.x))
      const minY = Math.min(...selectedNodes.map((n) => n.position.y))

      set({
        clipboard: {
          nodes: JSON.parse(JSON.stringify(selectedNodes)),
          edges: JSON.parse(JSON.stringify(selectedEdges)),
          offset: { x: minX, y: minY },
        },
      })
    },

    cutSelected: () => {
      const state = get()
      get().copySelected()

      if (!state.currentFlow) return

      get().pushToHistory('Cut nodes')
      set({
        currentFlow: {
          ...state.currentFlow,
          nodes: state.currentFlow.nodes.filter(
            (n) => !state.selectedNodeIds.includes(n.id)
          ),
          edges: state.currentFlow.edges.filter(
            (e) =>
              !state.selectedNodeIds.includes(e.source) &&
              !state.selectedNodeIds.includes(e.target)
          ),
        },
        selectedNodeIds: [],
        selectedNodeId: null,
      })
      get().markAsChanged()
    },

    paste: (position) => {
      const state = get()
      if (!state.currentFlow || !state.clipboard) return

      const pasteX = position?.x ?? state.viewport.x + 100
      const pasteY = position?.y ?? state.viewport.y + 100
      const offsetX = pasteX - state.clipboard.offset.x
      const offsetY = pasteY - state.clipboard.offset.y

      // Generate new IDs for nodes
      const idMap: Record<string, string> = {}
      const newNodes = state.clipboard.nodes.map((n) => {
        const newId = `${n.id}_copy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        idMap[n.id] = newId
        return {
          ...n,
          id: newId,
          position: {
            x: n.position.x + offsetX,
            y: n.position.y + offsetY,
          },
          selected: false,
        }
      })

      // Update edge references
      const newEdges = state.clipboard.edges.map((e) => ({
        ...e,
        id: `${e.id}_copy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        source: idMap[e.source],
        target: idMap[e.target],
        selected: false,
      }))

      get().pushToHistory('Paste nodes')
      set({
        currentFlow: {
          ...state.currentFlow,
          nodes: [...state.currentFlow.nodes, ...newNodes],
          edges: [...state.currentFlow.edges, ...newEdges],
        },
        selectedNodeIds: newNodes.map((n) => n.id),
        selectedNodeId: newNodes.length === 1 ? newNodes[0].id : null,
      })
      get().markAsChanged()
    },

    hasClipboard: () => {
      const state = get()
      return state.clipboard !== null && state.clipboard.nodes.length > 0
    },

    // ============================================================================
    // Canvas Implementation
    // ============================================================================

    setViewport: (viewport) => {
      set({ viewport })
    },

    toggleSnapToGrid: () => {
      set((state) => ({ snapToGrid: !state.snapToGrid }))
    },

    setGridSize: (size) => {
      set({ gridSize: Math.max(5, Math.min(100, size)) })
    },

    toggleMinimap: () => {
      set((state) => ({ showMinimap: !state.showMinimap }))
    },

    toggleDebugPanel: () => {
      set((state) => ({ showDebugPanel: !state.showDebugPanel }))
    },

    fitView: () => {
      // This will be handled by the ReactFlow component
      // Store just tracks the intent
    },

    // ============================================================================
    // Execution Implementation
    // ============================================================================

    executeFlow: async (id, inputs) => {
      set({
        isExecuting: true,
        error: null,
        nodeExecutionStates: {},
        executionLogs: [],
      })

      try {
        const response = await api.post(`/flows/${id}/execute`, { inputs })
        const execution: FlowExecution = response.data.execution || response.data

        set((state) => ({
          executions: [...state.executions, execution],
          currentExecution: execution,
          isExecuting: execution.status === 'running',
        }))

        return execution
      } catch (error) {
        set({
          error: extractErrorMessage(error, 'Failed to execute flow'),
          isExecuting: false,
        })
        throw error
      }
    },

    cancelExecution: async (executionId) => {
      try {
        await api.post(`/flows/executions/${executionId}/cancel`)
        set((state) => ({
          currentExecution:
            state.currentExecution?.id === executionId
              ? { ...state.currentExecution, status: 'cancelled' }
              : state.currentExecution,
          isExecuting: false,
        }))
      } catch (error) {
        set({ error: extractErrorMessage(error, 'Failed to cancel execution') })
        throw error
      }
    },

    updateNodeExecutionState: (nodeId, state) => {
      set((s) => ({
        nodeExecutionStates: {
          ...s.nodeExecutionStates,
          [nodeId]: {
            ...s.nodeExecutionStates[nodeId],
            nodeId,
            ...state,
          },
        },
      }))
    },

    addExecutionLog: (log) => {
      set((state) => ({
        executionLogs: [...state.executionLogs, log].slice(-500), // Keep last 500 logs
      }))
    },

    clearExecutionState: () => {
      set({
        nodeExecutionStates: {},
        executionLogs: [],
        currentExecution: null,
        isExecuting: false,
      })
    },

    setCurrentExecution: (execution) => {
      set({
        currentExecution: execution,
        isExecuting: execution?.status === 'running',
      })
    },

    // ============================================================================
    // Auto-save Implementation
    // ============================================================================

    markAsChanged: () => {
      const state = get()
      set({ hasUnsavedChanges: true })

      // Clear existing timer
      if (state._autoSaveTimer) {
        clearTimeout(state._autoSaveTimer)
      }

      // Set up auto-save if enabled
      if (state.autoSaveEnabled && state.currentFlow?.id) {
        const timer = setTimeout(() => {
          get().saveNow()
        }, state.autoSaveDebounceMs)

        set({ _autoSaveTimer: timer })
      }
    },

    saveNow: async () => {
      const state = get()
      if (!state.currentFlow?.id || !state.hasUnsavedChanges || state.isSaving) return

      try {
        await get().updateFlow(state.currentFlow.id, {
          nodes: state.currentFlow.nodes,
          edges: state.currentFlow.edges,
        })
      } catch (error) {
        console.error('[FlowStore] Auto-save failed:', error)
      }
    },

    toggleAutoSave: () => {
      set((state) => ({ autoSaveEnabled: !state.autoSaveEnabled }))
    },

    setAutoSaveDebounce: (ms) => {
      set({ autoSaveDebounceMs: Math.max(500, Math.min(30000, ms)) })
    },

    // ============================================================================
    // WebSocket Implementation
    // ============================================================================

    subscribeToFlowEvents: () => {
      if (get()._unsubscribe) return

      const unsubscribe = websocket.subscribeMany([
        {
          event: 'flow:queue:status',
          handler: (data: unknown) => {
            set({ queueStatus: data as FlowQueueStatus })
          },
        },
        {
          event: 'flow:schedule:triggered',
          handler: (data: unknown) => {
            const trigger = data as FlowScheduleTriggered
            set((state) => ({
              recentScheduleTriggers: [trigger, ...state.recentScheduleTriggers].slice(0, 10),
            }))
          },
        },
        {
          event: 'flow:execution:started',
          handler: (data: unknown) => {
            const typed = data as { executionId: string; flowId: string }
            const state = get()
            if (state.currentExecution?.id === typed.executionId) {
              set({
                currentExecution: { ...state.currentExecution, status: 'running' },
                isExecuting: true,
              })
            }
          },
        },
        {
          event: 'flow:execution:completed',
          handler: (data: unknown) => {
            const typed = data as { executionId: string; output: any; duration: number }
            const state = get()
            if (state.currentExecution?.id === typed.executionId) {
              set({
                currentExecution: {
                  ...state.currentExecution,
                  status: 'completed',
                  output: typed.output,
                  duration: typed.duration,
                  completedAt: new Date().toISOString(),
                },
                isExecuting: false,
              })
            }
          },
        },
        {
          event: 'flow:execution:failed',
          handler: (data: unknown) => {
            const typed = data as { executionId: string; error: string }
            const state = get()
            if (state.currentExecution?.id === typed.executionId) {
              set({
                currentExecution: {
                  ...state.currentExecution,
                  status: 'failed',
                  error: typed.error,
                  completedAt: new Date().toISOString(),
                },
                isExecuting: false,
              })
            }
          },
        },
        {
          event: 'flow:node:started',
          handler: (data: unknown) => {
            const typed = data as { executionId: string; nodeId: string; input: any }
            const state = get()
            if (state.currentExecution?.id === typed.executionId) {
              get().updateNodeExecutionState(typed.nodeId, {
                status: 'running',
                startedAt: new Date().toISOString(),
                input: typed.input,
              })
            }
          },
        },
        {
          event: 'flow:node:completed',
          handler: (data: unknown) => {
            const typed = data as {
              executionId: string
              nodeId: string
              output: any
              duration: number
            }
            const state = get()
            if (state.currentExecution?.id === typed.executionId) {
              get().updateNodeExecutionState(typed.nodeId, {
                status: 'completed',
                completedAt: new Date().toISOString(),
                output: typed.output,
                duration: typed.duration,
              })
            }
          },
        },
        {
          event: 'flow:node:failed',
          handler: (data: unknown) => {
            const typed = data as { executionId: string; nodeId: string; error: string }
            const state = get()
            if (state.currentExecution?.id === typed.executionId) {
              get().updateNodeExecutionState(typed.nodeId, {
                status: 'failed',
                completedAt: new Date().toISOString(),
                error: typed.error,
              })
            }
          },
        },
        {
          event: 'flow:log',
          handler: (data: unknown) => {
            const typed = data as ExecutionLog
            const state = get()
            if (state.currentExecution?.id) {
              get().addExecutionLog(typed)
            }
          },
        },
      ])

      set({ _unsubscribe: unsubscribe })
    },

    unsubscribeFromFlowEvents: () => {
      const unsubscribe = get()._unsubscribe
      if (unsubscribe) {
        unsubscribe()
        set({ _unsubscribe: null })
      }

      // Clean up auto-save timer
      const timer = get()._autoSaveTimer
      if (timer) {
        clearTimeout(timer)
        set({ _autoSaveTimer: null })
      }
    },

    // ============================================================================
    // Agent Assignment Implementation
    // ============================================================================

    assignFlowToAgent: async (flowId, agentId) => {
      try {
        const response = await api.post(`/flows/${flowId}/assign`, { agentId })
        const updatedFlow = response.data.flow

        set((state) => ({
          flows: state.flows.map((f) => (f.id === flowId ? { ...f, agentId: updatedFlow.agentId } : f)),
          currentFlow: state.currentFlow?.id === flowId
            ? { ...state.currentFlow, agentId: updatedFlow.agentId }
            : state.currentFlow,
        }))
      } catch (error) {
        set({ error: extractErrorMessage(error, 'Failed to assign flow to agent') })
        throw error
      }
    },

    getFlowsByAgent: async (agentId) => {
      try {
        const response = await api.get(`/flows/by-agent/${agentId}`)
        return response.data.flows
      } catch (error) {
        set({ error: extractErrorMessage(error, 'Failed to get flows by agent') })
        throw error
      }
    },

    getFlowAssignmentSummary: async () => {
      try {
        const response = await api.get('/flows/assignments/summary')
        return response.data
      } catch (error) {
        set({ error: extractErrorMessage(error, 'Failed to get assignment summary') })
        throw error
      }
    },
  }))
)

// ============================================================================
// Selectors
// ============================================================================

export const selectCurrentNodes = (state: FlowState) => state.currentFlow?.nodes ?? []
export const selectCurrentEdges = (state: FlowState) => state.currentFlow?.edges ?? []
export const selectSelectedNode = (state: FlowState) => {
  if (!state.selectedNodeId || !state.currentFlow) return null
  return state.currentFlow.nodes.find((n) => n.id === state.selectedNodeId) ?? null
}
export const selectSelectedEdge = (state: FlowState) => {
  if (!state.selectedEdgeId || !state.currentFlow) return null
  return state.currentFlow.edges.find((e) => e.id === state.selectedEdgeId) ?? null
}
export const selectNodeExecutionState = (nodeId: string) => (state: FlowState) =>
  state.nodeExecutionStates[nodeId]
export const selectCanUndo = (state: FlowState) => state.historyIndex > 0
export const selectCanRedo = (state: FlowState) =>
  state.historyIndex < state.history.length - 1
export const selectHasUnsavedChanges = (state: FlowState) => state.hasUnsavedChanges
