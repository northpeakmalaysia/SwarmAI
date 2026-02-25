/**
 * Agentic Monitor Store — Phase 4: Real-Time Execution Visibility
 *
 * Tracks real-time execution state for all agents via WebSocket events.
 * Provides timeline, status, and control state for the monitoring UI.
 */

import { create } from 'zustand';

// Event types
export interface AgenticReasoningEvent {
  agentId: string;
  agentName?: string;
  trigger?: string;
  tier?: string;
  iteration?: number;
  maxIterations?: number;
  thought?: string;
  timestamp: string;
}

export interface AgenticToolEvent {
  agentId: string;
  toolName: string;
  params?: Record<string, unknown>;
  reasoning?: string;
  success?: boolean;
  summary?: string;
  duration?: number;
  recoveryApplied?: boolean;
  attempts?: number;
  usedAlternativeTool?: string | null;
  timestamp: string;
}

export interface AgenticCompletionEvent {
  agentId: string;
  trigger?: string;
  iterations: number;
  tokensUsed: number;
  actionCount: number;
  successCount: number;
  failCount: number;
  finalThought?: string;
  duration?: number;
  mode?: string;
  planSteps?: number;
  timestamp: string;
}

export interface AgenticStatusEvent {
  agentId: string;
  status: 'paused' | 'resumed' | 'interrupted';
  timestamp: string;
}

export interface TimelineEvent {
  id: string;
  type: 'reasoning_start' | 'thought' | 'tool_start' | 'tool_result' | 'complete' | 'error' | 'status_change';
  timestamp: string;
  data: Record<string, unknown>;
}

export interface AgentExecutionState {
  status: 'idle' | 'thinking' | 'executing_tool' | 'paused' | 'completed' | 'error';
  agentName: string;
  currentIteration: number;
  maxIterations: number;
  currentTool: string | null;
  currentThought: string | null;
  tier: string | null;
  trigger: string | null;
  startedAt: string | null;
  tokensUsed: number;
  timeline: TimelineEvent[];
}

interface AgenticMonitorState {
  executions: Record<string, AgentExecutionState>;

  // Actions (called from WebSocket event handlers)
  onReasoningStart: (event: AgenticReasoningEvent) => void;
  onReasoningStep: (event: AgenticReasoningEvent) => void;
  onToolStart: (event: AgenticToolEvent) => void;
  onToolResult: (event: AgenticToolEvent) => void;
  onReasoningComplete: (event: AgenticCompletionEvent) => void;
  onStatusChange: (event: AgenticStatusEvent) => void;
  onError: (event: { agentId: string; error: string; timestamp: string }) => void;

  // Queries
  getExecution: (agentId: string) => AgentExecutionState | null;
  getActiveExecutions: () => [string, AgentExecutionState][];
  clearExecution: (agentId: string) => void;
}

const MAX_TIMELINE_EVENTS = 100;

const defaultExecutionState = (agentName: string = 'Agent'): AgentExecutionState => ({
  status: 'idle',
  agentName,
  currentIteration: 0,
  maxIterations: 0,
  currentTool: null,
  currentThought: null,
  tier: null,
  trigger: null,
  startedAt: null,
  tokensUsed: 0,
  timeline: [],
});

let eventCounter = 0;
const nextEventId = () => `evt_${++eventCounter}_${Date.now()}`;

