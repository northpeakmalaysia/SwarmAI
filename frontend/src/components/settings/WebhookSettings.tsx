import React, { useState, useEffect } from 'react';
import {
  Webhook,
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  Activity,
  Shield,
  Gauge,
  Zap,
  History,
  Settings,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import { useWebhookStore, type HttpWebhook, type WebhookLog, type AuthenticationType } from '../../stores/webhookStore';
import { useAgentStore, type Agent } from '../../stores/agentStore';
import { useFlowStore, type Flow } from '../../stores/flowStore';
import { formatRelativeTime } from '@/utils/dateFormat';

/**
 * Toggle switch component
 */
interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
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
);

/**
 * Auth type badge component
 */
const AuthBadge: React.FC<{ type: AuthenticationType }> = ({ type }) => {
  const variants: Record<AuthenticationType, { label: string; className: string }> = {
    none: { label: 'No Auth', className: 'bg-gray-500/20 text-gray-400' },
    bearer: { label: 'Bearer', className: 'bg-sky-500/20 text-sky-400' },
    api_key: { label: 'API Key', className: 'bg-purple-500/20 text-purple-400' },
    hmac: { label: 'HMAC', className: 'bg-emerald-500/20 text-emerald-400' },
  };

  const { label, className } = variants[type];
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', className)}>
      {label}
    </span>
  );
};

/**
 * Webhook card component
 */
interface WebhookCardProps {
  webhook: HttpWebhook;
  agents: Agent[];
  flows: Flow[];
  onEdit: (webhook: HttpWebhook) => void;
  onDelete: (webhook: HttpWebhook) => void;
  onViewLogs: (webhook: HttpWebhook) => void;
  onRegenerateToken: (webhook: HttpWebhook) => void;
  onToggleActive: (webhook: HttpWebhook, active: boolean) => void;
  getWebhookUrl: (webhook: HttpWebhook) => string;
  togglingId: string | null;
}

