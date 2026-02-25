import React, { useState, useEffect, useCallback } from 'react'
import {
  Key,
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  MoreVertical,
  BarChart3,
  Shield,
  Edit2,
} from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../common/Card'
import { Button } from '../../common/Button'
import { Badge } from '../../common/Badge'
import { Modal } from '../../common/Modal'
import { cn } from '../../../lib/utils'
import toast from 'react-hot-toast'
import { api } from '../../../services/api'
import { formatDate as formatDateUtil, formatRelativeTime as formatRelativeTimeUtil } from '@/utils/dateFormat'
import type { HttpApiKey, ApiKeyScope } from './types'

/**
 * Scope configuration for checkboxes
 */
const SCOPE_OPTIONS: { value: ApiKeyScope; label: string; description: string }[] = [
  { value: 'full', label: 'Full Access', description: 'Full access to all API endpoints' },
  { value: 'read', label: 'Read', description: 'Read-only access to resources' },
  { value: 'write', label: 'Write', description: 'Create and update resources' },
  { value: 'admin', label: 'Admin', description: 'Administrative operations' },
  { value: 'agents', label: 'Agents', description: 'Agent management operations' },
  { value: 'flows', label: 'Flows', description: 'Flow management operations' },
  { value: 'messages', label: 'Messages', description: 'Message operations' },
]

/**
 * Rate limit options
 */
const RATE_LIMIT_OPTIONS = [
  { value: 10, label: '10/min' },
  { value: 60, label: '60/min' },
  { value: 100, label: '100/min' },
  { value: 500, label: '500/min' },
  { value: 1000, label: '1000/min' },
  { value: 0, label: 'Unlimited' },
]

/**
 * Expiration options
 */
const EXPIRY_OPTIONS = [
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
  { value: null, label: 'Never' },
]

/**
 * Format date for display
 */
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'Never'
  return formatDateUtil(dateString)
}

/**
 * Format relative time
 */
const formatRelativeTime = (dateString: string | null | undefined): string => {
  if (!dateString) return 'Never'
  return formatRelativeTimeUtil(dateString)
}

/**
 * Scope badge color mapping
 */
const getScopeBadgeVariant = (scope: ApiKeyScope): 'default' | 'success' | 'warning' | 'error' | 'info' => {
  switch (scope) {
    case 'full':
      return 'error'
    case 'admin':
      return 'warning'
    case 'write':
      return 'info'
    case 'read':
      return 'success'
    default:
      return 'default'
  }
}

/**
 * Create/Edit form data
 */
interface ApiKeyFormData {
  name: string
  scopes: ApiKeyScope[]
  rateLimitRpm: number
  ipWhitelist: string
  expiresInDays: number | null
}

/**
 * Actions dropdown menu
 */
interface ActionMenuProps {
  isOpen: boolean
  onClose: () => void
  onViewStats: () => void
  onEditPermissions: () => void
  onRegenerate: () => void
  onDelete: () => void
}

const ActionMenu: React.FC<ActionMenuProps> = ({
  isOpen,
  onClose,
  onViewStats,
  onEditPermissions,
  onRegenerate,
  onDelete,
}) => {
  if (!isOpen) return null

  return (
    <>
      {/* Overlay to close menu */}
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-slate-700 rounded-lg shadow-lg border border-slate-600 py-1">
        <button
          onClick={() => { onViewStats(); onClose() }}
          className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-slate-600 flex items-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          View Usage Stats
        </button>
        <button
          onClick={() => { onEditPermissions(); onClose() }}
          className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-slate-600 flex items-center gap-2"
        >
          <Edit2 className="w-4 h-4" />
          Edit Permissions
        </button>
        <button
          onClick={() => { onRegenerate(); onClose() }}
          className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-slate-600 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Regenerate Key
        </button>
        <div className="border-t border-slate-600 my-1" />
        <button
          onClick={() => { onDelete(); onClose() }}
          className="w-full px-4 py-2 text-sm text-left text-red-400 hover:bg-slate-600 flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Revoke / Delete
        </button>
      </div>
    </>
  )
}

/**
 * HttpApiKeysTab Component
 *
 * Manages HTTP API keys with enhanced features including scopes, rate limits,
 * IP whitelists, and usage statistics.
 */
