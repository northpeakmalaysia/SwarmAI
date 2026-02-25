import React, { useState, useEffect, useCallback } from 'react';
import {
  UserCog,
  Bell,
  Clock,
  Mail,
  MessageSquare,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  Save,
  TestTube,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { SearchableSelect, SelectOption } from '../common/SearchableSelect';
import toast from 'react-hot-toast';
import api from '../../services/api';

export interface MasterContactConfig {
  contactId: string | null;
  channel: 'email' | 'whatsapp' | 'telegram';
  notifyOn: string[];
  escalationTimeoutMinutes: number;
  displayName?: string;
  avatar?: string;
}

export interface MasterContactPanelProps {
  /** Agentic profile ID */
  agenticId: string;
  /** Current master contact configuration */
  initialConfig?: Partial<MasterContactConfig>;
  /** Callback when configuration is saved */
  onSave?: (config: MasterContactConfig) => void;
  /** Whether the panel is read-only (for sub-agents) */
  readOnly?: boolean;
  /** Additional className */
  className?: string;
}

const NOTIFICATION_EVENTS = [
  { id: 'approval_needed', label: 'Approval Needed', description: 'When an action requires human approval' },
  { id: 'daily_report', label: 'Daily Report', description: 'Daily summary of agent activities' },
  { id: 'weekly_report', label: 'Weekly Report', description: 'Weekly summary and metrics' },
  { id: 'health_summary', label: 'Health Check', description: 'Periodic system health status updates' },
  { id: 'critical_error', label: 'Critical Error', description: 'When a critical error occurs' },
  { id: 'budget_warning', label: 'Budget Warning', description: 'When approaching budget limit' },
  { id: 'budget_exceeded', label: 'Budget Exceeded', description: 'When budget limit is reached' },
  { id: 'new_email', label: 'New Email', description: 'When a new email arrives for an agent' },
  { id: 'task_completed', label: 'Task Completed', description: 'When important tasks are completed' },
  { id: 'task_failed', label: 'Task Failed', description: 'When a task fails to execute' },
  { id: 'agent_status_change', label: 'Agent Status Change', description: 'When an agent goes online/offline' },
  { id: 'platform_disconnect', label: 'Platform Disconnect', description: 'When a platform connection drops' },
  { id: 'startup', label: 'Startup', description: 'When agent comes online' },
  { id: 'out_of_scope', label: 'Out of Scope Contact', description: 'When trying to contact someone outside scope' },
];

const CHANNEL_OPTIONS = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { id: 'telegram', label: 'Telegram', icon: Send },
];

/**
 * MasterContactPanel - Configure the master contact (superior) for an agentic profile
 *
 * The master contact receives:
 * - Approval requests for actions that need human review
 * - Daily/weekly reports on agent activities
 * - Critical error notifications
 * - Budget warnings and alerts
 */
