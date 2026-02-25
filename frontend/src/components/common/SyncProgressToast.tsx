import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, MessageSquare, CheckCircle2, XCircle, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { websocket } from '../../services/websocket';

export interface SyncTask {
  id: string;
  type: 'contacts' | 'chats';
  status: 'started' | 'syncing' | 'syncing_chats' | 'syncing_messages' | 'completed' | 'error';
  message?: string;
  current?: number;
  total?: number;
  subStep?: {
    chatName?: string;
    chatIndex?: number;
  };
  stats?: Record<string, number>;
  startedAt: number;
}

interface SyncProgressToastProps {
  agentId: string | null;
  onComplete?: () => void;
}

/**
 * SyncProgressToast - A non-blocking floating progress indicator for WhatsApp sync operations.
 * Renders in the bottom-right corner and allows users to continue using the system.
 */
export const SyncProgressToast: React.FC<SyncProgressToastProps> = ({ agentId, onComplete }) => {
  const [tasks, setTasks] = useState<SyncTask[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Subscribe to sync:status WebSocket events
  useEffect(() => {
    if (!agentId) return;

    websocket.subscribeToAgent(agentId);

    const unsubscribe = websocket.subscribe<{
      type: 'contacts' | 'chats';
      status: string;
      message?: string;
      current?: number;
      total?: number;
      subStep?: { chatName?: string; chatIndex?: number };
      stats?: Record<string, number>;
    }>('sync:status', (data) => {
      const taskId = `${data.type}-${agentId}`;

      setTasks(prev => {
        const existing = prev.find(t => t.id === taskId);
        const newTask: SyncTask = {
          id: taskId,
          type: data.type,
          status: data.status as SyncTask['status'],
          message: data.message,
          current: data.current,
          total: data.total,
          subStep: data.subStep,
          stats: data.stats,
          startedAt: existing?.startedAt || Date.now(),
        };

        if (existing) {
          return prev.map(t => t.id === taskId ? newTask : t);
        }
        return [...prev, newTask];
      });

      // Remove dismissed status when new sync starts
      if (data.status === 'started') {
        setDismissed(prev => prev.filter(id => id !== taskId));
      }

      // Auto-refresh conversations when completed
      if (data.status === 'completed') {
        setTimeout(() => {
          onCompleteRef.current?.();
        }, 1000);
      }
    });

    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
      unsubscribeRef.current = null;
    };
  }, [agentId]);

  // Auto-dismiss completed/error tasks after 8 seconds
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    tasks.forEach(task => {
      if ((task.status === 'completed' || task.status === 'error') && !dismissed.includes(task.id)) {
        const timer = setTimeout(() => {
          setDismissed(prev => [...prev, task.id]);
        }, 8000);
        timers.push(timer);
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [tasks, dismissed]);

  const dismissTask = useCallback((taskId: string) => {
    setDismissed(prev => [...prev, taskId]);
  }, []);

  const dismissAll = useCallback(() => {
    setDismissed(tasks.map(t => t.id));
  }, [tasks]);

  // Filter visible tasks
  const visibleTasks = tasks.filter(t => !dismissed.includes(t.id));

  if (visibleTasks.length === 0) return null;

  const activeTasks = visibleTasks.filter(t => !['completed', 'error'].includes(t.status));
  const hasActive = activeTasks.length > 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {/* Header bar when multiple tasks or can collapse */}
      {visibleTasks.length > 1 && (
        <div className="pointer-events-auto bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-lg px-3 py-2 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-2">
            {hasActive && <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />}
            <span className="text-xs text-gray-300 font-medium">
              {hasActive
                ? `${activeTasks.length} sync${activeTasks.length > 1 ? 's' : ''} in progress`
                : 'Sync complete'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 text-gray-400 hover:text-white rounded transition-colors"
            >
              {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {!hasActive && (
              <button
                onClick={dismissAll}
                className="p-1 text-gray-400 hover:text-white rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Task cards */}
      {!collapsed && visibleTasks.map(task => (
        <SyncTaskCard
          key={task.id}
          task={task}
          onDismiss={() => dismissTask(task.id)}
        />
      ))}
    </div>
  );
};

/**
 * Individual sync task progress card
 */
const SyncTaskCard: React.FC<{ task: SyncTask; onDismiss: () => void }> = ({ task, onDismiss }) => {
  const isActive = !['completed', 'error'].includes(task.status);
  const isComplete = task.status === 'completed';
  const isError = task.status === 'error';

  const icon = task.type === 'contacts'
    ? <Users className="w-4 h-4" />
    : <MessageSquare className="w-4 h-4" />;

  const title = task.type === 'contacts' ? 'Syncing Contacts' : 'Syncing Chats';

  const getProgressPercent = (): number => {
    if (isComplete) return 100;
    if (isError) return 0;
    if (task.current && task.total && task.total > 0) {
      return Math.min(Math.round((task.current / task.total) * 100), 95);
    }
    return 0;
  };

  const percent = getProgressPercent();

  // Build stats summary
  const getStatsSummary = (): string => {
    if (!task.stats) return '';
    if (task.type === 'contacts') {
      const synced = task.stats.contactsSynced || 0;
      const existing = task.stats.contactsExisting || 0;
      return `${synced} new, ${existing} existing`;
    }
    const convs = task.stats.conversationsSynced || 0;
    const msgs = task.stats.messagesSynced || 0;
    if (msgs > 0) return `${convs} chats, ${msgs} messages`;
    if (convs > 0) return `${convs} new chats`;
    return '';
  };

  return (
    <div className={cn(
      'pointer-events-auto bg-slate-800/95 backdrop-blur-xl border rounded-lg shadow-2xl',
      'transition-all duration-300 animate-in slide-in-from-right-5',
      isComplete && 'border-green-500/30',
      isError && 'border-red-500/30',
      isActive && 'border-sky-500/30',
    )}>
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        <div className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
          isComplete && 'bg-green-500/20 text-green-400',
          isError && 'bg-red-500/20 text-red-400',
          isActive && 'bg-sky-500/20 text-sky-400',
        )}>
          {isComplete ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : isError ? (
            <XCircle className="w-4 h-4" />
          ) : (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {icon}
            <span className={cn(
              'text-sm font-medium',
              isComplete && 'text-green-400',
              isError && 'text-red-400',
              isActive && 'text-sky-400',
            )}>
              {isComplete ? `${task.type === 'contacts' ? 'Contacts' : 'Chats'} Synced!` : title}
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate mt-0.5">
            {task.subStep?.chatName
              ? `${task.subStep.chatName}`
              : task.message || getStatsSummary() || 'Starting...'}
          </p>
        </div>
        {!isActive && (
          <button
            onClick={onDismiss}
            className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="px-3 pb-2.5">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>
              {task.current && task.total ? `${task.current}/${task.total}` : 'Processing...'}
            </span>
            {percent > 0 && <span>{percent}%</span>}
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-500 ease-out"
              style={{ width: `${Math.max(percent, 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* Completion stats */}
      {isComplete && getStatsSummary() && (
        <div className="px-3 pb-2.5">
          <p className="text-[11px] text-gray-400">{getStatsSummary()}</p>
        </div>
      )}

      {/* Error message */}
      {isError && (
        <div className="px-3 pb-2.5">
          <p className="text-[11px] text-red-400">{task.message || 'Sync failed'}</p>
        </div>
      )}
    </div>
  );
};

export default SyncProgressToast;
