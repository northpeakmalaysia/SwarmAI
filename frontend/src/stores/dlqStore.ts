import { create } from 'zustand';
import api from '../services/api';

export interface DLQStats {
  pending?: number;
  sending?: number;
  sent?: number;
  retrying?: number;
  dead?: number;
}

export interface DeadLetter {
  id: string;
  recipient: string;
  platform: string;
  content: string;
  content_type: string;
  status: string;
  retry_count: number;
  last_error: string;
  source: string;
  created_at: string;
  dead_at: string;
}

interface DLQState {
  stats: DLQStats | null;
  healthStatus: 'healthy' | 'warning';
  recent24h: { sent: number; dead: number };
  deadLetters: DeadLetter[];
  isLoading: boolean;
  error: string | null;

  fetchStats: () => Promise<void>;
  fetchDeadLetters: () => Promise<void>;
  retryDeadLetter: (id: string) => Promise<boolean>;
}

export const useDLQStore = create<DLQState>((set, get) => ({
  stats: null,
  healthStatus: 'healthy',
  recent24h: { sent: 0, dead: 0 },
  deadLetters: [],
  isLoading: false,
  error: null,

  fetchStats: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/dashboard/dlq/stats');
      const data = response.data;
      set({
        stats: data.stats,
        recent24h: data.recent24h,
        healthStatus: data.healthStatus,
        isLoading: false,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch DLQ stats';
      set({ error: msg, isLoading: false });
    }
  },

  fetchDeadLetters: async () => {
    try {
      const response = await api.get('/dashboard/dlq/dead-letters');
      set({ deadLetters: response.data.deadLetters });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch dead letters';
      set({ error: msg });
    }
  },

  retryDeadLetter: async (id: string) => {
    try {
      const response = await api.post(`/dashboard/dlq/retry/${id}`);
      // Refresh both stats and dead letters after retry
      const { fetchStats, fetchDeadLetters } = get();
      await Promise.all([fetchStats(), fetchDeadLetters()]);
      return response.data.sent;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to retry';
      set({ error: msg });
      return false;
    }
  },
}));
