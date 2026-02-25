/**
 * useWebSocket Hook Tests
 * Tests for the WebSocket connection hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ============================================================================
// Mock Setup - Use vi.hoisted for mocks used in vi.mock factory
// ============================================================================

const {
  mockConnect,
  mockDisconnect,
  mockSubscribe,
  mockReconnect,
  mockWebsocketState,
} = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockDisconnect: vi.fn(),
  mockSubscribe: vi.fn(),
  mockReconnect: vi.fn(),
  mockWebsocketState: {
    isConnected: true,
    state: 'connected' as const,
  },
}));

const mockAuthState = vi.hoisted(() => ({
  token: null as string | null,
  isAuthenticated: false,
}));

// Mock websocket service
vi.mock('../../services/websocket', () => ({
  websocket: {
    connect: mockConnect,
    disconnect: mockDisconnect,
    subscribe: mockSubscribe,
    reconnect: mockReconnect,
    get isConnected() {
      return mockWebsocketState.isConnected;
    },
    get state() {
      return mockWebsocketState.state;
    },
  },
}));

// Mock auth store
vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn(() => mockAuthState),
}));

// Import after mocks are set up
import { useWebSocket } from '../../hooks/useWebSocket';

// ============================================================================
// Helper Functions
// ============================================================================

const setAuthState = (state: { token: string | null; isAuthenticated: boolean }) => {
  mockAuthState.token = state.token;
  mockAuthState.isAuthenticated = state.isAuthenticated;
};

const setWebsocketState = (state: { isConnected: boolean; state: 'connected' | 'disconnected' | 'error' | 'connecting' }) => {
  mockWebsocketState.isConnected = state.isConnected;
  (mockWebsocketState as { state: typeof state.state }).state = state.state;
};

const resetMocks = () => {
  mockConnect.mockClear();
  mockConnect.mockResolvedValue(undefined);
  mockDisconnect.mockClear();
  mockSubscribe.mockClear();
  mockSubscribe.mockReturnValue(vi.fn());
  mockReconnect.mockClear();
  setWebsocketState({ isConnected: true, state: 'connected' });
  setAuthState({ token: null, isAuthenticated: false });
};

// ============================================================================
// Test Suite
// ============================================================================

describe('useWebSocket', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Initial State Tests
  // --------------------------------------------------------------------------
  describe('Initial State', () => {
    it('returns correct interface shape', () => {
      setAuthState({ token: null, isAuthenticated: false });

      const { result } = renderHook(() => useWebSocket());

      expect(result.current).toHaveProperty('isConnected');
      expect(result.current).toHaveProperty('connectionState');
      expect(result.current).toHaveProperty('reconnect');
    });

    it('returns isConnected from websocket service', () => {
      setAuthState({ token: null, isAuthenticated: false });
      setWebsocketState({ isConnected: false, state: 'disconnected' });

      const { result } = renderHook(() => useWebSocket());

      expect(result.current.isConnected).toBe(false);
    });

    it('returns reconnect function', () => {
      setAuthState({ token: null, isAuthenticated: false });

      const { result } = renderHook(() => useWebSocket());

      expect(result.current.reconnect).toBeInstanceOf(Function);
    });
  });

  // --------------------------------------------------------------------------
  // Connection Tests
  // --------------------------------------------------------------------------
  describe('Connection Management', () => {
    it('attempts to connect when authenticated with token', async () => {
      setAuthState({ token: 'valid-token', isAuthenticated: true });

      renderHook(() => useWebSocket());

      await waitFor(() => {
        expect(mockConnect).toHaveBeenCalledWith('valid-token');
      });
    });

    it('does not connect when not authenticated', () => {
      setAuthState({ token: null, isAuthenticated: false });

      renderHook(() => useWebSocket());

      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('does not connect when authenticated but no token', () => {
      setAuthState({ token: null, isAuthenticated: true });

      renderHook(() => useWebSocket());

      expect(mockConnect).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Subscription Tests
  // --------------------------------------------------------------------------
  describe('Event Subscriptions', () => {
    it('subscribes to connection events on mount', () => {
      setAuthState({ token: null, isAuthenticated: false });

      renderHook(() => useWebSocket());

      // Should subscribe to connect, disconnect, and error events
      expect(mockSubscribe).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('calls unsubscribe functions on unmount', () => {
      const unsubscribe1 = vi.fn();
      const unsubscribe2 = vi.fn();
      const unsubscribe3 = vi.fn();

      mockSubscribe
        .mockReturnValueOnce(unsubscribe1)
        .mockReturnValueOnce(unsubscribe2)
        .mockReturnValueOnce(unsubscribe3);

      setAuthState({ token: null, isAuthenticated: false });

      const { unmount } = renderHook(() => useWebSocket());

      unmount();

      expect(unsubscribe1).toHaveBeenCalled();
      expect(unsubscribe2).toHaveBeenCalled();
      expect(unsubscribe3).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Reconnect Tests
  // --------------------------------------------------------------------------
  describe('Reconnect Functionality', () => {
    it('calls websocket reconnect when reconnect is invoked with token', () => {
      setAuthState({ token: 'test-token', isAuthenticated: true });

      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.reconnect();
      });

      expect(mockReconnect).toHaveBeenCalled();
    });

    it('does not reconnect without token', () => {
      setAuthState({ token: null, isAuthenticated: false });

      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.reconnect();
      });

      expect(mockReconnect).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // State Change Tests
  // --------------------------------------------------------------------------
  describe('Connection State Changes', () => {
    it('updates connectionState when connect event fires', async () => {
      let capturedConnectHandler: (() => void) | null = null;

      mockSubscribe.mockImplementation((event: string, handler: () => void) => {
        if (event === 'connect') {
          capturedConnectHandler = handler;
        }
        return vi.fn();
      });

      setAuthState({ token: null, isAuthenticated: false });

      const { result } = renderHook(() => useWebSocket());

      // Simulate connect event
      if (capturedConnectHandler) {
        act(() => {
          capturedConnectHandler!();
        });
      }

      expect(result.current.connectionState).toBe('connected');
    });

    it('updates connectionState when disconnect event fires', async () => {
      let capturedDisconnectHandler: (() => void) | null = null;

      mockSubscribe.mockImplementation((event: string, handler: () => void) => {
        if (event === 'disconnect') {
          capturedDisconnectHandler = handler;
        }
        return vi.fn();
      });

      setAuthState({ token: null, isAuthenticated: false });

      const { result } = renderHook(() => useWebSocket());

      // Simulate disconnect event
      if (capturedDisconnectHandler) {
        act(() => {
          capturedDisconnectHandler!();
        });
      }

      expect(result.current.connectionState).toBe('disconnected');
    });

    it('updates connectionState when error event fires', async () => {
      let capturedErrorHandler: (() => void) | null = null;

      mockSubscribe.mockImplementation((event: string, handler: () => void) => {
        if (event === 'error') {
          capturedErrorHandler = handler;
        }
        return vi.fn();
      });

      setAuthState({ token: null, isAuthenticated: false });

      const { result } = renderHook(() => useWebSocket());

      // Simulate error event
      if (capturedErrorHandler) {
        act(() => {
          capturedErrorHandler!();
        });
      }

      expect(result.current.connectionState).toBe('error');
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling Tests
  // --------------------------------------------------------------------------
  describe('Error Handling', () => {
    it('handles connection failure gracefully', async () => {
      mockConnect.mockRejectedValue(new Error('Connection failed'));

      setAuthState({ token: 'test-token', isAuthenticated: true });

      // Should not throw
      const { result } = renderHook(() => useWebSocket());

      await waitFor(() => {
        expect(result.current.connectionState).toBe('error');
      });
    });
  });

  // --------------------------------------------------------------------------
  // Re-render Tests
  // --------------------------------------------------------------------------
  describe('Re-render Behavior', () => {
    it('maintains stable reconnect reference across renders', () => {
      setAuthState({ token: 'test-token', isAuthenticated: true });

      const { result, rerender } = renderHook(() => useWebSocket());

      const initialReconnect = result.current.reconnect;

      rerender();

      // Reconnect function should be stable (same reference due to useCallback)
      expect(result.current.reconnect).toBe(initialReconnect);
    });
  });

  // --------------------------------------------------------------------------
  // Integration Tests
  // --------------------------------------------------------------------------
  describe('Integration', () => {
    it('isConnected reflects websocket service state', () => {
      setWebsocketState({ isConnected: false, state: 'disconnected' });
      setAuthState({ token: null, isAuthenticated: false });

      const { result } = renderHook(() => useWebSocket());

      expect(result.current.isConnected).toBe(false);
    });

    it('sets connecting state during connection attempt', async () => {
      setAuthState({ token: 'test-token', isAuthenticated: true });

      // Make connect take some time
      mockConnect.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const { result } = renderHook(() => useWebSocket());

      // Should immediately set to connecting
      expect(result.current.connectionState).toBe('connecting');
    });
  });
});
