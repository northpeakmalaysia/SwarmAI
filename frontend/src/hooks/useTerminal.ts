import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

/**
 * Terminal type information
 */
export interface TerminalType {
  type: string;
  name: string;
  installed: boolean;
  description?: string;
}

/**
 * Terminal session information
 */
export interface TerminalSession {
  id: string;
  userId: string;
  type: string;
  createdAt: string;
  lastActivity: string;
  cols: number;
  rows: number;
}

/**
 * Terminal types response
 */
interface TerminalTypesResponse {
  types: TerminalType[];
}

/**
 * Terminal sessions response
 */
interface TerminalSessionsResponse {
  sessions: TerminalSession[];
}

/**
 * Create session response
 */
interface CreateSessionResponse {
  session: TerminalSession;
}

/**
 * Install CLI response
 */
interface InstallCliResponse {
  success: boolean;
  message: string;
}

/**
 * Hook for managing terminal types and sessions
 */
export function useTerminal() {
  const [types, setTypes] = useState<TerminalType[]>([]);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  /**
   * Fetch available terminal types
   */
  const fetchTypes = useCallback(async () => {
    try {
      const response = await api.get<TerminalTypesResponse>('/terminal/types');
      if (mountedRef.current) {
        setTypes(response.types || []);
      }
    } catch (err) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to fetch terminal types';
        setError(message);
        console.error('[useTerminal] Failed to fetch types:', message);
      }
    }
  }, []);

  /**
   * Fetch user's terminal sessions
   */
  const fetchSessions = useCallback(async () => {
    try {
      const response = await api.get<TerminalSessionsResponse>('/terminal/sessions');
      if (mountedRef.current) {
        setSessions(response.sessions || []);
      }
    } catch (err) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to fetch terminal sessions';
        setError(message);
        console.error('[useTerminal] Failed to fetch sessions:', message);
      }
    }
  }, []);

  /**
   * Create a new terminal session
   */
  const createSession = useCallback(async (
    type: string,
    options?: { cols?: number; rows?: number }
  ): Promise<TerminalSession> => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<CreateSessionResponse>('/terminal/sessions', {
        type,
        ...options
      });
      await fetchSessions();
      return response.session;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create terminal session';
      setError(message);
      throw new Error(message);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchSessions]);

  /**
   * Kill/terminate a terminal session
   */
  const killSession = useCallback(async (sessionId: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/terminal/sessions/${sessionId}`);
      await fetchSessions();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to kill terminal session';
      setError(message);
      throw new Error(message);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchSessions]);

  /**
   * Install a CLI tool
   */
  const installCli = useCallback(async (cli: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api.post<InstallCliResponse>(`/terminal/cli/${cli}/install`);
      await fetchTypes();
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to install ${cli}`;
      setError(message);
      throw new Error(message);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchTypes]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Fetch types and sessions on mount
  useEffect(() => {
    mountedRef.current = true;
    fetchTypes();
    fetchSessions();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchTypes, fetchSessions]);

  return {
    // State
    types,
    sessions,
    loading,
    error,
    // Actions
    createSession,
    killSession,
    installCli,
    clearError,
    // Refresh functions
    refreshTypes: fetchTypes,
    refreshSessions: fetchSessions
  };
}

export default useTerminal;
