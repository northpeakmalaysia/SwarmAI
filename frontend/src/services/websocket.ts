import { io, Socket } from 'socket.io-client';

/**
 * Get WebSocket URL from environment or use current origin
 * When using nginx proxy, socket.io connects to same origin with /socket.io path
 */
const getWsURL = (): string => {
  const wsUrl = import.meta.env.VITE_WS_URL;
  if (wsUrl) {
    console.log('[WebSocket] Using VITE_WS_URL:', wsUrl);
    return wsUrl;
  }
  // Use current origin (works with nginx proxy forwarding /socket.io)
  const origin = window.location.origin;
  console.log('[WebSocket] Using window.location.origin:', origin);
  return origin;
};

const WS_URL = getWsURL();
console.log('[WebSocket] WS_URL configured as:', WS_URL);

/**
 * Event handler type
 */
type EventHandler<T = unknown> = (data: T) => void;

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * WebSocket events supported by the platform
 */
export type WebSocketEventName =
  | 'message:new'
  | 'message:status'
  | 'message:reaction'
  | 'message:streaming'
  | 'message:sent'
  | 'agent:status_changed'
  | 'agent:qr'
  | 'agent:busy'
  | 'agent:platform_status'
  | 'agent:platform_error'
  | 'agent:auth_step'
  | 'agent:auth_error'
  | 'conversation:created'
  | 'conversation:updated'
  | 'conversations:initial'    // WebSocket-first: receive all conversations
  | 'conversations:error'      // WebSocket-first: error fetching conversations
  | 'messages:initial'         // WebSocket-first: receive messages for a conversation
  | 'messages:error'           // WebSocket-first: error fetching messages
  | 'swarm:task_update'
  | 'swarm:task_created'
  | 'swarm:handoff'
  | 'swarm:consensus'
  | 'swarm:collaboration'
  | 'flow:execution_start'
  | 'flow:execution_update'
  | 'flow:execution_complete'
  | 'flow:queue:status'
  | 'flow:schedule:triggered'
  | 'notification'
  | 'error'
  | 'superbrain:log:new'
  | 'resync:status'
  | 'sync:status'
  | 'messages:synced'
  | 'agentic:reasoning:start'
  | 'agentic:reasoning:step'
  | 'agentic:tool:start'
  | 'agentic:tool:result'
  | 'agentic:reasoning:complete'
  | 'agentic:status:changed'
  | 'agentic:error'
  | 'local-agent:online'
  | 'local-agent:offline'
  | 'local-agent:command-result'
  | 'local-agent:output'
  | 'local-agent:approval-needed';

/**
 * WebSocket connection options
 */
interface ConnectionOptions {
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeout?: number;
}

/**
 * WebSocket Service for real-time communication
 * Provides event subscription, agent-specific subscriptions, and automatic reconnection
 */
class WebSocketService {
  private socket: Socket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private connectionState: ConnectionState = 'disconnected';
  private subscribedAgents: Set<string> = new Set();
  private subscribedConversations: Set<string> = new Set();
  private subscribedFlowExecutions: Set<string> = new Set();
  private connectionPromise: Promise<void> | null = null;

  /**
   * Get current connection state
   */
  get state(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if socket is connected
   */
  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get socket ID (useful for debugging)
   */
  get socketId(): string | undefined {
    return this.socket?.id;
  }

  /**
   * Connect to WebSocket server
   */
  connect(token: string, options?: ConnectionOptions): Promise<void> {
    // Return existing connection promise if already connecting
    if (this.connectionPromise && this.connectionState === 'connecting') {
      return this.connectionPromise;
    }

    // Already connected
    if (this.socket?.connected) {
      return Promise.resolve();
    }

    this.connectionState = 'connecting';

    this.connectionPromise = new Promise((resolve, reject) => {
      const reconnectionAttempts = options?.reconnectionAttempts ?? this.maxReconnectAttempts;

      this.socket = io(WS_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: options?.reconnection ?? true,
        reconnectionAttempts,
        reconnectionDelay: options?.reconnectionDelay ?? 1000,
        timeout: options?.timeout ?? 20000,
      });

      // Connection successful
      this.socket.on('connect', () => {
        console.log('[WebSocket] Connected:', this.socket?.id);
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;

        // Re-subscribe to previously subscribed agents
        if (this.subscribedAgents.size > 0) {
          console.log('[WebSocket] Re-subscribing to', this.subscribedAgents.size, 'agents');
          this.subscribedAgents.forEach((agentId) => {
            this.socket?.emit('agent:subscribe', agentId);
          });
        }

        // Re-join previously subscribed conversations
        if (this.subscribedConversations.size > 0) {
          console.log('[WebSocket] Re-joining', this.subscribedConversations.size, 'conversations');
          this.subscribedConversations.forEach((conversationId) => {
            this.socket?.emit('conversation:join', conversationId);
          });
        }

        // Re-subscribe to flow executions
        if (this.subscribedFlowExecutions.size > 0) {
          console.log('[WebSocket] Re-subscribing to', this.subscribedFlowExecutions.size, 'flow executions');
          this.subscribedFlowExecutions.forEach((executionId) => {
            this.socket?.emit('subscribe:flow_execution', { executionId });
          });
        }

        resolve();
      });

      // Connection error
      this.socket.on('connect_error', (error) => {
        console.error('[WebSocket] Connection error:', error.message);
        this.reconnectAttempts++;

        if (this.reconnectAttempts >= reconnectionAttempts) {
          this.connectionState = 'error';
          reject(new Error(`Failed to connect after ${reconnectionAttempts} attempts: ${error.message}`));
        }
      });

      // Disconnection
      this.socket.on('disconnect', (reason) => {
        console.log('[WebSocket] Disconnected:', reason);
        this.connectionState = 'disconnected';

        // Notify disconnect handlers
        const disconnectHandlers = this.handlers.get('disconnect');
        disconnectHandlers?.forEach((handler) => handler({ reason }));
      });

      // Reconnection attempt
      this.socket.io.on('reconnect_attempt', (attempt) => {
        console.log('[WebSocket] Reconnect attempt:', attempt);
        this.connectionState = 'connecting';
      });

      // Reconnection successful
      this.socket.io.on('reconnect', (attempt) => {
        console.log('[WebSocket] Reconnected after', attempt, 'attempts');
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
      });

      // Reconnection failed
      this.socket.io.on('reconnect_failed', () => {
        console.error('[WebSocket] Reconnection failed');
        this.connectionState = 'error';
      });

      // Setup event forwarding for all supported events
      this.setupEventForwarding();
    });

    return this.connectionPromise;
  }