const WebhookCard: React.FC<WebhookCardProps> = ({
  webhook,
  agents,
  flows,
  onEdit,
  onDelete,
  onViewLogs,
  onRegenerateToken,
  onToggleActive,
  getWebhookUrl,
  togglingId,
}) => {
  const [showToken, setShowToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const agent = agents.find((a) => a.id === webhook.agentId);
  const flow = flows.find((f) => f.id === webhook.triggerFlowId);
  const webhookUrl = getWebhookUrl(webhook);

  const copyToClipboard = async (text: string, type: 'url' | 'token') => {
    await navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
    toast.success('Copied to clipboard');
  };

  return (
    <div
      className={cn(
        'p-4 rounded-lg bg-slate-700/50 border border-slate-600',
        !webhook.isActive && 'opacity-60'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              webhook.isActive ? 'bg-emerald-500/20' : 'bg-slate-600'
            )}
          >
            <Webhook
              className={cn('w-5 h-5', webhook.isActive ? 'text-emerald-400' : 'text-gray-400')}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-white font-medium">{webhook.name}</p>
              <AuthBadge type={webhook.authenticationType} />
            </div>
            {webhook.description && (
              <p className="text-sm text-gray-400">{webhook.description}</p>
            )}
          </div>
        </div>
        <ToggleSwitch
          enabled={webhook.isActive}
          onChange={(active) => onToggleActive(webhook, active)}
          disabled={togglingId === webhook.id}
        />
      </div>

      {/* Endpoint URL */}
      <div className="mb-3 p-3 bg-slate-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Endpoint URL</span>
          <button
            type="button"
            onClick={() => copyToClipboard(webhookUrl, 'url')}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Copy webhook URL"
          >
            {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <code className="text-sm text-sky-400 font-mono break-all">{webhookUrl}</code>
      </div>

      {/* Secret Token */}
      <div className="mb-3 p-3 bg-slate-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Secret Token</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(webhook.secretToken, 'token')}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Copy secret token"
            >
              {copiedToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <code className="text-sm text-emerald-400 font-mono">
          {showToken ? webhook.secretToken : '••••••••••••••••••••••••••••••••'}
        </code>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div className="text-center p-2 bg-slate-800/30 rounded">
          <p className="text-lg font-semibold text-white">{webhook.callCount}</p>
          <p className="text-xs text-gray-400">Calls</p>
        </div>
        <div className="text-center p-2 bg-slate-800/30 rounded">
          <p className="text-lg font-semibold text-white">{webhook.rateLimitPerMinute}</p>
          <p className="text-xs text-gray-400">Rate/min</p>
        </div>
        <div className="text-center p-2 bg-slate-800/30 rounded">
          <p className="text-sm font-medium text-white">{formatRelativeTime(webhook.lastCalledAt)}</p>
          <p className="text-xs text-gray-400">Last Call</p>
        </div>
        <div className="text-center p-2 bg-slate-800/30 rounded">
          <p className="text-sm font-medium text-white truncate">{agent?.name || 'Unknown'}</p>
          <p className="text-xs text-gray-400">Agent</p>
        </div>
      </div>

      {/* Trigger Flow */}
      {flow && (
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-400">
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Triggers flow: <span className="text-white">{flow.name}</span></span>
        </div>
      )}

      {/* IP Whitelist */}
      {webhook.allowedIps.length > 0 && (
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-400">
          <Shield className="w-4 h-4" />
          <span>IP Whitelist: {webhook.allowedIps.length} addresses</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-600">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<History className="w-4 h-4" />}
            onClick={() => onViewLogs(webhook)}
          >
            Logs
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={() => onRegenerateToken(webhook)}
          >
            Regenerate
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Settings className="w-4 h-4" />}
            onClick={() => onEdit(webhook)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={() => onDelete(webhook)}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Webhook logs modal component
 */
interface WebhookLogsModalProps {
  open: boolean;
  onClose: () => void;
  webhook: HttpWebhook | null;
  logs: WebhookLog[];
  loading: boolean;
  onRefresh: () => void;
}

const WebhookLogsModal: React.FC<WebhookLogsModalProps> = ({
  open,
  onClose,
  webhook,
  logs,
  loading,
  onRefresh,
}) => {
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  return (
    <Modal open={open} onClose={onClose} title={`Logs: ${webhook?.name}`} size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            Showing last {logs.length} requests
          </p>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={onRefresh}
            loading={loading}
          >
            Refresh
          </Button>
        </div>

        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <History className="w-12 h-12 text-gray-500 mx-auto mb-3" />
            <p className="text-gray-400">No logs yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Logs will appear here when the webhook receives requests
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-lg bg-slate-700/50 border border-slate-600"
              >
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={log.responseStatus < 400 ? 'success' : 'error'}
                      size="sm"
                    >
                      {log.responseStatus}
                    </Badge>
                    <span className="text-sm text-white font-mono">{log.requestMethod}</span>
                    <span className="text-sm text-gray-400">{log.ipAddress}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {log.durationMs ? `${log.durationMs}ms` : '-'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatRelativeTime(log.createdAt)}
                    </span>
                    {expandedLog === log.id ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {expandedLog === log.id && (
                  <div className="mt-3 space-y-3 pt-3 border-t border-slate-600">
                    {log.errorMessage && (
                      <div className="p-2 bg-red-500/10 rounded text-sm text-red-400">
                        {log.errorMessage}
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Request Body</p>
                      <pre className="p-2 bg-slate-800 rounded text-xs text-gray-300 overflow-x-auto max-h-40">
                        {JSON.stringify(log.requestBody, null, 2) || 'null'}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Response Body</p>
                      <pre className="p-2 bg-slate-800 rounded text-xs text-gray-300 overflow-x-auto max-h-40">
                        {JSON.stringify(log.responseBody, null, 2) || 'null'}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <Button variant="ghost" fullWidth onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
};

/**
 * Create/Edit webhook modal
 */
interface WebhookFormModalProps {
  open: boolean;
  onClose: () => void;
  webhook: HttpWebhook | null;
  agents: Agent[];
  flows: Flow[];
  onSubmit: (data: WebhookFormData) => Promise<void>;
  loading: boolean;
}

interface WebhookFormData {
  agentId: string;
  name: string;
  description: string;
  authenticationType: AuthenticationType;
  allowedIps: string[];
  rateLimitPerMinute: number;
  autoRespond: boolean;
  triggerFlowId: string | null;
  isActive?: boolean;
}

const WebhookFormModal: React.FC<WebhookFormModalProps> = ({
  open,
  onClose,
  webhook,
  agents,
  flows,
  onSubmit,
  loading,
}) => {
  const [formData, setFormData] = useState<WebhookFormData>({
    agentId: '',
    name: '',
    description: '',
    authenticationType: 'bearer',
    allowedIps: [],
    rateLimitPerMinute: 60,
    autoRespond: false,
    triggerFlowId: null,
  });
  const [ipInput, setIpInput] = useState('');

  useEffect(() => {
    if (webhook) {
      setFormData({
        agentId: webhook.agentId,
        name: webhook.name,
        description: webhook.description || '',
        authenticationType: webhook.authenticationType,
        allowedIps: webhook.allowedIps,
        rateLimitPerMinute: webhook.rateLimitPerMinute,
        autoRespond: webhook.autoRespond,
        triggerFlowId: webhook.triggerFlowId,
        isActive: webhook.isActive,
      });
    } else {
      setFormData({
        agentId: agents[0]?.id || '',
        name: '',
        description: '',
        authenticationType: 'bearer',
        allowedIps: [],
        rateLimitPerMinute: 60,
        autoRespond: false,
        triggerFlowId: null,
      });
    }
    setIpInput('');
  }, [webhook, agents, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.agentId) {
      toast.error('Please fill in required fields');
      return;
    }
    await onSubmit(formData);
  };

  const addIp = () => {
    const ip = ipInput.trim();
    if (!ip) return;
    // Basic IP validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(ip)) {
      toast.error('Invalid IP address format');
      return;
    }
    if (formData.allowedIps.includes(ip)) {
      toast.error('IP already added');
      return;
    }
    setFormData((prev) => ({ ...prev, allowedIps: [...prev.allowedIps, ip] }));
    setIpInput('');
  };

  const removeIp = (ip: string) => {
    setFormData((prev) => ({
      ...prev,
      allowedIps: prev.allowedIps.filter((i) => i !== ip),
    }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={webhook ? 'Edit Webhook' : 'Create Webhook'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Agent Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">
            Agent <span className="text-red-400">*</span>
          </label>
          <select
            value={formData.agentId}
            onChange={(e) => setFormData((prev) => ({ ...prev, agentId: e.target.value }))}
            className={cn(
              'w-full rounded-lg border bg-slate-800/50 text-white',
              'px-4 py-2.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
              'border-slate-600 focus:border-sky-500'
            )}
            disabled={!!webhook}
            aria-label="Select agent"
          >
            <option value="">Select an agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., CRM Integration"
            className={cn(
              'w-full rounded-lg border bg-slate-800/50 text-white',
              'px-4 py-2.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
              'border-slate-600 focus:border-sky-500'
            )}
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="What is this webhook used for?"
            rows={2}
            className={cn(
              'w-full rounded-lg border bg-slate-800/50 text-white',
              'px-4 py-2.5 text-sm resize-none',
              'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
              'border-slate-600 focus:border-sky-500'
            )}
          />
        </div>

        {/* Authentication Type */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Authentication Type</label>
          <select
            value={formData.authenticationType}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                authenticationType: e.target.value as AuthenticationType,
              }))
            }
            className={cn(
              'w-full rounded-lg border bg-slate-800/50 text-white',
              'px-4 py-2.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
              'border-slate-600 focus:border-sky-500'
            )}
            aria-label="Authentication type"
          >
            <option value="none">None - No authentication required</option>
            <option value="bearer">Bearer Token - Authorization header</option>
            <option value="api_key">API Key - X-API-Key header</option>
            <option value="hmac">HMAC Signature - X-Signature header</option>
          </select>
          <p className="text-xs text-gray-500">
            {formData.authenticationType === 'none' && 'Anyone can call this webhook (not recommended)'}
            {formData.authenticationType === 'bearer' && 'Use Authorization: Bearer <token> header'}
            {formData.authenticationType === 'api_key' && 'Use X-API-Key: <token> header'}
            {formData.authenticationType === 'hmac' && 'Sign request body with HMAC-SHA256 using secret token'}
          </p>
        </div>

        {/* Rate Limit */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Rate Limit (requests/minute)</label>
          <input
            type="number"
            value={formData.rateLimitPerMinute}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                rateLimitPerMinute: Math.max(1, Math.min(1000, parseInt(e.target.value) || 60)),
              }))
            }
            min={1}
            max={1000}
            className={cn(
              'w-full rounded-lg border bg-slate-800/50 text-white',
              'px-4 py-2.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
              'border-slate-600 focus:border-sky-500'
            )}
            aria-label="Rate limit per minute"
          />
        </div>

        {/* IP Whitelist */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">IP Whitelist (optional)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={ipInput}
              onChange={(e) => setIpInput(e.target.value)}
              placeholder="e.g., 192.168.1.1 or 10.0.0.0/24"
              className={cn(
                'flex-1 rounded-lg border bg-slate-800/50 text-white',
                'px-4 py-2.5 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
                'border-slate-600 focus:border-sky-500'
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addIp();
                }
              }}
              aria-label="IP address"
            />
            <Button type="button" variant="outline" onClick={addIp}>
              Add
            </Button>
          </div>
          {formData.allowedIps.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.allowedIps.map((ip) => (
                <span
                  key={ip}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 rounded text-sm text-gray-300"
                >
                  {ip}
                  <button
                    type="button"
                    onClick={() => removeIp(ip)}
                    className="text-gray-400 hover:text-red-400"
                    aria-label={`Remove ${ip}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500">
            Leave empty to allow requests from any IP address
          </p>
        </div>

        {/* Trigger Flow */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Trigger Flow (optional)</label>
          <select
            value={formData.triggerFlowId || ''}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                triggerFlowId: e.target.value || null,
              }))
            }
            className={cn(
              'w-full rounded-lg border bg-slate-800/50 text-white',
              'px-4 py-2.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-sky-500/50',
              'border-slate-600 focus:border-sky-500'
            )}
            aria-label="Trigger flow"
          >
            <option value="">No flow trigger</option>
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            Automatically execute a flow when this webhook receives a request
          </p>
        </div>

        {/* Auto Respond */}
        <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
          <div>
            <p className="text-sm font-medium text-white">Auto Respond</p>
            <p className="text-xs text-gray-400">
              Automatically send AI-generated response to webhook calls
            </p>
          </div>
          <ToggleSwitch
            enabled={formData.autoRespond}
            onChange={(enabled) => setFormData((prev) => ({ ...prev, autoRespond: enabled }))}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="ghost" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            {webhook ? 'Save Changes' : 'Create Webhook'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

/**
 * WebhookSettings Component
 *
 * Manages HTTP webhooks for receiving external requests
 */
export const WebhookSettings: React.FC = () => {
  const {
    webhooks,
    webhookLogs,
    isLoading,
    fetchWebhooks,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    selectWebhook,
    regenerateToken,
    fetchLogs,
    getWebhookUrl,
  } = useWebhookStore();

  const { agents, fetchAgents } = useAgentStore();
  const { flows, fetchFlows } = useFlowStore();

  const [showFormModal, setShowFormModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showNewTokenModal, setShowNewTokenModal] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<HttpWebhook | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    fetchWebhooks();
    fetchAgents();
    fetchFlows();
  }, [fetchWebhooks, fetchAgents, fetchFlows]);

  const handleCreate = () => {
    setSelectedWebhook(null);
    setShowFormModal(true);
  };

  const handleEdit = (webhook: HttpWebhook) => {
    setSelectedWebhook(webhook);
    setShowFormModal(true);
  };

  const handleViewLogs = async (webhook: HttpWebhook) => {
    setSelectedWebhook(webhook);
    setLogsLoading(true);
    setShowLogsModal(true);
    await fetchLogs(webhook.id);
    setLogsLoading(false);
  };

  const handleRefreshLogs = async () => {
    if (!selectedWebhook) return;
    setLogsLoading(true);
    await fetchLogs(selectedWebhook.id);
    setLogsLoading(false);
  };

  const handleDelete = (webhook: HttpWebhook) => {
    setSelectedWebhook(webhook);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!selectedWebhook) return;
    setDeleteLoading(true);
    try {
      await deleteWebhook(selectedWebhook.id);
      toast.success('Webhook deleted');
      setShowDeleteDialog(false);
      setSelectedWebhook(null);
    } catch (error) {
      toast.error('Failed to delete webhook');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleActive = async (webhook: HttpWebhook, active: boolean) => {
    setTogglingId(webhook.id);
    try {
      await updateWebhook(webhook.id, { isActive: active });
      toast.success(active ? 'Webhook activated' : 'Webhook deactivated');
    } catch (error) {
      toast.error('Failed to update webhook');
    } finally {
      setTogglingId(null);
    }
  };

  const handleRegenerateToken = async (webhook: HttpWebhook) => {
    setRegeneratingId(webhook.id);
    try {
      const result = await regenerateToken(webhook.id);
      setNewToken(result.token);
      setSelectedWebhook(result.webhook);
      setShowNewTokenModal(true);
      toast.success('Token regenerated');
    } catch (error) {
      toast.error('Failed to regenerate token');
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleFormSubmit = async (data: WebhookFormData) => {
    setFormLoading(true);
    try {
      if (selectedWebhook) {
        await updateWebhook(selectedWebhook.id, {
          name: data.name,
          description: data.description || null,
          authenticationType: data.authenticationType,
          allowedIps: data.allowedIps,
          rateLimitPerMinute: data.rateLimitPerMinute,
          autoRespond: data.autoRespond,
          triggerFlowId: data.triggerFlowId,
        });
        toast.success('Webhook updated');
      } else {
        const result = await createWebhook({
          agentId: data.agentId,
          name: data.name,
          description: data.description || undefined,
          authenticationType: data.authenticationType,
          allowedIps: data.allowedIps,
          rateLimitPerMinute: data.rateLimitPerMinute,
          autoRespond: data.autoRespond,
          triggerFlowId: data.triggerFlowId || undefined,
        });
        // Show the new token to the user
        if (result.token) {
          setNewToken(result.token);
          setSelectedWebhook(result.webhook);
          setShowNewTokenModal(true);
        }
        toast.success('Webhook created');
      }
      setShowFormModal(false);
    } catch (error) {
      toast.error(selectedWebhook ? 'Failed to update webhook' : 'Failed to create webhook');
    } finally {
      setFormLoading(false);
    }
  };

  const copyNewToken = async () => {
    if (newToken) {
      await navigator.clipboard.writeText(newToken);
      setCopiedToken(true);
      toast.success('Token copied to clipboard');
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader
          title="HTTP Webhooks"
          subtitle="Create webhooks to receive data from external systems"
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={handleCreate}
              disabled={agents.length === 0}
            >
              Create Webhook
            </Button>
          }
        />
        <CardBody>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <p className="text-gray-400">No agents available</p>
              <p className="text-sm text-gray-500 mt-1">
                Create an agent first to set up webhooks
              </p>
            </div>
          ) : webhooks.length === 0 ? (
            <div className="text-center py-12">
              <Webhook className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">No webhooks created yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Create a webhook to receive data from external systems
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {webhooks.map((webhook) => (
                <WebhookCard
                  key={webhook.id}
                  webhook={webhook}
                  agents={agents}
                  flows={flows}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onViewLogs={handleViewLogs}
                  onRegenerateToken={handleRegenerateToken}
                  onToggleActive={handleToggleActive}
                  getWebhookUrl={getWebhookUrl}
                  togglingId={togglingId}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create/Edit Modal */}
      <WebhookFormModal
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        webhook={selectedWebhook}
        agents={agents}
        flows={flows}
        onSubmit={handleFormSubmit}
        loading={formLoading}
      />

      {/* Logs Modal */}
      <WebhookLogsModal
        open={showLogsModal}
        onClose={() => setShowLogsModal(false)}
        webhook={selectedWebhook}
        logs={webhookLogs}
        loading={logsLoading}
        onRefresh={handleRefreshLogs}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={confirmDelete}
        title="Delete Webhook"
        message={`Are you sure you want to delete "${selectedWebhook?.name}"? This action cannot be undone and will invalidate all existing integrations using this webhook.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteLoading}
      />

      {/* New Token Modal */}
      <Modal
        open={showNewTokenModal}
        onClose={() => setShowNewTokenModal(false)}
        title="Webhook Token"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-500/10 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 font-medium">Save this token now!</p>
              <p className="text-sm text-amber-300/80 mt-1">
                This is the only time the token will be shown. Store it securely.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              Secret Token for "{selectedWebhook?.name}"
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-slate-800 rounded-lg text-sm text-emerald-400 font-mono break-all">
                {newToken}
              </code>
              <Button
                variant="outline"
                icon={copiedToken ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                onClick={copyNewToken}
              >
                {copiedToken ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          {selectedWebhook && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Webhook URL</label>
              <code className="block p-3 bg-slate-800 rounded-lg text-sm text-sky-400 font-mono break-all">
                {getWebhookUrl(selectedWebhook)}
              </code>
            </div>
          )}

          <Button
            variant="primary"
            fullWidth
            onClick={() => setShowNewTokenModal(false)}
          >
            I've Saved My Token
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default WebhookSettings;
