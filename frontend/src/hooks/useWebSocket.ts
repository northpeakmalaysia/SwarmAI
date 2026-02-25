import { useEffect, useRef, useState, useCallback } from 'react';
import { websocket, ConnectionState } from '../services/websocket';
import { useAuthStore } from '../stores/authStore';

/**
 * Return type for useWebSocket hook
 */
interface UseWebSocketReturn {
  isConnected: boolean;
  connectionState: ConnectionState;
  reconnect: () => void;
}

/**
 * Hook for managing WebSocket connection lifecycle
 * Automatically connects when authenticated and disconnects on logout
 * Uses the websocket service singleton for connection management
 */
export function useWebSocket(): UseWebSocketReturn {
  const { token, isAuthenticated } = useAuthStore();
  const [connectionState, setConnectionState] = useState<ConnectionState>(websocket.state);
  const connectedRef = useRef(false);

  // Subscribe to connection state changes
  useEffect(() => {
    const unsubscribeConnect = websocket.subscribe('connect', () => {
      setConnectionState('connected');
    });

    const unsubscribeDisconnect = websocket.subscribe('disconnect', () => {
      setConnectionState('disconnected');
    });

    const unsubscribeError = websocket.subscribe('error', () => {
      setConnectionState('error');
    });

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeError();
    };
  }, []);

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated && token && !connectedRef.current) {
      setConnectionState('connecting');
      websocket
        .connect(token)
        .then(() => {
          connectedRef.current = true;
          setConnectionState('connected');
        })
        .catch((error) => {
          console.error('[useWebSocket] Connection failed:', error);
          setConnectionState('error');
        });
    }

    // Disconnect when logging out
    if (!isAuthenticated && connectedRef.current) {
      websocket.disconnect();
      connectedRef.current = false;
      setConnectionState('disconnected');
    }

    return () => {
      // Only disconnect on unmount if still connected
      if (connectedRef.current) {
        websocket.disconnect();
        connectedRef.current = false;
      }
    };
  }, [isAuthenticated, token]);

  const reconnect = useCallback(() => {
    if (token) {
      setConnectionState('connecting');
      websocket.reconnect();
    }
  }, [token]);

  return {
    isConnected: websocket.isConnected,
    connectionState,
    reconnect,
  };
}