export const MasterContactPanel: React.FC<MasterContactPanelProps> = ({
  agenticId,
  initialConfig,
  onSave,
  readOnly = false,
  className,
}) => {
  const [config, setConfig] = useState<MasterContactConfig>({
    contactId: initialConfig?.contactId || null,
    channel: initialConfig?.channel || 'email',
    notifyOn: initialConfig?.notifyOn || ['approval_needed', 'daily_report', 'critical_error'],
    escalationTimeoutMinutes: initialConfig?.escalationTimeoutMinutes || 60,
    displayName: initialConfig?.displayName,
    avatar: initialConfig?.avatar,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch contacts for the searchable select
  const fetchContacts = useCallback(async (query: string): Promise<SelectOption[]> => {
    try {
      const params = new URLSearchParams();
      if (query) params.append('search', query);
      params.append('limit', '50');

      const response = await api.get(`/contacts?${params.toString()}`);
      const contacts = response.data?.contacts || response.data || [];

      return contacts.map((c: {
        id: string;
        display_name?: string;
        displayName?: string;
        avatar?: string;
        avatarUrl?: string;
        email?: string;
        phone?: string;
      }) => ({
        id: c.id,
        label: c.display_name || c.displayName || 'Unknown',
        sublabel: c.email || c.phone || '',
        avatar: c.avatar || c.avatarUrl,
      }));
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
      return [];
    }
  }, []);

  // Load initial master contact config
  useEffect(() => {
    const loadConfig = async () => {
      if (!agenticId) return;

      setIsLoading(true);
      try {
        const response = await api.get(`/agentic/profiles/${agenticId}/master-contact`);
        const resData = response.data;
        const mc = resData?.masterContact;

        setConfig({
          contactId: mc?.contactId || null,
          channel: mc?.channel || 'email',
          notifyOn: resData?.notifyOn || mc?.notifyOn || ['approval_needed', 'daily_report', 'critical_error'],
          escalationTimeoutMinutes: resData?.escalationTimeoutMinutes || mc?.escalationTimeoutMinutes || 60,
          displayName: mc?.displayName,
          avatar: mc?.avatar,
        });
        // Reset change tracking after loading saved data
        setTimeout(() => setHasChanges(false), 0);
      } catch (error) {
        console.error('Failed to load master contact config:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [agenticId]);

  // Track changes
  useEffect(() => {
    setHasChanges(true);
  }, [config]);

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put(`/agentic/profiles/${agenticId}/master-contact`, {
        masterContact: config.contactId ? {
          contactId: config.contactId,
          channel: config.channel,
        } : null,
        notifyOn: config.notifyOn,
        escalationTimeoutMinutes: config.escalationTimeoutMinutes,
      });

      toast.success('Master contact configuration saved');
      setHasChanges(false);
      onSave?.(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save configuration';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle test notification
  const handleTestNotification = async () => {
    if (!config.contactId) {
      toast.error('Please select a master contact first');
      return;
    }

    setIsTesting(true);
    try {
      await api.post(`/agentic/profiles/${agenticId}/master-contact/test`, {
        channel: config.channel,
      });
      toast.success('Test notification sent successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send test notification';
      toast.error(message);
    } finally {
      setIsTesting(false);
    }
  };

  // Toggle notification event
  const toggleNotification = (eventId: string) => {
    if (readOnly) return;

    setConfig(prev => ({
      ...prev,
      notifyOn: prev.notifyOn.includes(eventId)
        ? prev.notifyOn.filter(e => e !== eventId)
        : [...prev.notifyOn, eventId],
    }));
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <UserCog className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Master Contact (Superior)</h3>
            <p className="text-sm text-gray-400">
              Configure who receives approval requests and reports
            </p>
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleTestNotification}
              loading={isTesting}
              disabled={!config.contactId || isSaving}
              icon={<TestTube className="w-4 h-4" />}
            >
              Test
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              loading={isSaving}
              disabled={!hasChanges}
              icon={<Save className="w-4 h-4" />}
            >
              Save
            </Button>
          </div>
        )}
      </div>

      {readOnly && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400">
          <AlertCircle className="inline w-4 h-4 mr-2" />
          Sub-agents inherit master contact from their parent. Configuration is read-only.
        </div>
      )}

      {/* Contact Selection */}
      <div className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20">
        <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
          <UserCog className="w-4 h-4" />
          Contact Selection
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Contact Picker */}
          <SearchableSelect
            label="Master Contact"
            value={config.contactId}
            onChange={(id, option) => {
              setConfig(prev => ({
                ...prev,
                contactId: id,
                displayName: option?.label,
                avatar: option?.avatar,
              }));
            }}
            fetchOptions={fetchContacts}
            placeholder="Search contacts..."
            showAvatars
            clearable
            disabled={readOnly}
            helperText="The person who will receive notifications and approve actions"
          />

          {/* Channel Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Notification Channel
            </label>
            <div className="flex gap-2">
              {CHANNEL_OPTIONS.map(channel => {
                const Icon = channel.icon;
                const isSelected = config.channel === channel.id;

                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => !readOnly && setConfig(prev => ({
                      ...prev,
                      channel: channel.id as 'email' | 'whatsapp' | 'telegram',
                    }))}
                    disabled={readOnly}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors',
                      isSelected
                        ? 'bg-sky-500/20 border-sky-500 text-sky-400'
                        : 'bg-slate-800/50 border-slate-600 text-gray-400 hover:border-slate-500',
                      readOnly && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{channel.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              How notifications will be sent to the master contact
            </p>
          </div>
        </div>
      </div>

      {/* Notification Events */}
      <div className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20">
        <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Notification Events
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {NOTIFICATION_EVENTS.map(event => {
            const isEnabled = config.notifyOn.includes(event.id);

            return (
              <button
                key={event.id}
                type="button"
                onClick={() => toggleNotification(event.id)}
                disabled={readOnly}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                  isEnabled
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-slate-800/30 border-slate-700 hover:border-slate-600',
                  readOnly && 'opacity-50 cursor-not-allowed'
                )}
              >
                <div className={cn(
                  'w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5',
                  isEnabled ? 'bg-emerald-500' : 'bg-slate-700 border border-slate-600'
                )}>
                  {isEnabled && <CheckCircle className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <span className={cn(
                    'block text-sm font-medium',
                    isEnabled ? 'text-emerald-400' : 'text-gray-300'
                  )}>
                    {event.label}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {event.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Escalation Settings */}
      <div className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20">
        <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Escalation Settings
        </h4>

        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Escalation Timeout (minutes)
          </label>
          <input
            type="number"
            min={5}
            max={1440}
            value={config.escalationTimeoutMinutes}
            onChange={(e) => !readOnly && setConfig(prev => ({
              ...prev,
              escalationTimeoutMinutes: parseInt(e.target.value) || 60,
            }))}
            disabled={readOnly}
            className={cn(
              'w-full px-3 py-2 text-sm bg-slate-800/50 border border-slate-600 rounded-lg text-white',
              'focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500',
              readOnly && 'opacity-50 cursor-not-allowed'
            )}
          />
          <p className="text-xs text-gray-500 mt-1.5">
            If the master contact doesn't respond within this time, actions may be auto-escalated
            or timed out. Range: 5-1440 minutes (24 hours).
          </p>
        </div>
      </div>

      {/* Current Status */}
      {config.contactId && config.displayName && (
        <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-lg">
          <div className="flex items-center gap-3">
            {config.avatar ? (
              <img
                src={config.avatar}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center">
                <UserCog className="w-5 h-5 text-sky-400" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-white">{config.displayName}</p>
              <p className="text-xs text-sky-400">
                Will receive {config.notifyOn.length} notification type{config.notifyOn.length !== 1 ? 's' : ''} via {config.channel}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

MasterContactPanel.displayName = 'MasterContactPanel';

export default MasterContactPanel;
