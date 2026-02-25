import React, { useState, useEffect } from 'react';
import {
  Bell,
  Mail,
  Smartphone,
  MessageSquare,
  Users,
  Zap,
  AlertTriangle,
  Shield,
  Moon,
  Clock,
  Save,
  Loader2,
} from 'lucide-react';
import { Card, CardHeader, CardBody, CardFooter } from '../common/Card';
import { Button } from '../common/Button';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * Notification settings interface
 */
interface NotificationConfig {
  // Global toggles
  emailNotifications: boolean;
  pushNotifications: boolean;

  // Notification types
  newMessages: boolean;
  agentStatusChanges: boolean;
  swarmEvents: boolean;
  flowExecutionAlerts: boolean;
  securityAlerts: boolean;

  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

/**
 * Toggle switch component for notification settings
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
 * Notification item row component
 */
interface NotificationItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  icon,
  title,
  description,
  enabled,
  onChange,
  disabled,
}) => (
  <div className={cn(
    'flex items-center justify-between py-4 border-b border-slate-700 last:border-0',
    disabled && 'opacity-50'
  )}>
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-gray-400">
        {icon}
      </div>
      <div>
        <p className="text-white font-medium">{title}</p>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
    </div>
    <ToggleSwitch enabled={enabled} onChange={onChange} disabled={disabled} />
  </div>
);

/**
 * NotificationSettings Component
 *
 * Manages user notification preferences including email/push toggles,
 * notification types, and quiet hours configuration.
 */
export const NotificationSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [config, setConfig] = useState<NotificationConfig>({
    emailNotifications: true,
    pushNotifications: true,
    newMessages: true,
    agentStatusChanges: true,
    swarmEvents: true,
    flowExecutionAlerts: true,
    securityAlerts: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
  });

  // Fetch notification settings on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get('/users/notifications');
      setConfig(response.data);
    } catch (error) {
      console.error('Failed to fetch notification settings:', error);
      // Keep default values on error
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = <K extends keyof NotificationConfig>(
    key: K,
    value: NotificationConfig[K]
  ) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/users/notifications', config);
      toast.success('Notification settings saved');
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to save notification settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Check if all notification types are disabled
  const allTypesDisabled = !config.emailNotifications && !config.pushNotifications;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global Notification Channels */}
      <Card variant="pressed">
        <CardHeader
          title="Notification Channels"
          subtitle="Choose how you want to receive notifications"
        />
        <CardBody>
          <div className="space-y-1">
            <NotificationItem
              icon={<Mail className="w-5 h-5" />}
              title="Email Notifications"
              description="Receive notifications via email"
              enabled={config.emailNotifications}
              onChange={(enabled) => updateConfig('emailNotifications', enabled)}
            />
            <NotificationItem
              icon={<Smartphone className="w-5 h-5" />}
              title="Push Notifications"
              description="Receive browser push notifications"
              enabled={config.pushNotifications}
              onChange={(enabled) => updateConfig('pushNotifications', enabled)}
            />
          </div>
        </CardBody>
      </Card>

      {/* Notification Types */}
      <Card variant="pressed">
        <CardHeader
          title="Notification Types"
          subtitle="Select which events you want to be notified about"
        />
        <CardBody>
          {allTypesDisabled && (
            <div className="mb-4 p-3 bg-amber-500/10 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-400">
                Enable email or push notifications above to receive these alerts
              </p>
            </div>
          )}
          <div className="space-y-1">
            <NotificationItem
              icon={<MessageSquare className="w-5 h-5" />}
              title="New Messages"
              description="Get notified when new messages arrive"
              enabled={config.newMessages}
              onChange={(enabled) => updateConfig('newMessages', enabled)}
              disabled={allTypesDisabled}
            />
            <NotificationItem
              icon={<Users className="w-5 h-5" />}
              title="Agent Status Changes"
              description="Get notified when agents go online/offline"
              enabled={config.agentStatusChanges}
              onChange={(enabled) => updateConfig('agentStatusChanges', enabled)}
              disabled={allTypesDisabled}
            />
            <NotificationItem
              icon={<Bell className="w-5 h-5" />}
              title="Swarm Events"
              description="Handoffs, collaborations, and consensus updates"
              enabled={config.swarmEvents}
              onChange={(enabled) => updateConfig('swarmEvents', enabled)}
              disabled={allTypesDisabled}
            />
            <NotificationItem
              icon={<Zap className="w-5 h-5" />}
              title="Flow Execution Alerts"
              description="Get notified about flow execution status"
              enabled={config.flowExecutionAlerts}
              onChange={(enabled) => updateConfig('flowExecutionAlerts', enabled)}
              disabled={allTypesDisabled}
            />
            <NotificationItem
              icon={<Shield className="w-5 h-5" />}
              title="Security Alerts"
              description="Important security-related notifications"
              enabled={config.securityAlerts}
              onChange={(enabled) => updateConfig('securityAlerts', enabled)}
              disabled={allTypesDisabled}
            />
          </div>
        </CardBody>
      </Card>

      {/* Quiet Hours */}
      <Card variant="pressed">
        <CardHeader
          title="Quiet Hours"
          subtitle="Set a time period when notifications will be silenced"
        />
        <CardBody>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-gray-400">
                  <Moon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white font-medium">Enable Quiet Hours</p>
                  <p className="text-sm text-gray-400">
                    Pause notifications during set hours
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={config.quietHoursEnabled}
                onChange={(enabled) => updateConfig('quietHoursEnabled', enabled)}
              />
            </div>

            {config.quietHoursEnabled && (
              <div className="ml-13 pl-10 border-l-2 border-slate-700">
                <div className="grid grid-cols-2 gap-4">
                  {/* Start Time */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-gray-300">
                      Start Time
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                        <Clock className="w-4 h-4" />
                      </div>
                      <input
                        type="time"
                        value={config.quietHoursStart}
                        onChange={(e) => updateConfig('quietHoursStart', e.target.value)}
                        className={cn(
                          'w-full rounded-lg border bg-slate-800/50 text-white',
                          'pl-10 pr-4 py-2 text-sm',
                          'transition-colors duration-200',
                          'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-900',
                          'border-slate-600 focus:border-sky-500 focus:ring-sky-500/50'
                        )}
                      />
                    </div>
                  </div>

                  {/* End Time */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-gray-300">
                      End Time
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                        <Clock className="w-4 h-4" />
                      </div>
                      <input
                        type="time"
                        value={config.quietHoursEnd}
                        onChange={(e) => updateConfig('quietHoursEnd', e.target.value)}
                        className={cn(
                          'w-full rounded-lg border bg-slate-800/50 text-white',
                          'pl-10 pr-4 py-2 text-sm',
                          'transition-colors duration-200',
                          'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-900',
                          'border-slate-600 focus:border-sky-500 focus:ring-sky-500/50'
                        )}
                      />
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Notifications will be paused from {config.quietHoursStart} to {config.quietHoursEnd}
                </p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={<Save className="w-4 h-4" />}
          onClick={handleSave}
          loading={saving}
          disabled={!isDirty || saving}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default NotificationSettings;
