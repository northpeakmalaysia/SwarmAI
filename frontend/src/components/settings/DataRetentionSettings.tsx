import React, { useState, useEffect } from 'react';
import {
  Database,
  HardDrive,
  Clock,
  RefreshCw,
  AlertTriangle,
  Info,
  Save,
  Loader2,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDateTime } from '@/utils/dateFormat';

/**
 * Data retention settings interface
 */
interface DataRetentionConfig {
  redisTtlDays: number;
  sqliteTtlMonths: number;
  autoCleanupEnabled: boolean;
  lastCleanupAt?: string;
}

interface RetentionLimits {
  maxRedisDays: number;
  maxSqliteMonths: number;
}

interface RetentionResponse {
  settings: DataRetentionConfig;
  limits: RetentionLimits;
  defaults: DataRetentionConfig;
  subscriptionPlan: string;
}

/**
 * Slider component for retention settings
 */
interface RetentionSliderProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  unit: string;
  disabled?: boolean;
}

const RetentionSlider: React.FC<RetentionSliderProps> = ({
  label,
  description,
  icon,
  value,
  onChange,
  min,
  max,
  unit,
  disabled,
}) => (
  <div className={cn('py-4 border-b border-slate-700 last:border-0', disabled && 'opacity-50')}>
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-gray-400">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-white font-medium">{label}</p>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
      <Badge variant="info" size="md" className="text-lg px-3 py-1 min-w-[80px] text-center">
        {value} {unit}
      </Badge>
    </div>
    <div className="pl-13 ml-13">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        disabled={disabled}
        className={cn(
          'w-full h-2 rounded-full appearance-none cursor-pointer',
          'bg-slate-700',
          '[&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:w-5',
          '[&::-webkit-slider-thumb]:h-5',
          '[&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-sky-500',
          '[&::-webkit-slider-thumb]:shadow-lg',
          '[&::-webkit-slider-thumb]:cursor-pointer',
          '[&::-webkit-slider-thumb]:transition-transform',
          '[&::-webkit-slider-thumb]:hover:scale-110',
          '[&::-moz-range-thumb]:w-5',
          '[&::-moz-range-thumb]:h-5',
          '[&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:bg-sky-500',
          '[&::-moz-range-thumb]:border-0',
          '[&::-moz-range-thumb]:cursor-pointer',
          disabled && 'cursor-not-allowed'
        )}
      />
      <div className="flex justify-between mt-1 text-xs text-gray-500">
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
    </div>
  </div>
);

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
 * Format date for display
 */
const formatDateLocal = (dateString: string | undefined): string => {
  if (!dateString) return 'Never';
  return formatDateTime(dateString);
};

/**
 * DataRetentionSettings Component
 *
 * Manages data retention settings including:
 * - Redis cache TTL (in days)
 * - SQLite storage TTL (in months)
 * - Auto-cleanup toggle
 */
export const DataRetentionSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [config, setConfig] = useState<DataRetentionConfig>({
    redisTtlDays: 7,
    sqliteTtlMonths: 1,
    autoCleanupEnabled: true,
  });
  const [limits, setLimits] = useState<RetentionLimits>({
    maxRedisDays: 7,
    maxSqliteMonths: 1,
  });
  const [subscriptionPlan, setSubscriptionPlan] = useState('free');

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get<RetentionResponse>('/settings/data-retention');
      setConfig(response.data.settings);
      setLimits(response.data.limits);
      setSubscriptionPlan(response.data.subscriptionPlan);
    } catch (error) {
      console.error('Failed to fetch data retention settings:', error);
      toast.error('Failed to load data retention settings');
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = <K extends keyof DataRetentionConfig>(
    key: K,
    value: DataRetentionConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await api.put<RetentionResponse>('/settings/data-retention', config);
      setConfig(response.data.settings);
      toast.success('Data retention settings saved');
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to save data retention settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const response = await api.post<RetentionResponse>('/settings/data-retention/reset');
      setConfig(response.data.settings);
      toast.success('Settings reset to defaults');
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to reset data retention settings:', error);
      toast.error('Failed to reset settings');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan Notice */}
      <Card>
        <CardBody>
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-medium">
                Your plan: <span className="text-sky-400 capitalize">{subscriptionPlan}</span>
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Maximum retention: {limits.maxRedisDays} days for cache, {limits.maxSqliteMonths} months for storage.
                {subscriptionPlan === 'free' && (
                  <span className="text-amber-400"> Upgrade your plan for longer retention periods.</span>
                )}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Cache Retention (Redis) */}
      <Card>
        <CardHeader
          title="Message Cache Retention"
          subtitle="Configure how long messages are cached in memory for fast access"
        />
        <CardBody>
          <RetentionSlider
            label="Redis Cache TTL"
            description="Messages older than this will be removed from cache"
            icon={<Clock className="w-5 h-5" />}
            value={config.redisTtlDays}
            onChange={(value) => updateConfig('redisTtlDays', value)}
            min={1}
            max={limits.maxRedisDays}
            unit="days"
          />
          <div className="mt-4 p-3 bg-slate-700/50 rounded-lg flex items-start gap-2">
            <Database className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-400">
              Cached messages enable faster retrieval for active conversations and AI context.
              Messages are still stored in permanent storage even after cache expiry.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Permanent Storage Retention (SQLite) */}
      <Card>
        <CardHeader
          title="Permanent Storage Retention"
          subtitle="Configure how long messages are kept in permanent database storage"
        />
        <CardBody>
          <RetentionSlider
            label="Database Storage TTL"
            description="Messages older than this will be permanently deleted"
            icon={<HardDrive className="w-5 h-5" />}
            value={config.sqliteTtlMonths}
            onChange={(value) => updateConfig('sqliteTtlMonths', value)}
            min={1}
            max={limits.maxSqliteMonths}
            unit="months"
          />
          <div className="mt-4 p-3 bg-amber-500/10 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-400">
              <strong>Warning:</strong> Messages deleted from permanent storage cannot be recovered.
              Consider exporting important conversations before they expire.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Auto-Cleanup Settings */}
      <Card>
        <CardHeader
          title="Automatic Cleanup"
          subtitle="Configure automatic data cleanup behavior"
        />
        <CardBody>
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-gray-400">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <p className="text-white font-medium">Enable Auto-Cleanup</p>
                <p className="text-sm text-gray-400">
                  Automatically remove expired data based on retention settings
                </p>
              </div>
            </div>
            <ToggleSwitch
              enabled={config.autoCleanupEnabled}
              onChange={(enabled) => updateConfig('autoCleanupEnabled', enabled)}
            />
          </div>

          {config.lastCleanupAt && (
            <div className="mt-4 p-3 bg-slate-700/50 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">Last cleanup:</span>
              </div>
              <span className="text-sm text-white">{formatDateLocal(config.lastCleanupAt)}</span>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button
          variant="ghost"
          icon={<RotateCcw className="w-4 h-4" />}
          onClick={handleReset}
          loading={resetting}
          disabled={resetting || saving}
        >
          Reset to Defaults
        </Button>
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

export default DataRetentionSettings;
