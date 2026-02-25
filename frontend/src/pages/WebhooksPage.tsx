import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Plus,
  Search,
  RefreshCw,
  Webhook,
  Copy,
  Key,
  Shield,
  Clock,
  Activity,
  CheckCircle,
  XCircle,
  MoreVertical,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Play,
  Pause,
  AlertTriangle,
  X,
  ExternalLink,
} from 'lucide-react'
import {
  useWebhookStore,
  HttpWebhook,
  WebhookCreateInput,
  WebhookUpdateInput,
  AuthenticationType,
} from '../stores/webhookStore'
import { useAgentStore } from '../stores/agentStore'
import { Button } from '../components/common/Button'
import { Input } from '../components/common/Input'
import { Badge } from '../components/common/Badge'
import { Modal } from '../components/common/Modal'
import { ConfirmDialog } from '../components/common'
import toast from 'react-hot-toast'
import { formatRelativeTime, formatDateTime } from '@/utils/dateFormat'

// ==========================================
// Helper functions
// ==========================================

const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  } catch {
    toast.error('Failed to copy')
  }
}

const authTypeLabels: Record<AuthenticationType, string> = {
  none: 'No Auth',
  bearer: 'Bearer Token',
  api_key: 'API Key Header',
  hmac: 'HMAC Signature',
}

// ==========================================
// WebhookCard Component
// ==========================================

interface WebhookCardProps {
  webhook: HttpWebhook
  webhookUrl: string
  onSelect: (webhook: HttpWebhook) => void
  onToggleActive: (id: string, isActive: boolean) => void
  onDelete: (id: string) => void
  agentName?: string
}

