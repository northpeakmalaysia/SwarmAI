import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Edit3,
  Play,
  Pause,
  Calendar,
  RefreshCw,
  Zap,
  Mail,
  FileText,
  Brain,
  CheckCircle,
  Activity,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDateTime } from '@/utils/dateFormat';

// Types
interface Schedule {
  id: string;
  agenticId: string;
  title: string;
  description?: string;
  scheduleType: 'cron' | 'interval' | 'once' | 'event';
  cronExpression?: string;
  intervalMinutes?: number;
  nextRunAt?: string;
  lastRunAt?: string;
  actionType: string;
  actionConfig: Record<string, unknown>;
  customPrompt?: string;
  createdBy: 'user' | 'self';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulesPanelProps {
  /** Agentic profile ID */
  agenticId: string;
  /** Additional className */
  className?: string;
}

// Action type configurations
const actionTypeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  check_messages: { icon: Mail, color: 'text-blue-400', label: 'Check Messages' },
  send_report: { icon: FileText, color: 'text-green-400', label: 'Send Report' },
  review_tasks: { icon: CheckCircle, color: 'text-yellow-400', label: 'Review Tasks' },
  update_knowledge: { icon: Brain, color: 'text-purple-400', label: 'Update Knowledge' },
  custom_prompt: { icon: Zap, color: 'text-orange-400', label: 'Custom Prompt' },
  self_reflect: { icon: Brain, color: 'text-teal-400', label: 'Self Reflect' },
  health_summary: { icon: Activity, color: 'text-emerald-400', label: 'Health Summary' },
  reasoning_cycle: { icon: Brain, color: 'text-violet-400', label: 'AI Reasoning Cycle' },
};

// Schedule type configs
const scheduleTypeConfig: Record<string, { icon: React.ElementType; label: string }> = {
  cron: { icon: Calendar, label: 'Cron Schedule' },
  interval: { icon: RefreshCw, label: 'Interval' },
  once: { icon: Clock, label: 'One-time' },
  event: { icon: Zap, label: 'Event-triggered' },
};

// Common cron presets
const cronPresets = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every Monday at 9am', value: '0 9 * * 1' },
  { label: 'Every weekday at 9am', value: '0 9 * * 1-5' },
  { label: 'First day of month', value: '0 9 1 * *' },
];

const formatRelativeTime = (dateString?: string): string => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 0) return 'Overdue';
  if (diffMins < 60) return `In ${diffMins} minutes`;
  if (diffMins < 1440) return `In ${Math.round(diffMins / 60)} hours`;
  return `In ${Math.round(diffMins / 1440)} days`;
};

/**
 * SchedulesPanel - Displays and manages schedules for an agentic profile
 */
