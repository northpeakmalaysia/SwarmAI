import { create } from 'zustand';
import api from '../services/api';
import { websocket } from '../services/websocket';
import { useAuthStore } from './authStore';

export interface ToolInfo {
  installed: boolean;
  version: string | null;
  path: string | null;
}

export interface McpToolInfo {
  server: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface HealthMetrics {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; unit: string };
  uptime: number;
  loadAvg: number[];
}

export interface LocalAgent {
  id: string;
  name: string;
  apiKeyPrefix: string;
  hostname: string | null;
  osType: string | null;
  osVersion: string | null;
  lastConnectedAt: string | null;
  lastHeartbeatAt: string | null;
  isOnline: boolean;
  capabilities: string[];
  toolRegistry: Record<string, ToolInfo>;
  mcpTools: McpToolInfo[];
  healthMetrics: HealthMetrics | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommandRecord {
  id: string;
  command: string;
  params: Record<string, unknown>;
  status: string;
  result: unknown;
  errorMessage: string | null;
  executionTimeMs: number | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface PendingApproval {
  id: string;
  agentId: string;
  agentName: string;
  command: string;
  params: Record<string, unknown>;
  requestedAt: string;
}

export interface Challenge {
  id: string;
  deviceName: string;
  deviceInfo: {
    hostname?: string;
    os?: string;
    osVersion?: string;
  };
  expiresAt: string;
  createdAt: string;
}

// Streaming output buffer per command
export interface StreamingOutput {
  commandId: string;
  chunks: string[];
  stream: 'stdout' | 'stderr';
  isRunning: boolean;
}

interface LocalAgentState {
  agents: LocalAgent[];
  pendingChallenges: Challenge[];
  pendingApprovals: PendingApproval[];
  commandHistory: Record<string, CommandRecord[]>;
  streamingOutputs: Record<string, StreamingOutput>;
  isLoading: boolean;
  error: string | null;
  _socketInitialized: boolean;
  _socketRefCount: number;

  fetchAgents: () => Promise<void>;
  fetchPending: () => Promise<void>;
  fetchPendingApprovals: () => Promise<void>;
  approveChallenge: (sessionId: string) => Promise<void>;
  denyChallenge: (sessionId: string) => Promise<void>;
  approveCommand: (agentId: string, commandId: string) => Promise<void>;
  denyCommand: (agentId: string, commandId: string) => Promise<void>;
  renameAgent: (id: string, name: string) => Promise<void>;
  revokeAgent: (id: string) => Promise<void>;
  sendCommand: (id: string, command: string, params?: Record<string, unknown>) => Promise<unknown>;
  fetchCommandHistory: (agentId: string) => Promise<void>;
  initSocketListeners: () => () => void;
}

export const useLocalAgentStore = create<LocalAgentState>((set, get) => ({
  agents: [],
  pendingChallenges: [],
  pendingApprovals: [],
  commandHistory: {},
  streamingOutputs: {},
  isLoading: false,
  error: null,
  _socketInitialized: false,
  _socketRefCount: 0,

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/local-agents');
      set({ agents: response.data.agents || [], isLoading: false });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch agents';
      set({ error: msg, isLoading: false });
    }
  },

  fetchPending: async () => {
    try {
      const response = await api.get('/local-agents/auth/pending');
      set({ pendingChallenges: response.data || [] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch pending';
      set({ error: msg });
    }
  },

  fetchPendingApprovals: async () => {
    try {
      const response = await api.get('/local-agents/commands/pending-approvals');
      set({ pendingApprovals: response.data.commands || [] });
    } catch {
      // Non-critical — endpoint might not exist yet
    }
  },

  approveChallenge: async (sessionId: string) => {
    try {
      await api.post(`/local-agents/auth/approve/${sessionId}`);
      await get().fetchPending();
      await get().fetchAgents();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to approve';
      set({ error: msg });
      throw error;
    }
  },

  denyChallenge: async (sessionId: string) => {
    try {
      await api.post(`/local-agents/auth/deny/${sessionId}`);
      await get().fetchPending();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to deny';
      set({ error: msg });
      throw error;
    }
  },

  approveCommand: async (agentId: string, commandId: string) => {
    try {
      await api.post(`/local-agents/${agentId}/commands/${commandId}/approve`);
      // Remove from pending approvals
      set({
        pendingApprovals: get().pendingApprovals.filter(a => a.id !== commandId),
      });
      get().fetchCommandHistory(agentId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to approve command';
      set({ error: msg });
      throw error;
    }
  },

  denyCommand: async (agentId: string, commandId: string) => {
    try {
      await api.post(`/local-agents/${agentId}/commands/${commandId}/deny`);
      set({
        pendingApprovals: get().pendingApprovals.filter(a => a.id !== commandId),
      });
      get().fetchCommandHistory(agentId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to deny command';
      set({ error: msg });
      throw error;
    }
  },

  renameAgent: async (id: string, name: string) => {
    try {
      await api.put(`/local-agents/${id}`, { name });
      await get().fetchAgents();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to rename';
      set({ error: msg });
      throw error;
    }
  },

  revokeAgent: async (id: string) => {
    try {
      await api.delete(`/local-agents/${id}`);
      await get().fetchAgents();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to revoke';
      set({ error: msg });
      throw error;
    }
  },

  sendCommand: async (id: string, command: string, params?: Record<string, unknown>) => {
    try {
      const response = await api.post(`/local-agents/${id}/command`, { command, params });
      // Refresh command history after sending
      get().fetchCommandHistory(id);
      return response.data.result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to send command';
      set({ error: msg });
      throw error;
    }
  },

  fetchCommandHistory: async (agentId: string) => {
    try {
      const response = await api.get(`/local-agents/${agentId}/commands?limit=20`);
      set({
        commandHistory: {
          ...get().commandHistory,
          [agentId]: response.data.commands || [],
        },
      });
    } catch {
      // Command history is non-critical
    }
  },

  /**
   * Initialize WebSocket listeners for real-time local agent updates.
   * Uses reference counting — multiple components can call this safely.
   * Returns an unsubscribe function for cleanup.
   */
  initSocketListeners: () => {
    const newRefCount = get()._socketRefCount + 1;
    set({ _socketRefCount: newRefCount });

    if (get()._socketInitialized) {
      // Already initialized — return a decrement-only cleanup
      return () => {
        const count = get()._socketRefCount - 1;
        set({ _socketRefCount: count });
        if (count <= 0) {
          // Last consumer unmounted — will be cleaned up if re-initialized
          set({ _socketInitialized: false, _socketRefCount: 0 });
        }
      };
    }

    // Get current user ID for event filtering (multi-tenant safety)
    const getCurrentUserId = () => useAuthStore.getState().user?.id;

    const unsubOnline = websocket.subscribe<{ agentId: string; name: string; userId: string }>(
      'local-agent:online',
      (data) => {
        // Filter: only process events for the current user's agents
        if (data.userId && data.userId !== getCurrentUserId()) return;

        const agents = get().agents;
        const existing = agents.find(a => a.id === data.agentId);
        if (existing) {
          set({
            agents: agents.map(a =>
              a.id === data.agentId
                ? { ...a, isOnline: true, lastConnectedAt: new Date().toISOString() }
                : a
            ),
          });
        } else {
          get().fetchAgents();
        }
      }
    );

    const unsubOffline = websocket.subscribe<{ agentId: string; userId: string }>(
      'local-agent:offline',
      (data) => {
        if (data.userId && data.userId !== getCurrentUserId()) return;

        set({
          agents: get().agents.map(a =>
            a.id === data.agentId ? { ...a, isOnline: false } : a
          ),
        });
      }
    );

    const unsubCommandResult = websocket.subscribe<{
      agentId: string;
      commandId: string;
      command: string;
      status: string;
    }>(
      'local-agent:command-result',
      (data) => {
        // Refresh command history for this agent
        get().fetchCommandHistory(data.agentId);
        // Clear streaming output for this command
        const outputs = { ...get().streamingOutputs };
        if (outputs[data.commandId]) {
          outputs[data.commandId] = { ...outputs[data.commandId], isRunning: false };
          set({ streamingOutputs: outputs });
        }
      }
    );

    const unsubOutput = websocket.subscribe<{
      agentId: string;
      commandId: string;
      chunk: string;
      stream: 'stdout' | 'stderr';
    }>(
      'local-agent:output',
      (data) => {
        const outputs = { ...get().streamingOutputs };
        const existing = outputs[data.commandId];
        if (existing) {
          outputs[data.commandId] = {
            ...existing,
            chunks: [...existing.chunks, data.chunk],
          };
        } else {
          outputs[data.commandId] = {
            commandId: data.commandId,
            chunks: [data.chunk],
            stream: data.stream,
            isRunning: true,
          };
        }
        set({ streamingOutputs: outputs });
      }
    );

    const unsubApproval = websocket.subscribe<PendingApproval>(
      'local-agent:approval-needed',
      (data) => {
        set({
          pendingApprovals: [...get().pendingApprovals, data],
        });
      }
    );

    set({ _socketInitialized: true });

    // Return cleanup function with reference counting
    return () => {
      const count = get()._socketRefCount - 1;
      set({ _socketRefCount: count });
      if (count <= 0) {
        unsubOnline();
        unsubOffline();
        unsubCommandResult();
        unsubOutput();
        unsubApproval();
        set({ _socketInitialized: false, _socketRefCount: 0 });
      }
    };
  },
}));
