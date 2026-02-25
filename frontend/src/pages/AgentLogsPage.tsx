import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Search,
  Filter,
  RefreshCw,
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  DollarSign,
  MessageSquare,
  Send,
  Bot,
  Zap,
  GitBranch,
  Database,
  Play,
  Users,
  Bug,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  X,
  FileText,
} from 'lucide-react'
import {
  useAgentLogStore,
  AgentActivityLog,
  ActionType,
  LogQueryOptions,
} from '../stores/agentLogStore'
import { useAgentStore } from '../stores/agentStore'
import { formatRelativeTime, formatDateTime } from '../utils/dateFormat'
import { Button } from '../components/common/Button'
import { Input } from '../components/common/Input'
import { Badge } from '../components/common/Badge'
import toast from 'react-hot-toast'

// ==========================================
// Types
// ==========================================

type PeriodFilter = 'hour' | 'day' | 'week' | 'month'

// ==========================================
// Helper functions
// ==========================================

const actionTypeConfig: Record<
  ActionType,
  { icon: React.ReactNode; color: string; label: string }
> = {
  message_received: {
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'text-blue-400 bg-blue-400/20',
    label: 'Message Received',
  },
  message_sent: {
    icon: <Send className="w-4 h-4" />,
    color: 'text-green-400 bg-green-400/20',
    label: 'Message Sent',
  },
  ai_completion: {
    icon: <Bot className="w-4 h-4" />,
    color: 'text-purple-400 bg-purple-400/20',
    label: 'AI Completion',
  },
  tool_call: {
    icon: <Zap className="w-4 h-4" />,
    color: 'text-amber-400 bg-amber-400/20',
    label: 'Tool Call',
  },
  handoff_initiated: {
    icon: <GitBranch className="w-4 h-4" />,
    color: 'text-orange-400 bg-orange-400/20',
    label: 'Handoff Initiated',
  },
  handoff_received: {
    icon: <GitBranch className="w-4 h-4" />,
    color: 'text-teal-400 bg-teal-400/20',
    label: 'Handoff Received',
  },
  rag_query: {
    icon: <Database className="w-4 h-4" />,
    color: 'text-cyan-400 bg-cyan-400/20',
    label: 'RAG Query',
  },
  flow_triggered: {
    icon: <Play className="w-4 h-4" />,
    color: 'text-indigo-400 bg-indigo-400/20',
    label: 'Flow Triggered',
  },
  consensus_vote: {
    icon: <Users className="w-4 h-4" />,
    color: 'text-pink-400 bg-pink-400/20',
    label: 'Consensus Vote',
  },
  error: {
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-red-400 bg-red-400/20',
    label: 'Error',
  },
  warning: {
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-yellow-400 bg-yellow-400/20',
    label: 'Warning',
  },
  debug: {
    icon: <Bug className="w-4 h-4" />,
    color: 'text-gray-400 bg-gray-400/20',
    label: 'Debug',
  },
}

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${(ms / 60000).toFixed(2)}m`
}

const formatCost = (cost: number | null): string => {
  if (cost === null || cost === 0) return '-'
  return `$${cost.toFixed(6)}`
}

const formatTokens = (tokens: number | null): string => {
  if (tokens === null || tokens === 0) return '-'
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return tokens.toString()
}

// ==========================================
// LogEntry Component
// ==========================================

interface LogEntryProps {
  log: AgentActivityLog
  isSelected: boolean
  onSelect: (log: AgentActivityLog) => void
  agentName?: string
}

const LogEntry: React.FC<LogEntryProps> = ({ log, isSelected, onSelect, agentName }) => {
  const config = actionTypeConfig[log.actionType] || actionTypeConfig.debug

  return (
    <div
      onClick={() => onSelect(log)}
      className={`p-4 bg-swarm-dark rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'border-sky-500/50 shadow-lg shadow-sky-500/10'
          : 'border-swarm-border/30 hover:border-swarm-border/50'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`p-2 rounded-lg ${config.color}`}>{config.icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white">{config.label}</span>
            {agentName && (
              <Badge variant="default" size="sm">
                {agentName}
              </Badge>
            )}
            {log.errorMessage && (
              <Badge variant="error" size="sm">
                Error
              </Badge>
            )}
          </div>

          {/* Details */}
          <div className="text-sm text-gray-400 mt-1">
            {log.actionDetails && Object.keys(log.actionDetails).length > 0 && (
              <span className="truncate block">
                {Object.entries(log.actionDetails)
                  .slice(0, 3)
                  .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                  .join(' | ')}
              </span>
            )}
          </div>

          {/* Error message */}
          {log.errorMessage && (
            <p className="text-sm text-red-400 mt-1 truncate">{log.errorMessage}</p>
          )}
        </div>

        {/* Stats */}
        <div className="flex flex-col items-end gap-1 text-xs text-gray-500">
          <span>{formatRelativeTime(log.createdAt)}</span>
          {log.durationMs !== null && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(log.durationMs)}
            </span>
          )}
          {log.tokensUsed !== null && log.tokensUsed > 0 && (
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              {formatTokens(log.tokensUsed)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ==========================================
// LogDetailPanel Component
// ==========================================

interface LogDetailPanelProps {
  log: AgentActivityLog
  childLogs: AgentActivityLog[]
  onClose: () => void
  agentName?: string
}

const LogDetailPanel: React.FC<LogDetailPanelProps> = ({ log, childLogs, onClose, agentName }) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    details: true,
    input: false,
    output: false,
    children: false,
  })

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const config = actionTypeConfig[log.actionType] || actionTypeConfig.debug

  return (
    <div className="w-[450px] bg-swarm-dark border-l border-swarm-border/30 h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-swarm-border/30 flex items-center justify-between">
        <h3 className="font-semibold text-white">Log Details</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white hover:bg-swarm-border/30 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Action Type Header */}
      <div className="p-4 border-b border-swarm-border/30">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${config.color}`}>{config.icon}</div>
          <div>
            <h2 className="text-lg font-semibold text-white">{config.label}</h2>
            {agentName && <p className="text-sm text-gray-400">Agent: {agentName}</p>}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-gray-400">Duration:</span>
            <span className="text-white">{formatDuration(log.durationMs)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Cpu className="w-4 h-4 text-gray-500" />
            <span className="text-gray-400">Tokens:</span>
            <span className="text-white">{formatTokens(log.tokensUsed)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <span className="text-gray-400">Cost:</span>
            <span className="text-white">{formatCost(log.costUsd)}</span>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {log.errorMessage && (
        <div className="p-4 border-b border-swarm-border/30 bg-red-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">Error</p>
              <p className="text-sm text-red-300 mt-1 whitespace-pre-wrap">{log.errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Details */}
      <div className="border-b border-swarm-border/30">
        <button
          onClick={() => toggleSection('details')}
          className="w-full p-4 flex items-center justify-between hover:bg-swarm-darker transition-colors"
        >
          <span className="font-medium text-white">Action Details</span>
          {expandedSections.details ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </button>
        {expandedSections.details && (
          <div className="px-4 pb-4">
            {log.actionDetails && Object.keys(log.actionDetails).length > 0 ? (
              <pre className="text-sm text-gray-300 bg-swarm-darker p-3 rounded-lg overflow-x-auto">
                {JSON.stringify(log.actionDetails, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">No details available</p>
            )}
          </div>
        )}
      </div>

      {/* Input Data */}
      {log.inputData && (
        <div className="border-b border-swarm-border/30">
          <button
            onClick={() => toggleSection('input')}
            className="w-full p-4 flex items-center justify-between hover:bg-swarm-darker transition-colors"
          >
            <span className="font-medium text-white">Input Data</span>
            {expandedSections.input ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {expandedSections.input && (
            <div className="px-4 pb-4">
              <pre className="text-sm text-gray-300 bg-swarm-darker p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto">
                {typeof log.inputData === 'string'
                  ? log.inputData
                  : JSON.stringify(log.inputData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Output Data */}
      {log.outputData && (
        <div className="border-b border-swarm-border/30">
          <button
            onClick={() => toggleSection('output')}
            className="w-full p-4 flex items-center justify-between hover:bg-swarm-darker transition-colors"
          >
            <span className="font-medium text-white">Output Data</span>
            {expandedSections.output ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {expandedSections.output && (
            <div className="px-4 pb-4">
              <pre className="text-sm text-gray-300 bg-swarm-darker p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto">
                {typeof log.outputData === 'string'
                  ? log.outputData
                  : JSON.stringify(log.outputData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Child Logs */}
      {childLogs.length > 0 && (
        <div className="border-b border-swarm-border/30">
          <button
            onClick={() => toggleSection('children')}
            className="w-full p-4 flex items-center justify-between hover:bg-swarm-darker transition-colors"
          >
            <span className="font-medium text-white">Related Logs ({childLogs.length})</span>
            {expandedSections.children ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {expandedSections.children && (
            <div className="px-4 pb-4 space-y-2">
              {childLogs.map((child) => {
                const childConfig = actionTypeConfig[child.actionType] || actionTypeConfig.debug
                return (
                  <div
                    key={child.id}
                    className="flex items-center gap-2 p-2 bg-swarm-darker rounded-lg"
                  >
                    <div className={`p-1 rounded ${childConfig.color}`}>{childConfig.icon}</div>
                    <span className="text-sm text-white flex-1">{childConfig.label}</span>
                    <span className="text-xs text-gray-500">{formatDuration(child.durationMs)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="p-4 text-xs text-gray-500 space-y-1">
        <p>Log ID: {log.id}</p>
        {log.conversationId && <p>Conversation: {log.conversationId}</p>}
        {log.messageId && <p>Message: {log.messageId}</p>}
        <p>Created: {formatDateTime(log.createdAt)}</p>
      </div>
    </div>
  )
}

// ==========================================
// Main AgentLogsPage Component
// ==========================================

export default function AgentLogsPage() {
  const {
    logs,
    selectedLog,
    childLogs,
    summary,
    isLoading,
    fetchLogs,
    fetchSummary,
    selectLog,
    setFilters,
    clearFilters,
  } = useAgentLogStore()

  const { agents, fetchAgents } = useAgentStore()

  // UI State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [selectedActionTypes, setSelectedActionTypes] = useState<ActionType[]>([])
  const [period, setPeriod] = useState<PeriodFilter>('day')
  const [showFilters, setShowFilters] = useState(false)
  const [showErrorsOnly, setShowErrorsOnly] = useState(false)

  // Fetch data on mount
  useEffect(() => {
    fetchAgents()
    fetchSummary(period)
    fetchLogs({ limit: 100 })
  }, [fetchAgents, fetchSummary, fetchLogs, period])

  // Create agent name map
  const agentNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    agents.forEach((agent) => {
      map[agent.id] = agent.name
    })
    return map
  }, [agents])

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase()
      const matchesSearch =
        !searchQuery ||
        log.actionType.toLowerCase().includes(searchLower) ||
        log.errorMessage?.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.actionDetails).toLowerCase().includes(searchLower)

      // Agent filter
      const matchesAgent = !selectedAgentId || log.agentId === selectedAgentId

      // Action type filter
      const matchesActionType =
        selectedActionTypes.length === 0 || selectedActionTypes.includes(log.actionType)

      // Error filter
      const matchesError = !showErrorsOnly || !!log.errorMessage

      return matchesSearch && matchesAgent && matchesActionType && matchesError
    })
  }, [logs, searchQuery, selectedAgentId, selectedActionTypes, showErrorsOnly])

  // Apply filters
  const handleApplyFilters = useCallback(() => {
    const options: LogQueryOptions = {
      limit: 100,
    }
    if (selectedAgentId) options.agentId = selectedAgentId
    if (selectedActionTypes.length > 0) options.actionTypes = selectedActionTypes
    if (showErrorsOnly) options.hasError = true

    setFilters(options)
    fetchLogs(options)
  }, [selectedAgentId, selectedActionTypes, showErrorsOnly, setFilters, fetchLogs])

  // Clear filters
  const handleClearFilters = useCallback(() => {
    setSelectedAgentId('')
    setSelectedActionTypes([])
    setShowErrorsOnly(false)
    setSearchQuery('')
    clearFilters()
    fetchLogs({ limit: 100 })
  }, [clearFilters, fetchLogs])

  // Toggle action type filter
  const toggleActionType = (actionType: ActionType) => {
    setSelectedActionTypes((prev) =>
      prev.includes(actionType)
        ? prev.filter((t) => t !== actionType)
        : [...prev, actionType]
    )
  }

  return (
    <div className="page-container flex h-[calc(100vh-4rem)]">
      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${selectedLog ? 'pr-0' : ''}`}>
        {/* Header */}
        <div className="page-header-actions">
          <div>
            <h1 className="page-title">Agent Activity Logs</h1>
            <p className="text-gray-400 text-sm mt-1">Monitor agent decisions and actions</p>
          </div>

          <div className="flex gap-2">
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as PeriodFilter)
                fetchSummary(e.target.value as PeriodFilter)
              }}
              className="px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white text-sm"
            >
              <option value="hour">Last Hour</option>
              <option value="day">Last 24 Hours</option>
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
            </select>
            <Button
              variant="ghost"
              onClick={() => {
                fetchSummary(period)
                fetchLogs({ limit: 100 })
              }}
              loading={isLoading}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed">
              <div className="text-2xl font-bold text-white">{summary.totalLogs}</div>
              <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                <Activity className="w-4 h-4" /> Total Logs
              </div>
            </div>
            <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed-glow-purple">
              <div className="text-2xl font-bold text-purple-400">
                {formatTokens(summary.totalTokens)}
              </div>
              <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                <Cpu className="w-4 h-4" /> Tokens Used
              </div>
            </div>
            <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed-glow-emerald">
              <div className="text-2xl font-bold text-emerald-400">
                ${summary.totalCost.toFixed(4)}
              </div>
              <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                <DollarSign className="w-4 h-4" /> Total Cost
              </div>
            </div>
            <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed">
              <div className="text-2xl font-bold text-sky-400">{summary.totalAgents}</div>
              <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                <Bot className="w-4 h-4" /> Active Agents
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <div className="flex-1">
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              iconLeft={<Search className="w-4 h-4" />}
            />
          </div>

          <div className="flex gap-2">
            {/* Agent select */}
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white text-sm min-w-[150px]"
            >
              <option value="">All Agents</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>

            <Button
              variant={showFilters ? 'secondary' : 'ghost'}
              onClick={() => setShowFilters(!showFilters)}
              icon={<Filter className="w-4 h-4" />}
            >
              Filters
            </Button>

            <Button variant="secondary" onClick={handleApplyFilters}>
              Apply
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="p-4 mt-4 bg-swarm-dark border border-swarm-border/30 rounded-xl shadow-neu-pressed-sm">
            <div className="flex flex-wrap gap-2 items-center mb-3">
              <span className="text-sm text-gray-400 mr-2">Action Types:</span>
              {(Object.keys(actionTypeConfig) as ActionType[]).map((actionType) => {
                const config = actionTypeConfig[actionType]
                return (
                  <Badge
                    key={actionType}
                    variant={selectedActionTypes.includes(actionType) ? 'info' : 'default'}
                    className="cursor-pointer"
                    onClick={() => toggleActionType(actionType)}
                  >
                    {config.icon}
                    <span className="ml-1">{config.label}</span>
                  </Badge>
                )
              })}
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showErrorsOnly}
                  onChange={(e) => setShowErrorsOnly(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-700 text-sky-500 focus:ring-sky-500"
                />
                Show errors only
              </label>

              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            </div>
          </div>
        )}

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto mt-6">
          {isLoading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex items-center gap-3 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Loading logs...</span>
              </div>
            </div>
          ) : filteredLogs.length > 0 ? (
            <div className="flex flex-col gap-3">
              {filteredLogs.map((log) => (
                <LogEntry
                  key={log.id}
                  log={log}
                  isSelected={selectedLog?.id === log.id}
                  onSelect={selectLog}
                  agentName={agentNameMap[log.agentId]}
                />
              ))}
            </div>
          ) : (
            <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 shadow-neu-pressed py-16 px-4">
              <div className="flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-swarm-darker flex items-center justify-center mb-6 shadow-neu-pressed-sm">
                  <FileText className="w-10 h-10 text-gray-600" />
                </div>

                {searchQuery || selectedAgentId || selectedActionTypes.length > 0 ? (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-2">No logs found</h3>
                    <p className="text-gray-400 text-center mb-6 max-w-md">
                      No logs match your current filter criteria.
                    </p>
                    <Button variant="ghost" onClick={handleClearFilters}>
                      Clear Filters
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-2">No activity yet</h3>
                    <p className="text-gray-400 text-center mb-6 max-w-md">
                      Agent activity logs will appear here as your agents process messages and
                      perform actions.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Log Detail Panel */}
      {selectedLog && (
        <LogDetailPanel
          log={selectedLog}
          childLogs={childLogs}
          onClose={() => selectLog(null)}
          agentName={agentNameMap[selectedLog.agentId]}
        />
      )}
    </div>
  )
}
