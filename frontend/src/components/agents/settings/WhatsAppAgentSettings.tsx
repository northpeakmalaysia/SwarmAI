import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  RefreshCw,
  CheckCircle,
  Image,
  Clock,
  Eye,
  Keyboard,
  LogOut,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../common/Button';
import { ToggleSwitch } from '../../common/ToggleSwitch';
import api from '../../../services/api';

export interface WhatsAppSettings {
  // Connection
  phoneNumber: string;
  displayName: string;
  // Message Settings
  syncMessageHistory: boolean;
  autoDownloadMedia: boolean;
  sendReadReceipts: boolean;
  showTypingIndicator: boolean;
  // Response Behavior
  minResponseDelay: number; // seconds
  typingSpeedSimulation: 'fast' | 'normal' | 'slow';
}

export interface WhatsAppAgentSettingsProps {
  agentId: string;
  platformAccountId?: string;
  initialSettings?: Partial<WhatsAppSettings>;
  onSave?: (settings: WhatsAppSettings) => Promise<void>;
  onDisconnect?: () => Promise<void>;
  className?: string;
}

const defaultSettings: WhatsAppSettings = {
  phoneNumber: '',
  displayName: '',
  syncMessageHistory: false,
  autoDownloadMedia: true,
  sendReadReceipts: true,
  showTypingIndicator: true,
  minResponseDelay: 1,
  typingSpeedSimulation: 'normal',
};

export const WhatsAppAgentSettings: React.FC<WhatsAppAgentSettingsProps> = ({
  agentId,
  platformAccountId,
  initialSettings,
  onSave,
  onDisconnect,
  className,
}) => {
  const [settings, setSettings] = useState<WhatsAppSettings>({
    ...defaultSettings,
    ...initialSettings,
  });
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'qr_pending'>('connected');
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Load current settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!platformAccountId) return;
      try {
        const response = await api.get(`/platforms/whatsapp/${platformAccountId}`);
        if (response.data) {
          const data = response.data;
          setSettings(prev => ({
            ...prev,
            phoneNumber: data.phoneNumber || data.wid || prev.phoneNumber,
            displayName: data.displayName || data.pushName || prev.displayName,
            ...data.settings,
          }));
          setConnectionStatus(data.status || 'connected');
        }
      } catch (err) {
        console.error('Failed to load WhatsApp settings:', err);
      }
    };
    loadSettings();
  }, [platformAccountId]);

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(settings);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!onDisconnect) return;
    setIsDisconnecting(true);
    try {
      await onDisconnect();
    } finally {
      setIsDisconnecting(false);
    }
  };

  const updateSetting = <K extends keyof WhatsAppSettings>(key: K, value: WhatsAppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Connection Status */}
      <div className={cn(
        'p-4 rounded-xl border',
        connectionStatus === 'connected'
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-yellow-500/10 border-yellow-500/30'
      )}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-3 h-3 rounded-full',
              connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-yellow-500 animate-pulse'
            )} />
            <span className={cn(
              'font-medium',
              connectionStatus === 'connected' ? 'text-emerald-400' : 'text-yellow-400'
            )}>
              {connectionStatus === 'connected' ? 'Connected' : 'Pending QR Scan'}
            </span>
          </div>
        </div>

        {connectionStatus === 'connected' && (
          <div className="space-y-2 text-sm mb-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Phone Number</span>
              <span className="text-white">{settings.phoneNumber || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Display Name</span>
              <span className="text-white">{settings.displayName || 'N/A'}</span>
            </div>
          </div>
        )}

        {onDisconnect && connectionStatus === 'connected' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            loading={isDisconnecting}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            icon={<LogOut className="w-3.5 h-3.5" />}
          >
            Disconnect & Re-authenticate
          </Button>
        )}
      </div>

      {/* Message Settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          Message Settings
        </h3>

        <div className="p-3 bg-slate-800/30 rounded-lg">
          <ToggleSwitch
            checked={settings.syncMessageHistory}
            onChange={(v) => updateSetting('syncMessageHistory', v)}
            label="Sync Message History"
            description="Import existing chats on connect"
            size="sm"
          />
        </div>

        <div className="p-3 bg-slate-800/30 rounded-lg">
          <ToggleSwitch
            checked={settings.autoDownloadMedia}
            onChange={(v) => updateSetting('autoDownloadMedia', v)}
            label="Auto-Download Media"
            description="Download images and documents automatically"
            size="sm"
          />
        </div>

        <div className="p-3 bg-slate-800/30 rounded-lg">
          <ToggleSwitch
            checked={settings.sendReadReceipts}
            onChange={(v) => updateSetting('sendReadReceipts', v)}
            label="Send Read Receipts"
            description="Show blue ticks when messages are read"
            size="sm"
          />
        </div>

        <div className="p-3 bg-slate-800/30 rounded-lg">
          <ToggleSwitch
            checked={settings.showTypingIndicator}
            onChange={(v) => updateSetting('showTypingIndicator', v)}
            label="Typing Indicator"
            description="Show typing animation before responding"
            size="sm"
          />
        </div>
      </div>

      {/* Response Behavior */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-400" />
          Response Behavior
        </h3>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Minimum Response Delay</label>
          <select
            value={settings.minResponseDelay}
            onChange={(e) => updateSetting('minResponseDelay', parseInt(e.target.value))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-600 bg-slate-800/50 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            <option value={0}>No delay</option>
            <option value={1}>1 second</option>
            <option value={2}>2 seconds</option>
            <option value={3}>3 seconds</option>
            <option value={5}>5 seconds</option>
          </select>
          <p className="text-[10px] text-gray-500 mt-1">
            Wait before responding to appear more natural
          </p>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Typing Speed Simulation</label>
          <select
            value={settings.typingSpeedSimulation}
            onChange={(e) => updateSetting('typingSpeedSimulation', e.target.value as 'fast' | 'normal' | 'slow')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-600 bg-slate-800/50 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            <option value="fast">Fast (30 chars/sec)</option>
            <option value="normal">Normal (15 chars/sec)</option>
            <option value="slow">Slow (8 chars/sec)</option>
          </select>
          <p className="text-[10px] text-gray-500 mt-1">
            How fast typing indicator shows before response
          </p>
        </div>
      </div>

      {/* Save Button */}
      {onSave && (
        <Button
          onClick={handleSave}
          loading={isSaving}
          fullWidth
          icon={<CheckCircle className="w-4 h-4" />}
        >
          Save WhatsApp Settings
        </Button>
      )}
    </div>
  );
};

WhatsAppAgentSettings.displayName = 'WhatsAppAgentSettings';

export default WhatsAppAgentSettings;
