import { useEffect, useState, useCallback } from 'react'
import {
  Cpu,
  Play,
  Pause,
  RefreshCw,
  Plus,
  Terminal,
  Wrench,
  Key,
  Clock,
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  Trash2,
  RotateCw,
  Eye,
  EyeOff,
  Copy,
} from 'lucide-react'
import { useAgenticStore, type AgenticWorkspace, type CustomTool, type AgenticToken } from '../stores/agenticStore'
import { formatDateTime, formatDate } from '@/utils/dateFormat'
import { Card, CardHeader, CardBody } from '../components/common'

type TabType = 'workspaces' | 'tools' | 'tokens'

const CLI_TYPE_LABELS: Record<string, string> = {
  claude: 'Claude CLI',
  gemini: 'Gemini CLI',
  opencode: 'OpenCode CLI',
  bash: 'Bash Automation',
}

const CLI_TYPE_COLORS: Record<string, string> = {
  claude: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  gemini: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  opencode: 'bg-green-500/20 text-green-400 border-green-500/30',
  bash: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

const AUTONOMY_LABELS: Record<string, string> = {
  semi: 'Semi-Autonomous',
  full: 'Fully Autonomous',
}

export default function AgenticDashboardPage() {
  const {
    workspaces,
    tools,
    tokens,
    loading,
    error,
    fetchWorkspaces,
    fetchTools,
    fetchTokens,
    deleteWorkspace,
    deleteTool,
    revokeToken,
    regenerateContextFile,
    clearError,
  } = useAgenticStore()

  const [activeTab, setActiveTab] = useState<TabType>('workspaces')
  const [isPaused, setIsPaused] = useState(false)
  const [showTokenValues, setShowTokenValues] = useState<Record<string, boolean>>({})
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkspaces()
    fetchTools()
    fetchTokens()

    const interval = setInterval(() => {
      if (!isPaused) {
        fetchWorkspaces()
        fetchTools()
        fetchTokens()
      }
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [fetchWorkspaces, fetchTools, fetchTokens, isPaused])

  const handleRefresh = useCallback(() => {
    fetchWorkspaces()
    fetchTools()
    fetchTokens()
  }, [fetchWorkspaces, fetchTools, fetchTokens])

  const handleDeleteWorkspace = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this workspace? This action cannot be undone.')) {
      await deleteWorkspace(id)
    }
  }

  const handleDeleteTool = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this tool?')) {
      await deleteTool(id)
    }
  }

  const handleRevokeToken = async (id: string) => {
    if (window.confirm('Are you sure you want to revoke this token?')) {
      await revokeToken(id)
    }
  }

  const handleRegenerateContext = async (id: string) => {
    try {
      await regenerateContextFile(id)
    } catch {
      // Error handled by store
    }
  }

  const toggleTokenVisibility = (id: string) => {
    setShowTokenValues((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const copyTokenPrefix = async (prefix: string, id: string) => {
    await navigator.clipboard.writeText(prefix)
    setCopiedToken(id)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  // Stats
  const activeWorkspaces = workspaces.filter((w) => w.isActive).length
  const totalExecutions = workspaces.reduce((sum, w) => sum + (w.executionCount || 0), 0)
  const activeTools = tools.filter((t) => t.isActive).length
  const activeTokens = tokens.filter((t) => t.isActive).length

  return (
    <div className="page-container-full overflow-auto">
      {/* Header */}
      <div className="page-header-actions">
        <div>
          <h1 className="page-title">Agentic AI Platform</h1>
          <p className="page-subtitle">
            Manage autonomous AI agents and their workspaces
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="btn-secondary flex items-center gap-2"
          >
            {isPaused ? (
              <>
                <Play className="w-4 h-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Pause
              </>
            )}
          </button>
          <button
            onClick={handleRefresh}
            className="btn-ghost flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
          <button onClick={clearError} className="text-red-400 hover:text-red-300">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="stats-grid mb-6">
        <div className="card py-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-cyan-400">{workspaces.length}</p>
            <p className="text-sm text-gray-400">Total Workspaces</p>
          </div>
        </div>
        <div className="card py-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-green-400">{activeWorkspaces}</p>
            <p className="text-sm text-gray-400">Active Agents</p>
          </div>
        </div>
        <div className="card py-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-purple-400">{activeTools}</p>
            <p className="text-sm text-gray-400">Custom Tools</p>
          </div>
        </div>
        <div className="card py-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-yellow-400">{totalExecutions}</p>
            <p className="text-sm text-gray-400">Total Executions</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-800 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setActiveTab('workspaces')}
          className={`px-4 py-2 text-sm rounded-md transition-colors flex items-center gap-2 ${
            activeTab === 'workspaces'
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Terminal className="w-4 h-4" />
          Workspaces ({workspaces.length})
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          className={`px-4 py-2 text-sm rounded-md transition-colors flex items-center gap-2 ${
            activeTab === 'tools'
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Wrench className="w-4 h-4" />
          Tools ({tools.length})
        </button>
        <button
          onClick={() => setActiveTab('tokens')}
          className={`px-4 py-2 text-sm rounded-md transition-colors flex items-center gap-2 ${
            activeTab === 'tokens'
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Key className="w-4 h-4" />
          Tokens ({activeTokens})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'workspaces' && (
        <WorkspacesTab
          workspaces={workspaces}
          onDelete={handleDeleteWorkspace}
          onRegenerateContext={handleRegenerateContext}
        />
      )}

      {activeTab === 'tools' && (
        <ToolsTab tools={tools} onDelete={handleDeleteTool} />
      )}

      {activeTab === 'tokens' && (
        <TokensTab
          tokens={tokens}
          workspaces={workspaces}
          onRevoke={handleRevokeToken}
          showTokenValues={showTokenValues}
          toggleTokenVisibility={toggleTokenVisibility}
          copyTokenPrefix={copyTokenPrefix}
          copiedToken={copiedToken}
        />
      )}
    </div>
  )
}

// Workspaces Tab Component
interface WorkspacesTabProps {
  workspaces: AgenticWorkspace[]
  onDelete: (id: string) => void
  onRegenerateContext: (id: string) => void
}

function WorkspacesTab({ workspaces, onDelete, onRegenerateContext }: WorkspacesTabProps) {
  if (workspaces.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <Cpu className="w-16 h-16 mx-auto text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-400">No Agentic Workspaces</h3>
          <p className="text-gray-500 mt-2">
            Create an Agentic AI agent to get started with autonomous execution
          </p>
          <a href="/agents" className="btn-primary mt-4 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Agent
          </a>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      {workspaces.map((workspace) => (
        <Card key={workspace.id} noPadding>
          <CardHeader
            title={workspace.agentName}
            subtitle={
              <span className={`inline-flex px-2 py-0.5 text-xs rounded border ${CLI_TYPE_COLORS[workspace.cliType]}`}>
                {CLI_TYPE_LABELS[workspace.cliType]}
              </span>
            }
            action={
              <div className="flex items-center gap-2">
                {workspace.isActive ? (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle className="w-3 h-3" />
                    Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <XCircle className="w-3 h-3" />
                    Inactive
                  </span>
                )}
              </div>
            }
            className="px-4 pt-4"
          />
          <CardBody className="px-4 pb-4">
            <div className="space-y-3">
              {/* Autonomy Level */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Autonomy</span>
                <span className={`${workspace.autonomyLevel === 'full' ? 'text-yellow-400' : 'text-cyan-400'}`}>
                  {AUTONOMY_LABELS[workspace.autonomyLevel]}
                </span>
              </div>

              {/* Capabilities */}
              <div className="flex flex-wrap gap-1">
                {workspace.customToolsEnabled && (
                  <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">
                    Custom Tools
                  </span>
                )}
                {workspace.selfImprovementEnabled && (
                  <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
                    Self-Improve
                  </span>
                )}
                {workspace.ragAutoUpdateEnabled && (
                  <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                    RAG Auto-Update
                  </span>
                )}
              </div>

              {/* Execution Stats */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Executions
                </span>
                <span className="text-white">{workspace.executionCount}</span>
              </div>

              {/* Last Execution */}
              {workspace.lastExecutionAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Last Run
                  </span>
                  <span className="text-gray-400">
                    {formatDateTime(workspace.lastExecutionAt)}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-gray-800">
                <button
                  onClick={() => onRegenerateContext(workspace.id)}
                  className="btn-ghost text-xs flex items-center gap-1"
                  title="Regenerate context file"
                >
                  <RotateCw className="w-3 h-3" />
                  Regen Context
                </button>
                <button
                  onClick={() => onDelete(workspace.id)}
                  className="btn-ghost text-xs flex items-center gap-1 text-red-400 hover:text-red-300"
                  title="Delete workspace"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  )
}

// Tools Tab Component
interface ToolsTabProps {
  tools: CustomTool[]
  onDelete: (id: string) => void
}

function ToolsTab({ tools, onDelete }: ToolsTabProps) {
  if (tools.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <Wrench className="w-16 h-16 mx-auto text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-400">No Custom Tools</h3>
          <p className="text-gray-500 mt-2">
            Custom tools can be created by agentic agents or through the API
          </p>
        </div>
      </Card>
    )
  }

  // Group tools by category
  const toolsByCategory = tools.reduce((acc, tool) => {
    const category = tool.category || 'Uncategorized'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(tool)
    return acc
  }, {} as Record<string, CustomTool[]>)

  return (
    <div className="space-y-6">
      {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
        <div key={category}>
          <h3 className="text-sm font-medium text-gray-400 mb-3">{category}</h3>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {categoryTools.map((tool) => (
              <Card key={tool.id} noPadding>
                <CardBody className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-medium text-white">{tool.displayName}</h4>
                      <p className="text-xs text-gray-500 font-mono">{tool.name}</p>
                    </div>
                    {tool.isActive ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <XCircle className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">{tool.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {tool.inputs.length} inputs / {tool.outputs.length} outputs
                    </span>
                    <span className={tool.createdBy === 'agent' ? 'text-cyan-400' : 'text-gray-400'}>
                      {tool.createdBy === 'agent' ? 'Agent-created' : 'User-created'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
                    <span className="text-xs text-gray-500">{tool.executionCount} runs</span>
                    <button
                      onClick={() => onDelete(tool.id)}
                      className="text-red-400 hover:text-red-300"
                      title="Delete tool"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Tokens Tab Component
interface TokensTabProps {
  tokens: AgenticToken[]
  workspaces: AgenticWorkspace[]
  onRevoke: (id: string) => void
  showTokenValues: Record<string, boolean>
  toggleTokenVisibility: (id: string) => void
  copyTokenPrefix: (prefix: string, id: string) => void
  copiedToken: string | null
}

function TokensTab({
  tokens,
  workspaces,
  onRevoke,
  showTokenValues,
  toggleTokenVisibility,
  copyTokenPrefix,
  copiedToken,
}: TokensTabProps) {
  const getWorkspaceName = (workspaceId: string) => {
    const workspace = workspaces.find((w) => w.id === workspaceId)
    return workspace?.agentName || 'Unknown Workspace'
  }

  if (tokens.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <Key className="w-16 h-16 mx-auto text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-400">No API Tokens</h3>
          <p className="text-gray-500 mt-2">
            Tokens are automatically generated when creating agentic workspaces
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {tokens.map((token) => (
        <Card key={token.id} noPadding>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="font-medium text-white">{token.name || 'Workspace Token'}</h4>
                  {token.isActive ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
                      <CheckCircle className="w-3 h-3" />
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-500/20 text-gray-400 rounded">
                      <XCircle className="w-3 h-3" />
                      Revoked
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mb-2">
                  Workspace: {getWorkspaceName(token.workspaceId)}
                </p>
                <div className="flex items-center gap-2">
                  <code className="px-2 py-1 bg-gray-800 rounded text-sm font-mono text-gray-300">
                    {showTokenValues[token.id] ? token.tokenPrefix + '...' : '••••••••••••'}
                  </code>
                  <button
                    onClick={() => toggleTokenVisibility(token.id)}
                    className="text-gray-400 hover:text-white"
                  >
                    {showTokenValues[token.id] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => copyTokenPrefix(token.tokenPrefix, token.id)}
                    className="text-gray-400 hover:text-white"
                  >
                    {copiedToken === token.id ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="text-right ml-4">
                <div className="text-xs text-gray-500 mb-2">
                  Expires: {formatDate(token.expiresAt)}
                </div>
                {token.lastUsedAt && (
                  <div className="text-xs text-gray-500">
                    Last used: {formatDate(token.lastUsedAt)}
                  </div>
                )}
                {token.isActive && (
                  <button
                    onClick={() => onRevoke(token.id)}
                    className="mt-2 text-xs text-red-400 hover:text-red-300"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
            {/* Scopes */}
            <div className="mt-3 pt-3 border-t border-gray-800">
              <span className="text-xs text-gray-500 mr-2">Scopes:</span>
              <div className="inline-flex flex-wrap gap-1">
                {token.scopes.map((scope) => (
                  <span
                    key={scope}
                    className="px-2 py-0.5 text-xs bg-cyan-500/20 text-cyan-400 rounded"
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  )
}
