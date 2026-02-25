import { useEffect, useCallback, useRef } from 'react';
import { websocket } from '../services/websocket';
import { useAgentStore, Agent } from '../stores/agentStore';

/**
 * Event payload for agent status changes
 * Note: When emitted from platform clients (WhatsApp/Telegram), status may be
 * platform-specific values like 'connected'/'disconnected'/'qr_pending'
 */
interface AgentStatusChangedPayload {
  agentId: string;
  status: string;
  platform?: string;
  previousStatus?: string;
  timestamp?: string;
}

/**
 * Event payload for agent QR code (WhatsApp)
 */
interface AgentQRPayload {
  agentId: string;
  qrCode: string;
  expiresAt?: string;
}

/**
 * Event payload for agent busy state
 */
interface AgentBusyPayload {
  agentId: string;
  busy: boolean;
  reason?: string;
}

/**
 * Event payload for agent platform status
 */
interface AgentPlatformStatusPayload {
  agentId: string;
  platform: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  message?: string;
}

/**
 * Return type for useAgentStatus hook
 */
interface UseAgentStatusReturn {
  subscribeToAgent: (agentId: string) => void;
  unsubscribeFromAgent: (agentId: string) => void;
}

/**
 * Hook for subscribing to real-time agent status updates
 * Automatically updates the agent store when status changes occur
 */
export function useAgentStatus(): UseAgentStatusReturn {
  const fetchAgents = useAgentStore((state) => state.fetchAgents);

  // Subscribe to agent status changed events
  useEffect(() => {
    const unsubscribeStatus = websocket.subscribe<any>(
      'agent:status_changed',
      (raw) => {
        // Unwrap { data: {...}, timestamp } envelope from broadcast()
        const data: AgentStatusChangedPayload = raw?.data || raw;
        console.log('[useAgentStatus] Agent status changed:', data);
        if (!data?.agentId) return;

        const currentAgents = useAgentStore.getState().agents;
        const agent = currentAgents.find((a) => a.id === data.agentId);
        if (agent) {
          // If this is a platform status change (has platform field), update platformStatus
          // and map to appropriate agent status
          const isPlatformChange = !!data.platform;
          const updates: Partial<Agent> = {};

          if (isPlatformChange) {
            updates.platformStatus = data.status;
            // Map platform status to agent status
            if (data.status === 'connected') {
              updates.status = 'idle';
            } else if (data.status === 'disconnected' || data.status === 'error') {
              updates.status = 'offline';
            }
          } else {
            // Direct agent status change (online/offline/busy/idle)
            updates.status = data.status as Agent['status'];
          }

          useAgentStore.setState((state) => ({
            agents: state.agents.map((a) =>
              a.id === data.agentId ? { ...a, ...updates } : a
            ),
            selectedAgent:
              state.selectedAgent?.id === data.agentId
                ? { ...state.selectedAgent, ...updates }
                : state.selectedAgent,
          }));
        } else {
          // Agent not in store, fetch all agents to update list
          fetchAgents();
        }
      }
    );

    const unsubscribeBusy = websocket.subscribe<any>(
      'agent:busy',
      (raw) => {
        // Unwrap { data: {...}, timestamp } envelope from broadcast()
        const data: AgentBusyPayload = raw?.data || raw;
        console.log('[useAgentStatus] Agent busy state changed:', data);
        if (!data?.agentId) return;

        const newStatus = data.busy ? 'busy' : 'idle';
        useAgentStore.setState((state) => ({
          agents: state.agents.map((a) =>
            a.id === data.agentId ? { ...a, status: newStatus } : a
          ),
          selectedAgent:
            state.selectedAgent?.id === data.agentId
              ? { ...state.selectedAgent, status: newStatus }
              : state.selectedAgent,
        }));
      }
    );

    const unsubscribePlatformStatus = websocket.subscribe<any>(
      'agent:platform_status',
      (raw) => {
        // Unwrap { data: {...}, timestamp } envelope from broadcast()
        const data: AgentPlatformStatusPayload = raw?.data || raw;
        console.log('[useAgentStatus] Agent platform status:', data);
        if (!data?.agentId) return;

        // Update platformStatus on the agent so sync buttons can check connection
        useAgentStore.setState((state) => ({
          agents: state.agents.map((a) =>
            a.id === data.agentId
              ? {
                  ...a,
                  platformStatus: data.status,
                  ...(data.status === 'error' || data.status === 'disconnected'
                    ? { status: 'offline' as const }
                    : data.status === 'connected'
                    ? { status: 'idle' as const }
                    : {}),
                }
              : a
          ),
          selectedAgent:
            state.selectedAgent?.id === data.agentId
              ? {
                  ...state.selectedAgent,
                  platformStatus: data.status,
                  ...(data.status === 'error' || data.status === 'disconnected'
                    ? { status: 'offline' as const }
                    : data.status === 'connected'
                    ? { status: 'idle' as const }
                    : {}),
                }
              : state.selectedAgent,
        }));
      }
    );

    return () => {
      unsubscribeStatus();
      unsubscribeBusy();
      unsubscribePlatformStatus();
    };
  }, [fetchAgents]);

  // Subscribe to a specific agent for detailed updates (e.g., QR code)
  const subscribeToAgent = useCallback((agentId: string) => {
    websocket.subscribeToAgent(agentId);
  }, []);

  // Unsubscribe from a specific agent
  const unsubscribeFromAgent = useCallback((agentId: string) => {
    websocket.unsubscribeFromAgent(agentId);
  }, []);

  return {
    subscribeToAgent,
    unsubscribeFromAgent,
  };
}

/**
 * Hook for subscribing to QR code updates for a specific agent
 * Useful for WhatsApp agent setup
 */
export function useAgentQR(
  agentId: string | null,
  onQRCode?: (qrCode: string) => void
): void {
  // Use ref to store callback to avoid dependency issues
  const onQRCodeRef = useRef(onQRCode);
  onQRCodeRef.current = onQRCode;

  useEffect(() => {
    if (!agentId) return;

    // Subscribe to agent-specific updates
    websocket.subscribeToAgent(agentId);

    const unsubscribe = websocket.subscribe<AgentQRPayload>(
      'agent:qr',
      (data) => {
        if (data.agentId === agentId && onQRCodeRef.current) {
          console.log('[useAgentQR] Received QR code for agent:', agentId);
          onQRCodeRef.current(data.qrCode);
        }
      }
    );

    return () => {
      unsubscribe();
      websocket.unsubscribeFromAgent(agentId);
    };
  }, [agentId]);
}
