import React, { useState, useEffect, useCallback } from 'react';
import {
  ListChecks,
  Plus,
  Filter,
  Search,
  Clock,
  AlertCircle,
  CheckCircle2,
  Circle,
  Pause,
  ArrowUpRight,
  User,
  Calendar,
  Tag,
  MoreVertical,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { SearchableSelect, SelectOption } from '../common/SearchableSelect';
import { useAuthStore } from '../../stores/authStore';
import { formatRelativeTime } from '@/utils/dateFormat';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedTo?: string;
  assigneeName?: string;
  assigneeRole?: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  estimatedHours?: number;
  taskType?: string;
  parentTaskId?: string;
  subtasks?: Task[];
}

export interface TaskTrackingPanelProps {
  agenticId: string;
  className?: string;
}

const statusConfig: Record<Task['status'], { icon: React.ReactNode; color: string; bgColor: string; label: string }> = {
  pending: { icon: <Circle className="w-4 h-4" />, color: 'text-gray-400', bgColor: 'bg-gray-500/20', label: 'Pending' },
  in_progress: { icon: <Clock className="w-4 h-4" />, color: 'text-blue-400', bgColor: 'bg-blue-500/20', label: 'In Progress' },
  completed: { icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', label: 'Completed' },
  blocked: { icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-400', bgColor: 'bg-red-500/20', label: 'Blocked' },
  cancelled: { icon: <X className="w-4 h-4" />, color: 'text-gray-500', bgColor: 'bg-gray-600/20', label: 'Cancelled' },
};

const priorityConfig: Record<Task['priority'], { color: string; bgColor: string; label: string }> = {
  urgent: { color: 'text-red-400', bgColor: 'bg-red-500/20', label: 'Urgent' },
  high: { color: 'text-orange-400', bgColor: 'bg-orange-500/20', label: 'High' },
  normal: { color: 'text-blue-400', bgColor: 'bg-blue-500/20', label: 'Normal' },
  low: { color: 'text-gray-400', bgColor: 'bg-gray-500/20', label: 'Low' },
};

/**
 * TaskTrackingPanel - Comprehensive task management for agentic profiles
 */
export const TaskTrackingPanel: React.FC<TaskTrackingPanelProps> = ({
  agenticId,
  className,
}) => {
  const { token } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Task['status'] | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<Task['priority'] | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Create task modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'normal' as Task['priority'],
    assignedTo: null as string | null,
    dueAt: '',
    taskType: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  // Team members for assignment
  const [teamMembers, setTeamMembers] = useState<SelectOption[]>([]);

  // Expanded subtasks
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);

      const response = await fetch(
        `/api/agentic/profiles/${agenticId}/tasks?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Failed to fetch tasks');

      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId, token, statusFilter, priorityFilter]);

  // Fetch team members for assignment dropdown
  const fetchTeamMembers = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/agentic/profiles/${agenticId}/team`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) return;

      const data = await response.json();
      const members = (data.members || []).map((m: any) => ({
        value: m.id,
        label: m.contactName || m.role,
        description: m.role,
      }));
      setTeamMembers(members);
    } catch (err) {
      console.error('Failed to fetch team members:', err);
    }
  }, [agenticId, token]);

  useEffect(() => {
    fetchTasks();
    fetchTeamMembers();
  }, [fetchTasks, fetchTeamMembers]);

  // Filter tasks by search query
  const filteredTasks = tasks.filter(task => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.title.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query) ||
      task.assigneeName?.toLowerCase().includes(query)
    );
  });

  // Group tasks by status for kanban-style view
  const tasksByStatus = {
    pending: filteredTasks.filter(t => t.status === 'pending'),
    in_progress: filteredTasks.filter(t => t.status === 'in_progress'),
    blocked: filteredTasks.filter(t => t.status === 'blocked'),
    completed: filteredTasks.filter(t => t.status === 'completed'),
  };

  // Create task
  const handleCreateTask = async () => {
    if (!newTask.title.trim()) return;

    try {
      setIsCreating(true);

      const response = await fetch(`/api/agentic/profiles/${agenticId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description || undefined,
          priority: newTask.priority,
          assignedTo: newTask.assignedTo || undefined,
          dueAt: newTask.dueAt || undefined,
          taskType: newTask.taskType || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to create task');

      setShowCreateModal(false);
      setNewTask({ title: '', description: '', priority: 'normal', assignedTo: null, dueAt: '', taskType: '' });
      fetchTasks();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setIsCreating(false);
    }
  };

  // Update task status
  const handleUpdateStatus = async (taskId: string, newStatus: Task['status']) => {
    try {
      const response = await fetch(`/api/agentic/profiles/${agenticId}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update task');

      fetchTasks();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  // Auto-assign task
  const handleAutoAssign = async (taskId: string) => {
    try {
      const response = await fetch(`/api/agentic/profiles/${agenticId}/tasks/${taskId}/auto-assign`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to auto-assign task');

      const data = await response.json();
      if (data.success) {
        fetchTasks();
      }
    } catch (err) {
      console.error('Failed to auto-assign:', err);
    }
  };

  // Toggle expanded state for subtasks
  const toggleExpanded = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Task card component
  const TaskCard: React.FC<{ task: Task; depth?: number }> = ({ task, depth = 0 }) => {
    if (!task) return null;
    const status = (task.status && statusConfig[task.status as Task['status']]) || statusConfig.pending;
    const priority = (task.priority && priorityConfig[task.priority as Task['priority']]) || priorityConfig.normal;
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
    const isExpanded = expandedTasks.has(task.id);
    const isOverdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status !== 'completed';

    return (
      <div className={cn('space-y-2', depth > 0 && 'ml-6 border-l border-swarm-border/30 pl-4')}>
        <div
          className={cn(
            'p-4 rounded-xl border transition-all',
            'bg-swarm-darker/50 border-swarm-border/20',
            'hover:bg-swarm-darker hover:border-swarm-border/40',
            isOverdue && 'border-red-500/30'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {hasSubtasks && (
                <button
                  onClick={() => toggleExpanded(task.id)}
                  className="mt-1 text-gray-400 hover:text-white transition-colors"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}

              <button
                onClick={() => {
                  const nextStatus = task.status === 'pending' ? 'in_progress'
                    : task.status === 'in_progress' ? 'completed'
                    : task.status;
                  if (nextStatus !== task.status) {
                    handleUpdateStatus(task.id, nextStatus);
                  }
                }}
                className={cn('mt-1 transition-colors', status.color, 'hover:opacity-80')}
              >
                {status.icon}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    'font-medium text-white truncate',
                    task.status === 'completed' && 'line-through text-gray-500'
                  )}>
                    {task.title}
                  </span>

                  <Badge variant="default" size="sm" className={cn(priority.bgColor, priority.color)}>
                    {priority.label}
                  </Badge>

                  {task.taskType && (
                    <Badge variant="default" size="sm" className="bg-purple-500/20 text-purple-400">
                      {task.taskType}
                    </Badge>
                  )}
                </div>

                {task.description && (
                  <p className="text-sm text-gray-400 mt-1 line-clamp-2">{task.description}</p>
                )}

                <div className="flex items-center gap-4 mt-2 text-xs">
                  {task.assigneeName ? (
                    <span className="flex items-center gap-1 text-gray-400">
                      <User className="w-3 h-3" />
                      {task.assigneeName}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAutoAssign(task.id)}
                      className="flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      Auto-assign
                    </button>
                  )}

                  {task.dueAt && (
                    <span className={cn(
                      'flex items-center gap-1',
                      isOverdue ? 'text-red-400' : 'text-gray-400'
                    )}>
                      <Calendar className="w-3 h-3" />
                      {formatRelativeTime(task.dueAt)}
                    </span>
                  )}

                  {task.tags && task.tags.length > 0 && (
                    <span className="flex items-center gap-1 text-gray-400">
                      <Tag className="w-3 h-3" />
                      {task.tags.slice(0, 2).join(', ')}
                      {task.tags.length > 2 && ` +${task.tags.length - 2}`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex items-center gap-1">
              {task.status === 'pending' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUpdateStatus(task.id, 'in_progress')}
                  className="text-blue-400 hover:text-blue-300"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
              )}
              {task.status === 'in_progress' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUpdateStatus(task.id, 'blocked')}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Pause className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUpdateStatus(task.id, 'completed')}
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </Button>
                </>
              )}
              {task.status === 'blocked' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUpdateStatus(task.id, 'in_progress')}
                  className="text-blue-400 hover:text-blue-300"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Subtasks */}
        {hasSubtasks && isExpanded && (
          <div className="space-y-2">
            {task.subtasks!.map(subtask => (
              <TaskCard key={subtask.id} task={subtask} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-sky-400" />
          <h3 className="font-medium text-white">Task Tracking</h3>
          <Badge variant="default" size="sm">
            {filteredTasks.length} tasks
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && 'bg-sky-500/20 text-sky-400')}
          >
            <Filter className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchTasks}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            New Task
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-swarm-darker/50 rounded-xl border border-swarm-border/20">
          <div className="flex-1 min-w-[200px]">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              size="sm"
              iconLeft={<Search className="w-4 h-4" />}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 text-sm bg-swarm-dark border border-swarm-border/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="completed">Completed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
            className="px-3 py-1.5 text-sm bg-swarm-dark border border-swarm-border/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            <option value="all">All Priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(tasksByStatus).map(([status, statusTasks]) => {
          const config = statusConfig[status as Task['status']] || statusConfig.pending;
          return (
            <div
              key={status}
              className={cn(
                'p-3 rounded-xl border border-swarm-border/20',
                config.bgColor
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn('text-2xl font-bold', config.color)}>
                  {statusTasks.length}
                </span>
                <div className={config.color}>{config.icon}</div>
              </div>
              <span className="text-xs text-gray-400">{config.label}</span>
            </div>
          );
        })}
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-red-400">{error}</p>
          <Button variant="ghost" size="sm" onClick={fetchTasks} className="mt-2">
            Retry
          </Button>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-12">
          <ListChecks className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">No tasks found</p>
          <p className="text-sm text-gray-500 mt-1">Create your first task to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks
            .filter(t => !t.parentTaskId) // Show only root tasks
            .map(task => (
              <TaskCard key={task.id} task={task} />
            ))}
        </div>
      )}

      {/* Create Task Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Task"
        size="md"
      >
        <div className="space-y-4 p-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Task Title *
            </label>
            <Input
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              placeholder="Enter task title..."
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Description
            </label>
            <textarea
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              placeholder="Describe the task..."
              rows={3}
              className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Priority
              </label>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as Task['priority'] })}
                className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Task Type
              </label>
              <Input
                value={newTask.taskType}
                onChange={(e) => setNewTask({ ...newTask, taskType: e.target.value })}
                placeholder="e.g., code_review, bug_fix"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Assign To
            </label>
            <SearchableSelect
              value={newTask.assignedTo}
              onChange={(value) => setNewTask({ ...newTask, assignedTo: value })}
              options={teamMembers}
              placeholder="Select team member..."
              clearable
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Due Date
            </label>
            <Input
              type="datetime-local"
              value={newTask.dueAt}
              onChange={(e) => setNewTask({ ...newTask, dueAt: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-swarm-border/20">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateTask}
              loading={isCreating}
              disabled={!newTask.title.trim()}
            >
              Create Task
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

TaskTrackingPanel.displayName = 'TaskTrackingPanel';

export default TaskTrackingPanel;
