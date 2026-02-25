import { useEffect, useCallback, useRef } from 'react';
import { websocket } from '../services/websocket';
import { useSwarmStore, SwarmTask } from '../stores/swarmStore';

/**
 * Event payload for swarm task updates
 */
interface SwarmTaskUpdatePayload {
  id: string;
  title: string;
  description: string;
  status: SwarmTask['status'];
  assignedAgents: string[];
  progress?: number;
  result?: unknown;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * Event payload for new swarm task creation
 */
interface SwarmTaskCreatedPayload {
  id: string;
  title: string;
  description: string;
  status: SwarmTask['status'];
  assignedAgents: string[];
  createdAt: string;
}

/**
 * Event payload for agent handoff
 */
interface SwarmHandoffPayload {
  id: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  toAgentName: string;
  conversationId: string;
  reason?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  timestamp: string;
}

/**
 * Event payload for consensus voting
 */
interface SwarmConsensusPayload {
  id: string;
  topic: string;
  status: 'voting' | 'completed' | 'failed';
  votes: Array<{
    agentId: string;
    agentName: string;
    vote: string;
    confidence: number;
  }>;
  result?: string;
  timestamp: string;
}

/**
 * Event payload for collaboration updates
 */
interface SwarmCollaborationPayload {
  id: string;
  taskId: string;
  type: 'started' | 'progress' | 'completed' | 'failed';
  participants: string[];
  message?: string;
  timestamp: string;
}

/**
 * Options for useSwarmUpdates hook
 */
interface UseSwarmUpdatesOptions {
  onTaskUpdate?: (task: SwarmTaskUpdatePayload) => void;
  onTaskCreated?: (task: SwarmTaskCreatedPayload) => void;
  onHandoff?: (handoff: SwarmHandoffPayload) => void;
  onConsensus?: (consensus: SwarmConsensusPayload) => void;
  onCollaboration?: (collaboration: SwarmCollaborationPayload) => void;
}

/**
 * Return type for useSwarmUpdates hook
 */
interface UseSwarmUpdatesReturn {
  refreshStatus: () => Promise<void>;
  refreshTasks: () => Promise<void>;
}

/**
 * Hook for subscribing to real-time swarm updates
 * Includes task updates, handoffs, consensus voting, and collaboration events
 */
export function useSwarmUpdates(
  options: UseSwarmUpdatesOptions = {}
): UseSwarmUpdatesReturn {
  const fetchStatus = useSwarmStore((state) => state.fetchStatus);
  const fetchTasks = useSwarmStore((state) => state.fetchTasks);
  const { onTaskUpdate, onTaskCreated, onHandoff, onConsensus, onCollaboration } = options;

  // Use refs for callbacks to avoid dependency issues
  const onTaskUpdateRef = useRef(onTaskUpdate);
  const onTaskCreatedRef = useRef(onTaskCreated);
  const onHandoffRef = useRef(onHandoff);
  const onConsensusRef = useRef(onConsensus);
  const onCollaborationRef = useRef(onCollaboration);
  onTaskUpdateRef.current = onTaskUpdate;
  onTaskCreatedRef.current = onTaskCreated;
  onHandoffRef.current = onHandoff;
  onConsensusRef.current = onConsensus;
  onCollaborationRef.current = onCollaboration;

  // Subscribe to task updates
  useEffect(() => {
    const unsubscribeTaskUpdate = websocket.subscribe<SwarmTaskUpdatePayload>(
      'swarm:task_update',
      (data) => {
        console.log('[useSwarmUpdates] Task update:', data.id, data.status);

        // Update task in store
        useSwarmStore.setState((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === data.id
              ? {
                  ...task,
                  status: data.status,
                  assignedAgents: data.assignedAgents,
                  completedAt: data.completedAt,
                }
              : task
          ),
        }));

        // Refresh status counts
        fetchStatus();

        // Call callback if provided
        onTaskUpdateRef.current?.(data);
      }
    );

    return () => {
      unsubscribeTaskUpdate();
    };
  }, [fetchStatus]);

  // Subscribe to new task creation
  useEffect(() => {
    const unsubscribeTaskCreated = websocket.subscribe<SwarmTaskCreatedPayload>(
      'swarm:task_created',
      (data) => {
        console.log('[useSwarmUpdates] New task created:', data.id);

        // Add new task to store
        const newTask: SwarmTask = {
          id: data.id,
          title: data.title,
          description: data.description,
          status: data.status,
          assignedAgents: data.assignedAgents,
          createdAt: data.createdAt,
        };

        useSwarmStore.setState((state) => ({
          tasks: [newTask, ...state.tasks],
        }));

        // Refresh status counts
        fetchStatus();

        // Call callback if provided
        onTaskCreatedRef.current?.(data);
      }
    );

    return () => {
      unsubscribeTaskCreated();
    };
  }, [fetchStatus]);

  // Subscribe to handoff events
  useEffect(() => {
    const unsubscribeHandoff = websocket.subscribe<SwarmHandoffPayload>(
      'swarm:handoff',
      (data) => {
        console.log(
          '[useSwarmUpdates] Handoff:',
          data.fromAgentName,
          '->',
          data.toAgentName,
          data.status
        );

        // Call callback if provided
        onHandoffRef.current?.(data);

        // Refresh status to update counts
        fetchStatus();
      }
    );

    return () => {
      unsubscribeHandoff();
    };
  }, [fetchStatus]);

  // Subscribe to consensus events
  useEffect(() => {
    const unsubscribeConsensus = websocket.subscribe<SwarmConsensusPayload>(
      'swarm:consensus',
      (data) => {
        console.log('[useSwarmUpdates] Consensus:', data.topic, data.status);

        // Call callback if provided
        onConsensusRef.current?.(data);
      }
    );

    return () => {
      unsubscribeConsensus();
    };
  }, []);

  // Subscribe to collaboration events
  useEffect(() => {
    const unsubscribeCollaboration = websocket.subscribe<SwarmCollaborationPayload>(
      'swarm:collaboration',
      (data) => {
        console.log('[useSwarmUpdates] Collaboration:', data.type, data.taskId);

        // Call callback if provided
        onCollaborationRef.current?.(data);

        // Refresh status to update collaboration count
        if (data.type === 'started' || data.type === 'completed') {
          fetchStatus();
        }
      }
    );

    return () => {
      unsubscribeCollaboration();
    };
  }, [fetchStatus]);

  const refreshStatus = useCallback(async () => {
    await fetchStatus();
  }, [fetchStatus]);

  const refreshTasks = useCallback(async () => {
    await fetchTasks();
  }, [fetchTasks]);

  return {
    refreshStatus,
    refreshTasks,
  };
}

/**
 * Hook for subscribing to a specific task's updates
 * Useful when viewing task details
 */
export function useTaskUpdates(
  taskId: string | null,
  onUpdate?: (task: SwarmTaskUpdatePayload) => void
): void {
  // Use ref for callback to avoid dependency issues
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!taskId) return;

    const unsubscribe = websocket.subscribe<SwarmTaskUpdatePayload>(
      'swarm:task_update',
      (data) => {
        if (data.id === taskId) {
          console.log('[useTaskUpdates] Task updated:', taskId);
          onUpdateRef.current?.(data);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [taskId]);
}