  /**
   * Setup event forwarding to registered handlers
   */
  private setupEventForwarding(): void {
    if (!this.socket) return;

    const events: WebSocketEventName[] = [
      'message:new',
      'message:status',
      'message:reaction',
      'message:streaming',
      'message:sent',
      'agent:status_changed',
      'agent:qr',
      'agent:busy',
      'agent:platform_status',
      'agent:platform_error',
      'agent:auth_step',
      'agent:auth_error',
      'conversation:created',
      'conversation:updated',
      'conversations:initial',
      'conversations:error',
      'messages:initial',
      'messages:error',
      'swarm:task_update',
      'swarm:task_created',
      'swarm:handoff',
      'swarm:consensus',
      'swarm:collaboration',
      'flow:execution_start',
      'flow:execution_update',
      'flow:execution_complete',
      'flow:queue:status',
      'flow:schedule:triggered',
      'notification',
      'error',
      'superbrain:log:new',
      'resync:status',
      'sync:status',
      'messages:synced',
      'agentic:reasoning:start',
      'agentic:reasoning:step',
      'agentic:tool:start',
      'agentic:tool:result',
      'agentic:reasoning:complete',
      'agentic:status:changed',
      'agentic:error',
      'local-agent:online',
      'local-agent:offline',
      'local-agent:command-result',
      'local-agent:output',
      'local-agent:approval-needed',
    ];

    events.forEach((event) => {
      this.socket?.on(event, (data: unknown) => {
        // Debug logging for message events
        if (event === 'message:new') {
          console.log(`[WebSocket] Received ${event}:`, data);
        }

        // Auto-forward server notifications to the dashboard bell (uiStore)
        if (event === 'notification') {
          try {
            const payload = data as { type?: string; title?: string; message?: string; duration?: number; dismissible?: boolean };
            // Dynamic import to avoid circular dependency at module load
            import('../stores/uiStore').then(({ useUIStore }) => {
              useUIStore.getState().addNotification({
                type: (payload.type as 'success' | 'error' | 'warning' | 'info') || 'info',
                title: payload.title || 'System Notification',
                message: payload.message,
                duration: payload.duration ?? (payload.type === 'error' ? 10000 : 5000),
                dismissible: payload.dismissible ?? true,
              });
            });
          } catch (err) {
            console.error('[WebSocket] Failed to forward notification to uiStore:', err);
          }
        }

        const handlers = this.handlers.get(event);
        if (handlers && handlers.size > 0) {
          handlers.forEach((handler) => {
            try {
              handler(data);
            } catch (err) {
              console.error(`[WebSocket] Error in handler for ${event}:`, err);
            }
          });
        } else if (event === 'message:new') {
          console.warn(`[WebSocket] No handlers registered for ${event}`);
        }
      });
    });
  }

