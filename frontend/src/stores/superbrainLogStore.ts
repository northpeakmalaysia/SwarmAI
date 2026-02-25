/**
 * SuperBrain Log Store
 *
 * Zustand store for real-time SuperBrain activity logging.
 * Manages log entries, filtering, statistics, and WebSocket subscriptions.
 */

import { create } from 'zustand';
import { api } from '@/services/api';

// Types
export interface SuperBrainLogMessage {
  id: string;
  platform: string;
  sender: string;
  contentPreview: string;
  conversationId: string | null;
}

export interface SuperBrainLogClassification {
  intent: 'SKIP' | 'PASSIVE' | 'ACTIVE' | null;
  tier: 'trivial' | 'simple' | 'moderate' | 'complex' | 'critical' | null;
  confidence: number | null;
  reasons: string[];
}

export interface SuperBrainLogExecution {
  providerChain: string[];
  providerUsed: string | null;
  model: string | null;
  failedProviders: Array<{ provider: string; error: string }>;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  } | null;
}

export interface SuperBrainLogTool {
  name: string;
  category: string | null;
  parameters: Record<string, unknown> | null;
  result: {
    success: boolean;
    output: unknown;
    error: string | null;
  } | null;
  duration: number | null;
}

export interface SuperBrainLogResult {
  type: string;
  success: boolean;
  error: string | null;
  responsePreview: string | null;
}

export interface SuperBrainLogDuration {
  total: number;
  classification: number;
  providerSelection: number;
  execution: number;
  tools: number;
}

export interface SuperBrainLogEntry {
  id: string;
  timestamp: number;
  message: SuperBrainLogMessage;
  classification: SuperBrainLogClassification;
  execution: SuperBrainLogExecution;
  tools: SuperBrainLogTool[];
  result: SuperBrainLogResult;
  duration: SuperBrainLogDuration;
  userId: string;
  agentId: string | null;
  flowId: string | null;
}

export interface SuperBrainLogStats {
  total: number;
  byStatus: { success: number; error: number };
  byTier: Record<string, number>;
  byProvider: Record<string, number>;
  byIntent: Record<string, number>;
  byResultType: Record<string, number>;
  avgDuration: number;
  toolsUsed: Record<string, number>;
  timeRange: {
    oldest: number | null;
    newest: number | null;
  };
}

export interface SuperBrainLogFilters {
  status: 'all' | 'success' | 'error';
  provider: string | null;
  tier: string | null;
  intent: string | null;
}

interface SuperBrainLogState {
  // Data
  logs: SuperBrainLogEntry[];
  stats: SuperBrainLogStats | null;
  selectedLog: SuperBrainLogEntry | null;

  // UI State
  filters: SuperBrainLogFilters;
  isLoading: boolean;
  isLoadingStats: boolean;
  hasMore: boolean;
  total: number;
  autoScroll: boolean;
  isAvailable: boolean;
  ttlHours: number;

  // Actions
  fetchLogs: (reset?: boolean) => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchLogStatus: () => Promise<void>;
  addLogEntry: (entry: SuperBrainLogEntry) => void;
  setFilters: (filters: Partial<SuperBrainLogFilters>) => void;
  setAutoScroll: (enabled: boolean) => void;
  selectLog: (log: SuperBrainLogEntry | null) => void;
  clearLogs: () => Promise<void>;
  reset: () => void;
}

const initialFilters: SuperBrainLogFilters = {
  status: 'all',
  provider: null,
  tier: null,
  intent: null,
};