export const SchedulesPanel: React.FC<SchedulesPanelProps> = ({
  agenticId,
  className,
}) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    scheduleType: 'interval' as Schedule['scheduleType'],
    cronExpression: '',
    intervalMinutes: 60,
    actionType: 'check_messages' as string,
    customPrompt: '',
    isActive: true,
  });

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/agentic/profiles/${agenticId}/schedules`);
      setSchedules(response.data.schedules || []);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
      toast.error('Failed to load schedules');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Reset form
  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      scheduleType: 'interval',
      cronExpression: '',
      intervalMinutes: 60,
      actionType: 'check_messages',
      customPrompt: '',
      isActive: true,
    });
    setEditingSchedule(null);
  };

  // Open modal for new schedule
  const handleAddSchedule = () => {
    resetForm();
    setShowModal(true);
  };

  // Open modal for editing
  const handleEditSchedule = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setFormData({
      title: schedule.title,
      description: schedule.description || '',
      scheduleType: schedule.scheduleType,
      cronExpression: schedule.cronExpression || '',
      intervalMinutes: schedule.intervalMinutes || 60,
      actionType: schedule.actionType,
      customPrompt: schedule.customPrompt || '',
      isActive: schedule.isActive,
    });
    setShowModal(true);
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingSchedule) {
        await api.put(`/agentic/profiles/${agenticId}/schedules/${editingSchedule.id}`, formData);
        toast.success('Schedule updated');
      } else {
        await api.post(`/agentic/profiles/${agenticId}/schedules`, formData);
        toast.success('Schedule created');
      }
      setShowModal(false);
      resetForm();
      fetchSchedules();
    } catch (error) {
      console.error('Failed to save schedule:', error);
      toast.error(editingSchedule ? 'Failed to update schedule' : 'Failed to create schedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete schedule
  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    setDeletingId(scheduleId);
    try {
      await api.delete(`/agentic/profiles/${agenticId}/schedules/${scheduleId}`);
      toast.success('Schedule deleted');
      fetchSchedules();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      toast.error('Failed to delete schedule');
    } finally {
      setDeletingId(null);
    }
  };

  // Toggle schedule active status
  const handleToggleActive = async (schedule: Schedule) => {
    try {
      await api.put(`/agentic/profiles/${agenticId}/schedules/${schedule.id}`, {
        isActive: !schedule.isActive,
      });
      toast.success(schedule.isActive ? 'Schedule paused' : 'Schedule activated');
      fetchSchedules();
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
      toast.error('Failed to update schedule');
    }
  };

  // Run schedule manually
  const handleRunNow = async (scheduleId: string) => {
    setRunningId(scheduleId);
    try {
      await api.post(`/agentic/profiles/${agenticId}/schedules/${scheduleId}/run`);
      toast.success('Schedule triggered');
      fetchSchedules();
    } catch (error) {
      console.error('Failed to run schedule:', error);
      toast.error('Failed to run schedule');
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-400">Scheduled Tasks</h4>
        <Button
          size="sm"
          variant="primary"
          onClick={handleAddSchedule}
          icon={<Plus className="w-4 h-4" />}
        >
          Add Schedule
        </Button>
      </div>

      {/* Schedules List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No scheduled tasks yet</p>
          <p className="text-xs mt-1">Create schedules for automated agent actions</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {schedules.map((schedule) => {
            const actionConfig = actionTypeConfig[schedule.actionType] || actionTypeConfig.custom_prompt;
            const ActionIcon = actionConfig.icon;
            const scheduleConfig = scheduleTypeConfig[schedule.scheduleType];
            const ScheduleIcon = scheduleConfig?.icon || Clock;

            return (
              <div
                key={schedule.id}
                className={cn(
                  'p-4 bg-swarm-darker rounded-lg border transition-colors',
                  schedule.isActive
                    ? 'border-swarm-border/20 hover:border-swarm-border/40'
                    : 'border-swarm-border/10 opacity-60'
                )}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ActionIcon className={cn('w-4 h-4', actionConfig.color)} />
                    <span className="font-medium text-white">{schedule.title}</span>
                    <Badge
                      variant={schedule.isActive ? 'success' : 'default'}
                      size="sm"
                    >
                      {schedule.isActive ? 'Active' : 'Paused'}
                    </Badge>
                    {schedule.createdBy === 'self' && (
                      <Badge variant="info" size="sm">Self-created</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleRunNow(schedule.id)}
                      disabled={runningId === schedule.id}
                      className="p-1 text-gray-400 hover:text-green-400 transition-colors disabled:opacity-50"
                      title="Run now"
                    >
                      <Play className={cn('w-4 h-4', runningId === schedule.id && 'animate-pulse')} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(schedule)}
                      className="p-1 text-gray-400 hover:text-yellow-400 transition-colors"
                      title={schedule.isActive ? 'Pause' : 'Resume'}
                    >
                      {schedule.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleEditSchedule(schedule)}
                      className="p-1 text-gray-400 hover:text-sky-400 transition-colors"
                      title="Edit schedule"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteSchedule(schedule.id)}
                      disabled={deletingId === schedule.id}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Delete schedule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                {schedule.description && (
                  <p className="text-sm text-gray-400 mb-3">{schedule.description}</p>
                )}

                {/* Schedule Info */}
                <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-2">
                  <span className="flex items-center gap-1">
                    <ScheduleIcon className="w-3 h-3" />
                    {schedule.scheduleType === 'cron' && schedule.cronExpression}
                    {schedule.scheduleType === 'interval' && `Every ${schedule.intervalMinutes} minutes`}
                    {schedule.scheduleType === 'once' && 'One-time'}
                    {schedule.scheduleType === 'event' && 'Event-triggered'}
                  </span>
                  <span className="flex items-center gap-1">
                    <ActionIcon className="w-3 h-3" />
                    {actionConfig.label}
                  </span>
                </div>

                {/* Custom prompt preview */}
                {schedule.actionType === 'custom_prompt' && schedule.customPrompt && (
                  <p className="text-xs text-gray-500 italic mb-2 line-clamp-2">
                    Prompt: {schedule.customPrompt}
                  </p>
                )}

                {/* Timing Info */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-swarm-border/10">
                  <span>
                    Last run: {formatDateTime(schedule.lastRunAt)}
                  </span>
                  {schedule.isActive && schedule.nextRunAt && (
                    <span className="text-sky-400">
                      Next: {formatRelativeTime(schedule.nextRunAt)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          resetForm();
        }}
        title={editingSchedule ? 'Edit Schedule' : 'Add New Schedule'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Title <span className="text-red-400">*</span>
            </label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Daily Email Check"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this schedule does..."
              className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              rows={2}
            />
          </div>

          {/* Schedule Type and Action */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Schedule Type
              </label>
              <select
                value={formData.scheduleType}
                onChange={(e) => setFormData({ ...formData, scheduleType: e.target.value as Schedule['scheduleType'] })}
                className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white"
                title="Select schedule type"
                aria-label="Schedule Type"
              >
                <option value="interval">Interval</option>
                <option value="cron">Cron Expression</option>
                <option value="once">One-time</option>
                <option value="event">Event-triggered</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Action Type
              </label>
              <select
                value={formData.actionType}
                onChange={(e) => setFormData({ ...formData, actionType: e.target.value })}
                className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white"
                title="Select action type"
                aria-label="Action Type"
              >
                {Object.entries(actionTypeConfig).map(([type, config]) => (
                  <option key={type} value={type}>{config.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Interval Minutes */}
          {formData.scheduleType === 'interval' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Interval (minutes)
              </label>
              <Input
                type="number"
                min="1"
                value={formData.intervalMinutes}
                onChange={(e) => setFormData({ ...formData, intervalMinutes: parseInt(e.target.value) || 60 })}
              />
            </div>
          )}

          {/* Cron Expression */}
          {formData.scheduleType === 'cron' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Cron Expression
              </label>
              <Input
                value={formData.cronExpression}
                onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                placeholder="0 9 * * *"
              />
              <div className="flex flex-wrap gap-1 mt-2">
                {cronPresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, cronExpression: preset.value })}
                    className="px-2 py-0.5 text-xs bg-swarm-dark hover:bg-sky-500/20 text-gray-400 hover:text-sky-400 rounded transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Prompt */}
          {formData.actionType === 'custom_prompt' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Custom Prompt
              </label>
              <textarea
                value={formData.customPrompt}
                onChange={(e) => setFormData({ ...formData, customPrompt: e.target.value })}
                placeholder="Enter the prompt to execute..."
                className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                rows={3}
              />
            </div>
          )}

          {/* Active Toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 rounded bg-swarm-dark border-swarm-border/30"
            />
            <label htmlFor="isActive" className="text-sm text-gray-300">
              Active (schedule will run automatically)
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowModal(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SchedulesPanel;
