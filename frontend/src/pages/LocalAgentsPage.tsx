import { useEffect, useState } from 'react'
import {
  Monitor, Wifi, WifiOff, Trash2, Edit2, Play, Clock,
  CheckCircle, XCircle, ChevronDown, ChevronUp, Info,
  Terminal, FileText, History, Wrench, Blocks, Activity
} from 'lucide-react'
import AgentHealthPanel from '../components/agentic/AgentHealthPanel'
import { useLocalAgentStore, LocalAgent, Challenge, CommandRecord, McpToolInfo, PendingApproval } from '../stores/localAgentStore'

function TimeAgo({ date }: { date: string | null }) {
  if (!date) return <span className="text-gray-500">Never</span>
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return <span>Just now</span>
  if (mins < 60) return <span>{mins}m ago</span>
  const hours = Math.floor(mins / 60)
  if (hours < 24) return <span>{hours}h ago</span>
  const days = Math.floor(hours / 24)
  return <span>{days}d ago</span>
}

function OsIcon({ os }: { os: string | null }) {
  const label = os?.toLowerCase() || ''
  if (label.includes('win')) return <span title="Windows">Win</span>
  if (label.includes('mac') || label.includes('darwin')) return <span title="macOS">Mac</span>
  if (label.includes('linux')) return <span title="Linux">Lin</span>
  return <span>{os || '?'}</span>
}

