import { create } from 'zustand';
import api from '../services/api';

export interface PlatformHealthAccount {
  accountId: string;
  platform: string;
  agentId: string | null;
  agentName: string | null;
  userId: string | null;
  status: string;
  healthScore: number;
  lastMessageSentAt: string | null;
  lastMessageReceivedAt: string | null;
  lastError: string | null;
  errorCount1h: number;
  errorCount24h: number;
  uptimePct24h: number;
  avgDeliveryLatencyMs: number;
  deadLetterCount: number;
  updatedAt: string;
}

export interface PlatformBreakdown {
  platform: string;
  total: number;
  healthy: number;
  degraded: number;
  critical: number;
  avg_score: number;
}

export interface PlatformHealthSummary {
  total: number;
  healthy: number;
  degraded: number;
  critical: number;
  byPlatform: PlatformBreakdown[];
  timestamp: string;
}

interface PlatformHealthState {
  summary: PlatformHealthSummary | null;
  accounts: PlatformHealthAccount[];
  isLoading: boolean;
  error: string | null;

  fetchSummary: () => Promise<void>;
  fetchAccounts: () => Promise<void>;
}

export const usePlatformHealthStore = create<PlatformHealthState>((set) => ({
  summary: null,
  accounts: [],
  isLoading: false,
  error: null,

  fetchSummary: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/platforms/health');
      set({ summary: response.data, isLoading: false });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch health summary';
      set({ error: msg, isLoading: false });
    }
  },

  fetchAccounts: async () => {
    try {
      const response = await api.get('/platforms/health/accounts');
      set({ accounts: response.data.accounts || [] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch health accounts';
      set({ error: msg });
    }
  },
}));
