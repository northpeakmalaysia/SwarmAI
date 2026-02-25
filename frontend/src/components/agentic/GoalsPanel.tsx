import React, { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Plus,
  Trash2,
  Edit3,
  CheckCircle,
  Clock,
  AlertCircle,
  PauseCircle,
  TrendingUp,
  Calendar,
  Flag,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDate } from '@/utils/dateFormat';

// Types
interface Goal {
  id: string;
  agenticId: string;
  title: string;
  description?: string;
  goalType: 'ongoing' | 'deadline' | 'milestone';
  targetMetric?: string;
  targetValue?: string;
  currentValue?: string;
  progress: number;
  deadlineAt?: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'active' | 'paused' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface GoalsPanelProps {
  /** Agentic profile ID */
  agenticId: string;
  /** Additional className */
  className?: string;
}

// Status badge configurations
const statusConfig = {
  active: { color: 'success' as const, icon: TrendingUp, label: 'Active' },
  paused: { color: 'warning' as const, icon: PauseCircle, label: 'Paused' },
  completed: { color: 'info' as const, icon: CheckCircle, label: 'Completed' },
  failed: { color: 'error' as const, icon: AlertCircle, label: 'Failed' },
};

const priorityColors = {
  low: 'text-gray-400',
  normal: 'text-blue-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

/**
 * GoalsPanel - Displays and manages goals for an agentic profile
 */
export const GoalsPanel: React.FC<GoalsPanelProps> = ({
  agenticId,
  className,
}) => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goalType: 'ongoing' as Goal['goalType'],
    targetMetric: '',
    targetValue: '',
    deadlineAt: '',
    priority: 'normal' as Goal['priority'],
  });

  // Fetch goals
  const fetchGoals = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const response = await api.get(`/agentic/profiles/${agenticId}/goals${params}`);
      setGoals(response.data.goals || []);
    } catch (error) {
      console.error('Failed to fetch goals:', error);
      toast.error('Failed to load goals');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId, statusFilter]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // Reset form
  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      goalType: 'ongoing',
      targetMetric: '',
      targetValue: '',
      deadlineAt: '',
      priority: 'normal',
    });
    setEditingGoal(null);
  };

  // Open modal for new goal
  const handleAddGoal = () => {
    resetForm();
    setShowModal(true);
  };

  // Open modal for editing
  const handleEditGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setFormData({
      title: goal.title,
      description: goal.description || '',
      goalType: goal.goalType,
      targetMetric: goal.targetMetric || '',
      targetValue: goal.targetValue || '',
      deadlineAt: goal.deadlineAt ? goal.deadlineAt.split('T')[0] : '',
      priority: goal.priority,
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
      if (editingGoal) {
        await api.put(`/agentic/profiles/${agenticId}/goals/${editingGoal.id}`, formData);
        toast.success('Goal updated');
      } else {
        await api.post(`/agentic/profiles/${agenticId}/goals`, formData);
        toast.success('Goal created');
      }
      setShowModal(false);
      resetForm();
      fetchGoals();
    } catch (error) {
      console.error('Failed to save goal:', error);
      toast.error(editingGoal ? 'Failed to update goal' : 'Failed to create goal');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete goal
  const handleDeleteGoal = async (goalId: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;

    setDeletingId(goalId);
    try {
      await api.delete(`/agentic/profiles/${agenticId}/goals/${goalId}`);
      toast.success('Goal deleted');
      fetchGoals();
    } catch (error) {
      console.error('Failed to delete goal:', error);
      toast.error('Failed to delete goal');
    } finally {
      setDeletingId(null);
    }
  };

  // Update goal status
  const handleUpdateStatus = async (goal: Goal, newStatus: Goal['status']) => {
    try {
      await api.put(`/agentic/profiles/${agenticId}/goals/${goal.id}`, { status: newStatus });
      toast.success(`Goal marked as ${newStatus}`);
      fetchGoals();
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update goal status');
    }
  };

  // Update progress
  const handleUpdateProgress = async (goal: Goal, increment: number) => {
    try {
      await api.put(`/agentic/profiles/${agenticId}/goals/${goal.id}/progress`, { increment });
      fetchGoals();
    } catch (error) {
      console.error('Failed to update progress:', error);
      toast.error('Failed to update progress');
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-400">Goals & Objectives</h4>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 text-xs bg-swarm-dark border border-swarm-border/30 rounded text-gray-300"
            title="Filter by status"
            aria-label="Filter by status"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <Button
            size="sm"
            variant="primary"
            onClick={handleAddGoal}
            icon={<Plus className="w-4 h-4" />}
          >
            Add Goal
          </Button>
        </div>
      </div>

      {/* Goals List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No goals defined yet</p>
          <p className="text-xs mt-1">Add goals to track agent progress</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {goals.map((goal) => {
            const StatusIcon = statusConfig[goal.status].icon;
            return (
              <div
                key={goal.id}
                className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20 hover:border-swarm-border/40 transition-colors"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Target className={cn('w-4 h-4', priorityColors[goal.priority])} />
                    <span className="font-medium text-white">{goal.title}</span>
                    <Badge variant={statusConfig[goal.status].color} size="sm">
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {statusConfig[goal.status].label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditGoal(goal)}
                      className="p-1 text-gray-400 hover:text-sky-400 transition-colors"
                      title="Edit goal"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteGoal(goal.id)}
                      disabled={deletingId === goal.id}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Delete goal"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                {goal.description && (
                  <p className="text-sm text-gray-400 mb-3">{goal.description}</p>
                )}

                {/* Progress Bar */}
                {goal.targetValue && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>Progress: {goal.currentValue || '0'} / {goal.targetValue} {goal.targetMetric}</span>
                      <span>{goal.progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-swarm-dark rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full transition-all duration-300',
                          goal.progress >= 100 ? 'bg-green-500' :
                          goal.progress >= 75 ? 'bg-sky-500' :
                          goal.progress >= 50 ? 'bg-yellow-500' : 'bg-orange-500'
                        )}
                        style={{ width: `${Math.min(100, goal.progress)}%` }}
                      />
                    </div>
                    {goal.status === 'active' && (
                      <div className="flex gap-1 mt-2">
                        <button
                          onClick={() => handleUpdateProgress(goal, 1)}
                          className="px-2 py-0.5 text-xs bg-swarm-dark hover:bg-sky-500/20 text-gray-300 rounded transition-colors"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => handleUpdateProgress(goal, 5)}
                          className="px-2 py-0.5 text-xs bg-swarm-dark hover:bg-sky-500/20 text-gray-300 rounded transition-colors"
                        >
                          +5
                        </button>
                        <button
                          onClick={() => handleUpdateProgress(goal, 10)}
                          className="px-2 py-0.5 text-xs bg-swarm-dark hover:bg-sky-500/20 text-gray-300 rounded transition-colors"
                        >
                          +10
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Flag className={cn('w-3 h-3', priorityColors[goal.priority])} />
                      {goal.priority}
                    </span>
                    {goal.deadlineAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(goal.deadlineAt)}
                      </span>
                    )}
                  </div>
                  {goal.status === 'active' && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleUpdateStatus(goal, 'paused')}
                        className="px-2 py-0.5 text-xs hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors"
                      >
                        Pause
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(goal, 'completed')}
                        className="px-2 py-0.5 text-xs hover:bg-green-500/20 text-green-400 rounded transition-colors"
                      >
                        Complete
                      </button>
                    </div>
                  )}
                  {goal.status === 'paused' && (
                    <button
                      onClick={() => handleUpdateStatus(goal, 'active')}
                      className="px-2 py-0.5 text-xs hover:bg-sky-500/20 text-sky-400 rounded transition-colors"
                    >
                      Resume
                    </button>
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
        title={editingGoal ? 'Edit Goal' : 'Add New Goal'}
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
              placeholder="e.g., Process 100 emails per day"
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
              placeholder="Describe what this goal aims to achieve..."
              className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              rows={2}
            />
          </div>

          {/* Type and Priority Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Goal Type
              </label>
              <select
                value={formData.goalType}
                onChange={(e) => setFormData({ ...formData, goalType: e.target.value as Goal['goalType'] })}
                className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white"
                title="Select goal type"
                aria-label="Goal Type"
              >
                <option value="ongoing">Ongoing</option>
                <option value="deadline">Deadline-based</option>
                <option value="milestone">Milestone</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as Goal['priority'] })}
                className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white"
                title="Select priority"
                aria-label="Priority"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Target Metric
              </label>
              <Input
                value={formData.targetMetric}
                onChange={(e) => setFormData({ ...formData, targetMetric: e.target.value })}
                placeholder="e.g., emails, tasks, responses"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Target Value
              </label>
              <Input
                type="number"
                value={formData.targetValue}
                onChange={(e) => setFormData({ ...formData, targetValue: e.target.value })}
                placeholder="e.g., 100"
              />
            </div>
          </div>

          {/* Deadline */}
          {(formData.goalType === 'deadline' || formData.goalType === 'milestone') && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Deadline
              </label>
              <Input
                type="date"
                value={formData.deadlineAt}
                onChange={(e) => setFormData({ ...formData, deadlineAt: e.target.value })}
              />
            </div>
          )}

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
              {editingGoal ? 'Update Goal' : 'Create Goal'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default GoalsPanel;
