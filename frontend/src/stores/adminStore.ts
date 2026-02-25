import { create } from 'zustand';
import api from '../services/api';
import { extractErrorMessage } from '../lib/utils';

/**
 * User in admin context
 */
export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: 'user' | 'admin';
  isSuperuser: boolean;
  isSuspended: boolean;
  createdAt: string;
  updatedAt?: string;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  agentCount?: number;
  conversationCount?: number;
}

/**
 * User details with stats
 */
export interface UserDetails extends AdminUser {
  subscription: {
    plan: string;
    status: string;
    agentSlots?: number;
    features?: Record<string, unknown>;
  };
  stats: {
    agents: number;
    conversations: number;
    messages: number;
    flows: number;
    knowledgeLibraries: number;
  };
  aiUsage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    totalRequests: number;
  };
}

/**
 * Pagination info
 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * System setting
 */
export interface SystemSetting {
  value: unknown;
  description?: string;
  updatedAt?: string;
}

/**
 * Admin stats
 */
export interface AdminStats {
  users: {
    total: number;
    active: number;
    suspended: number;
    admins: number;
    superadmins: number;
  };
  subscriptions: {
    free: number;
    starter: number;
    pro: number;
    enterprise: number;
  };
  agents: {
    total: number;
    active: number;
  };
  conversations: {
    total: number;
    active: number;
  };
  messages: {
    total: number;
    today: number;
  };
  aiUsage: {
    totalTokens: number;
    totalCost: number;
  };
}

/**
 * User filters
 */
export interface UserFilters {
  search: string;
  role: string;
  status: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

/**
 * System log entry
 */
export interface SystemLogEntry {
  id: string;
  timestamp: string;
  type: 'system' | 'api' | 'agent' | 'superbrain' | 'webhook';
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log filters
 */
export interface LogFilters {
  type: string;
  level: string;
  search: string;
  userId: string;
  provider: string;
  startDate: string;
  endDate: string;
}

/**
 * Log statistics
 */
export interface LogStats {
  summary: {
    total: number;
    errors: number;
    warnings: number;
    apiRequests: number;
  };
  byType: {
    system: number;
    agent: number;
    api: number;
    webhook: number;
  };
  aiUsage: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
  };
  topProviders: Array<{ provider: string; count: number }>;
  timeRange: {
    start: string;
    end: string;
  };
}

/**
 * Log pagination
 */
export interface LogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Admin Store State
 */
interface AdminStoreState {
  // State
  users: AdminUser[];
  selectedUser: UserDetails | null;
  pagination: Pagination;
  filters: UserFilters;
  systemSettings: Record<string, SystemSetting>;
  stats: AdminStats | null;
  loading: boolean;
  error: string | null;

  // Log State
  logs: SystemLogEntry[];
  logStats: LogStats | null;
  logFilters: LogFilters;
  logPagination: LogPagination;
  logsLoading: boolean;

  // User Actions
  fetchUsers: () => Promise<void>;
  fetchUserDetails: (userId: string) => Promise<void>;
  updateUser: (userId: string, updates: Partial<AdminUser>) => Promise<void>;
  suspendUser: (userId: string, reason?: string) => Promise<void>;
  activateUser: (userId: string) => Promise<void>;
  updateUserSubscription: (userId: string, updates: { plan?: string; agentSlots?: number; features?: Record<string, unknown> }) => Promise<void>;

  // Filter Actions
  setFilters: (filters: Partial<UserFilters>) => void;
  setPage: (page: number) => void;
  clearSelectedUser: () => void;

  // System Settings Actions
  fetchSystemSettings: () => Promise<void>;
  updateSystemSetting: (key: string, value: unknown, description?: string) => Promise<void>;
  deleteSystemSetting: (key: string) => Promise<void>;

  // Stats Actions
  fetchStats: () => Promise<void>;

  // Log Actions
  fetchLogs: () => Promise<void>;
  fetchLogStats: () => Promise<void>;
  setLogFilters: (filters: Partial<LogFilters>) => void;
  setLogPage: (page: number) => void;
  exportLogs: (format: 'json' | 'csv') => Promise<void>;
  cleanupLogs: (retentionDays: number) => Promise<void>;