export const useAgenticMonitorStore = create<AgenticMonitorState>((set, get) => ({
  executions: {},

  onReasoningStart: (event) => {
    set((state) => ({
      executions: {
        ...state.executions,
        [event.agentId]: {
          ...defaultExecutionState(event.agentName || event.agentId),
          status: 'thinking',
          tier: event.tier || null,
          trigger: event.trigger || null,
          maxIterations: event.maxIterations || 0,
          startedAt: event.timestamp,
          timeline: [{
            id: nextEventId(),
            type: 'reasoning_start',
            timestamp: event.timestamp,
            data: { agentName: event.agentName, trigger: event.trigger, tier: event.tier },
          }],
        },
      },
    }));
  },

  onReasoningStep: (event) => {
    set((state) => {
      const existing = state.executions[event.agentId];
      if (!existing) return state;

      const timeline = [...existing.timeline, {
        id: nextEventId(),
        type: 'thought' as const,
        timestamp: event.timestamp,
        data: { iteration: event.iteration, thought: event.thought },
      }].slice(-MAX_TIMELINE_EVENTS);

      return {
        executions: {
          ...state.executions,
          [event.agentId]: {
            ...existing,
            status: 'thinking',
            currentIteration: event.iteration || existing.currentIteration,
            currentThought: event.thought || existing.currentThought,
            timeline,
          },
        },
      };
    });
  },

  onToolStart: (event) => {
    set((state) => {
      const existing = state.executions[event.agentId];
      if (!existing) return state;

      const timeline = [...existing.timeline, {
        id: nextEventId(),
        type: 'tool_start' as const,
        timestamp: event.timestamp,
        data: { toolName: event.toolName, params: event.params, reasoning: event.reasoning },
      }].slice(-MAX_TIMELINE_EVENTS);

      return {
        executions: {
          ...state.executions,
          [event.agentId]: {
            ...existing,
            status: 'executing_tool',
            currentTool: event.toolName,
            timeline,
          },
        },
      };
    });
  },

  onToolResult: (event) => {
    set((state) => {
      const existing = state.executions[event.agentId];
      if (!existing) return state;

      const timeline = [...existing.timeline, {
        id: nextEventId(),
        type: 'tool_result' as const,
        timestamp: event.timestamp,
        data: {
          toolName: event.toolName,
          success: event.success,
          summary: event.summary,
          duration: event.duration,
          recoveryApplied: event.recoveryApplied,
          attempts: event.attempts,
          usedAlternativeTool: event.usedAlternativeTool,
        },
      }].slice(-MAX_TIMELINE_EVENTS);

      return {
        executions: {
          ...state.executions,
          [event.agentId]: {
            ...existing,
            status: 'thinking',
            currentTool: null,
            timeline,
          },
        },
      };
    });
  },

  onReasoningComplete: (event) => {
    set((state) => {
      const existing = state.executions[event.agentId];
      if (!existing) return state;

      const timeline = [...existing.timeline, {
        id: nextEventId(),
        type: 'complete' as const,
        timestamp: event.timestamp,
        data: {
          iterations: event.iterations,
          tokensUsed: event.tokensUsed,
          actionCount: event.actionCount,
          successCount: event.successCount,
          failCount: event.failCount,
          finalThought: event.finalThought,
          mode: event.mode,
        },
      }].slice(-MAX_TIMELINE_EVENTS);

      return {
        executions: {
          ...state.executions,
          [event.agentId]: {
            ...existing,
            status: 'completed',
            tokensUsed: event.tokensUsed,
            currentTool: null,
            currentThought: event.finalThought || existing.currentThought,
            timeline,
          },
        },
      };
    });
  },

  onStatusChange: (event) => {
    set((state) => {
      const existing = state.executions[event.agentId] || defaultExecutionState();

      const statusMap: Record<string, AgentExecutionState['status']> = {
        paused: 'paused',
        resumed: 'thinking',
        interrupted: 'idle',
      };

      const timeline = [...existing.timeline, {
        id: nextEventId(),
        type: 'status_change' as const,
        timestamp: event.timestamp,
        data: { status: event.status },
      }].slice(-MAX_TIMELINE_EVENTS);

      return {
        executions: {
          ...state.executions,
          [event.agentId]: {
            ...existing,
            status: statusMap[event.status] || existing.status,
            timeline,
          },
        },
      };
    });
  },

  onError: (event) => {
    set((state) => {
      const existing = state.executions[event.agentId] || defaultExecutionState();

      const timeline = [...existing.timeline, {
        id: nextEventId(),
        type: 'error' as const,
        timestamp: event.timestamp,
        data: { error: event.error },
      }].slice(-MAX_TIMELINE_EVENTS);

      return {
        executions: {
          ...state.executions,
          [event.agentId]: {
            ...existing,
            status: 'error',
            timeline,
          },
        },
      };
    });
  },

  getExecution: (agentId) => get().executions[agentId] || null,

  getActiveExecutions: () => {
    return Object.entries(get().executions).filter(
      ([, state]) => state.status !== 'idle' && state.status !== 'completed'
    );
  },

  clearExecution: (agentId) => {
    set((state) => {
      const { [agentId]: _, ...rest } = state.executions;
      return { executions: rest };
    });
  },
}));