  /**
   * Subscribe to a WebSocket event
   * Returns an unsubscribe function
   */
  subscribe<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }

    const typedHandler = handler as EventHandler;
    this.handlers.get(event)?.add(typedHandler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(typedHandler);

      // Clean up empty handler sets
      if (this.handlers.get(event)?.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  /**
   * Subscribe to multiple events at once
   * Returns an unsubscribe function that removes all subscriptions
   */
  subscribeMany(subscriptions: Array<{ event: string; handler: EventHandler }>): () => void {
    const unsubscribers = subscriptions.map(({ event, handler }) =>
      this.subscribe(event, handler)
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }

  /**
   * Emit an event to the server
   */
  emit<T = unknown>(event: string, data?: T): void {
    if (!this.socket?.connected) {
      console.warn('[WebSocket] Cannot emit event - not connected:', event);
      return;
    }
    this.socket.emit(event, data);
  }

  /**
   * Emit an event and wait for acknowledgment
   */
  emitWithAck<TData = unknown, TResponse = unknown>(
    event: string,
    data?: TData,
    timeout = 5000
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for acknowledgment: ${event}`));
      }, timeout);

      this.socket.emit(event, data, (response: TResponse) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  /**
   * Subscribe to agent-specific events
   */
  subscribeToAgent(agentId: string): void {
    if (!agentId) {
      console.warn('[WebSocket] Cannot subscribe to agent - no agentId provided');
      return;
    }

    this.subscribedAgents.add(agentId);

    if (this.socket?.connected) {
      this.socket.emit('agent:subscribe', agentId);
      console.log('[WebSocket] Subscribed to agent:', agentId);
    }
  }

  /**
   * Unsubscribe from agent-specific events
   */
  unsubscribeFromAgent(agentId: string): void {
    if (!agentId) return;

    this.subscribedAgents.delete(agentId);

    if (this.socket?.connected) {
      this.socket.emit('agent:unsubscribe', agentId);
      console.log('[WebSocket] Unsubscribed from agent:', agentId);
    }
  }

  /**
   * Subscribe to conversation-specific events
   * Subscription is persisted and restored on reconnection
   */
  subscribeToConversation(conversationId: string): void {
    if (!conversationId) return;

    // Track subscription for reconnection
    this.subscribedConversations.add(conversationId);

    if (this.socket?.connected) {
      this.socket.emit('conversation:join', conversationId);
      console.log('[WebSocket] Subscribed to conversation:', conversationId);
    }
  }

  /**
   * Unsubscribe from conversation-specific events
   */
  unsubscribeFromConversation(conversationId: string): void {
    if (!conversationId) return;

    // Remove from tracking
    this.subscribedConversations.delete(conversationId);

    if (this.socket?.connected) {
      this.socket.emit('conversation:leave', conversationId);
      console.log('[WebSocket] Unsubscribed from conversation:', conversationId);
    }
  }

  /**
   * Subscribe to flow execution updates
   * Subscription is persisted and restored on reconnection
   */
  subscribeToFlowExecution(executionId: string): void {
    if (!executionId) return;

    // Track subscription for reconnection
    this.subscribedFlowExecutions.add(executionId);

    if (this.socket?.connected) {
      this.socket.emit('subscribe:flow_execution', { executionId });
      console.log('[WebSocket] Subscribed to flow execution:', executionId);
    }
  }

  /**
   * Unsubscribe from flow execution updates
   */
  unsubscribeFromFlowExecution(executionId: string): void {
    if (!executionId) return;

    // Remove from tracking
    this.subscribedFlowExecutions.delete(executionId);

    if (this.socket?.connected) {
      this.socket.emit('unsubscribe:flow_execution', { executionId });
      console.log('[WebSocket] Unsubscribed from flow execution:', executionId);
    }
  }

  /**
   * Get list of currently subscribed agents
   */
  getSubscribedAgents(): string[] {
    return Array.from(this.subscribedAgents);
  }

  /**
   * Get list of currently subscribed conversations
   */
  getSubscribedConversations(): string[] {
    return Array.from(this.subscribedConversations);
  }

  /**
   * Get list of currently subscribed flow executions
   */
  getSubscribedFlowExecutions(): string[] {
    return Array.from(this.subscribedFlowExecutions);
  }

  /**
   * Remove all event handlers
   */
  removeAllHandlers(): void {
    this.handlers.clear();
  }

  /**
   * Remove all handlers for a specific event
   */
  removeHandlers(event: string): void {
    this.handlers.delete(event);
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      console.log('[WebSocket] Disconnecting...');
      this.socket.disconnect();
      this.socket = null;
    }

    this.handlers.clear();
    this.subscribedAgents.clear();
    this.subscribedConversations.clear();
    this.subscribedFlowExecutions.clear();
    this.connectionState = 'disconnected';
    this.connectionPromise = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Force reconnection
   */
  reconnect(): void {
    if (this.socket) {
      console.log('[WebSocket] Forcing reconnection...');
      this.socket.connect();
    }
  }
}

// Export singleton instance
export const websocket = new WebSocketService();

// Make websocket available on window for global access (used by messageStore)
if (typeof window !== 'undefined') {
  (window as any).__websocket = websocket;
}

// Export types for consumers
export type { EventHandler, ConnectionOptions };
