/**
 * Execution Panel Component
 *
 * Real-time execution monitoring with timeline view, node status,
 * variable inspection, and debugging capabilities.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  SkipForward,
  Bug,
  Terminal,
  Variable,
  Layers,
  Filter,
  Search,
  Download,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useFlowStore, type FlowExecution } from '../../../stores/flowStore'
import { formatTime24h } from '@/utils/dateFormat'

// Types
interface ExecutionLog {
  id: string
  timestamp: Date
  nodeId: string
  nodeName: string
  nodeType: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  message?: string
  input?: any
  output?: any
  error?: string
  duration?: number
}

interface Variable {
  name: string
  value: any
  type: string
  nodeId?: string
  timestamp: Date
}

type TabType = 'timeline' | 'logs' | 'variables' | 'output'

// Status colors and icons
const statusConfig = {
  pending: {
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/20',
    borderColor: 'border-slate-500/30',
    Icon: Clock,
  },
  running: {
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/30',
    Icon: Loader2,
  },
  completed: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/30',
    Icon: CheckCircle2,
  },
  failed: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/30',
    Icon: XCircle,
  },
  skipped: {
    color: 'text-slate-500',
    bgColor: 'bg-slate-600/20',
    borderColor: 'border-slate-600/30',
    Icon: SkipForward,
  },
}

// Timeline Item Component
interface TimelineItemProps {
  log: ExecutionLog
  isExpanded: boolean
  onToggle: () => void
  onInspect: (nodeId: string) => void
}

const TimelineItem: React.FC<TimelineItemProps> = ({ log, isExpanded, onToggle, onInspect }) => {
  const config = statusConfig[log.status]
  const StatusIcon = config.Icon

  const formatDuration = (ms?: number) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatTime = (date: Date) => {
    return formatTime24h(date.toISOString())
  }

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden transition-all',
        config.borderColor,
        config.bgColor
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 cursor-pointer',
          'hover:bg-white/5 transition-colors'
        )}
        onClick={onToggle}
      >
        {/* Expand toggle */}
        <button className="p-0.5 text-slate-400 hover:text-white">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Status icon */}
        <StatusIcon
          className={cn(
            'w-4 h-4',
            config.color,
            log.status === 'running' && 'animate-spin'
          )}
        />

        {/* Node info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200 truncate">
              {log.nodeName}
            </span>
            <span className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">
              {log.nodeType}
            </span>
          </div>
          {log.message && (
            <p className="text-[10px] text-slate-500 truncate">{log.message}</p>
          )}
        </div>

        {/* Timestamp & Duration */}
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span>{formatTime(log.timestamp)}</span>
          <span className="font-mono">{formatDuration(log.duration)}</span>
        </div>

        {/* Inspect button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onInspect(log.nodeId)
          }}
          className="p-1 text-slate-500 hover:text-indigo-400 transition-colors"
          title="Focus on node"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-700/50 space-y-3">
          {/* Error message */}
          {log.error && (
            <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 inline-block mr-1" />
              {log.error}
            </div>
          )}

          {/* Input */}
          {log.input !== undefined && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-slate-400">Input:</span>
              <pre className="p-2 bg-slate-900/50 rounded text-[11px] text-slate-300 font-mono overflow-x-auto max-h-32">
                {typeof log.input === 'object'
                  ? JSON.stringify(log.input, null, 2)
                  : String(log.input)}
              </pre>
            </div>
          )}

          {/* Output */}
          {log.output !== undefined && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-slate-400">Output:</span>
              <pre className="p-2 bg-slate-900/50 rounded text-[11px] text-slate-300 font-mono overflow-x-auto max-h-32">
                {typeof log.output === 'object'
                  ? JSON.stringify(log.output, null, 2)
                  : String(log.output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Variable Inspector Component
interface VariableInspectorProps {
  variables: Variable[]
}

const VariableInspector: React.FC<VariableInspectorProps> = ({ variables }) => {
  const [search, setSearch] = useState('')
  const [copiedVar, setCopiedVar] = useState<string | null>(null)

  const filteredVariables = useMemo(() => {
    if (!search.trim()) return variables
    const term = search.toLowerCase()
    return variables.filter(
      (v) =>
        v.name.toLowerCase().includes(term) ||
        String(v.value).toLowerCase().includes(term)
    )
  }, [variables, search])

  const copyValue = async (name: string, value: any) => {
    try {
      await navigator.clipboard.writeText(
        typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
      )
      setCopiedVar(name)
      setTimeout(() => setCopiedVar(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'string':
        return 'text-green-400'
      case 'number':
        return 'text-blue-400'
      case 'boolean':
        return 'text-amber-400'
      case 'object':
        return 'text-purple-400'
      case 'array':
        return 'text-cyan-400'
      default:
        return 'text-slate-400'
    }
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search variables..."
          className={cn(
            'w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg',
            'text-sm text-slate-100 placeholder-slate-500',
            'focus:outline-none focus:border-indigo-500'
          )}
        />
      </div>

      {/* Variables list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filteredVariables.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            {variables.length === 0 ? 'No variables captured' : 'No matching variables'}
          </div>
        ) : (
          filteredVariables.map((variable) => (
            <div
              key={variable.name}
              className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Variable className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-sm font-medium text-slate-200 font-mono">
                    {variable.name}
                  </span>
                  <span className={cn('text-[10px]', getTypeColor(variable.type))}>
                    {variable.type}
                  </span>
                </div>
                <button
                  onClick={() => copyValue(variable.name, variable.value)}
                  className="p-1 text-slate-500 hover:text-white transition-colors"
                >
                  {copiedVar === variable.name ? (
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <pre className="text-[11px] text-slate-400 font-mono overflow-x-auto">
                {typeof variable.value === 'object'
                  ? JSON.stringify(variable.value, null, 2)
                  : String(variable.value)}
              </pre>
              {variable.nodeId && (
                <div className="mt-1 text-[10px] text-slate-500">
                  From: {variable.nodeId}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Main ExecutionPanel Component
interface ExecutionPanelProps {
  className?: string
  onClose?: () => void
}

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({ className, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('timeline')
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const timelineRef = useRef<HTMLDivElement>(null)

  // Get execution state from store
  const {
    currentFlow,
    executions,
    executionLogs: storeLogs,
    nodeExecutionStates: storeNodeStates,
    isExecuting,
    executeFlow,
    cancelExecution,
    clearExecutionState,
    selectNode,
  } = useFlowStore()

  // Get current execution for this flow
  const execution = executions.find((e) => e.flowId === currentFlow?.id) || null

  // Convert store logs to Map format
  const executionLogs = useMemo(() => {
    const map = new Map<string, ExecutionLog>()
    storeLogs.forEach((log) => {
      map.set(log.id, {
        ...log,
        timestamp: new Date(log.timestamp),
        nodeName: log.nodeId || 'Unknown',
        nodeType: log.nodeType || 'action',
        status: log.level === 'error' ? 'failed' : 'completed',
      } as any)
    })
    return map
  }, [storeLogs])

  // Wrap store methods
  const startExecution = useCallback(() => {
    if (currentFlow?.id) {
      executeFlow(currentFlow.id)
    }
  }, [currentFlow?.id, executeFlow])

  const stopExecution = useCallback(() => {
    if (execution?.id) {
      cancelExecution(execution.id)
    }
  }, [execution?.id, cancelExecution])

  const resetExecution = useCallback(() => {
    clearExecutionState()
  }, [clearExecutionState])

  const pauseExecution = undefined // Not implemented yet

  // Convert logs to sorted array
  const sortedLogs = useMemo(() => {
    const logs = Array.from(executionLogs.values())
    return logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }, [executionLogs])

  // Filter logs by status
  const filteredLogs = useMemo(() => {
    if (filterStatus.length === 0) return sortedLogs
    return sortedLogs.filter((log) => filterStatus.includes(log.status))
  }, [sortedLogs, filterStatus])

  // Calculate stats
  const stats = useMemo(() => {
    const total = sortedLogs.length
    const completed = sortedLogs.filter((l) => l.status === 'completed').length
    const failed = sortedLogs.filter((l) => l.status === 'failed').length
    const running = sortedLogs.filter((l) => l.status === 'running').length
    const avgDuration =
      sortedLogs.reduce((acc, l) => acc + (l.duration || 0), 0) / (total || 1)

    return { total, completed, failed, running, avgDuration }
  }, [sortedLogs])

  // Extract variables from execution
  const variables = useMemo((): Variable[] => {
    const vars: Variable[] = []

    // Add input variables if available
    if (execution?.input) {
      for (const [name, value] of Object.entries(execution.input)) {
        vars.push({
          name: `input.${name}`,
          value,
          type: Array.isArray(value) ? 'array' : typeof value,
          timestamp: new Date(),
        })
      }
    }

    // Add output variables if available
    if (execution?.output) {
      for (const [name, value] of Object.entries(execution.output)) {
        vars.push({
          name: `output.${name}`,
          value,
          type: Array.isArray(value) ? 'array' : typeof value,
          timestamp: new Date(),
        })
      }
    }

    // Add node outputs as variables
    for (const log of sortedLogs) {
      if (log.output !== undefined && log.status === 'completed') {
        vars.push({
          name: `${log.nodeId}.output`,
          value: log.output,
          type: Array.isArray(log.output) ? 'array' : typeof log.output,
          nodeId: log.nodeId,
          timestamp: log.timestamp,
        })
      }
    }

    return vars
  }, [execution, sortedLogs])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight
    }
  }, [sortedLogs.length, autoScroll])

  const toggleLogExpanded = (logId: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev)
      if (next.has(logId)) {
        next.delete(logId)
      } else {
        next.add(logId)
      }
      return next
    })
  }

  const handleInspect = (nodeId: string) => {
    selectNode(nodeId)
  }

  const toggleFilter = (status: string) => {
    setFilterStatus((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    )
  }

  const exportLogs = () => {
    const data = {
      executionId: execution?.id,
      startTime: execution?.startedAt,
      endTime: execution?.completedAt,
      status: execution?.status,
      logs: sortedLogs,
      variables,
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `execution-${execution?.id || 'unknown'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'timeline', label: 'Timeline', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'logs', label: 'Logs', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'variables', label: 'Variables', icon: <Variable className="w-3.5 h-3.5" /> },
    { id: 'output', label: 'Output', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  ]

  return (
    <div
      className={cn(
        'flex flex-col bg-slate-900 border-l border-slate-700',
        isExpanded ? 'w-[600px]' : 'w-96',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-slate-200">Execution</span>
          {isExecuting && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded-full">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={exportLogs}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title="Export logs"
          >
            <Download className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Controls - Run/Stop moved to main toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700/50">
        <button
          onClick={() => resetExecution()}
          disabled={isExecuting}
          className={cn(
            'flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors',
            isExecuting
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          )}
          title="Reset execution state"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>

        <div className="flex-1" />

        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-slate-500">
            {stats.total} node{stats.total !== 1 ? 's' : ''}
          </span>
          {stats.completed > 0 && (
            <span className="text-green-400">{stats.completed} done</span>
          )}
          {stats.failed > 0 && <span className="text-red-400">{stats.failed} failed</span>}
          {stats.running > 0 && (
            <span className="text-amber-400">{stats.running} running</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm transition-colors',
              activeTab === tab.id
                ? 'text-indigo-400 border-b-2 border-indigo-500'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'timeline' && (
          <div className="h-full flex flex-col">
            {/* Filters */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700/30">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              {Object.entries(statusConfig).map(([status, config]) => {
                const StatusIcon = config.Icon
                const isActive = filterStatus.includes(status)
                return (
                  <button
                    key={status}
                    onClick={() => toggleFilter(status)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors',
                      isActive
                        ? `${config.bgColor} ${config.color}`
                        : 'text-slate-500 hover:text-slate-300'
                    )}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {status}
                  </button>
                )
              })}

              <div className="flex-1" />

              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors',
                  autoScroll
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {autoScroll ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                Auto-scroll
              </button>
            </div>

            {/* Timeline list */}
            <div ref={timelineRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredLogs.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  {sortedLogs.length === 0
                    ? 'No execution history. Click Run to start.'
                    : 'No logs match the current filter.'}
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <TimelineItem
                    key={log.id}
                    log={log}
                    isExpanded={expandedLogs.has(log.id)}
                    onToggle={() => toggleLogExpanded(log.id)}
                    onInspect={handleInspect}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="h-full p-4 overflow-auto">
            <pre className="text-[11px] text-slate-400 font-mono whitespace-pre-wrap">
              {sortedLogs.map((log) => {
                const time = log.timestamp.toISOString()
                const status = log.status.toUpperCase().padEnd(9)
                return `[${time}] ${status} ${log.nodeName}: ${log.message || '-'}\n`
              }).join('')}
              {sortedLogs.length === 0 && 'No logs available.'}
            </pre>
          </div>
        )}

        {activeTab === 'variables' && (
          <div className="h-full p-4 overflow-auto">
            <VariableInspector variables={variables} />
          </div>
        )}

        {activeTab === 'output' && (
          <div className="h-full p-4 overflow-auto">
            {execution?.output !== undefined ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-slate-200">
                    Execution Complete
                  </span>
                </div>
                <pre className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-slate-300 font-mono overflow-x-auto">
                  {typeof execution.output === 'object'
                    ? JSON.stringify(execution.output, null, 2)
                    : String(execution.output)}
                </pre>
              </div>
            ) : execution?.error ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-medium text-red-400">Execution Failed</span>
                </div>
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                  {execution.error}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-slate-500">
                No output available. Run the flow to see results.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with execution info */}
      {execution && (
        <div className="px-4 py-2 border-t border-slate-700/50 flex items-center justify-between text-[10px] text-slate-500">
          <span>ID: {execution.id?.slice(0, 8)}...</span>
          <span>
            Duration:{' '}
            {execution.completedAt
              ? `${((new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000).toFixed(2)}s`
              : 'Running...'}
          </span>
        </div>
      )}
    </div>
  )
}

export default ExecutionPanel
