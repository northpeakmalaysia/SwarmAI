/**
 * Debug Panel Component
 *
 * Step-by-step debugging with breakpoints, variable watches,
 * and execution control.
 */

import React, { useState, useMemo, useCallback } from 'react'
import {
  Bug,
  Play,
  Pause,
  SkipForward,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Circle,
  Square,
  AlertTriangle,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  RefreshCw,
} from 'lucide-react'

// Alias icons for step debugging (lucide-react doesn't have StepInto/Over/Out)
const StepInto = ArrowDownToLine
const StepOver = ArrowRight
const StepOut = ArrowUpFromLine
import { cn } from '../../../lib/utils'
import { useFlowStore } from '../../../stores/flowStore'

interface Breakpoint {
  id: string
  nodeId: string
  nodeName: string
  enabled: boolean
  condition?: string
  hitCount?: number
}

interface WatchExpression {
  id: string
  expression: string
  value?: any
  error?: string
}

interface DebugPanelProps {
  className?: string
}

export const DebugPanel: React.FC<DebugPanelProps> = ({ className }) => {
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([])
  const [watches, setWatches] = useState<WatchExpression[]>([])
  const [newWatch, setNewWatch] = useState('')
  const [isDebugMode, setIsDebugMode] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    breakpoints: true,
    watches: true,
    callStack: true,
  })

  const {
    currentFlow,
    currentExecution: execution,
    executionLogs,
    nodeExecutionStates,
    selectNode,
    isExecuting,
  } = useFlowStore()

  // Get nodes from currentFlow
  const nodes = currentFlow?.nodes ?? []

  // Current execution position
  const currentNode = useMemo(() => {
    if (!execution) return null
    const runningStates = Object.values(nodeExecutionStates).filter(
      (state) => state.status === 'running'
    )
    if (runningStates.length > 0) {
      const state = runningStates[runningStates.length - 1]
      const node = nodes.find((n) => n.id === state.nodeId)
      return {
        nodeId: state.nodeId,
        nodeName: (node?.data?.label as string) || state.nodeId,
        nodeType: node?.type || 'unknown',
      }
    }
    return null
  }, [execution, nodeExecutionStates, nodes])

  // Call stack from node execution states
  const callStack = useMemo(() => {
    const states = Object.values(nodeExecutionStates)
    const stack: { nodeId: string; nodeName: string; nodeType: string }[] = []

    // Build stack from running and completed nodes
    for (const state of states) {
      if (state.status === 'running' || state.status === 'completed') {
        const node = nodes.find((n) => n.id === state.nodeId)
        stack.push({
          nodeId: state.nodeId,
          nodeName: (node?.data?.label as string) || state.nodeId,
          nodeType: node?.type || 'unknown',
        })
      }
    }

    return stack.reverse()
  }, [nodeExecutionStates, nodes])

  // Toggle section expansion
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  // Add breakpoint
  const addBreakpoint = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return

      const existing = breakpoints.find((bp) => bp.nodeId === nodeId)
      if (existing) return

      setBreakpoints((prev) => [
        ...prev,
        {
          id: `bp-${Date.now()}`,
          nodeId,
          nodeName: (node.data?.label as string) || nodeId,
          enabled: true,
          hitCount: 0,
        },
      ])
    },
    [nodes, breakpoints]
  )

  // Remove breakpoint
  const removeBreakpoint = useCallback((id: string) => {
    setBreakpoints((prev) => prev.filter((bp) => bp.id !== id))
  }, [])

  // Toggle breakpoint
  const toggleBreakpoint = useCallback((id: string) => {
    setBreakpoints((prev) =>
      prev.map((bp) => (bp.id === id ? { ...bp, enabled: !bp.enabled } : bp))
    )
  }, [])

  // Add watch expression
  const addWatch = useCallback(() => {
    if (!newWatch.trim()) return

    setWatches((prev) => [
      ...prev,
      {
        id: `watch-${Date.now()}`,
        expression: newWatch.trim(),
        value: undefined,
      },
    ])
    setNewWatch('')
  }, [newWatch])

  // Remove watch expression
  const removeWatch = useCallback((id: string) => {
    setWatches((prev) => prev.filter((w) => w.id !== id))
  }, [])

  // Evaluate watch expressions
  const evaluateWatches = useCallback(() => {
    // Build context from execution input/output
    const context = {
      input: execution?.input || {},
      output: execution?.output || {},
      ...execution?.input,
      ...execution?.output,
    }
    if (!execution) return

    setWatches((prev) =>
      prev.map((watch) => {
        try {
          // Simple path evaluation
          const parts = watch.expression.split('.')
          let value: any = context

          for (const part of parts) {
            if (value && typeof value === 'object') {
              value = value[part]
            } else {
              value = undefined
              break
            }
          }

          return { ...watch, value, error: undefined }
        } catch (err) {
          return { ...watch, error: String(err), value: undefined }
        }
      })
    )
  }, [execution])

  // Debug controls
  const handleStepOver = () => {
    console.log('Step over')
    // TODO: Implement step over
  }

  const handleStepInto = () => {
    console.log('Step into')
    // TODO: Implement step into
  }

  const handleStepOut = () => {
    console.log('Step out')
    // TODO: Implement step out
  }

  const handleContinue = () => {
    setIsPaused(false)
    console.log('Continue')
    // TODO: Implement continue
  }

  const formatValue = (value: any): string => {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return '[Object]'
      }
    }
    return String(value)
  }

  return (
    <div className={cn('flex flex-col h-full bg-slate-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-slate-200">Debugger</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsDebugMode(!isDebugMode)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
              isDebugMode
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            {isDebugMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            Debug Mode
          </button>
        </div>
      </div>

      {/* Debug Controls */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-700/50">
        <button
          onClick={handleContinue}
          disabled={!isPaused}
          className={cn(
            'p-1.5 rounded transition-colors',
            !isPaused
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-green-400 hover:bg-green-500/10'
          )}
          title="Continue (F5)"
        >
          <Play className="w-4 h-4" />
        </button>

        <button
          onClick={handleStepOver}
          disabled={!isPaused}
          className={cn(
            'p-1.5 rounded transition-colors',
            !isPaused
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          )}
          title="Step Over (F10)"
        >
          <StepOver className="w-4 h-4" />
        </button>

        <button
          onClick={handleStepInto}
          disabled={!isPaused}
          className={cn(
            'p-1.5 rounded transition-colors',
            !isPaused
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          )}
          title="Step Into (F11)"
        >
          <StepInto className="w-4 h-4" />
        </button>

        <button
          onClick={handleStepOut}
          disabled={!isPaused}
          className={cn(
            'p-1.5 rounded transition-colors',
            !isPaused
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          )}
          title="Step Out (Shift+F11)"
        >
          <StepOut className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-700 mx-2" />

        {/* Current position */}
        {currentNode && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">At:</span>
            <button
              onClick={() => selectNode(currentNode.nodeId)}
              className="text-indigo-400 hover:underline"
            >
              {currentNode.nodeName}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Breakpoints Section */}
        <div className="border-b border-slate-700/50">
          <button
            onClick={() => toggleSection('breakpoints')}
            className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            {expandedSections.breakpoints ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            BREAKPOINTS
            <span className="text-slate-600 ml-auto">{breakpoints.length}</span>
          </button>

          {expandedSections.breakpoints && (
            <div className="px-4 pb-3 space-y-1">
              {breakpoints.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  No breakpoints set. Click on a node to add one.
                </p>
              ) : (
                breakpoints.map((bp) => (
                  <div
                    key={bp.id}
                    className="flex items-center gap-2 py-1 group"
                  >
                    <button
                      onClick={() => toggleBreakpoint(bp.id)}
                      className={cn(
                        'w-3 h-3 rounded-full border-2 transition-colors',
                        bp.enabled
                          ? 'bg-red-500 border-red-500'
                          : 'bg-transparent border-slate-600'
                      )}
                    />
                    <button
                      onClick={() => selectNode(bp.nodeId)}
                      className="flex-1 text-left text-xs text-slate-300 hover:text-white truncate"
                    >
                      {bp.nodeName}
                    </button>
                    {bp.hitCount !== undefined && bp.hitCount > 0 && (
                      <span className="text-[10px] text-slate-500">
                        Hit: {bp.hitCount}
                      </span>
                    )}
                    <button
                      onClick={() => removeBreakpoint(bp.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Watch Expressions Section */}
        <div className="border-b border-slate-700/50">
          <button
            onClick={() => toggleSection('watches')}
            className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            {expandedSections.watches ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            WATCH
            <span className="text-slate-600 ml-auto">{watches.length}</span>
          </button>

          {expandedSections.watches && (
            <div className="px-4 pb-3 space-y-2">
              {/* Add watch input */}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newWatch}
                  onChange={(e) => setNewWatch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addWatch()}
                  placeholder="Add expression..."
                  className={cn(
                    'flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded',
                    'text-xs text-slate-100 placeholder-slate-500',
                    'focus:outline-none focus:border-indigo-500'
                  )}
                />
                <button
                  onClick={addWatch}
                  disabled={!newWatch.trim()}
                  className={cn(
                    'p-1 rounded transition-colors',
                    !newWatch.trim()
                      ? 'text-slate-600 cursor-not-allowed'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  )}
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={evaluateWatches}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                  title="Refresh all"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Watch list */}
              {watches.map((watch) => (
                <div
                  key={watch.id}
                  className="flex items-start gap-2 py-1 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-mono">
                        {watch.expression}
                      </span>
                      <button
                        onClick={() => removeWatch(watch.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {watch.error ? (
                      <span className="text-xs text-red-400">{watch.error}</span>
                    ) : (
                      <pre className="text-xs text-slate-300 font-mono truncate">
                        {formatValue(watch.value)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Call Stack Section */}
        <div className="border-b border-slate-700/50">
          <button
            onClick={() => toggleSection('callStack')}
            className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            {expandedSections.callStack ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            CALL STACK
            <span className="text-slate-600 ml-auto">{callStack.length}</span>
          </button>

          {expandedSections.callStack && (
            <div className="px-4 pb-3 space-y-1">
              {callStack.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Not running</p>
              ) : (
                callStack.map((frame, index) => (
                  <button
                    key={`${frame.nodeId}-${index}`}
                    onClick={() => selectNode(frame.nodeId)}
                    className={cn(
                      'w-full flex items-center gap-2 py-1 text-left transition-colors',
                      index === 0
                        ? 'text-indigo-400'
                        : 'text-slate-400 hover:text-white'
                    )}
                  >
                    {index === 0 && (
                      <ChevronRight className="w-3 h-3 text-amber-400" />
                    )}
                    <span className="text-xs truncate">{frame.nodeName}</span>
                    <span className="text-[10px] text-slate-600 ml-auto">
                      {frame.nodeType}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-700/50 text-[10px] text-slate-500">
        {isDebugMode ? (
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Debug mode active - execution may be slower
          </span>
        ) : (
          <span>Enable debug mode to set breakpoints and step through execution</span>
        )}
      </div>
    </div>
  )
}

export default DebugPanel
