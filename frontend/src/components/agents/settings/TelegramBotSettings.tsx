import React, { useState, useEffect } from 'react';
import {
  Send,
  CheckCircle,
  Plus,
  X,
  Users,
  MessageSquare,
  AtSign,
  Link2,
  Copy,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { ToggleSwitch } from '../../common/ToggleSwitch';
import api from '../../../services/api';

export interface BotCommand {
  command: string;
  description: string;
}

export interface TelegramBotSettings {
  // Bot Info
  botUsername: string;
  botId: string;
  // Permissions
  canJoinGroups: boolean;
  canReadGroupMessages: boolean;
  supportsInlineMode: boolean;
  // Commands
  commands: BotCommand[];
  // Webhook
  webhookUrl: string;
}

export interface TelegramBotSettingsProps {
  agentId: string;
  platformAccountId?: string;
  initialSettings?: Partial<TelegramBotSettings>;
  onSave?: (settings: TelegramBotSettings) => Promise<void>;
  className?: string;
}

const defaultSettings: TelegramBotSettings = {
  botUsername: '',
  botId: '',
  canJoinGroups: true,
  canReadGroupMessages: false,
  supportsInlineMode: false,
  commands: [
    { command: '/start', description: 'Start conversation with the bot' },
    { command: '/help', description: 'Show help information' },
  ],
  webhookUrl: '',
};

export const TelegramBotSettings: React.FC<TelegramBotSettingsProps> = ({
  agentId,
  platformAccountId,
  initialSettings,
  onSave,
  className,
}) => {
  const [settings, setSettings] = useState<TelegramBotSettings>({
    ...defaultSettings,
    ...initialSettings,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [newCommand, setNewCommand] = useState({ command: '', description: '' });
  const [copied, setCopied] = useState(false);

  // Generate webhook URL
  const webhookUrl = `${window.location.origin}/api/webhook/telegram/${agentId}`;

  // Load current settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!platformAccountId) return;
      try {
        const response = await api.get(`/platforms/telegram-bot/${platformAccountId}`);
        if (response.data) {
          const data = response.data;
          setSettings(prev => ({
            ...prev,
            botUsername: data.botUsername || prev.botUsername,
            botId: data.botId || prev.botId,
            ...data.settings,
          }));
        }
      } catch (err) {
        console.error('Failed to load Telegram bot settings:', err);
      }
    };
    loadSettings();
  }, [platformAccountId]);

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave({ ...settings, webhookUrl });
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof TelegramBotSettings>(key: K, value: TelegramBotSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const addCommand = () => {
    if (!newCommand.command.trim() || !newCommand.description.trim()) return;
    const cmd = newCommand.command.startsWith('/') ? newCommand.command : `/${newCommand.command}`;
    setSettings(prev => ({
      ...prev,
      commands: [...prev.commands, { command: cmd, description: newCommand.description }],
    }));
    setNewCommand({ command: '', description: '' });
  };

  const removeCommand = (index: number) => {
    setSettings(prev => ({
      ...prev,
      commands: prev.commands.filter((_, i) => i !== index),
    }));
  };

  const updateCommand = (index: number, field: 'command' | 'description', value: string) => {
    setSettings(prev => ({
      ...prev,
      commands: prev.commands.map((cmd, i) =>
        i === index ? { ...cmd, [field]: value } : cmd
      ),
    }));
  };

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Bot Info */}
      <div className="p-4 bg-sky-500/10 border border-sky-500/30 rounded-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center">
            <Send className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <p className="font-semibold text-white">
              {settings.botUsername ? `@${settings.botUsername}` : 'Telegram Bot'}
            </p>
            <p className="text-xs text-gray-400">
              {settings.botId ? `ID: ${settings.botId}` : 'Not connected'}
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Status</span>
            <span className="text-emerald-400">Active</span>
          </div>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-300">Webhook URL</label>
        <div className="flex gap-2">
          <div className="flex-1 p-2.5 bg-slate-800 border border-slate-600 rounded-lg font-mono text-xs text-gray-300 overflow-x-auto">
            {webhookUrl}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyWebhookUrl}
            icon={copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          />
        </div>
        <p className="text-[10px] text-gray-500">
          Telegram sends updates to this URL. Configure via @BotFather if using webhooks.
        </p>
      </div>

      {/* Permissions */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-400" />
          Permissions
        </h3>

        <div className="p-3 bg-slate-800/30 rounded-lg">
          <ToggleSwitch
            checked={settings.canJoinGroups}
            onChange={(v) => updateSetting('canJoinGroups', v)}
            label="Can Join Groups"
            description="Allow bot to be added to groups"
            size="sm"
          />
        </div>

        <div className="p-3 bg-slate-800/30 rounded-lg">
          <ToggleSwitch
            checked={settings.canReadGroupMessages}
            onChange={(v) => updateSetting('canReadGroupMessages', v)}
            label="Read Group Messages"
            description="Receive all messages in groups (not just commands)"
            size="sm"
          />
        </div>

        <div className="p-3 bg-slate-800/30 rounded-lg">
          <ToggleSwitch
            checked={settings.supportsInlineMode}
            onChange={(v) => updateSetting('supportsInlineMode', v)}
            label="Inline Mode"
            description="Enable @bot inline queries in any chat"
            size="sm"
          />
        </div>
      </div>

      {/* Bot Commands */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          Bot Commands
        </h3>
        <p className="text-[10px] text-gray-500">
          Commands appear in Telegram's command menu. Run /setcommands in @BotFather to update.
        </p>

        <div className="space-y-2">
          {settings.commands.map((cmd, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={cmd.command}
                onChange={(e) => updateCommand(index, 'command', e.target.value)}
                placeholder="/command"
                className="w-28 text-xs font-mono"
                containerClassName="flex-shrink-0"
              />
              <Input
                value={cmd.description}
                onChange={(e) => updateCommand(index, 'description', e.target.value)}
                placeholder="Description"
                className="text-xs"
                containerClassName="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeCommand(index)}
                className="text-gray-400 hover:text-red-400"
                icon={<X className="w-4 h-4" />}
              />
            </div>
          ))}

          {/* Add new command */}
          <div className="flex gap-2 pt-2 border-t border-slate-700">
            <Input
              value={newCommand.command}
              onChange={(e) => setNewCommand(prev => ({ ...prev, command: e.target.value }))}
              placeholder="/newcmd"
              className="w-28 text-xs font-mono"
              containerClassName="flex-shrink-0"
            />
            <Input
              value={newCommand.description}
              onChange={(e) => setNewCommand(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Command description"
              className="text-xs"
              containerClassName="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addCommand()}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={addCommand}
              icon={<Plus className="w-4 h-4" />}
            >
              Add
            </Button>
          </div>
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
          Save Telegram Settings
        </Button>
      )}
    </div>
  );
};

TelegramBotSettings.displayName = 'TelegramBotSettings';

export default TelegramBotSettings;
