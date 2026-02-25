import { useMemo, useState } from 'react';
import {
  ListTodo,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Bot,
  FileText,
  MessageSquare,
  Search,
  Zap,
  Users,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSwarmStore, type SwarmTask } from '../../stores/swarmStore';
import { useAgentStore } from '../../stores/agentStore';
import { Badge } from '../common/Badge';
import { formatTime as formatTimeUtil } from '@/utils/dateFormat';

export type TaskType = 'query' | 'collaboration' | 'analysis' | 'response' | 'search';

const getTaskTypeIcon = (type: TaskType) => {
  switch (type) {
    case 'query':
      return <MessageSquare className="w-3.5 h-3.5" />;
    case 'collaboration':
      return <Users className="w-3.5 h-3.5" />;
    case 'analysis':
      return <FileText className="w-3.5 h-3.5" />;
    case 'response':
      return <Zap className="w-3.5 h-3.5" />;
    case 'search':
      return <Search className="w-3.5 h-3.5" />;
    default:
      return <ListTodo className="w-3.5 h-3.5" />;
  }
};

const getTaskTypeLabel = (type: TaskType) => {
  switch (type) {
    case 'query':
      return 'Query';
    case 'collaboration':
      return 'Collaboration';
    case 'analysis':
      return 'Analysis';
    case 'response':
      return 'Response';
    case 'search':
      return 'Search';
  }
};

const getStatusIcon = (status: SwarmTask['status']) => {
  switch (status) {
    case 'pending':
      return <Clock className="w-3.5 h-3.5 text-gray-400" />;
    case 'in_progress':
      return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case 'failed':
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    default:
      return null;
  }
};

const getStatusBadgeVariant = (status: SwarmTask['status']) => {
  switch (status) {
    case 'pending':
      return 'default';
    case 'in_progress':
      return 'warning';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
};

const formatTime = (dateString: string): string => {
  return formatTimeUtil(dateString);
};

interface ExtendedTask extends SwarmTask {
  type: TaskType;
  progress?: number;
  assignedAgentNames?: string[];
}

interface TaskItemProps {
  task: ExtendedTask;
  onClick?: (task: ExtendedTask) => void;
}

const TaskItem = ({ task, onClick }: TaskItemProps) => {
  const progress = task.progress || (task.status === 'completed' ? 100 : task.status === 'in_progress' ? 50 : 0);

  return (
    <div
      className={cn(
        'p-3 bg-swarm-dark rounded-xl border border-swarm-border/30 shadow-neu-pressed-sm',
        'hover:shadow-neu-pressed-glow transition-all duration-300 cursor-pointer'
      )}
      onClick={() => onClick?.(task)}
    >
      {/* Header with type and status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-slate-700/50 rounded">
            {getTaskTypeIcon(task.type)}
          </div>
          <span className="text-xs text-gray-400">{getTaskTypeLabel(task.type)}</span>
        </div>
        <Badge variant={getStatusBadgeVariant(task.status)} size="sm">
          <span className="flex items-center gap-1">
            {getStatusIcon(task.status)}
            {task.status === 'in_progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
          </span>
        </Badge>
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-white mb-1 line-clamp-1">
        {task.title}
      </h4>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-gray-400 mb-2 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Progress bar for in-progress tasks */}
      {task.status === 'in_progress' && (
        <div className="mb-2">
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Assigned agents */}
      {task.assignedAgentNames && task.assignedAgentNames.length > 0 && (
        <div className="flex items-center gap-1 mb-2">
          <Bot className="w-3 h-3 text-gray-500" />
          <div className="flex items-center gap-1">
            {task.assignedAgentNames.slice(0, 3).map((name, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 bg-slate-700 rounded text-xs text-gray-300"
              >
                {name}
              </span>
            ))}
            {task.assignedAgentNames.length > 3 && (
              <span className="text-xs text-gray-500">
                +{task.assignedAgentNames.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Created {formatTime(task.createdAt)}
        </span>
        {task.completedAt && (
          <span className="text-emerald-400">
            Completed {formatTime(task.completedAt)}
          </span>
        )}
      </div>
    </div>
  );
};

export interface TaskListProps {
  className?: string;
  maxItems?: number;
  onTaskClick?: (task: SwarmTask) => void;
}

/**
 * TaskList displays swarm tasks with status, type icons, assigned agents,
 * and progress indicators.
 */
export function TaskList({
  className,
  maxItems = 5,
  onTaskClick,
}: TaskListProps) {
  const { tasks, isLoading } = useSwarmStore();
  const { agents } = useAgentStore();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Enhance tasks with type and agent names - uses real data only
  const enhancedTasks = useMemo<ExtendedTask[]>(() => {
    // Map task type from backend or infer from title/description
    const inferTaskType = (task: SwarmTask): TaskType => {
      const typeMap: Record<string, TaskType> = {
        collaboration: 'collaboration',
        parallel: 'collaboration',
        sequential: 'analysis',
        voting: 'query',
      };
      // Check if task has a type property (from backend)
      const backendType = (task as any).type as string | undefined;
      if (backendType && typeMap[backendType]) {
        return typeMap[backendType];
      }
      // Infer from title/description
      const text = `${task.title} ${task.description}`.toLowerCase();
      if (text.includes('search') || text.includes('find')) return 'search';
      if (text.includes('collaborate') || text.includes('team')) return 'collaboration';
      if (text.includes('analyze') || text.includes('analysis')) return 'analysis';
      if (text.includes('respond') || text.includes('reply')) return 'response';
      return 'query';
    };

    return tasks.map((task) => {
      // Map agent IDs to names
      const assignedAgentNames = task.assignedAgents
        .map((id) => agents.find((a) => a.id === id)?.name)
        .filter((name): name is string => !!name);

      return {
        ...task,
        type: inferTaskType(task),
        progress: task.status === 'in_progress' ? 50 : undefined,
        assignedAgentNames,
      };
    });
  }, [tasks, agents]);

  // Filter tasks - no more mock data fallback
  const filteredTasks = useMemo(() => {
    return enhancedTasks
      .filter((task) => {
        if (filter === 'active')
          return task.status === 'in_progress' || task.status === 'pending';
        if (filter === 'completed') return task.status === 'completed';
        return true;
      })
      .slice(0, maxItems);
  }, [enhancedTasks, filter, maxItems]);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  const activeCount = enhancedTasks.filter(
    (t) => t.status === 'in_progress' || t.status === 'pending'
  ).length;
  const completedCount = enhancedTasks.filter((t) => t.status === 'completed').length;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Summary and filter */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <Loader2 className="w-3.5 h-3.5" />
            {activeCount} active
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {completedCount} completed
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1">
          {(['all', 'active', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={cn(
                'px-2 py-0.5 text-xs rounded transition-colors',
                filter === tab
                  ? 'bg-sky-500/20 text-sky-400'
                  : 'text-gray-500 hover:text-gray-400'
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      {filteredTasks.length > 0 ? (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <TaskItem key={task.id} task={task} onClick={onTaskClick} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8">
          <ListTodo className="w-12 h-12 text-gray-600 mb-3" />
          <p className="text-gray-400 text-sm">No {filter !== 'all' ? filter : ''} tasks</p>
        </div>
      )}

      {/* Show more link */}
      {enhancedTasks.length > maxItems && (
        <button className="w-full py-2 text-center text-xs text-sky-400 hover:text-sky-300 transition-colors">
          View all {enhancedTasks.length} tasks
        </button>
      )}
    </div>
  );
}

export default TaskList;
