import React, { useState, useEffect } from 'react';
import {
  Mail,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Inbox,
  Send as SendIcon,
  Paperclip,
  Server,
  Eye,
  EyeOff,
  Info,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { ToggleSwitch } from '../../common/ToggleSwitch';
import api from '../../../services/api';
import { formatDateTime } from '@/utils/dateFormat';

interface EmailPreset {
  id: string;
  name: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  notes: string;
  helpUrl?: string | null;
  helpSteps?: string[];
}

export interface EmailSettings {
  // Connection
  email: string;
  password: string;
  provider: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  useTLS: boolean;
  // Monitoring
  checkInterval: number; // minutes
  foldersToMonitor: string[];
  // Handling
  autoArchiveProcessed: boolean;
  processAttachments: boolean;
  maxAttachmentSize: number; // MB
  // Reply
  replyToAddress: string;
  emailSignature: string;
  includeThreadHistory: boolean;
}

export interface EmailAgentSettingsProps {
  agentId: string;
  platformAccountId?: string;
  initialSettings?: Partial<EmailSettings>;
  onSave?: (settings: EmailSettings) => Promise<void>;
  className?: string;
}

const defaultSettings: EmailSettings = {
  email: '',
  password: '',
  provider: 'gmail',
  imapHost: 'imap.gmail.com',
  imapPort: 993,
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  useTLS: true,
  checkInterval: 5,
  foldersToMonitor: ['INBOX'],
  autoArchiveProcessed: false,
  processAttachments: true,
  maxAttachmentSize: 10,
  replyToAddress: '',
  emailSignature: '',
  includeThreadHistory: true,
};

export const EmailAgentSettings: React.FC<EmailAgentSettingsProps> = ({
  agentId,
  platformAccountId,
  initialSettings,
  onSave,
  className,
}) => {
  const [settings, setSettings] = useState<EmailSettings>({
    ...defaultSettings,
    ...initialSettings,
  });
  const [presets, setPresets] = useState<EmailPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<EmailPreset | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'unknown'>('unknown');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    results?: {
      imap: { success: boolean; message: string };
      smtp: { success: boolean; message: string };
    };
  } | null>(null);

  // Load presets on mount
  useEffect(() => {
    const loadPresets = async () => {
      try {
        const response = await api.get('/platforms/email/presets');
        if (response.data?.presets) {
          setPresets(response.data.presets);
          // Set default preset
          const gmail = response.data.presets.find((p: EmailPreset) => p.id === 'gmail');
          if (gmail && !initialSettings?.imapHost) {
            setSelectedPreset(gmail);
          }
        }
      } catch (err) {
        console.error('Failed to load email presets:', err);
      }
    };
    loadPresets();
  }, [initialSettings?.imapHost]);

  // Load current settings if editing existing account
  useEffect(() => {
    const loadSettings = async () => {
      if (!platformAccountId) return;
      try {
        const response = await api.get(`/platforms/email/${platformAccountId}`);
        if (response.data) {
          const data = response.data;
          setSettings(prev => ({
            ...prev,
            email: data.email || prev.email,
            password: '', // Don't load password - user must enter new one if changing
            imapHost: data.imapHost || prev.imapHost,
            imapPort: data.imapPort || prev.imapPort,
            smtpHost: data.smtpHost || prev.smtpHost,
            smtpPort: data.smtpPort || prev.smtpPort,
            checkInterval: data.settings?.checkInterval || prev.checkInterval,
            foldersToMonitor: data.settings?.foldersToMonitor || prev.foldersToMonitor,
            autoArchiveProcessed: data.settings?.autoArchiveProcessed ?? prev.autoArchiveProcessed,
            processAttachments: data.settings?.processAttachments ?? prev.processAttachments,
            maxAttachmentSize: data.settings?.maxAttachmentSize || prev.maxAttachmentSize,
            replyToAddress: data.settings?.replyToAddress || prev.replyToAddress,
            emailSignature: data.settings?.emailSignature || prev.emailSignature,
            includeThreadHistory: data.settings?.includeThreadHistory ?? prev.includeThreadHistory,
          }));
          setConnectionStatus(data.status === 'connected' ? 'connected' : data.status === 'error' ? 'error' : 'unknown');
          setLastSynced(data.lastConnectedAt || null);

          // Find matching preset based on IMAP host
          if (data.imapHost && presets.length > 0) {
            const matchingPreset = presets.find(p => p.imap.host === data.imapHost);
            if (matchingPreset) {
              setSelectedPreset(matchingPreset);
              setSettings(prev => ({ ...prev, provider: matchingPreset.id }));
            } else {
              // Custom provider
              const customPreset = presets.find(p => p.id === 'custom');
              if (customPreset) {
                setSelectedPreset(customPreset);
                setSettings(prev => ({ ...prev, provider: 'custom' }));
              }
              setShowAdvanced(true);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load email settings:', err);
      }
    };
    loadSettings();
  }, [platformAccountId, presets]);

  const handlePresetChange = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setSelectedPreset(preset);
      setSettings(prev => ({
        ...prev,
        provider: presetId,
        imapHost: preset.imap.host,
        imapPort: preset.imap.port,
        smtpHost: preset.smtp.host,
        smtpPort: preset.smtp.port,
        useTLS: preset.imap.secure,
      }));
      // Show advanced for custom
      if (presetId === 'custom') {
        setShowAdvanced(true);
      }
    }
  };

  const handleTestConnection = async () => {
    // For new accounts, both email and password required
    // For existing accounts, password is optional (will use stored password)
    if (!settings.email) {
      setTestResult({
        success: false,
        message: 'Email address is required',
      });
      return;
    }

    if (!platformAccountId && !settings.password) {
      setTestResult({
        success: false,
        message: 'Password is required for new accounts',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await api.post('/platforms/email/test', {
        agentId,
        platformAccountId, // Pass this so backend can use stored password if needed
        email: settings.email,
        password: settings.password || undefined, // Only send if provided
        imapHost: settings.imapHost,
        imapPort: settings.imapPort,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        useTLS: settings.useTLS,
      });
      setTestResult({
        success: response.data?.success ?? false,
        message: response.data?.message || 'Connection test completed',
        results: response.data?.results,
      });
      if (response.data?.success) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('error');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection test failed';
      setTestResult({ success: false, message });
      setConnectionStatus('error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await api.post(`/platforms/email/${platformAccountId}/sync`);
      setLastSynced(new Date().toISOString());
    } catch (err) {
      console.error('Failed to sync:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(settings);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const toggleFolder = (folder: string) => {
    setSettings(prev => ({
      ...prev,
      foldersToMonitor: prev.foldersToMonitor.includes(folder)
        ? prev.foldersToMonitor.filter(f => f !== folder)
        : [...prev.foldersToMonitor, folder],
    }));
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Email Provider Selection */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Mail className="w-4 h-4 text-rose-400" />
          Email Provider
        </h3>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Select Email Service</label>
          <select
            value={settings.provider || 'gmail'}
            onChange={(e) => handlePresetChange(e.target.value)}
            aria-label="Select Email Service"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-600 bg-slate-800/50 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            {presets.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        {selectedPreset && (selectedPreset.notes || selectedPreset.helpSteps) && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 overflow-hidden">
            {/* Main note with expand button */}
            <div className="flex items-start gap-2 p-3">
              <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-amber-200">{selectedPreset.notes}</p>
              </div>
              {selectedPreset.helpSteps && selectedPreset.helpSteps.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHelp(!showHelp)}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  {showHelp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {/* Expandable help steps */}
            {showHelp && selectedPreset.helpSteps && (
              <div className="px-3 pb-3 pt-0 border-t border-amber-500/20">
                <p className="text-xs font-medium text-amber-300 mb-2 mt-2">How to get App Password:</p>
                <ol className="space-y-1.5">
                  {selectedPreset.helpSteps.map((step, index) => (
                    <li key={index} className="text-xs text-amber-200/80 flex gap-2">
                      <span className="text-amber-400 font-medium">{index + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                {selectedPreset.helpUrl && (
                  <a
                    href={selectedPreset.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open {selectedPreset.name} Settings
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connection Credentials */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Server className="w-4 h-4 text-sky-400" />
          Connection Settings
        </h3>

        <Input
          label="Email Address"
          type="email"
          value={settings.email}
          onChange={(e) => updateSetting('email', e.target.value)}
          placeholder="your@email.com"
          className="text-sm"
        />

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Password / App Password
            {platformAccountId && (
              <span className="ml-2 text-sky-400">(leave empty to keep current)</span>
            )}
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={settings.password}
              onChange={(e) => updateSetting('password', e.target.value)}
              placeholder={platformAccountId ? "Enter new password to change" : "Enter your password or app password"}
              className="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-slate-600 bg-slate-800/50 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Advanced Settings Toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-sky-400 hover:text-sky-300"
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced Server Settings
        </button>

        {showAdvanced && (
          <div className="space-y-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="IMAP Host"
                value={settings.imapHost}
                onChange={(e) => updateSetting('imapHost', e.target.value)}
                placeholder="imap.example.com"
                className="text-sm"
              />
              <Input
                label="IMAP Port"
                type="number"
                value={settings.imapPort}
                onChange={(e) => updateSetting('imapPort', parseInt(e.target.value) || 993)}
                placeholder="993"
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="SMTP Host"
                value={settings.smtpHost}
                onChange={(e) => updateSetting('smtpHost', e.target.value)}
                placeholder="smtp.example.com"
                className="text-sm"
              />
              <Input
                label="SMTP Port"
                type="number"
                value={settings.smtpPort}
                onChange={(e) => updateSetting('smtpPort', parseInt(e.target.value) || 587)}
                placeholder="587"
                className="text-sm"
              />
            </div>
            <div className="p-2 bg-slate-800/50 rounded-lg">
              <ToggleSwitch
                checked={settings.useTLS}
                onChange={(v) => updateSetting('useTLS', v)}
                label="Use TLS/SSL"
                description="Secure connection (recommended)"
                size="sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Connection Status & Test */}
      <div className={cn(
        'p-4 rounded-xl border',
        connectionStatus === 'connected'
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : connectionStatus === 'error'
          ? 'bg-red-500/10 border-red-500/30'
          : 'bg-slate-700/30 border-slate-600'
      )}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-3 h-3 rounded-full',
              connectionStatus === 'connected' ? 'bg-emerald-500' :
              connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'
            )} />
            <span className={cn(
              'font-medium',
              connectionStatus === 'connected' ? 'text-emerald-400' :
              connectionStatus === 'error' ? 'text-red-400' : 'text-gray-400'
            )}>
              {connectionStatus === 'connected' ? 'Connected' :
               connectionStatus === 'error' ? 'Connection Error' : 'Not Tested'}
            </span>
          </div>
        </div>

        {settings.email && lastSynced && (
          <div className="space-y-2 text-sm mb-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Last Synced</span>
              <span className="text-white">
                {formatDateTime(lastSynced)}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTestConnection}
            loading={isTesting}
            disabled={!settings.email || (!platformAccountId && !settings.password)}
            icon={isTesting ? undefined : <RefreshCw className="w-3.5 h-3.5" />}
          >
            Test Connection
          </Button>
          {platformAccountId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSyncNow}
              loading={isSyncing}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync Now
            </Button>
          )}
        </div>

        {testResult && (
          <div className="mt-3 space-y-2">
            <div className={cn(
              'flex items-center gap-2 p-2 rounded-lg text-xs',
              testResult.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            )}>
              {testResult.success ? (
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>

            {/* Detailed results */}
            {testResult.results && (
              <div className="grid grid-cols-2 gap-2">
                <div className={cn(
                  'p-2 rounded-lg text-xs',
                  testResult.results.imap.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                )}>
                  <div className="flex items-center gap-1 font-medium mb-1">
                    {testResult.results.imap.success ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    IMAP
                  </div>
                  <div className="text-gray-400 text-[10px] truncate">
                    {testResult.results.imap.success ? 'Connected' : testResult.results.imap.message}
                  </div>
                </div>
                <div className={cn(
                  'p-2 rounded-lg text-xs',
                  testResult.results.smtp.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                )}>
                  <div className="flex items-center gap-1 font-medium mb-1">
                    {testResult.results.smtp.success ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    SMTP
                  </div>
                  <div className="text-gray-400 text-[10px] truncate">
                    {testResult.results.smtp.success ? 'Connected' : testResult.results.smtp.message}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inbox Monitoring */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Inbox className="w-4 h-4 text-sky-400" />
          Inbox Monitoring
        </h3>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Check for New Emails</label>
          <select
            value={settings.checkInterval}
            onChange={(e) => updateSetting('checkInterval', parseInt(e.target.value))}
            aria-label="Check for New Emails interval"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-600 bg-slate-800/50 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            <option value={1}>Every 1 minute</option>
            <option value={5}>Every 5 minutes</option>
            <option value={15}>Every 15 minutes</option>
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every hour</option>
            <option value={0}>Manual only</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Folders to Monitor</label>
          <div className="space-y-2">
            {['INBOX', 'Starred', 'Important', 'Support'].map(folder => (
              <label key={folder} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.foldersToMonitor.includes(folder)}
                  onChange={() => toggleFolder(folder)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                />
                <span className="text-sm text-gray-300">{folder}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Email Handling */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-purple-400" />
          Email Handling
        </h3>

        <div className="p-3 bg-slate-800/30 rounded-lg">
          <ToggleSwitch
            checked={settings.autoArchiveProcessed}
            onChange={(v) => updateSetting('autoArchiveProcessed', v)}
            label="Auto-Archive Processed"
            description="Move emails to archive after response"
            size="sm"
          />
        </div>

        <div className="p-3 bg-slate-800/30 rounded-lg">
          <ToggleSwitch
            checked={settings.processAttachments}
            onChange={(v) => updateSetting('processAttachments', v)}
            label="Process Attachments"
            description="Extract text from PDFs, docs, images"
            size="sm"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Max Attachment Size</label>
          <select
            value={settings.maxAttachmentSize}
            onChange={(e) => updateSetting('maxAttachmentSize', parseInt(e.target.value))}
            aria-label="Max Attachment Size"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-600 bg-slate-800/50 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            <option value={5}>5 MB</option>
            <option value={10}>10 MB</option>
            <option value={25}>25 MB</option>
            <option value={50}>50 MB</option>
          </select>
        </div>
      </div>

      {/* Reply Settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <SendIcon className="w-4 h-4 text-emerald-400" />
          Reply Settings
        </h3>

        <Input
          label="Reply-To Address (optional)"
          type="email"
          value={settings.replyToAddress}
          onChange={(e) => updateSetting('replyToAddress', e.target.value)}
          placeholder="noreply@company.com"
          className="text-sm"
        />

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Email Signature</label>
          <textarea
            value={settings.emailSignature}
            onChange={(e) => updateSetting('emailSignature', e.target.value)}
            placeholder="Best regards,&#10;Support Team"
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-600 bg-slate-800/50 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none"
          />
        </div>

        <div className="p-3 bg-slate-800/30 rounded-lg">
          <ToggleSwitch
            checked={settings.includeThreadHistory}
            onChange={(v) => updateSetting('includeThreadHistory', v)}
            label="Include Thread History"
            description="Quote previous messages in reply"
            size="sm"
          />
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
          Save Changes
        </Button>
      )}
    </div>
  );
};

EmailAgentSettings.displayName = 'EmailAgentSettings';

export default EmailAgentSettings;