export const useSuperBrainLogStore = create<SuperBrainLogState>((set, get) => ({
  // Initial state
  logs: [],
  stats: null,
  selectedLog: null,
  filters: { ...initialFilters },
  isLoading: false,
  isLoadingStats: false,
  hasMore: true,
  total: 0,
  autoScroll: true,
  isAvailable: true,
  ttlHours: 12,

  // Fetch logs with pagination and filters
  fetchLogs: async (reset = false) => {
    const { logs, filters, isLoading } = get();
    if (isLoading) return;

    set({ isLoading: true });

    try {
      const offset = reset ? 0 : logs.length;
      const params = new URLSearchParams({
        limit: '50',
        offset: offset.toString(),
      });

      if (filters.status !== 'all') {
        params.append('status', filters.status);
      }
      if (filters.provider) {
        params.append('provider', filters.provider);
      }
      if (filters.tier) {
        params.append('tier', filters.tier);
      }
      if (filters.intent) {
        params.append('intent', filters.intent);
      }

      const response = await api.get<{
        logs: SuperBrainLogEntry[];
        total: number;
        hasMore: boolean;
        ttlHours: number;
      }>(`/superbrain/logs?${params}`);
      const { logs: newLogs, total, hasMore, ttlHours } = response;

      // Dedupe logs when appending to prevent duplicate keys
      let mergedLogs: SuperBrainLogEntry[];
      if (reset) {
        mergedLogs = newLogs;
      } else {
        const existingIds = new Set(logs.map((l) => l.id));
        const uniqueNewLogs = newLogs.filter((l) => !existingIds.has(l.id));
        mergedLogs = [...logs, ...uniqueNewLogs];
      }

      set({
        logs: mergedLogs,
        total,
        hasMore,
        ttlHours: ttlHours || 12,
        isLoading: false,
        isAvailable: true,
      });
    } catch (error: unknown) {
      console.error('Failed to fetch SuperBrain logs:', error);
      const errResponse = (error as { response?: { status?: number } })?.response;
      if (errResponse?.status === 503) {
        set({ isAvailable: false });
      }
      set({ isLoading: false });
    }
  },

  // Fetch statistics
  fetchStats: async () => {
    set({ isLoadingStats: true });

    try {
      const response = await api.get<{
        stats: SuperBrainLogStats;
        ttlHours: number;
      }>('/superbrain/logs/stats');
      set({
        stats: response.stats,
        ttlHours: response.ttlHours || 12,
        isLoadingStats: false,
        isAvailable: true,
      });
    } catch (error: unknown) {
      console.error('Failed to fetch SuperBrain log stats:', error);
      const errResponse = (error as { response?: { status?: number } })?.response;
      if (errResponse?.status === 503) {
        set({ isAvailable: false });
      }
      set({ isLoadingStats: false });
    }
  },

  // Check log service availability
  fetchLogStatus: async () => {
    try {
      const response = await api.get<{
        available: boolean;
        ttlHours: number;
      }>('/superbrain/logs/status');
      set({
        isAvailable: response.available,
        ttlHours: response.ttlHours || 12,
      });
    } catch {
      set({ isAvailable: false });
    }
  },

  // Add a new log entry (from WebSocket)
  addLogEntry: (entry: SuperBrainLogEntry) => {
    set((state) => {
      const { filters, logs } = state;

      // Check for duplicate entry (avoid adding same log twice)
      if (logs.some((log) => log.id === entry.id)) {
        return state;
      }

      // Check if entry passes current filters
      if (filters.status !== 'all') {
        const matchesStatus = filters.status === 'success' ? entry.result.success : !entry.result.success;
        if (!matchesStatus) return state;
      }

      if (filters.provider && entry.execution.providerUsed !== filters.provider) {
        return state;
      }

      if (filters.tier && entry.classification.tier !== filters.tier) {
        return state;
      }

      if (filters.intent && entry.classification.intent !== filters.intent) {
        return state;
      }

      // Add to beginning (newest first) and keep max 500 in memory
      return {
        logs: [entry, ...logs].slice(0, 500),
        total: state.total + 1,
      };
    });
  },

  // Update filters and refetch
  setFilters: (newFilters: Partial<SuperBrainLogFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
    // Refetch with new filters
    get().fetchLogs(true);
  },

  // Toggle auto-scroll
  setAutoScroll: (enabled: boolean) => set({ autoScroll: enabled }),

  // Select a log for detail view
  selectLog: (log: SuperBrainLogEntry | null) => set({ selectedLog: log }),

  // Clear all logs
  clearLogs: async () => {
    try {
      await api.delete('/superbrain/logs');
      set({ logs: [], total: 0, selectedLog: null });
      get().fetchStats();
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  },

  // Reset store
  reset: () => set({
    logs: [],
    stats: null,
    selectedLog: null,
    filters: { ...initialFilters },
    isLoading: false,
    isLoadingStats: false,
    hasMore: true,
    total: 0,
  }),
}));
