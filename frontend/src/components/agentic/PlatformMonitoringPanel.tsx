import React, { useState, useEffect, useCallback } from 'react';
import {
  Monitor,
  Wifi,
  WifiOff,
  RefreshCw,
  MessageSquare,
  Mail,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ExternalLink,
  Activity,
  Zap,
  XCircle,
  Bot,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { ToggleSwitch } from '../common/ToggleSwitch';
import { useAuthStore } from '../../stores/authStore';
import { formatRelativeTime } from '@/utils/dateFormat';
import toast from 'react-hot-toast';

export interface PlatformAccount {
  id: string;
  platform: 'whatsapp' | 'whatsapp-business' | 'telegram' | 'telegram-user' | 'email';
  status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'qr_ready';
  agentId: string;
  agentName?: string;
  lastError?: string;
  lastConnected?: string;
  connectionMetadata?: {
    phoneNumber?: string;
    botUsername?: string;
    email?: string;
    profileName?: string;
  };
  stats?: {
    messagesSent?: number;
    messagesReceived?: number;
    lastMessageAt?: string;
  };
}

interface MonitoringConfig {
  id?: string;
  sourceType: string;
  sourceId?: string;
  sourceName?: string;
  autoRespond: boolean;
  autoClassify: boolean;
  forwardToTeam: boolean;
  priority: string;
  isActive: boolean;
  filterKeywords?: string[];
  filterSenders?: string[];
}

export interface PlatformMonitoringPanelProps {
  /** Agentic profile ID — enables monitoring config when provided */
  agenticId?: string;
  /** Optional: filter by specific agent ID */
  agentId?: string;
  /** Additional className */
  className?: string;
  /** Whether to show full details or compact view */
  compact?: boolean;
}

const platformConfig: Record<string, { icon: React.ReactNode; label: string; color: string; bgColor: string }> = {
  whatsapp: { icon: <MessageSquare className="w-5 h-5" />, label: 'WhatsApp', color: 'text-green-400', bgColor: 'bg-green-500/20' },
  'whatsapp-business': { icon: <MessageSquare className="w-5 h-5" />, label: 'WhatsApp Business', color: 'text-green-400', bgColor: 'bg-green-500/20' },
  telegram: { icon: <Send className="w-5 h-5" />, label: 'Telegram Bot', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  'telegram-user': { icon: <Send className="w-5 h-5" />, label: 'Telegram User', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  email: { icon: <Mail className="w-5 h-5" />, label: 'Email', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
};

const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string; pulse?: boolean }> = {
  connected: { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Connected', color: 'text-emerald-400' },
  connecting: { icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Connecting', color: 'text-yellow-400', pulse: true },
  disconnected: { icon: <WifiOff className="w-4 h-4" />, label: 'Disconnected', color: 'text-gray-400' },
  error: { icon: <AlertTriangle className="w-4 h-4" />, label: 'Error', color: 'text-red-400' },
  qr_ready: { icon: <Clock className="w-4 h-4" />, label: 'QR Ready', color: 'text-yellow-400', pulse: true },
};

/**
 * Map platform account types to monitoring source_type values.
 * The agentic_monitoring table uses normalized source types:
 * telegram-bot / telegram-user → telegram
 * whatsapp / whatsapp-business → whatsapp
 */
function platformToSourceType(platform: string): string {
  const map: Record<string, string> = {
    'whatsapp': 'whatsapp',
    'whatsapp-business': 'whatsapp',
    'telegram': 'telegram',
    'telegram-bot': 'telegram',
    'telegram-user': 'telegram',
    'email': 'email',
  };
  return map[platform] || platform;
}

const priorityOptions = [
  { value: 'low', label: 'Low', color: 'text-gray-400' },
  { value: 'normal', label: 'Normal', color: 'text-blue-400' },
  { value: 'high', label: 'High', color: 'text-orange-400' },
  { value: 'urgent', label: 'Urgent', color: 'text-red-400' },
];

/**
 * PlatformMonitoringPanel - Monitor status and configure AI auto-response per platform
 */
export const PlatformMonitoringPanel: React.FC<PlatformMonitoringPanelProps> = ({
  agenticId,
  agentId,
  className,
  compact = false,
}) => {
  const { token } = useAuthStore();
  const [platforms, setPlatforms] = useState<PlatformAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);

  // Monitoring config state
  const [monitoringConfigs, setMonitoringConfigs] = useState<MonitoringConfig[]>([]);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [savingPlatform, setSavingPlatform] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Fetch platform accounts
  const fetchPlatforms = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const url = agentId
        ? `/api/platforms?agentId=${agentId}`
        : '/api/platforms';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch platforms');

      const data = await response.json();
      setPlatforms(data.accounts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platforms');
    } finally {
      setIsLoading(false);
    }
  }, [agentId, token]);

  // Fetch monitoring configs (only when agenticId is provided)
  const fetchMonitoring = useCallback(async () => {
    if (!agenticId) return;

    try {
      setMonitoringLoading(true);
      const response = await fetch(`/api/agentic/profiles/${agenticId}/monitoring`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch monitoring config');

      const data = await response.json();
      setMonitoringConfigs(data.monitoring || []);
    } catch (err) {
      console.error('Failed to fetch monitoring:', err);
    } finally {
      setMonitoringLoading(false);
    }
  }, [agenticId, token]);

  useEffect(() => {
    fetchPlatforms();
    const interval = setInterval(fetchPlatforms, 30000);
    return () => clearInterval(interval);
  }, [fetchPlatforms]);

  useEffect(() => {
    if (agenticId) {
      fetchMonitoring();
    }
  }, [agenticId, fetchMonitoring]);

  // Get monitoring config for a specific platform account (by sourceId, not just sourceType)
  const getMonitoringForPlatform = (platform: PlatformAccount): MonitoringConfig | undefined => {
    const sourceType = platformToSourceType(platform.platform);
    // Match by specific account ID first (per-account settings)
    const byId = monitoringConfigs.find(m => m.sourceType === sourceType && m.sourceId === platform.id);
    if (byId) return byId;
    // Fallback: match by sourceType with no sourceId (legacy rows)
    return monitoringConfigs.find(m => m.sourceType === sourceType && !m.sourceId);
  };

  // Save monitoring config for a platform
  const saveMonitoringConfig = async (
    platform: PlatformAccount,
    updates: Partial<MonitoringConfig>
  ) => {
    if (!agenticId) return;

    const sourceType = platformToSourceType(platform.platform);
    const existing = getMonitoringForPlatform(platform);
    const platformLabel = platformConfig[platform.platform]?.label || platform.platform;

    setSavingPlatform(platform.id);

    try {
      // If existing config has a sourceId matching this platform, update it.
      // If existing is a legacy shared row (no sourceId), create a new per-account row instead.
      const isPerAccountConfig = existing?.id && existing.sourceId === platform.id;

      const body = isPerAccountConfig
        ? { id: existing.id, sourceType, ...updates }
        : {
            sourceType,
            sourceId: platform.id,
            sourceName: `${platformLabel} - ${platform.connectionMetadata?.profileName || platform.connectionMetadata?.phoneNumber || platform.connectionMetadata?.botUsername || platform.connectionMetadata?.email || platform.id}`,
            autoRespond: existing?.autoRespond ?? false,
            autoClassify: existing?.autoClassify ?? false,
            forwardToTeam: existing?.forwardToTeam ?? false,
            priority: existing?.priority ?? 'normal',
            isActive: true,
            ...updates,
          };

      const response = await fetch(`/api/agentic/profiles/${agenticId}/monitoring`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to save');
      }

      // Refresh configs after save
      await fetchMonitoring();

      let toastMsg = `Monitoring updated for ${platformLabel}`;
      if (updates.isActive !== undefined) {
        toastMsg = `Monitoring ${updates.isActive ? 'enabled' : 'disabled'} for ${platformLabel}`;
      } else if (updates.autoRespond !== undefined) {
        toastMsg = `Auto-respond ${updates.autoRespond ? 'enabled' : 'disabled'} for ${platformLabel}`;
      }
      toast.success(toastMsg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save monitoring config');
    } finally {
      setSavingPlatform(null);
    }
  };

  // Toggle expanded card
  const toggleExpanded = (platformId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(platformId)) {
        next.delete(platformId);
      } else {
        next.add(platformId);
      }
      return next;
    });
  };

  // Reconnect platform
  const handleReconnect = async (platformId: string) => {
    try {
      setReconnecting(platformId);

      const response = await fetch(`/api/platforms/${platformId}/reconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to reconnect');
      setTimeout(fetchPlatforms, 2000);
    } catch (err) {
      console.error('Failed to reconnect:', err);
    } finally {
      setReconnecting(null);
    }
  };

  // Disconnect platform
  const handleDisconnect = async (platformId: string) => {
    try {
      const response = await fetch(`/api/platforms/${platformId}/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to disconnect');
      fetchPlatforms();
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  // Reset error status
  const handleResetError = async (platformId: string) => {
    try {
      const response = await fetch(`/api/platforms/${platformId}/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to reset');
      fetchPlatforms();
    } catch (err) {
      console.error('Failed to reset:', err);
    }
  };

  // Group platforms by status
  const connectedCount = platforms.filter(p => p.status === 'connected').length;
  const errorCount = platforms.filter(p => p.status === 'error').length;
  const totalCount = platforms.length;

  const healthStatus = errorCount > 0 ? 'degraded' : connectedCount === totalCount && totalCount > 0 ? 'healthy' : 'partial';

  if (compact) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg',
          healthStatus === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' :
          healthStatus === 'degraded' ? 'bg-red-500/20 text-red-400' :
          'bg-yellow-500/20 text-yellow-400'
        )}>
          {healthStatus === 'healthy' ? <Wifi className="w-4 h-4" /> :
           healthStatus === 'degraded' ? <AlertTriangle className="w-4 h-4" /> :
           <Activity className="w-4 h-4" />}
          <span className="text-sm font-medium">
            {connectedCount}/{totalCount} Connected
          </span>
        </div>

        {errorCount > 0 && (
          <Badge variant="error" size="sm">
            {errorCount} Error{errorCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-5 h-5 text-sky-400" />
          <h3 className="font-medium text-white">Platform Monitoring</h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Health indicator */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg',
            healthStatus === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' :
            healthStatus === 'degraded' ? 'bg-red-500/20 text-red-400' :
            'bg-yellow-500/20 text-yellow-400'
          )}>
            {healthStatus === 'healthy' ? <CheckCircle2 className="w-4 h-4" /> :
             healthStatus === 'degraded' ? <AlertTriangle className="w-4 h-4" /> :
             <Activity className="w-4 h-4" />}
            <span className="text-sm">
              {healthStatus === 'healthy' ? 'All Systems Operational' :
               healthStatus === 'degraded' ? `${errorCount} Issue${errorCount > 1 ? 's' : ''}` :
               'Partially Connected'}
            </span>
          </div>

          <Button variant="ghost" size="sm" onClick={fetchPlatforms}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-swarm-darker/50 border border-swarm-border/20">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-white">{totalCount}</span>
            <Monitor className="w-5 h-5 text-gray-400" />
          </div>
          <span className="text-xs text-gray-400">Total Platforms</span>
        </div>

        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-emerald-400">{connectedCount}</span>
            <Wifi className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-xs text-gray-400">Connected</span>
        </div>

        <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-yellow-400">
              {platforms.filter(p => ['connecting', 'qr_ready'].includes(p.status)).length}
            </span>
            <Loader2 className="w-5 h-5 text-yellow-400" />
          </div>
          <span className="text-xs text-gray-400">Pending</span>
        </div>

        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-red-400">{errorCount}</span>
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <span className="text-xs text-gray-400">Errors</span>
        </div>
      </div>

      {/* Platform List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-red-400">{error}</p>
          <Button variant="ghost" size="sm" onClick={fetchPlatforms} className="mt-2">
            Retry
          </Button>
        </div>
      ) : platforms.length === 0 ? (
        <div className="text-center py-12">
          <Monitor className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">No platforms connected</p>
          <p className="text-sm text-gray-500 mt-1">Connect WhatsApp, Telegram, or Email to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {platforms.map(platform => {
            const config = platformConfig[platform.platform] || platformConfig.email;
            const status = statusConfig[platform.status] || statusConfig.disconnected;
            const isReconnecting = reconnecting === platform.id;
            const monitoring = getMonitoringForPlatform(platform);
            const isExpanded = expandedCards.has(platform.id);
            const isSaving = savingPlatform === platform.id;

            return (
              <div
                key={platform.id}
                className={cn(
                  'rounded-xl border transition-all',
                  'bg-swarm-darker/50 border-swarm-border/20',
                  platform.status === 'error' && 'border-red-500/30',
                  platform.status === 'connected' && 'border-emerald-500/20',
                  monitoring?.autoRespond && 'ring-1 ring-sky-500/30'
                )}
              >
                {/* Main card content */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {/* Platform Icon */}
                      <div className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        config.bgColor
                      )}>
                        <span className={config.color}>{config.icon}</span>
                      </div>

                      {/* Platform Info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{config.label}</span>
                          <Badge
                            variant={platform.status === 'connected' ? 'success' :
                                     platform.status === 'error' ? 'error' :
                                     'warning'}
                            size="sm"
                            dot
                            pulse={status.pulse}
                          >
                            {status.label}
                          </Badge>

                          {/* Monitoring status badge */}
                          {agenticId && monitoring && !monitoring.isActive && (
                            <Badge variant="warning" size="sm">
                              Monitoring Off
                            </Badge>
                          )}

                          {/* Auto-respond badge */}
                          {monitoring?.isActive && monitoring?.autoRespond && (
                            <Badge variant="info" size="sm">
                              <Bot className="w-3 h-3 mr-1" />
                              Auto-Respond
                            </Badge>
                          )}
                        </div>

                        {/* Connection details */}
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                          {platform.connectionMetadata?.phoneNumber && (
                            <span>{platform.connectionMetadata.phoneNumber}</span>
                          )}
                          {platform.connectionMetadata?.botUsername && (
                            <span>@{platform.connectionMetadata.botUsername}</span>
                          )}
                          {platform.connectionMetadata?.email && (
                            <span>{platform.connectionMetadata.email}</span>
                          )}
                          {platform.connectionMetadata?.profileName && (
                            <span>{platform.connectionMetadata.profileName}</span>
                          )}
                          {platform.agentName && (
                            <span className="text-sky-400">• {platform.agentName}</span>
                          )}
                        </div>

                        {/* Error message */}
                        {platform.status === 'error' && platform.lastError && (
                          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-sm text-red-400">{platform.lastError}</p>
                          </div>
                        )}

                        {/* Stats */}
                        {platform.stats && (
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            {platform.stats.messagesSent !== undefined && (
                              <span className="flex items-center gap-1">
                                <Zap className="w-3 h-3" />
                                {platform.stats.messagesSent} sent
                              </span>
                            )}
                            {platform.stats.messagesReceived !== undefined && (
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {platform.stats.messagesReceived} received
                              </span>
                            )}
                            {platform.stats.lastMessageAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last: {formatRelativeTime(platform.stats.lastMessageAt)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {/* Monitoring Enable/Disable Toggle */}
                      {agenticId && platform.status === 'connected' && (
                        <div className="flex items-center gap-1.5 mr-1">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={monitoring?.isActive ?? false}
                            disabled={savingPlatform === platform.id}
                            onClick={() => {
                              const newActive = !(monitoring?.isActive ?? false);
                              saveMonitoringConfig(platform, { isActive: newActive, autoRespond: newActive ? (monitoring?.autoRespond ?? false) : false });
                            }}
                            className={cn(
                              'w-9 h-5 relative inline-flex flex-shrink-0 rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50',
                              monitoring?.isActive ? 'bg-sky-500' : 'bg-slate-600',
                              savingPlatform === platform.id && 'opacity-50 cursor-not-allowed'
                            )}
                            title={monitoring?.isActive ? 'Disable monitoring' : 'Enable monitoring'}
                          >
                            <span
                              className={cn(
                                'w-3.5 h-3.5 inline-block rounded-full bg-white shadow-sm transform transition-transform duration-200',
                                monitoring?.isActive ? 'translate-x-4' : 'translate-x-0'
                              )}
                            />
                          </button>
                        </div>
                      )}

                      {/* AI Config expand toggle (only when agenticId is provided) */}
                      {agenticId && platform.status === 'connected' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpanded(platform.id)}
                          className="text-gray-400 hover:text-sky-400"
                          title="AI Response Settings"
                        >
                          <Bot className="w-4 h-4 mr-1" />
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </Button>
                      )}

                      {platform.status === 'connected' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnect(platform.id)}
                          className="text-gray-400 hover:text-red-400"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      )}

                      {platform.status === 'error' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetError(platform.id)}
                            className="text-gray-400 hover:text-yellow-400"
                          >
                            Reset
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleReconnect(platform.id)}
                            loading={isReconnecting}
                          >
                            Reconnect
                          </Button>
                        </>
                      )}

                      {platform.status === 'disconnected' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleReconnect(platform.id)}
                          loading={isReconnecting}
                        >
                          Connect
                        </Button>
                      )}

                      {['connecting', 'qr_ready'].includes(platform.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            window.location.href = `/agents/${platform.agentId}/platforms`;
                          }}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expandable AI Response Config Section */}
                {agenticId && isExpanded && platform.status === 'connected' && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="border-t border-swarm-border/20 pt-3 space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Bot className="w-4 h-4 text-sky-400" />
                        <span className="text-sm font-medium text-sky-400">AI Response Configuration</span>
                        {isSaving && <Loader2 className="w-3 h-3 animate-spin text-sky-400" />}
                      </div>

                      {/* Monitoring disabled notice */}
                      {!(monitoring?.isActive) && (
                        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <p className="text-xs text-amber-400">
                            <AlertTriangle className="w-3 h-3 inline mr-1" />
                            Monitoring is disabled for this platform. Enable the toggle above to configure AI responses.
                          </p>
                        </div>
                      )}

                      {/* Auto-Respond Toggle */}
                      <ToggleSwitch
                        checked={monitoring?.autoRespond ?? false}
                        onChange={(checked) => saveMonitoringConfig(platform, { autoRespond: checked, isActive: true })}
                        label="Auto-Respond"
                        description="AI will automatically respond to incoming messages on this platform"
                        disabled={isSaving || !(monitoring?.isActive)}
                        size="sm"
                      />

                      {/* Priority (only show when auto-respond is on) */}
                      {monitoring?.autoRespond && (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0 mr-3">
                              <p className="text-xs font-medium text-white">Response Priority</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                Higher priority messages are processed first
                              </p>
                            </div>
                            <select
                              value={monitoring?.priority || 'normal'}
                              onChange={(e) => saveMonitoringConfig(platform, { priority: e.target.value })}
                              disabled={isSaving}
                              className="bg-swarm-darker border border-swarm-border/30 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500/50"
                            >
                              {priorityOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Auto-Classify Toggle */}
                          <ToggleSwitch
                            checked={monitoring?.autoClassify ?? false}
                            onChange={(checked) => saveMonitoringConfig(platform, { autoClassify: checked })}
                            label="Auto-Classify"
                            description="Automatically categorize incoming messages"
                            disabled={isSaving}
                            size="sm"
                          />

                          {/* Forward to Team Toggle */}
                          <ToggleSwitch
                            checked={monitoring?.forwardToTeam ?? false}
                            onChange={(checked) => saveMonitoringConfig(platform, { forwardToTeam: checked })}
                            label="Forward to Team"
                            description="Forward messages to team members when AI cannot handle"
                            disabled={isSaving}
                            size="sm"
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No agenticId hint */}
      {!agenticId && platforms.length > 0 && (
        <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/20">
          <p className="text-xs text-sky-400">
            <Bot className="w-3 h-3 inline mr-1" />
            Link this profile to an agent to configure AI auto-response per platform.
          </p>
        </div>
      )}
    </div>
  );
};

PlatformMonitoringPanel.displayName = 'PlatformMonitoringPanel';

export default PlatformMonitoringPanel;
