import React, { useState, useEffect, useCallback } from 'react'
import {
  Webhook,
  Key,
  Link,
  Eye,
  EyeOff,
  RefreshCw,
  Send,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../common/Card'
import { Button } from '../../common/Button'
import { Badge } from '../../common/Badge'
import { Modal } from '../../common/Modal'
import { cn } from '../../../lib/utils'
import toast from 'react-hot-toast'
import { api } from '../../../services/api'
import { formatRelativeTime as formatRelativeTimeUtil, formatDateTime as formatDateTimeUtil } from '@/utils/dateFormat'
import type {
  WebhookConfig,
  WebhookLog,
  WebhookEvent,
  WebhookRetryStrategy,
  WEBHOOK_EVENT_DESCRIPTIONS,
} from './types'

// =============================================================================
// Types
// =============================================================================

interface WebhookConfigResponse {
  enabled: boolean
  url: string | null
  hasSecret: boolean
  events: WebhookEvent[]
  maxRetries: number
  retryStrategy: WebhookRetryStrategy
  timeoutSeconds: number
  updatedAt?: string
}

// =============================================================================
// Constants
// =============================================================================

const WEBHOOK_EVENTS: { id: WebhookEvent; label: string; description: string }[] = [
  { id: 'message.received', label: 'Message Received', description: 'When a new message arrives' },
  { id: 'message.sent', label: 'Message Sent', description: 'When a message is sent' },
  { id: 'agent.status_changed', label: 'Agent Status Changed', description: 'When agent goes online/offline' },
  { id: 'flow.started', label: 'Flow Started', description: 'When a flow begins execution' },
  { id: 'flow.completed', label: 'Flow Completed', description: 'When a flow completes successfully' },
  { id: 'flow.failed', label: 'Flow Failed', description: 'When a flow fails with an error' },
  { id: 'handoff.created', label: 'Handoff Created', description: 'When a handoff is initiated' },
  { id: 'handoff.completed', label: 'Handoff Completed', description: 'When a handoff is accepted' },
]

const MAX_RETRIES_OPTIONS = [1, 2, 3, 4, 5]

const RETRY_STRATEGY_OPTIONS: { value: WebhookRetryStrategy; label: string; description: string }[] = [
  { value: 'fixed', label: 'Fixed (30s)', description: 'Retry every 30 seconds' },
  { value: 'exponential', label: 'Exponential (5s, 30s, 2min)', description: 'Increasing delays between retries' },
]

const TIMEOUT_OPTIONS = [
  { value: 10, label: '10 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '60 seconds' },
]

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format relative time (e.g., "5m ago")
 */
const formatRelativeTime = (dateString: string): string => {
  return formatRelativeTimeUtil(dateString)
}

/**
 * Format timestamp for modal
 */
const formatTimestamp = (dateString: string): string => {
  return formatDateTimeUtil(dateString)
}

/**
 * Get status badge for delivery log
 */
const getStatusBadge = (status: number | null, attemptNumber: number, maxAttempts: number) => {
  if (status && status >= 200 && status < 300) {
    return (
      <Badge variant="success" size="sm">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    )
  }
  if (attemptNumber < maxAttempts) {
    return (
      <Badge variant="warning" size="sm">
        <RotateCcw className="w-3 h-3 mr-1" />
        Retry
      </Badge>
    )
  }
  return (
    <Badge variant="error" size="sm">
      <XCircle className="w-3 h-3 mr-1" />
      Failed
    </Badge>
  )
}

// =============================================================================
// Toggle Switch Component
// =============================================================================

interface ToggleSwitchProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ enabled, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    disabled={disabled}
    onClick={() => onChange(!enabled)}
    className={cn(
      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
      'transition-colors duration-200 ease-in-out',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900',
      enabled ? 'bg-sky-500' : 'bg-slate-600',
      disabled && 'opacity-50 cursor-not-allowed'
    )}
  >
    <span
      className={cn(
        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow',
        'transform ring-0 transition duration-200 ease-in-out',
        enabled ? 'translate-x-5' : 'translate-x-0'
      )}
    />
  </button>
)

// =============================================================================
// Payload Preview Modal Component
// =============================================================================

interface PayloadPreviewModalProps {
  open: boolean
  onClose: () => void
  log: WebhookLog | null
  onRetry: (logId: string) => void
  retrying: boolean
}

const PayloadPreviewModal: React.FC<PayloadPreviewModalProps> = ({
  open,
  onClose,
  log,
  onRetry,
  retrying,
}) => {
  if (!log) return null

  const isSuccess = log.status && log.status >= 200 && log.status < 300
  const canRetry = !isSuccess && log.attemptNumber >= log.maxAttempts

  let requestPayload = ''
  try {
    requestPayload = JSON.stringify(JSON.parse(log.requestPayload), null, 2)
  } catch {
    requestPayload = log.requestPayload
  }

  let responseBody = ''
  if (log.responseBody) {
    try {
      responseBody = JSON.stringify(JSON.parse(log.responseBody), null, 2)
    } catch {
      responseBody = log.responseBody
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Webhook Delivery Details" size="lg">
      <div className="space-y-4">
        {/* Header Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Event</label>
            <p className="text-white font-medium mt-1">{log.event}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Timestamp</label>
            <p className="text-white font-medium mt-1">{formatTimestamp(log.createdAt)}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Status</label>
            <div className="mt-1">
              {getStatusBadge(log.status, log.attemptNumber, log.maxAttempts)}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Response Time</label>
            <p className="text-white font-medium mt-1">
              {log.responseTimeMs !== null ? `${log.responseTimeMs}ms` : 'N/A'}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Attempts</label>
            <p className="text-white font-medium mt-1">{log.attemptNumber}/{log.maxAttempts}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Endpoint</label>
            <p className="text-white font-medium mt-1 truncate" title={log.endpointUrl}>
              {log.endpointUrl}
            </p>
          </div>
        </div>

        {/* Error Message */}
        {log.errorMessage && (
          <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Error</p>
                <p className="text-sm text-red-300/80 mt-1">{log.errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Request Payload */}
        <div>
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Request Payload</label>
          <pre className="mt-2 p-3 bg-slate-900 rounded-lg text-sm text-emerald-400 font-mono overflow-auto max-h-48 border border-slate-700">
            {requestPayload}
          </pre>
        </div>

        {/* Response Body */}
        {responseBody && (
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Response Body</label>
            <pre className="mt-2 p-3 bg-slate-900 rounded-lg text-sm text-gray-300 font-mono overflow-auto max-h-48 border border-slate-700">
              {responseBody}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {canRetry && (
            <Button
              variant="primary"
              icon={<RotateCcw className="w-4 h-4" />}
              onClick={() => onRetry(log.id)}
              loading={retrying}
            >
              Retry Now
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// =============================================================================
// Main WebhooksTab Component
// =============================================================================

export const WebhooksTab: React.FC = () => {
  // Webhook config state
  const [config, setConfig] = useState<WebhookConfigResponse>({
    enabled: false,
    url: null,
    hasSecret: false,
    events: [],
    maxRetries: 3,
    retryStrategy: 'exponential',
    timeoutSeconds: 30,
  })
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [testingWebhook, setTestingWebhook] = useState(false)

  // Form state
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [generatingSecret, setGeneratingSecret] = useState(false)
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>([])
  const [maxRetries, setMaxRetries] = useState(3)
  const [retryStrategy, setRetryStrategy] = useState<WebhookRetryStrategy>('exponential')
  const [timeoutSeconds, setTimeoutSeconds] = useState(30)

  // Delivery logs state
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [clearingLogs, setClearingLogs] = useState(false)

  // Modal state
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null)
  const [showLogModal, setShowLogModal] = useState(false)
  const [retryingLog, setRetryingLog] = useState(false)

  // =============================================================================
  // Data Fetching
  // =============================================================================

  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true)
    try {
      const response = await api.get<WebhookConfigResponse>('/settings/webhooks')
      setConfig(response)
      setWebhookUrl(response.url || '')
      setSelectedEvents(response.events)
      setMaxRetries(response.maxRetries)
      setRetryStrategy(response.retryStrategy)
      setTimeoutSeconds(response.timeoutSeconds)
    } catch (error) {
      console.error('Failed to fetch webhook config:', error)
      toast.error('Failed to load webhook configuration')
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const response = await api.get<WebhookLog[]>('/settings/webhooks/logs')
      setLogs(response)
    } catch (error) {
      console.error('Failed to fetch webhook logs:', error)
      toast.error('Failed to load delivery logs')
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => {
    fetchConfig()
    fetchLogs()
  }, [fetchConfig, fetchLogs])

  // =============================================================================
  // Handlers
  // =============================================================================

  const handleToggleEnabled = (enabled: boolean) => {
    setConfig((prev) => ({ ...prev, enabled }))
  }

  const toggleEvent = (eventId: WebhookEvent) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    )
  }

  const handleGenerateSecret = async () => {
    setGeneratingSecret(true)
    try {
      const response = await api.post<{ secret: string }>('/settings/webhooks/generate-secret')
      setWebhookSecret(response.secret)
      toast.success('Secret generated - save to apply')
    } catch (error) {
      console.error('Failed to generate secret:', error)
      toast.error('Failed to generate secret')
    } finally {
      setGeneratingSecret(false)
    }
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      const payload: Partial<WebhookConfig> & { secret?: string } = {
        enabled: config.enabled,
        url: webhookUrl || '',
        events: selectedEvents,
        maxRetries,
        retryStrategy,
        timeoutSeconds,
      }
      if (webhookSecret) {
        payload.secret = webhookSecret
      }

      const response = await api.put<WebhookConfigResponse>('/settings/webhooks', payload)
      setConfig(response)
      setWebhookSecret('')
      toast.success('Webhook settings saved')
    } catch (error) {
      console.error('Failed to save webhook config:', error)
      toast.error('Failed to save webhook settings')
    } finally {
      setSavingConfig(false)
    }
  }

  const handleTestWebhook = async () => {
    setTestingWebhook(true)
    try {
      const response = await api.post<{ success: boolean; statusCode: number; message: string }>(
        '/settings/webhooks/test'
      )
      if (response.success) {
        toast.success(`Test webhook sent successfully (${response.statusCode})`)
        fetchLogs() // Refresh logs to show test delivery
      } else {
        toast.error(`Webhook test failed: ${response.message}`)
      }
    } catch (error: unknown) {
      console.error('Failed to test webhook:', error)
      const message = error instanceof Error ? error.message : 'Failed to send test webhook'
      toast.error(message)
    } finally {
      setTestingWebhook(false)
    }
  }

  const handleViewLog = async (logId: string) => {
    try {
      const log = await api.get<WebhookLog>(`/settings/webhooks/logs/${logId}`)
      setSelectedLog(log)
      setShowLogModal(true)
    } catch (error) {
      console.error('Failed to fetch log details:', error)
      toast.error('Failed to load log details')
    }
  }

  const handleRetryDelivery = async (logId: string) => {
    setRetryingLog(true)
    try {
      await api.post(`/settings/webhooks/logs/${logId}/retry`)
      toast.success('Webhook delivery queued for retry')
      setShowLogModal(false)
      fetchLogs()
    } catch (error) {
      console.error('Failed to retry webhook delivery:', error)
      toast.error('Failed to retry webhook delivery')
    } finally {
      setRetryingLog(false)
    }
  }

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to clear all delivery logs older than 24 hours?')) {
      return
    }
    setClearingLogs(true)
    try {
      await api.delete('/settings/webhooks/logs')
      toast.success('Old logs cleared successfully')
      fetchLogs()
    } catch (error) {
      console.error('Failed to clear logs:', error)
      toast.error('Failed to clear logs')
    } finally {
      setClearingLogs(false)
    }
  }

  // =============================================================================
  // Render
  // =============================================================================

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <Card>
        <CardHeader
          title="Webhook Configuration"
          subtitle="Configure outgoing webhooks to notify external systems of events"
        />
        <CardBody>
          <div className="space-y-6">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-gray-400">
                  <Webhook className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white font-medium">Enable Webhooks</p>
                  <p className="text-sm text-gray-400">
                    Send HTTP POST requests when events occur
                  </p>
                </div>
              </div>
              <ToggleSwitch enabled={config.enabled} onChange={handleToggleEnabled} />
            </div>

            {config.enabled && (
              <>
                {/* Webhook URL */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Endpoint URL</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Link className="w-4 h-4" />
                    </div>
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://your-server.com/webhook"
                      className={cn(
                        'w-full rounded-lg border bg-slate-800/50 text-white',
                        'pl-10 pr-4 py-2.5 text-sm',
                        'transition-colors duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
                        'border-slate-600 focus:border-sky-500'
                      )}
                    />
                  </div>
                </div>

                {/* Webhook Secret */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Secret</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <Key className="w-4 h-4" />
                      </div>
                      <input
                        type={showSecret ? 'text' : 'password'}
                        value={webhookSecret}
                        onChange={(e) => setWebhookSecret(e.target.value)}
                        placeholder={config.hasSecret ? '****************' : 'Enter or generate a secret'}
                        className={cn(
                          'w-full rounded-lg border bg-slate-800/50 text-white',
                          'pl-10 pr-10 py-2.5 text-sm',
                          'transition-colors duration-200',
                          'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
                          'border-slate-600 focus:border-sky-500'
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Button
                      variant="outline"
                      icon={<RefreshCw className="w-4 h-4" />}
                      onClick={handleGenerateSecret}
                      loading={generatingSecret}
                    >
                      Regenerate
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Used to sign webhook payloads. Verify signatures using X-SwarmAI-Signature header.
                  </p>
                </div>

                {/* Events Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Events to Send</label>
                  <div className="grid grid-cols-2 gap-2">
                    {WEBHOOK_EVENTS.map((event) => (
                      <button
                        key={event.id}
                        onClick={() => toggleEvent(event.id)}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-colors',
                          selectedEvents.includes(event.id)
                            ? 'border-sky-500 bg-sky-500/10'
                            : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'w-4 h-4 rounded border flex items-center justify-center',
                              selectedEvents.includes(event.id)
                                ? 'bg-sky-500 border-sky-500'
                                : 'border-slate-500'
                            )}
                          >
                            {selectedEvents.includes(event.id) && (
                              <CheckCircle2 className="w-3 h-3 text-white" />
                            )}
                          </div>
                          <p className="text-sm font-medium text-white">{event.label}</p>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 ml-6">{event.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Retry Configuration */}
                <div className="p-4 bg-slate-700/30 rounded-lg space-y-4">
                  <h4 className="text-sm font-medium text-white">Retry Configuration</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {/* Max Retries */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-400">Max Retries</label>
                      <select
                        value={maxRetries}
                        onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                        className={cn(
                          'w-full rounded-lg border bg-slate-800/50 text-white',
                          'px-3 py-2 text-sm',
                          'transition-colors duration-200',
                          'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
                          'border-slate-600 focus:border-sky-500'
                        )}
                      >
                        {MAX_RETRIES_OPTIONS.map((value) => (
                          <option key={value} value={value}>
                            {value} {value === 1 ? 'retry' : 'retries'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Retry Strategy */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-400">Retry Strategy</label>
                      <select
                        value={retryStrategy}
                        onChange={(e) => setRetryStrategy(e.target.value as WebhookRetryStrategy)}
                        className={cn(
                          'w-full rounded-lg border bg-slate-800/50 text-white',
                          'px-3 py-2 text-sm',
                          'transition-colors duration-200',
                          'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
                          'border-slate-600 focus:border-sky-500'
                        )}
                      >
                        {RETRY_STRATEGY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Timeout */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-400">Timeout</label>
                      <select
                        value={timeoutSeconds}
                        onChange={(e) => setTimeoutSeconds(parseInt(e.target.value))}
                        className={cn(
                          'w-full rounded-lg border bg-slate-800/50 text-white',
                          'px-3 py-2 text-sm',
                          'transition-colors duration-200',
                          'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
                          'border-slate-600 focus:border-sky-500'
                        )}
                      >
                        {TIMEOUT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    icon={<Send className="w-4 h-4" />}
                    onClick={handleTestWebhook}
                    loading={testingWebhook}
                    disabled={!webhookUrl}
                  >
                    Send Test
                  </Button>
                  <Button variant="primary" onClick={handleSaveConfig} loading={savingConfig}>
                    Save Webhook Settings
                  </Button>
                </div>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Delivery Logs Section */}
      {config.enabled && (
        <Card>
          <CardHeader
            title="Delivery Logs"
            subtitle="Last 100 webhook deliveries"
            action={
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={handleClearLogs}
                loading={clearingLogs}
                disabled={logs.length === 0}
              >
                Clear Old Logs
              </Button>
            }
          />
          <CardBody>
            {loadingLogs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                <p className="text-gray-400">No delivery logs yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  Webhook deliveries will appear here when events are triggered
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      <th className="pb-3 pr-4">Time</th>
                      <th className="pb-3 pr-4">Event</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Response</th>
                      <th className="pb-3 pr-4">Attempts</th>
                      <th className="pb-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {logs.map((log) => (
                      <tr key={log.id} className="text-sm">
                        <td className="py-3 pr-4 text-gray-400">
                          {formatRelativeTime(log.createdAt)}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-white font-medium">{log.event}</span>
                        </td>
                        <td className="py-3 pr-4">
                          {getStatusBadge(log.status, log.attemptNumber, log.maxAttempts)}
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          {log.responseTimeMs !== null ? `${log.responseTimeMs}ms` : '-'}
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          {log.attemptNumber}/{log.maxAttempts}
                        </td>
                        <td className="py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Eye className="w-4 h-4" />}
                            onClick={() => handleViewLog(log.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Payload Preview Modal */}
      <PayloadPreviewModal
        open={showLogModal}
        onClose={() => setShowLogModal(false)}
        log={selectedLog}
        onRetry={handleRetryDelivery}
        retrying={retryingLog}
      />
    </div>
  )
}

export default WebhooksTab
