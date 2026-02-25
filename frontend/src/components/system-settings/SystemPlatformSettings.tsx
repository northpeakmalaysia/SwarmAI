import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Mail,
  Webhook,
  CheckCircle,
  AlertCircle,
  XCircle,
  RefreshCw,
  QrCode,
  ExternalLink,
  Settings,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDateTime } from '../../utils/dateFormat';

/**
 * Platform status interface
 */
interface PlatformStatus {
  id: string;
  type: 'whatsapp' | 'whatsapp-business' | 'telegram-bot' | 'email' | 'http-api';
  name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  icon: React.FC<{ className?: string }>;
  color: string;
  bgColor: string;
  lastConnected?: string;
  details?: string;
}

/**
 * Platform metadata
 */
const platformMeta = {
  whatsapp: {
    name: 'WhatsApp',
    icon: MessageSquare,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    description: 'Personal WhatsApp via Web.js (QR Code)',
  },
  'whatsapp-business': {
    name: 'WhatsApp Business',
    icon: MessageSquare,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    description: 'Official Meta WhatsApp Business API',
  },
  'telegram-bot': {
    name: 'Telegram Bot',
    icon: Send,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/20',
    description: 'Telegram Bot API',
  },
  email: {
    name: 'Email',
    icon: Mail,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    description: 'IMAP/SMTP Email Integration',
  },
  'http-api': {
    name: 'HTTP API',
    icon: Webhook,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    description: 'Custom Webhook Integration',
  },
};

/**
 * Status indicator component
 */
const StatusIndicator: React.FC<{ status: string }> = ({ status }) => {
  const statusConfig = {
    connected: { color: 'text-emerald-400', bg: 'bg-emerald-400', icon: CheckCircle, label: 'Connected' },
    disconnected: { color: 'text-gray-400', bg: 'bg-gray-400', icon: XCircle, label: 'Disconnected' },
    connecting: { color: 'text-amber-400', bg: 'bg-amber-400', icon: RefreshCw, label: 'Connecting' },
    error: { color: 'text-red-400', bg: 'bg-red-400', icon: AlertCircle, label: 'Error' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.disconnected;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-2 h-2 rounded-full', config.bg, status === 'connecting' && 'animate-pulse')} />
      <span className={cn('text-sm', config.color)}>{config.label}</span>
    </div>
  );
};

/**
 * SystemPlatformSettings Component
 *
 * Manages system-wide platform connections:
 * - WhatsApp (Web.js with QR code)
 * - WhatsApp Business API
 * - Telegram Bot
 * - Email (IMAP/SMTP)
 * - HTTP API Webhooks
 */
export const SystemPlatformSettings: React.FC = () => {
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPlatformStatus = async () => {
    try {
      const response = await api.get('/platforms/status');
      const statuses = response.data.platforms || [];

      // Map API response to our format
      const formattedPlatforms = statuses.map((p: any) => ({
        id: p.id || p.type,
        type: p.type,
        name: platformMeta[p.type as keyof typeof platformMeta]?.name || p.type,
        status: p.status || 'disconnected',
        icon: platformMeta[p.type as keyof typeof platformMeta]?.icon || Webhook,
        color: platformMeta[p.type as keyof typeof platformMeta]?.color || 'text-gray-400',
        bgColor: platformMeta[p.type as keyof typeof platformMeta]?.bgColor || 'bg-gray-500/20',
        lastConnected: p.lastConnected,
        details: p.details,
      }));

      setPlatforms(formattedPlatforms);
    } catch (error) {
      console.error('Failed to fetch platform status:', error);
      // Set default platforms if API fails
      setPlatforms(
        Object.entries(platformMeta).map(([type, meta]) => ({
          id: type,
          type: type as any,
          name: meta.name,
          status: 'disconnected' as const,
          icon: meta.icon,
          color: meta.color,
          bgColor: meta.bgColor,
        }))
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPlatformStatus();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPlatformStatus();
  };

  const handleReconnect = async (platformType: string) => {
    try {
      await api.post(`/platforms/${platformType}/reconnect`);
      toast.success(`Reconnecting to ${platformMeta[platformType as keyof typeof platformMeta]?.name || platformType}...`);
      setTimeout(fetchPlatformStatus, 2000);
    } catch (error) {
      console.error('Failed to reconnect:', error);
      toast.error('Failed to reconnect');
    }
  };

  const handleDisconnect = async (platformType: string) => {
    try {
      await api.post(`/platforms/${platformType}/disconnect`);
      toast.success('Platform disconnected');
      fetchPlatformStatus();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      toast.error('Failed to disconnect');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <Card variant="bordered" className="border-sky-500/50 bg-sky-500/10">
        <CardBody className="py-3">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-sky-400 flex-shrink-0" />
            <div className="text-sm text-sky-200">
              <strong>Platform Connections:</strong> These connections are used by all agents in the system.
              Configure individual agent platforms in the Agents page.
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Platform List */}
      <Card variant="pressed">
        <CardHeader
          title="Connected Platforms"
          subtitle="Manage messaging platform connections"
          action={
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={handleRefresh}
              loading={refreshing}
            >
              Refresh
            </Button>
          }
        />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(platformMeta).map(([type, meta]) => {
              const platform = platforms.find((p) => p.type === type);
              const Icon = meta.icon;
              const isConnected = platform?.status === 'connected';

              return (
                <div
                  key={type}
                  className={cn(
                    'p-4 rounded-lg border transition-colors',
                    isConnected
                      ? 'bg-slate-800/50 border-slate-600'
                      : 'bg-slate-900/50 border-slate-700'
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg', meta.bgColor)}>
                        <Icon className={cn('w-5 h-5', meta.color)} />
                      </div>
                      <div>
                        <h4 className="font-medium text-white">{meta.name}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                      </div>
                    </div>
                    <StatusIndicator status={platform?.status || 'disconnected'} />
                  </div>

                  {platform?.details && (
                    <p className="text-sm text-gray-400 mb-3">{platform.details}</p>
                  )}

                  {platform?.lastConnected && (
                    <p className="text-xs text-gray-500 mb-3">
                      Last connected: {formatDateTime(platform.lastConnected)}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDisconnect(type)}
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleReconnect(type)}
                      >
                        Connect
                      </Button>
                    )}
                    {type === 'whatsapp' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<QrCode className="w-4 h-4" />}
                      >
                        QR Code
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Platform Setup Instructions */}
      <Card variant="pressed">
        <CardHeader title="Setup Instructions" />
        <CardBody>
          <div className="space-y-4 text-sm text-gray-400">
            <div>
              <h5 className="font-medium text-white mb-1">WhatsApp (Web.js)</h5>
              <p>Scan the QR code from your WhatsApp mobile app. Session persists across restarts.</p>
            </div>
            <div>
              <h5 className="font-medium text-white mb-1">WhatsApp Business</h5>
              <p>Requires a Meta Business account with WhatsApp Business API access. Configure in agent settings.</p>
            </div>
            <div>
              <h5 className="font-medium text-white mb-1">Telegram Bot</h5>
              <p>Create a bot via @BotFather and use the bot token. Configure in agent settings.</p>
            </div>
            <div>
              <h5 className="font-medium text-white mb-1">Email</h5>
              <p>Configure IMAP/SMTP settings in agent settings. Supports Gmail, Outlook, and custom servers.</p>
            </div>
            <div>
              <h5 className="font-medium text-white mb-1">HTTP API</h5>
              <p>Configure webhook URLs and authentication in agent settings for custom integrations.</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default SystemPlatformSettings;
