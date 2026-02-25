/**
 * useAgenticMonitor — Phase 4: Real-Time Execution Visibility
 *
 * Hook that subscribes to agentic WebSocket events and forwards them
 * to the agenticMonitorStore for real-time UI updates.
 */

import { useEffect } from 'react';
import { websocket } from '../services/websocket';
import {
  useAgenticMonitorStore,
  AgenticReasoningEvent,
  AgenticToolEvent,
  AgenticCompletionEvent,
  AgenticStatusEvent,
} from '../stores/agenticMonitorStore';

/**
 * Subscribe to all agentic execution events for a specific agent.
 * Call this in any component that needs to display live execution data.
 *
 * @param agentId - The agent profile ID to monitor
 */
export function useAgenticMonitor(agentId: string | null): void {
  const {
    onReasoningStart,
    onReasoningStep,
    onToolStart,
    onToolResult,
    onReasoningComplete,
    onStatusChange,
    onError,
  } = useAgenticMonitorStore();

  useEffect(() => {
    if (!agentId) return;

    // Subscribe to agent-specific room for targeted events
    websocket.subscribeToAgent(agentId);

    const unsubscribers = [
      websocket.subscribe<AgenticReasoningEvent>('agentic:reasoning:start', (data) => {
        if (data.agentId === agentId) onReasoningStart(data);
      }),

      websocket.subscribe<AgenticReasoningEvent>('agentic:reasoning:step', (data) => {
        if (data.agentId === agentId) onReasoningStep(data);
      }),

      websocket.subscribe<AgenticToolEvent>('agentic:tool:start', (data) => {
        if (data.agentId === agentId) onToolStart(data);
      }),

      websocket.subscribe<AgenticToolEvent>('agentic:tool:result', (data) => {
        if (data.agentId === agentId) onToolResult(data);
      }),

      websocket.subscribe<AgenticCompletionEvent>('agentic:reasoning:complete', (data) => {
        if (data.agentId === agentId) onReasoningComplete(data);
      }),

      websocket.subscribe<AgenticStatusEvent>('agentic:status:changed', (data) => {
        if (data.agentId === agentId) onStatusChange(data);
      }),

      websocket.subscribe<{ agentId: string; error: string; timestamp: string }>('agentic:error', (data) => {
        if (data.agentId === agentId) onError(data);
      }),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      websocket.unsubscribeFromAgent(agentId);
    };
  }, [agentId, onReasoningStart, onReasoningStep, onToolStart, onToolResult, onReasoningComplete, onStatusChange, onError]);
}