const WebhookCard: React.FC<WebhookCardProps> = ({
  webhook,
  webhookUrl,
  onSelect,
  onToggleActive,
  onDelete,
  agentName,
}) => {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="p-4 bg-swarm-dark rounded-xl border border-swarm-border/30 hover:border-swarm-border/50 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              webhook.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            <Webhook className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-medium text-white">{webhook.name}</h3>
            {agentName && <p className="text-sm text-gray-400">Agent: {agentName}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={webhook.isActive ? 'success' : 'default'}>
            {webhook.isActive ? 'Active' : 'Inactive'}
          </Badge>

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-gray-400 hover:text-white hover:bg-swarm-border/30 rounded-lg transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 rounded-lg border border-slate-700 shadow-xl z-10">
                <button
                  onClick={() => {
                    onSelect(webhook)
                    setShowMenu(false)
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 first:rounded-t-lg"
                >
                  <Eye className="w-4 h-4" />
                  View Details
                </button>
                <button
                  onClick={() => {
                    onToggleActive(webhook.id, webhook.isActive)
                    setShowMenu(false)
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-slate-700"
                >
                  {webhook.isActive ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Activate
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    onDelete(webhook.id)
                    setShowMenu(false)
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-slate-700 last:rounded-b-lg"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {webhook.description && (
        <p className="text-sm text-gray-400 mt-2 line-clamp-2">{webhook.description}</p>
      )}

      {/* URL */}
      <div className="mt-4 p-2 bg-swarm-darker rounded-lg">
        <div className="flex items-center justify-between">
          <code className="text-xs text-sky-400 truncate flex-1">{webhookUrl}</code>
          <button
            onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}
            className="p-1 text-gray-400 hover:text-white transition-colors ml-2"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mt-4 text-sm text-gray-400">
        <div className="flex items-center gap-1">
          <Shield className="w-4 h-4" />
          {authTypeLabels[webhook.authenticationType]}
        </div>
        <div className="flex items-center gap-1">
          <Activity className="w-4 h-4" />
          {webhook.callCount} calls
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {formatRelativeTime(webhook.lastCalledAt)}
        </div>
      </div>
    </div>
  )
}

// ==========================================
// CreateWebhookModal Component
// ==========================================

interface CreateWebhookModalProps {
  open: boolean
  onClose: () => void
  onCreate: (input: WebhookCreateInput) => Promise<{ webhook: HttpWebhook; token: string }>
  agents: { id: string; name: string }[]
}

const CreateWebhookModal: React.FC<CreateWebhookModalProps> = ({
  open,
  onClose,
  onCreate,
  agents,
}) => {
  const [formData, setFormData] = useState<WebhookCreateInput>({
    agentId: '',
    name: '',
    description: '',
    authenticationType: 'bearer',
    rateLimitPerMinute: 60,
    autoRespond: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Name is required')
      return
    }
    if (!formData.agentId) {
      toast.error('Please select an agent')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await onCreate(formData)
      setCreatedToken(result.token)
      toast.success('Webhook created')
    } catch {
      // Error handled by store
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setFormData({
      agentId: '',
      name: '',
      description: '',
      authenticationType: 'bearer',
      rateLimitPerMinute: 60,
      autoRespond: false,
    })
    setCreatedToken(null)
    setShowToken(false)
    onClose()
  }

  // Show token after creation
  if (createdToken) {
    return (
      <Modal open={open} onClose={handleClose} title="Webhook Created" size="md">
        <div className="space-y-4">
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400">Save your secret token</p>
                <p className="text-sm text-amber-300 mt-1">
                  This token will only be shown once. Save it securely.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Secret Token</label>
            <div className="flex items-center gap-2">
              <Input
                type={showToken ? 'text' : 'password'}
                value={createdToken}
                readOnly
                className="flex-1 font-mono"
              />
              <Button
                variant="ghost"
                onClick={() => setShowToken(!showToken)}
                icon={showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              />
              <Button
                variant="ghost"
                onClick={() => copyToClipboard(createdToken, 'Token')}
                icon={<Copy className="w-4 h-4" />}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleClose}>Done</Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create Webhook"
      size="md"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={isSubmitting}>
            Create
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Agent</label>
          <select
            value={formData.agentId}
            onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            required
          >
            <option value="">Select an agent...</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Name"
          placeholder="My API Webhook"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
          <textarea
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="What this webhook is used for..."
            rows={2}
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Authentication Type</label>
          <select
            value={formData.authenticationType}
            onChange={(e) =>
              setFormData({ ...formData, authenticationType: e.target.value as AuthenticationType })
            }
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="none">No Authentication</option>
            <option value="bearer">Bearer Token (Authorization header)</option>
            <option value="api_key">API Key (X-API-Key header)</option>
            <option value="hmac">HMAC Signature (X-Webhook-Signature header)</option>
          </select>
        </div>

        <Input
          label="Rate Limit (requests/minute)"
          type="number"
          min={1}
          max={1000}
          value={formData.rateLimitPerMinute || 60}
          onChange={(e) =>
            setFormData({ ...formData, rateLimitPerMinute: parseInt(e.target.value, 10) })
          }
        />

        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.autoRespond || false}
            onChange={(e) => setFormData({ ...formData, autoRespond: e.target.checked })}
            className="rounded border-gray-600 bg-gray-700 text-sky-500 focus:ring-sky-500"
          />
          Auto-respond with AI agent response
        </label>
      </div>
    </Modal>
  )
}

// ==========================================
// WebhookDetailPanel Component
// ==========================================

interface WebhookDetailPanelProps {
  webhook: HttpWebhook
  webhookUrl: string
  onClose: () => void
  onRegenerateToken: () => void
}

const WebhookDetailPanel: React.FC<WebhookDetailPanelProps> = ({
  webhook,
  webhookUrl,
  onClose,
  onRegenerateToken,
}) => {
  const { webhookLogs, fetchLogs } = useWebhookStore()
  const [showToken, setShowToken] = useState(false)

  useEffect(() => {
    fetchLogs(webhook.id)
  }, [webhook.id, fetchLogs])

  return (
    <div className="w-[450px] bg-swarm-dark border-l border-swarm-border/30 h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-swarm-border/30 flex items-center justify-between">
        <h3 className="font-semibold text-white">Webhook Details</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white hover:bg-swarm-border/30 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Basic Info */}
      <div className="p-4 border-b border-swarm-border/30">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`p-3 rounded-lg ${
              webhook.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            <Webhook className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">{webhook.name}</h2>
            <Badge variant={webhook.isActive ? 'success' : 'default'} size="sm">
              {webhook.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>

        {webhook.description && <p className="text-sm text-gray-400">{webhook.description}</p>}
      </div>

      {/* Endpoint URL */}
      <div className="p-4 border-b border-swarm-border/30">
        <h4 className="text-sm font-medium text-gray-400 mb-2">Endpoint URL</h4>
        <div className="p-3 bg-swarm-darker rounded-lg">
          <div className="flex items-center justify-between gap-2">
            <code className="text-sm text-sky-400 break-all">{webhookUrl}</code>
            <button
              onClick={() => copyToClipboard(webhookUrl, 'URL')}
              className="p-1 text-gray-400 hover:text-white transition-colors flex-shrink-0"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Secret Token */}
      <div className="p-4 border-b border-swarm-border/30">
        <h4 className="text-sm font-medium text-gray-400 mb-2">Secret Token</h4>
        <div className="p-3 bg-swarm-darker rounded-lg">
          <div className="flex items-center gap-2">
            <code className="text-sm text-white flex-1 font-mono">
              {showToken ? webhook.secretToken : '••••••••••••••••••••••••'}
            </code>
            <button
              onClick={() => setShowToken(!showToken)}
              className="p-1 text-gray-400 hover:text-white transition-colors"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={() => copyToClipboard(webhook.secretToken, 'Token')}
              className="p-1 text-gray-400 hover:text-white transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={onRegenerateToken}
          icon={<Key className="w-4 h-4" />}
        >
          Regenerate Token
        </Button>
      </div>

      {/* Configuration */}
      <div className="p-4 border-b border-swarm-border/30">
        <h4 className="text-sm font-medium text-gray-400 mb-3">Configuration</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Authentication</span>
            <Badge variant="default">{authTypeLabels[webhook.authenticationType]}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Rate Limit</span>
            <span className="text-sm text-white">{webhook.rateLimitPerMinute}/min</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Auto Respond</span>
            <Badge variant={webhook.autoRespond ? 'success' : 'default'}>
              {webhook.autoRespond ? 'Yes' : 'No'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 border-b border-swarm-border/30">
        <h4 className="text-sm font-medium text-gray-400 mb-3">Statistics</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-swarm-darker rounded-lg text-center">
            <div className="text-2xl font-bold text-white">{webhook.callCount}</div>
            <div className="text-xs text-gray-400">Total Calls</div>
          </div>
          <div className="p-3 bg-swarm-darker rounded-lg text-center">
            <div className="text-sm font-medium text-white">{formatRelativeTime(webhook.lastCalledAt)}</div>
            <div className="text-xs text-gray-400">Last Called</div>
          </div>
        </div>
      </div>

      {/* Recent Logs */}
      <div className="p-4">
        <h4 className="text-sm font-medium text-gray-400 mb-3">Recent Requests</h4>
        {webhookLogs.length > 0 ? (
          <div className="space-y-2">
            {webhookLogs.slice(0, 10).map((log) => (
              <div key={log.id} className="p-3 bg-swarm-darker rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {log.responseStatus >= 200 && log.responseStatus < 300 ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-sm text-white">{log.requestMethod}</span>
                    <Badge
                      variant={log.responseStatus >= 200 && log.responseStatus < 300 ? 'success' : 'error'}
                      size="sm"
                    >
                      {log.responseStatus}
                    </Badge>
                  </div>
                  <span className="text-xs text-gray-500">{formatRelativeTime(log.createdAt)}</span>
                </div>
                {log.durationMs && (
                  <p className="text-xs text-gray-500 mt-1">{log.durationMs}ms</p>
                )}
                {log.errorMessage && (
                  <p className="text-xs text-red-400 mt-1 truncate">{log.errorMessage}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">No requests yet</p>
        )}
      </div>

      {/* Metadata */}
      <div className="p-4 border-t border-swarm-border/30 text-xs text-gray-500">
        <p>Created: {formatDateTime(webhook.createdAt)}</p>
        <p>Endpoint: /{webhook.endpointPath}</p>
      </div>
    </div>
  )
}

// ==========================================
// Main WebhooksPage Component
// ==========================================

export default function WebhooksPage() {
  const {
    webhooks,
    selectedWebhook,
    isLoading,
    fetchWebhooks,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    selectWebhook,
    regenerateToken,
    getWebhookUrl,
  } = useWebhookStore()

  const { agents, fetchAgents } = useAgentStore()

  // UI State
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  })
  const [isDeleting, setIsDeleting] = useState(false)
  const [regenerateDialog, setRegenerateDialog] = useState(false)

  // Fetch data on mount
  useEffect(() => {
    fetchWebhooks()
    fetchAgents()
  }, [fetchWebhooks, fetchAgents])

  // Create agent name map
  const agentNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    agents.forEach((agent) => {
      map[agent.id] = agent.name
    })
    return map
  }, [agents])

  // Filter webhooks
  const filteredWebhooks = useMemo(() => {
    return webhooks.filter((webhook) => {
      const searchLower = searchQuery.toLowerCase()
      return (
        !searchQuery ||
        webhook.name.toLowerCase().includes(searchLower) ||
        webhook.description?.toLowerCase().includes(searchLower) ||
        webhook.endpointPath.toLowerCase().includes(searchLower)
      )
    })
  }, [webhooks, searchQuery])

  // Handlers
  const handleCreateWebhook = useCallback(
    async (input: WebhookCreateInput) => {
      return await createWebhook(input)
    },
    [createWebhook]
  )

  const handleToggleActive = useCallback(
    async (id: string, isActive: boolean) => {
      try {
        await updateWebhook(id, { isActive: !isActive })
        toast.success(isActive ? 'Webhook deactivated' : 'Webhook activated')
      } catch {
        toast.error('Action failed')
      }
    },
    [updateWebhook]
  )

  const handleDeleteClick = useCallback((id: string) => {
    setDeleteDialog({ open: true, id })
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteDialog.id) return
    setIsDeleting(true)
    try {
      await deleteWebhook(deleteDialog.id)
      toast.success('Webhook deleted')
      setDeleteDialog({ open: false, id: null })
    } catch {
      toast.error('Failed to delete webhook')
    } finally {
      setIsDeleting(false)
    }
  }, [deleteDialog.id, deleteWebhook])

  const handleRegenerateToken = useCallback(async () => {
    if (!selectedWebhook) return
    try {
      const result = await regenerateToken(selectedWebhook.id)
      toast.success('Token regenerated')
      // Copy new token to clipboard
      await copyToClipboard(result.token, 'New token')
      setRegenerateDialog(false)
    } catch {
      toast.error('Failed to regenerate token')
    }
  }, [selectedWebhook, regenerateToken])

  // Stats
  const stats = useMemo(() => {
    return {
      total: webhooks.length,
      active: webhooks.filter((w) => w.isActive).length,
      totalCalls: webhooks.reduce((sum, w) => sum + w.callCount, 0),
    }
  }, [webhooks])

  return (
    <div className="page-container flex h-[calc(100vh-4rem)]">
      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${selectedWebhook ? 'pr-0' : ''}`}>
        {/* Header */}
        <div className="page-header-actions">
          <div>
            <h1 className="page-title">HTTP Webhooks</h1>
            <p className="text-gray-400 text-sm mt-1">
              Create webhooks to integrate with external services
            </p>
          </div>

          <Button onClick={() => setShowCreateModal(true)} icon={<Plus className="w-4 h-4" />}>
            Create Webhook
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
              <Webhook className="w-4 h-4" /> Total Webhooks
            </div>
          </div>
          <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed-glow-emerald">
            <div className="text-2xl font-bold text-emerald-400">{stats.active}</div>
            <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" /> Active
            </div>
          </div>
          <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed">
            <div className="text-2xl font-bold text-sky-400">{stats.totalCalls}</div>
            <div className="text-sm text-gray-400 mt-1 flex items-center gap-1">
              <Activity className="w-4 h-4" /> Total Calls
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-3 mt-6">
          <div className="flex-1">
            <Input
              placeholder="Search webhooks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              iconLeft={<Search className="w-4 h-4" />}
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => fetchWebhooks()}
            loading={isLoading}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
        </div>

        {/* Webhooks List */}
        <div className="flex-1 overflow-y-auto mt-6">
          {isLoading && webhooks.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex items-center gap-3 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Loading webhooks...</span>
              </div>
            </div>
          ) : filteredWebhooks.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredWebhooks.map((webhook) => (
                <WebhookCard
                  key={webhook.id}
                  webhook={webhook}
                  webhookUrl={getWebhookUrl(webhook)}
                  onSelect={selectWebhook}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDeleteClick}
                  agentName={agentNameMap[webhook.agentId]}
                />
              ))}
            </div>
          ) : (
            <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 shadow-neu-pressed py-16 px-4">
              <div className="flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-swarm-darker flex items-center justify-center mb-6 shadow-neu-pressed-sm">
                  <Webhook className="w-10 h-10 text-gray-600" />
                </div>

                {searchQuery ? (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-2">No webhooks found</h3>
                    <p className="text-gray-400 text-center mb-6 max-w-md">
                      No webhooks match your search criteria.
                    </p>
                    <Button variant="ghost" onClick={() => setSearchQuery('')}>
                      Clear Search
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-2">No webhooks yet</h3>
                    <p className="text-gray-400 text-center mb-6 max-w-md">
                      Create a webhook to receive messages from external services and route them
                      to your AI agents.
                    </p>
                    <Button
                      onClick={() => setShowCreateModal(true)}
                      icon={<Plus className="w-4 h-4" />}
                    >
                      Create Your First Webhook
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Webhook Detail Panel */}
      {selectedWebhook && (
        <WebhookDetailPanel
          webhook={selectedWebhook}
          webhookUrl={getWebhookUrl(selectedWebhook)}
          onClose={() => selectWebhook(null)}
          onRegenerateToken={() => setRegenerateDialog(true)}
        />
      )}

      {/* Create Webhook Modal */}
      <CreateWebhookModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateWebhook}
        agents={agents.map((a) => ({ id: a.id, name: a.name }))}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, id: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete Webhook"
        message="Are you sure you want to delete this webhook? This action cannot be undone and any integrations using this webhook will stop working."
        confirmText="Delete"
        variant="danger"
        loading={isDeleting}
      />

      {/* Regenerate Token Confirmation */}
      <ConfirmDialog
        open={regenerateDialog}
        onClose={() => setRegenerateDialog(false)}
        onConfirm={handleRegenerateToken}
        title="Regenerate Token"
        message="Are you sure you want to regenerate the secret token? The old token will immediately stop working and any integrations using it will need to be updated."
        confirmText="Regenerate"
        variant="warning"
      />
    </div>
  )
}