export const HttpApiKeysTab: React.FC = () => {
  // API Keys state
  const [apiKeys, setApiKeys] = useState<HttpApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [actionMenuKeyId, setActionMenuKeyId] = useState<string | null>(null)

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState<ApiKeyFormData>({
    name: '',
    scopes: ['read'],
    rateLimitRpm: 100,
    ipWhitelist: '',
    expiresInDays: null,
  })

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingKey, setEditingKey] = useState<HttpApiKey | null>(null)
  const [saving, setSaving] = useState(false)

  // New key display modal
  const [showNewKeyModal, setShowNewKeyModal] = useState(false)
  const [newKeyData, setNewKeyData] = useState<{ name: string; apiKey: string } | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)

  // Usage stats modal
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [statsKey, setStatsKey] = useState<HttpApiKey | null>(null)

  // Delete confirmation
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null)
  const [regeneratingKeyId, setRegeneratingKeyId] = useState<string | null>(null)

  /**
   * Fetch API keys on mount
   */
  useEffect(() => {
    fetchApiKeys()
  }, [])

  /**
   * Fetch API keys from backend
   */
  const fetchApiKeys = async () => {
    setLoading(true)
    try {
      const response = await api.get<{ apiKeys: Array<{
        id: string
        name: string
        key_prefix?: string
        keyPrefix?: string
        last_used_at?: string
        lastUsedAt?: string
        created_at?: string
        createdAt?: string
        scopes?: ApiKeyScope[]
        rateLimitRpm?: number
        ipWhitelist?: string[]
        expiresAt?: string | null
        lastUsedIp?: string
        requestCount24h?: number
      }> }>('/settings/api-keys')
      // Backend returns { apiKeys: [...] }, extract the array
      const rawKeys = response.apiKeys || []

      // Transform backend response to match expected HttpApiKey format
      // Backend may not have all enhanced fields, so provide defaults
      const transformedKeys: HttpApiKey[] = (Array.isArray(rawKeys) ? rawKeys : []).map(key => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix || key.key_prefix || 'key_***',
        scopes: key.scopes || ['read'] as ApiKeyScope[],
        rateLimitRpm: key.rateLimitRpm ?? 100,
        ipWhitelist: key.ipWhitelist || [],
        createdAt: key.createdAt || key.created_at || new Date().toISOString(),
        expiresAt: key.expiresAt || null,
        lastUsedAt: key.lastUsedAt || key.last_used_at || null,
        lastUsedIp: key.lastUsedIp || null,
        requestCount24h: key.requestCount24h ?? 0,
      }))

      setApiKeys(transformedKeys)
    } catch (error) {
      console.error('Failed to fetch API keys:', error)
      toast.error('Failed to load API keys')
      setApiKeys([])
    } finally {
      setLoading(false)
    }
  }

  /**
   * Create new API key
   */
  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a name for the API key')
      return
    }

    if (formData.scopes.length === 0) {
      toast.error('Please select at least one scope')
      return
    }

    setCreating(true)
    try {
      const payload = {
        name: formData.name.trim(),
        scopes: formData.scopes,
        rateLimitRpm: formData.rateLimitRpm,
        ipWhitelist: formData.ipWhitelist
          .split(',')
          .map((ip) => ip.trim())
          .filter((ip) => ip.length > 0),
        expiresInDays: formData.expiresInDays,
      }

      const response = await api.post<{ name: string; apiKey: string }>('/settings/api-keys', payload)
      setNewKeyData({ name: response.name, apiKey: response.apiKey })
      setShowCreateModal(false)
      setShowNewKeyModal(true)
      resetForm()
      fetchApiKeys()
      toast.success('API key created successfully')
    } catch (error) {
      console.error('Failed to create API key:', error)
      toast.error('Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  /**
   * Delete API key
   */
  const handleDelete = async (id: string) => {
    setDeletingKeyId(id)
    try {
      await api.delete(`/settings/api-keys/${id}`)
      setApiKeys((prev) => prev.filter((k) => k.id !== id))
      toast.success('API key deleted')
    } catch (error) {
      console.error('Failed to delete API key:', error)
      toast.error('Failed to delete API key')
    } finally {
      setDeletingKeyId(null)
    }
  }

  /**
   * Regenerate API key
   */
  const handleRegenerate = async (id: string) => {
    setRegeneratingKeyId(id)
    try {
      const response = await api.post<{ name: string; apiKey: string }>(`/settings/api-keys/${id}/regenerate`)
      setNewKeyData({ name: response.name, apiKey: response.apiKey })
      setShowNewKeyModal(true)
      fetchApiKeys()
      toast.success('API key regenerated')
    } catch (error) {
      console.error('Failed to regenerate API key:', error)
      toast.error('Failed to regenerate API key')
    } finally {
      setRegeneratingKeyId(null)
    }
  }

  /**
   * Open edit modal for permissions
   */
  const handleEditPermissions = (key: HttpApiKey) => {
    setEditingKey(key)
    setFormData({
      name: key.name,
      scopes: key.scopes,
      rateLimitRpm: key.rateLimitRpm,
      ipWhitelist: key.ipWhitelist?.join(', ') || '',
      expiresInDays: null, // Can't change expiry on existing keys
    })
    setShowEditModal(true)
  }

  /**
   * Save edited permissions
   * Note: Backend may not support PATCH for API keys, so this may need adjustment
   */
  const handleSaveEdit = async () => {
    if (!editingKey) return

    setSaving(true)
    try {
      // If backend supports PATCH, use it; otherwise show info toast
      toast('Editing permissions requires key regeneration. Use "Regenerate Key" to apply new settings.', {
        icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
        duration: 5000,
      })
      setShowEditModal(false)
    } catch (error) {
      console.error('Failed to update API key:', error)
      toast.error('Failed to update API key')
    } finally {
      setSaving(false)
    }
  }

  /**
   * View usage stats for a key
   */
  const handleViewStats = (key: HttpApiKey) => {
    setStatsKey(key)
    setShowStatsModal(true)
  }

  /**
   * Copy API key to clipboard
   */
  const copyToClipboard = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopiedKey(false), 2000)
  }, [])

  /**
   * Reset form to default values
   */
  const resetForm = () => {
    setFormData({
      name: '',
      scopes: ['read'],
      rateLimitRpm: 100,
      ipWhitelist: '',
      expiresInDays: null,
    })
  }

  /**
   * Toggle scope selection
   */
  const toggleScope = (scope: ApiKeyScope) => {
    setFormData((prev) => {
      // If selecting 'full', clear other scopes
      if (scope === 'full') {
        return { ...prev, scopes: prev.scopes.includes('full') ? [] : ['full'] }
      }

      // If 'full' is selected, remove it when selecting other scopes
      const scopesWithoutFull = prev.scopes.filter((s) => s !== 'full')

      if (prev.scopes.includes(scope)) {
        return { ...prev, scopes: scopesWithoutFull.filter((s) => s !== scope) }
      } else {
        return { ...prev, scopes: [...scopesWithoutFull, scope] }
      }
    })
  }

  /**
   * Check if a key is expired
   */
  const isExpired = (key: HttpApiKey): boolean => {
    if (!key.expiresAt) return false
    return new Date(key.expiresAt) < new Date()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="HTTP API Keys"
          subtitle="Manage API keys for external HTTP integrations. Keys provide secure access to the SwarmAI API."
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreateModal(true)}
            >
              Create Key
            </Button>
          }
        />
        <CardBody>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8">
              <Key className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">No API keys created yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Create an API key to integrate with external systems via HTTP API
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-slate-700">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Key Prefix</th>
                    <th className="pb-3 font-medium">Scopes</th>
                    <th className="pb-3 font-medium">Rate Limit</th>
                    <th className="pb-3 font-medium">Expires</th>
                    <th className="pb-3 font-medium">Last Used</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {apiKeys.map((key) => (
                    <tr
                      key={key.id}
                      className={cn(
                        'hover:bg-slate-700/30 transition-colors',
                        isExpired(key) && 'opacity-60'
                      )}
                    >
                      {/* Name */}
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
                            <Key className={cn('w-4 h-4', isExpired(key) ? 'text-red-400' : 'text-sky-400')} />
                          </div>
                          <div>
                            <p className="text-white font-medium">{key.name}</p>
                            {isExpired(key) && (
                              <Badge variant="error" size="sm">Expired</Badge>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Key Prefix */}
                      <td className="py-4">
                        <code className="text-sm text-emerald-400 bg-slate-800 px-2 py-1 rounded font-mono">
                          {key.keyPrefix}...
                        </code>
                      </td>

                      {/* Scopes */}
                      <td className="py-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {key.scopes.slice(0, 3).map((scope) => (
                            <Badge key={scope} variant={getScopeBadgeVariant(scope)} size="sm">
                              {scope}
                            </Badge>
                          ))}
                          {key.scopes.length > 3 && (
                            <Badge variant="default" size="sm">
                              +{key.scopes.length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Rate Limit */}
                      <td className="py-4">
                        <span className="text-gray-300 text-sm">
                          {key.rateLimitRpm === 0 ? 'Unlimited' : `${key.rateLimitRpm}/min`}
                        </span>
                      </td>

                      {/* Expires */}
                      <td className="py-4">
                        <span className={cn(
                          'text-sm',
                          isExpired(key) ? 'text-red-400' : 'text-gray-400'
                        )}>
                          {formatDate(key.expiresAt)}
                        </span>
                      </td>

                      {/* Last Used */}
                      <td className="py-4">
                        <div className="text-sm">
                          <span className="text-gray-400">{formatRelativeTime(key.lastUsedAt)}</span>
                          {key.lastUsedIp && (
                            <span className="text-gray-500 ml-1 text-xs">({key.lastUsedIp})</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 text-right">
                        <div className="relative inline-block">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<MoreVertical className="w-4 h-4" />}
                            onClick={() => setActionMenuKeyId(actionMenuKeyId === key.id ? null : key.id)}
                            loading={deletingKeyId === key.id || regeneratingKeyId === key.id}
                          />
                          <ActionMenu
                            isOpen={actionMenuKeyId === key.id}
                            onClose={() => setActionMenuKeyId(null)}
                            onViewStats={() => handleViewStats(key)}
                            onEditPermissions={() => handleEditPermissions(key)}
                            onRegenerate={() => handleRegenerate(key.id)}
                            onDelete={() => handleDelete(key.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create API Key Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetForm() }}
        title="Create API Key"
        size="lg"
      >
        <div className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Production Server, Integration Bot"
              className={cn(
                'w-full rounded-lg border bg-slate-800/50 text-white',
                'px-4 py-2.5 text-sm',
                'transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
                'border-slate-600 focus:border-sky-500'
              )}
            />
          </div>

          {/* Scopes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Scopes *</label>
            <p className="text-xs text-gray-500">Select permissions for this API key</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {SCOPE_OPTIONS.map((scope) => (
                <button
                  key={scope.value}
                  type="button"
                  onClick={() => toggleScope(scope.value)}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-colors',
                    formData.scopes.includes(scope.value)
                      ? 'border-sky-500 bg-sky-500/10'
                      : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center',
                      formData.scopes.includes(scope.value)
                        ? 'bg-sky-500 border-sky-500'
                        : 'border-slate-500'
                    )}>
                      {formData.scopes.includes(scope.value) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-white">{scope.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 ml-6">{scope.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Rate Limit */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Rate Limit</label>
            <select
              value={formData.rateLimitRpm}
              onChange={(e) => setFormData((prev) => ({ ...prev, rateLimitRpm: parseInt(e.target.value) }))}
              className={cn(
                'w-full rounded-lg border bg-slate-800/50 text-white',
                'px-4 py-2.5 text-sm',
                'transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
                'border-slate-600 focus:border-sky-500'
              )}
            >
              {RATE_LIMIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* IP Whitelist */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              IP Whitelist <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              value={formData.ipWhitelist}
              onChange={(e) => setFormData((prev) => ({ ...prev, ipWhitelist: e.target.value }))}
              placeholder="192.168.1.0/24, 10.0.0.1, 2001:db8::/32"
              rows={2}
              className={cn(
                'w-full rounded-lg border bg-slate-800/50 text-white',
                'px-4 py-2.5 text-sm',
                'transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
                'border-slate-600 focus:border-sky-500',
                'resize-none'
              )}
            />
            <p className="text-xs text-gray-500">Comma-separated IPs or CIDRs. Leave empty to allow all.</p>
          </div>

          {/* Expiration */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Expiration</label>
            <select
              value={formData.expiresInDays ?? ''}
              onChange={(e) => setFormData((prev) => ({
                ...prev,
                expiresInDays: e.target.value ? parseInt(e.target.value) : null
              }))}
              className={cn(
                'w-full rounded-lg border bg-slate-800/50 text-white',
                'px-4 py-2.5 text-sm',
                'transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
                'border-slate-600 focus:border-sky-500'
              )}
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.label} value={option.value ?? ''}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => { setShowCreateModal(false); resetForm() }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleCreate}
              loading={creating}
              disabled={!formData.name.trim() || formData.scopes.length === 0}
            >
              Create Key
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Permissions Modal */}
      <Modal
        open={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingKey(null) }}
        title="Edit API Key Permissions"
        size="lg"
      >
        <div className="space-y-6">
          <div className="p-4 bg-amber-500/10 rounded-lg flex items-start gap-3">
            <Shield className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 font-medium">Permission changes require key regeneration</p>
              <p className="text-sm text-amber-300/80 mt-1">
                Changing scopes or rate limits will require you to regenerate the key.
                The old key will be invalidated.
              </p>
            </div>
          </div>

          {/* Current key info */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Key Name</label>
            <p className="text-white">{editingKey?.name}</p>
          </div>

          {/* Scopes (read-only display) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Current Scopes</label>
            <div className="flex flex-wrap gap-2">
              {editingKey?.scopes.map((scope) => (
                <Badge key={scope} variant={getScopeBadgeVariant(scope)} size="sm">
                  {scope}
                </Badge>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => { setShowEditModal(false); setEditingKey(null) }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                if (editingKey) {
                  handleRegenerate(editingKey.id)
                  setShowEditModal(false)
                  setEditingKey(null)
                }
              }}
              loading={saving}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Regenerate with New Permissions
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Key Display Modal */}
      <Modal
        open={showNewKeyModal}
        onClose={() => setShowNewKeyModal(false)}
        title="API Key Created"
        size="md"
      >
        {newKeyData && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-500/10 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-400 font-medium">Save this key now!</p>
                <p className="text-sm text-amber-300/80 mt-1">
                  This is the only time the full API key will be shown. Store it securely.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                API Key for "{newKeyData.name}"
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-slate-800 rounded-lg text-sm text-emerald-400 font-mono break-all">
                  {newKeyData.apiKey}
                </code>
                <Button
                  variant="outline"
                  icon={copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  onClick={() => copyToClipboard(newKeyData.apiKey)}
                >
                  {copiedKey ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <Button
              variant="primary"
              fullWidth
              onClick={() => setShowNewKeyModal(false)}
            >
              I've Saved My Key
            </Button>
          </div>
        )}
      </Modal>

      {/* Usage Stats Modal */}
      <Modal
        open={showStatsModal}
        onClose={() => { setShowStatsModal(false); setStatsKey(null) }}
        title="API Key Usage Statistics"
        size="md"
      >
        {statsKey && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-700">
              <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                <Key className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <p className="text-white font-medium">{statsKey.name}</p>
                <code className="text-xs text-emerald-400 font-mono">{statsKey.keyPrefix}...</code>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-slate-700/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-white">{statsKey.requestCount24h}</p>
                <p className="text-sm text-gray-400">Requests (24h)</p>
              </div>
              <div className="p-4 bg-slate-700/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-white">
                  {statsKey.rateLimitRpm === 0 ? '∞' : statsKey.rateLimitRpm}
                </p>
                <p className="text-sm text-gray-400">Rate Limit/min</p>
              </div>
              <div className="p-4 bg-slate-700/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-white">{statsKey.scopes.length}</p>
                <p className="text-sm text-gray-400">Active Scopes</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Created</span>
                <span className="text-white">{formatDate(statsKey.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Last Used</span>
                <span className="text-white">{formatRelativeTime(statsKey.lastUsedAt)}</span>
              </div>
              {statsKey.lastUsedIp && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Last IP</span>
                  <span className="text-white font-mono">{statsKey.lastUsedIp}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Expires</span>
                <span className={cn(
                  isExpired(statsKey) ? 'text-red-400' : 'text-white'
                )}>
                  {formatDate(statsKey.expiresAt)}
                </span>
              </div>
              {statsKey.ipWhitelist && statsKey.ipWhitelist.length > 0 && (
                <div className="flex items-start justify-between text-sm">
                  <span className="text-gray-400">IP Whitelist</span>
                  <div className="text-right">
                    {statsKey.ipWhitelist.map((ip) => (
                      <span key={ip} className="block text-white font-mono text-xs">{ip}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              fullWidth
              onClick={() => { setShowStatsModal(false); setStatsKey(null) }}
            >
              Close
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default HttpApiKeysTab