  // Utility Actions
  clearError: () => void;
}

export const useAdminStore = create<AdminStoreState>((set, get) => ({
  // Initial State
  users: [],
  selectedUser: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
  filters: {
    search: '',
    role: '',
    status: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
  },
  systemSettings: {},
  stats: null,
  loading: false,
  error: null,

  // Log Initial State
  logs: [],
  logStats: null,
  logFilters: {
    type: 'all',
    level: '',
    search: '',
    userId: '',
    provider: '',
    startDate: '',
    endDate: '',
  },
  logPagination: {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
    hasMore: false,
  },
  logsLoading: false,

  /**
   * Fetch users with current filters and pagination
   */
  fetchUsers: async () => {
    const { pagination, filters } = get();
    set({ loading: true, error: null });

    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        ...(filters.search && { search: filters.search }),
        ...(filters.role && { role: filters.role }),
        ...(filters.status && { status: filters.status }),
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      });

      const response = await api.get(`/admin/users?${params}`);
      const data = response.data;

      set({
        users: data.users || [],
        pagination: data.pagination || get().pagination,
        loading: false,
      });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch users'), loading: false });
    }
  },

  /**
   * Fetch detailed user information
   */
  fetchUserDetails: async (userId) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/admin/users/${userId}`);
      const data = response.data;

      set({
        selectedUser: {
          ...data.user,
          subscription: data.subscription,
          stats: data.stats,
          aiUsage: data.aiUsage,
        },
        loading: false,
      });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch user details'), loading: false });
    }
  },

  /**
   * Update user details
   */
  updateUser: async (userId, updates) => {
    set({ loading: true, error: null });
    try {
      const response = await api.patch(`/admin/users/${userId}`, updates);
      const updatedUser = response.data.user;

      // Update user in list
      set((state) => ({
        users: state.users.map((u) =>
          u.id === userId ? { ...u, ...updatedUser } : u
        ),
        selectedUser: state.selectedUser?.id === userId
          ? { ...state.selectedUser, ...updatedUser }
          : state.selectedUser,
        loading: false,
      }));
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to update user'), loading: false });
      throw error;
    }
  },

  /**
   * Suspend a user
   */
  suspendUser: async (userId, reason) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/admin/users/${userId}/suspend`, { reason });

      // Update user in list
      set((state) => ({
        users: state.users.map((u) =>
          u.id === userId ? { ...u, isSuspended: true } : u
        ),
        selectedUser: state.selectedUser?.id === userId
          ? { ...state.selectedUser, isSuspended: true }
          : state.selectedUser,
        loading: false,
      }));
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to suspend user'), loading: false });
      throw error;
    }
  },

  /**
   * Activate a suspended user
   */
  activateUser: async (userId) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/admin/users/${userId}/activate`);

      // Update user in list
      set((state) => ({
        users: state.users.map((u) =>
          u.id === userId ? { ...u, isSuspended: false } : u
        ),
        selectedUser: state.selectedUser?.id === userId
          ? { ...state.selectedUser, isSuspended: false }
          : state.selectedUser,
        loading: false,
      }));
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to activate user'), loading: false });
      throw error;
    }
  },

  /**
   * Update user's subscription
   */
  updateUserSubscription: async (userId, updates) => {
    set({ loading: true, error: null });
    try {
      const response = await api.patch(`/admin/users/${userId}/subscription`, updates);
      const subscription = response.data.subscription;

      // Update selected user's subscription
      set((state) => ({
        selectedUser: state.selectedUser?.id === userId
          ? { ...state.selectedUser, subscription }
          : state.selectedUser,
        users: state.users.map((u) =>
          u.id === userId ? { ...u, subscriptionPlan: subscription.plan } : u
        ),
        loading: false,
      }));
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to update subscription'), loading: false });
      throw error;
    }
  },

  /**
   * Set user filters
   */
  setFilters: (filters) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
      pagination: { ...state.pagination, page: 1 }, // Reset to first page
    }));
  },

  /**
   * Set current page
   */
  setPage: (page) => {
    set((state) => ({
      pagination: { ...state.pagination, page },
    }));
  },

  /**
   * Clear selected user
   */
  clearSelectedUser: () => {
    set({ selectedUser: null });
  },

  /**
   * Fetch all system settings
   */
  fetchSystemSettings: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/admin/system-settings');
      set({
        systemSettings: response.data.settings || {},
        loading: false,
      });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch system settings'), loading: false });
    }
  },

  /**
   * Update a system setting
   */
  updateSystemSetting: async (key, value, description) => {
    set({ loading: true, error: null });
    try {
      await api.patch(`/admin/system-settings/${key}`, { value, description });

      set((state) => ({
        systemSettings: {
          ...state.systemSettings,
          [key]: { value, description, updatedAt: new Date().toISOString() },
        },
        loading: false,
      }));
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to update system setting'), loading: false });
      throw error;
    }
  },

  /**
   * Delete a system setting
   */
  deleteSystemSetting: async (key) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/admin/system-settings/${key}`);

      set((state) => {
        const { [key]: _, ...rest } = state.systemSettings;
        return { systemSettings: rest, loading: false };
      });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to delete system setting'), loading: false });
      throw error;
    }
  },

  /**
   * Fetch admin dashboard stats
   */
  fetchStats: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/admin/stats');
      set({
        stats: response.data.stats,
        loading: false,
      });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch admin stats'), loading: false });
    }
  },

  /**
   * Fetch system logs
   */
  fetchLogs: async () => {
    const { logFilters, logPagination } = get();
    set({ logsLoading: true, error: null });

    try {
      const params = new URLSearchParams({
        page: String(logPagination.page),
        limit: String(logPagination.limit),
        type: logFilters.type,
        ...(logFilters.level && { level: logFilters.level }),
        ...(logFilters.search && { search: logFilters.search }),
        ...(logFilters.userId && { userId: logFilters.userId }),
        ...(logFilters.provider && { provider: logFilters.provider }),
        ...(logFilters.startDate && { startDate: logFilters.startDate }),
        ...(logFilters.endDate && { endDate: logFilters.endDate }),
      });

      const response = await api.get(`/admin/logs?${params}`);
      const data = response.data;

      set({
        logs: data.logs || [],
        logPagination: {
          page: data.page || 1,
          limit: data.limit || 50,
          total: data.total || 0,
          totalPages: data.totalPages || 0,
          hasMore: data.hasMore || false,
        },
        logsLoading: false,
      });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch logs'), logsLoading: false });
    }
  },

  /**
   * Fetch log statistics
   */
  fetchLogStats: async () => {
    const { logFilters } = get();
    set({ logsLoading: true, error: null });

    try {
      const params = new URLSearchParams({
        ...(logFilters.startDate && { startDate: logFilters.startDate }),
        ...(logFilters.endDate && { endDate: logFilters.endDate }),
        ...(logFilters.userId && { userId: logFilters.userId }),
      });

      const response = await api.get(`/admin/logs/stats?${params}`);
      set({
        logStats: response.data.stats,
        logsLoading: false,
      });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch log stats'), logsLoading: false });
    }
  },

  /**
   * Set log filters
   */
  setLogFilters: (filters) => {
    set((state) => ({
      logFilters: { ...state.logFilters, ...filters },
      logPagination: { ...state.logPagination, page: 1 }, // Reset to first page
    }));
  },

  /**
   * Set log page
   */
  setLogPage: (page) => {
    set((state) => ({
      logPagination: { ...state.logPagination, page },
    }));
  },

  /**
   * Export logs
   */
  exportLogs: async (format) => {
    const { logFilters } = get();

    try {
      const params = new URLSearchParams({
        format,
        type: logFilters.type,
        ...(logFilters.level && { level: logFilters.level }),
        ...(logFilters.startDate && { startDate: logFilters.startDate }),
        ...(logFilters.endDate && { endDate: logFilters.endDate }),
      });

      // Create download link
      const response = await api.get(`/admin/logs/export?${params}`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: format === 'csv' ? 'text/csv' : 'application/json',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to export logs') });
      throw error;
    }
  },

  /**
   * Cleanup old logs
   */
  cleanupLogs: async (retentionDays) => {
    set({ logsLoading: true, error: null });

    try {
      await api.post('/admin/logs/cleanup', { retentionDays });
      // Refresh logs and stats after cleanup
      await get().fetchLogs();
      await get().fetchLogStats();
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to cleanup logs'), logsLoading: false });
      throw error;
    }
  },

  /**
   * Clear error state
   */
  clearError: () => {
    set({ error: null });
  },
}));