function PendingChallengeCard({ challenge }: { challenge: Challenge }) {
  const { approveChallenge, denyChallenge } = useLocalAgentStore()
  const [loading, setLoading] = useState(false)

  const handleApprove = async () => {
    setLoading(true)
    try { await approveChallenge(challenge.id) } catch { /* store sets error */ }
    setLoading(false)
  }

  const handleDeny = async () => {
    setLoading(true)
    try { await denyChallenge(challenge.id) } catch { /* store sets error */ }
    setLoading(false)
  }

  return (
    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center flex-shrink-0">
          <Clock className="w-5 h-5 text-yellow-400" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-medium truncate">{challenge.deviceName}</p>
          <p className="text-gray-400 text-sm">
            {challenge.deviceInfo?.hostname || 'Unknown host'}
            {challenge.deviceInfo?.os ? ` - ${challenge.deviceInfo.os}` : ''}
          </p>
        </div>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={handleDeny}
          disabled={loading}
          className="px-3 py-1.5 rounded border border-gray-600 text-gray-300 hover:bg-gray-700 text-sm disabled:opacity-50"
        >
          <XCircle className="w-4 h-4" />
        </button>
        <button
          onClick={handleApprove}
          disabled={loading}
          className="px-3 py-1.5 rounded bg-cyan-600 text-white hover:bg-cyan-500 text-sm disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function CommandHistoryPanel({ agentId }: { agentId: string }) {
  const { commandHistory, fetchCommandHistory } = useLocalAgentStore()
  const history = commandHistory[agentId] || []

  useEffect(() => {
    fetchCommandHistory(agentId)
  }, [agentId, fetchCommandHistory])

  if (history.length === 0) {
    return <p className="text-gray-500 text-sm">No commands executed yet.</p>
  }

  const statusColor = (s: string) => {
    if (s === 'success') return 'text-green-400'
    if (s === 'failed' || s === 'timeout' || s === 'denied') return 'text-red-400'
    if (s === 'sent' || s === 'executing') return 'text-yellow-400'
    if (s === 'approval_required') return 'text-orange-400'
    if (s === 'approved') return 'text-cyan-400'
    return 'text-gray-400'
  }

  return (
    <div className="space-y-2 max-h-64 overflow-auto">
      {history.map((cmd: CommandRecord) => (
        <div key={cmd.id} className="flex items-center gap-3 text-xs bg-gray-800/50 rounded p-2">
          <Terminal className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <span className="text-gray-300 font-mono">{cmd.command}</span>
          <span className={`${statusColor(cmd.status)} flex-shrink-0`}>{cmd.status}</span>
          {cmd.executionTimeMs != null && (
            <span className="text-gray-600">{cmd.executionTimeMs}ms</span>
          )}
          <span className="text-gray-600 ml-auto flex-shrink-0">
            <TimeAgo date={cmd.requestedAt} />
          </span>
        </div>
      ))}
    </div>
  )
}

function ToolRegistryPanel({ toolRegistry }: { toolRegistry: Record<string, { installed: boolean; version: string | null; path: string | null }> }) {
  const tools = Object.entries(toolRegistry || {})
  if (tools.length === 0) {
    return <p className="text-gray-500 text-sm">No tool scan data. Agent needs to reconnect.</p>
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {tools.map(([name, info]) => (
        <div
          key={name}
          className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
            info.installed
              ? 'bg-green-500/5 border border-green-500/20'
              : 'bg-gray-800/50 border border-gray-700'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${info.installed ? 'bg-green-400' : 'bg-gray-600'}`} />
          <span className={info.installed ? 'text-gray-200' : 'text-gray-500'}>{name}</span>
          {info.version && <span className="text-gray-600 ml-auto">{info.version}</span>}
        </div>
      ))}
    </div>
  )
}

function MCPToolsPanel({ mcpTools }: { mcpTools: McpToolInfo[] }) {
  if (!mcpTools || mcpTools.length === 0) {
    return (
      <div className="text-gray-500 text-sm space-y-2">
        <p>No MCP servers configured on this device.</p>
        <div className="bg-gray-900 rounded p-3 font-mono text-xs">
          <p className="text-cyan-300">swarmai-agent mcp add playwright</p>
          <p className="text-gray-600 mt-1"># Available: playwright, filesystem, sqlite, git, docker</p>
        </div>
      </div>
    )
  }

  // Group tools by server
  const byServer: Record<string, McpToolInfo[]> = {}
  for (const t of mcpTools) {
    const srv = t.server || 'unknown'
    if (!byServer[srv]) byServer[srv] = []
    byServer[srv].push(t)
  }

  return (
    <div className="space-y-3">
      {Object.entries(byServer).map(([server, tools]) => (
        <div key={server}>
          <h4 className="text-gray-200 text-sm font-medium mb-1.5 flex items-center gap-2">
            <Blocks className="w-3.5 h-3.5 text-purple-400" />
            {server}
            <span className="text-gray-600 font-normal text-xs">{tools.length} tool{tools.length !== 1 ? 's' : ''}</span>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {tools.map(t => (
              <div
                key={`${server}-${t.name}`}
                className="bg-purple-500/5 border border-purple-500/20 rounded px-2 py-1 text-xs"
                title={t.description || t.name}
              >
                <span className="text-gray-200">{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AgentCard({ agent }: { agent: LocalAgent }) {
  const { renameAgent, revokeAgent, sendCommand } = useLocalAgentStore()
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState(agent.name)
  const [commandResult, setCommandResult] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'tools' | 'mcp' | 'health' | 'history'>('info')
  const [actionLoading, setActionLoading] = useState(false)

  const handleRename = async () => {
    if (newName.trim() && newName !== agent.name) {
      await renameAgent(agent.id, newName.trim())
    }
    setEditing(false)
  }

  const handleRevoke = async () => {
    if (!confirm(`Revoke "${agent.name}"? This will disconnect the device.`)) return
    await revokeAgent(agent.id)
  }

  const handleTestCommand = async () => {
    setActionLoading(true)
    try {
      const result = await sendCommand(agent.id, 'systemInfo')
      setCommandResult(JSON.stringify(result, null, 2))
      setExpanded(true)
      setActiveTab('info')
    } catch (err) {
      setCommandResult(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setExpanded(true)
      setActiveTab('info')
    }
    setActionLoading(false)
  }

  const installedToolCount = Object.values(agent.toolRegistry || {}).filter(t => t.installed).length
  const mcpToolCount = (agent.mcpTools || []).length

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              agent.isOnline ? 'bg-green-500/10' : 'bg-gray-700'
            }`}>
              {agent.isOnline
                ? <Wifi className="w-5 h-5 text-green-400" />
                : <WifiOff className="w-5 h-5 text-gray-500" />
              }
            </div>
            <div className="min-w-0">
              {editing ? (
                <input
                  className="bg-gray-700 text-white px-2 py-1 rounded text-sm w-full"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={e => e.key === 'Enter' && handleRename()}
                  autoFocus
                />
              ) : (
                <p className="text-white font-medium truncate">{agent.name}</p>
              )}
              <p className="text-gray-400 text-sm flex items-center gap-2">
                <span>{agent.hostname || 'Unknown'}</span>
                <span className="text-gray-600">|</span>
                <OsIcon os={agent.osType} />
                <span className="text-gray-600">|</span>
                <span className={agent.isOnline ? 'text-green-400' : 'text-gray-500'}>
                  {agent.isOnline ? 'Online' : 'Offline'}
                </span>
                {installedToolCount > 0 && (
                  <>
                    <span className="text-gray-600">|</span>
                    <span className="text-gray-500">{installedToolCount} tools</span>
                  </>
                )}
                {mcpToolCount > 0 && (
                  <>
                    <span className="text-gray-600">|</span>
                    <span className="text-purple-400">{mcpToolCount} MCP</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {agent.isOnline && (
              <button
                onClick={handleTestCommand}
                disabled={actionLoading}
                className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                title="Send systemInfo command"
              >
                <Play className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => { setNewName(agent.name); setEditing(true) }}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
              title="Rename"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRevoke}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
              title="Revoke"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span>Key: {agent.apiKeyPrefix}...</span>
          <span>Last connected: <TimeAgo date={agent.lastConnectedAt} /></span>
          <span>Commands: {agent.capabilities.join(', ')}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-700 bg-gray-900/50">
          {/* Tab bar */}
          <div className="flex border-b border-gray-700">
            {([
              { id: 'info' as const, label: 'Info', icon: FileText },
              { id: 'tools' as const, label: 'Dev Tools', icon: Wrench },
              { id: 'mcp' as const, label: 'MCP', icon: Blocks },
              { id: 'health' as const, label: 'Health', icon: Activity },
              { id: 'history' as const, label: 'History', icon: History },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-cyan-400 border-b-2 border-cyan-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {activeTab === 'info' && (
              commandResult ? (
                <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-48 font-mono">
                  {commandResult}
                </pre>
              ) : (
                <div className="text-gray-500 text-sm space-y-1">
                  <p>Agent ID: <span className="text-gray-400 font-mono text-xs">{agent.id}</span></p>
                  <p>Capabilities: {agent.capabilities.length > 0 ? agent.capabilities.join(', ') : 'Default'}</p>
                  {agent.osVersion && <p>OS Version: {agent.osVersion}</p>}
                </div>
              )
            )}
            {activeTab === 'tools' && (
              <ToolRegistryPanel toolRegistry={agent.toolRegistry} />
            )}
            {activeTab === 'mcp' && (
              <MCPToolsPanel mcpTools={agent.mcpTools} />
            )}
            {activeTab === 'health' && (
              <AgentHealthPanel metrics={agent.healthMetrics} isOnline={agent.isOnline} />
            )}
            {activeTab === 'history' && (
              <CommandHistoryPanel agentId={agent.id} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function LocalAgentsPage() {
  const {
    agents, pendingChallenges, pendingApprovals, isLoading, error,
    fetchAgents, fetchPending, fetchPendingApprovals,
    approveCommand, denyCommand, initSocketListeners,
  } = useLocalAgentStore()

  useEffect(() => {
    fetchAgents()
    fetchPending()
    fetchPendingApprovals()

    // Initialize WebSocket listeners for real-time updates
    const cleanupSocket = initSocketListeners()

    // Reduced polling to 60s (WebSocket handles real-time updates)
    const interval = setInterval(() => {
      fetchAgents()
      fetchPending()
      fetchPendingApprovals()
    }, 60000)
    return () => {
      clearInterval(interval)
      cleanupSocket()
    }
  }, [fetchAgents, fetchPending, fetchPendingApprovals, initSocketListeners])

  const onlineCount = agents.filter(a => a.isOnline).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Monitor className="w-6 h-6 text-cyan-400" />
            Local Agents
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {agents.length} device{agents.length !== 1 ? 's' : ''} registered,{' '}
            {onlineCount} online
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Pending approvals */}
      {pendingChallenges.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-400" />
            Pending Approvals ({pendingChallenges.length})
          </h2>
          <div className="space-y-2">
            {pendingChallenges.map(c => (
              <PendingChallengeCard key={c.id} challenge={c} />
            ))}
          </div>
        </div>
      )}

      {/* Pending command approvals */}
      {pendingApprovals.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-orange-400" />
            Commands Awaiting Approval ({pendingApprovals.length})
          </h2>
          <div className="space-y-2">
            {pendingApprovals.map((approval: PendingApproval) => (
              <div key={approval.id} className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-white font-medium">
                    <span className="font-mono text-orange-300">{approval.command}</span>
                    <span className="text-gray-400 text-sm ml-2">on {approval.agentName}</span>
                  </p>
                  {approval.params && Object.keys(approval.params).length > 0 && (
                    <p className="text-gray-500 text-xs font-mono mt-1 truncate">
                      {JSON.stringify(approval.params).substring(0, 100)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => denyCommand(approval.agentId, approval.id)}
                    className="px-3 py-1.5 rounded border border-gray-600 text-gray-300 hover:bg-gray-700 text-sm"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => approveCommand(approval.agentId, approval.id)}
                    className="px-3 py-1.5 rounded bg-orange-600 text-white hover:bg-orange-500 text-sm"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Setup instructions */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-white font-medium mb-1">Add a New Device</h3>
            <p className="text-gray-400 text-sm mb-2">
              Install the Local Agent CLI on your device and run the login command:
            </p>
            <div className="bg-gray-900 rounded p-3 font-mono text-sm">
              <p className="text-cyan-300">npx @swarmai/local-agent login</p>
              <p className="text-gray-500 mt-1"># or if installed globally:</p>
              <p className="text-cyan-300">swarmai-agent login --api https://agents.northpeak.app</p>
            </div>
          </div>
        </div>
      </div>

      {/* Agent list */}
      {isLoading && agents.length === 0 ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-400 mt-3">Loading agents...</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/30 rounded-lg border border-gray-700">
          <Monitor className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No local agents registered yet.</p>
          <p className="text-gray-500 text-sm mt-1">Use the CLI to connect your first device.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
