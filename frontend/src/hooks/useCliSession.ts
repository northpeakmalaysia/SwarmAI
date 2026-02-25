import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';

/**
 * CLI Session interface
 */
export interface CLISession {
  id: string;
  userId: string;
  agentId?: string;
  workspaceId: string;
  cliType: 'claude' | 'gemini' | 'opencode';
  status: 'active' | 'completed' | 'failed' | 'expired';
  lastPrompt?: string;
  lastOutput?: string;
  contextSummary?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Options for creating a new CLI session
 */
export interface CreateSessionOptions {
  workspaceId: string;
  cliType: 'claude' | 'gemini' | 'opencode';
  agentId?: string;
  expiresInHours?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Options for updating a CLI session
 */
export interface UpdateSessionOptions {
  lastPrompt?: string;
  lastOutput?: string;
  contextSummary?: string;
  status?: 'active' | 'completed' | 'failed' | 'expired';
  metadata?: Record<string, unknown>;
}

/**
 * Return type for useCliSession hook
 */
export interface UseCliSessionReturn {
  sessions: CLISession[];
  currentSession: CLISession | null;
  loading: boolean;
  error: string | null;
  createSession: (options: CreateSessionOptions) => Promise<CLISession>;
  getSession: (sessionId: string) => Promise<CLISession | null>;
  updateSession: (sessionId: string, updates: UpdateSessionOptions) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  fetchUserSessions: (filters?: { status?: string; cliType?: string }) => Promise<void>;
  fetchWorkspaceSessions: (workspaceId: string) => Promise<void>;
  cleanupExpiredSessions: () => Promise<number>;
  cleanupOldSessions: (olderThanDays?: number) => Promise<number>;
  setCurrentSession: (session: CLISession | null) => void;
}

/**
 * Hook for managing CLI sessions (Claude, Gemini, OpenCode)
 * Provides CRUD operations and session resumption capabilities
 */
export function useCliSession(): UseCliSessionReturn {
  const [sessions, setSessions] = useState<CLISession[]>([]);
  const [currentSession, setCurrentSession] = useState<CLISession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create a new CLI session
   */
  const createSession = useCallback(async (options: CreateSessionOptions): Promise<CLISession> => {
    setLoading(true);
    setError(null);

    try {
      const session = await api.post<CLISession>('/cli/sessions', options);

      // Add to sessions list
      setSessions((prev) => [session, ...prev]);

      return session;
    } catch (err) {
      const errorMessage = (err as { error?: string })?.error || 'Failed to create session';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get a specific session by ID
   */
  const getSession = useCallback(async (sessionId: string): Promise<CLISession | null> => {
    setLoading(true);
    setError(null);

    try {
      const session = await api.get<CLISession>(`/cli/sessions/${sessionId}`);

      // Update current session if it matches
      if (currentSession?.id === sessionId) {
        setCurrentSession(session);
      }

      // Update in sessions list
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? session : s))
      );

      return session;
    } catch (err) {
      const errorMessage = (err as { error?: string })?.error || 'Failed to fetch session';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [currentSession]);

  /**
   * Update a session
   */
  const updateSession = useCallback(async (
    sessionId: string,
    updates: UpdateSessionOptions
  ): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await api.put(`/cli/sessions/${sessionId}`, updates);

      // Update in sessions list
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                ...updates,
                updatedAt: Math.floor(Date.now() / 1000),
              }
            : s
        )
      );

      // Update current session if it matches
      if (currentSession?.id === sessionId) {
        setCurrentSession((prev) =>
          prev ? { ...prev, ...updates, updatedAt: Math.floor(Date.now() / 1000) } : null
        );
      }
    } catch (err) {
      const errorMessage = (err as { error?: string })?.error || 'Failed to update session';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [currentSession]);

  /**
   * Delete a session
   */
  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await api.delete(`/cli/sessions/${sessionId}`);

      // Remove from sessions list
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      // Clear current session if it matches
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
      }
    } catch (err) {
      const errorMessage = (err as { error?: string })?.error || 'Failed to delete session';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [currentSession]);

  /**
   * Fetch all sessions for the current user
   */
  const fetchUserSessions = useCallback(async (filters?: {
    status?: string;
    cliType?: string;
  }): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      if (filters?.status) queryParams.append('status', filters.status);
      if (filters?.cliType) queryParams.append('cliType', filters.cliType);

      const url = `/cli/sessions${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const fetchedSessions = await api.get<CLISession[]>(url);

      setSessions(fetchedSessions);
    } catch (err) {
      const errorMessage = (err as { error?: string })?.error || 'Failed to fetch sessions';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch all sessions for a specific workspace
   */
  const fetchWorkspaceSessions = useCallback(async (workspaceId: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const fetchedSessions = await api.get<CLISession[]>(`/cli/sessions/workspace/${workspaceId}`);
      setSessions(fetchedSessions);
    } catch (err) {
      const errorMessage = (err as { error?: string })?.error || 'Failed to fetch workspace sessions';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Cleanup expired sessions
   */
  const cleanupExpiredSessions = useCallback(async (): Promise<number> => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.post<{ deletedCount: number }>('/cli/sessions/cleanup/expired');

      // Refetch sessions to update the list
      await fetchUserSessions();

      return result.deletedCount;
    } catch (err) {
      const errorMessage = (err as { error?: string })?.error || 'Failed to cleanup expired sessions';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchUserSessions]);

  /**
   * Cleanup old sessions
   */
  const cleanupOldSessions = useCallback(async (olderThanDays: number = 30): Promise<number> => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.post<{ deletedCount: number }>('/cli/sessions/cleanup/old', {
        olderThanDays,
      });

      // Refetch sessions to update the list
      await fetchUserSessions();

      return result.deletedCount;
    } catch (err) {
      const errorMessage = (err as { error?: string })?.error || 'Failed to cleanup old sessions';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchUserSessions]);

  return {
    sessions,
    currentSession,
    loading,
    error,
    createSession,
    getSession,
    updateSession,
    deleteSession,
    fetchUserSessions,
    fetchWorkspaceSessions,
    cleanupExpiredSessions,
    cleanupOldSessions,
    setCurrentSession,
  };
}

/**
 * Hook for managing a single CLI session with auto-fetch
 * Useful for resuming a specific session
 */
export function useCliSessionById(sessionId: string | null): {
  session: CLISession | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [session, setSession] = useState<CLISession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;

    setLoading(true);
    setError(null);

    try {
      const fetchedSession = await api.get<CLISession>(`/cli/sessions/${sessionId}`);
      setSession(fetchedSession);
    } catch (err) {
      const errorMessage = (err as { error?: string })?.error || 'Failed to fetch session';
      setError(errorMessage);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Auto-fetch on mount and when sessionId changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    session,
    loading,
    error,
    refresh,
  };
}
