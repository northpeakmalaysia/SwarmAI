import { useEffect, useCallback, useRef } from 'react';
import { websocket } from '../services/websocket';
import { useMessageStore, Message } from '../stores/messageStore';

/**
 * Event payload for new messages
 */
interface MessageNewPayload {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentId?: string;
  agentName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Event payload for message status updates
 */
interface MessageStatusPayload {
  messageId: string;
  conversationId: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
  timestamp?: string;
}

/**
 * Event payload for message reactions
 */
interface MessageReactionPayload {
  messageId: string;
  conversationId: string;
  reaction: string;
  userId?: string;
}

/**
 * Event payload for streaming message chunks
 */
interface MessageStreamingPayload {
  messageId: string;
  conversationId: string;
  chunk: string;
  done: boolean;
}

/**
 * Options for useMessages hook
 */
interface UseMessagesOptions {
  onNewMessage?: (message: Message) => void;
  onMessageStatus?: (status: MessageStatusPayload) => void;
  onStreamingChunk?: (data: MessageStreamingPayload) => void;
}

/**
 * Return type for useMessages hook
 */
interface UseMessagesReturn {
  subscribeToConversation: (conversationId: string) => void;
  unsubscribeFromConversation: (conversationId: string) => void;
}

/**
 * Hook for subscribing to real-time message updates for a conversation
 * Automatically updates the message store when new messages arrive
 */
export function useMessages(
  conversationId: string | null,
  options: UseMessagesOptions = {}
): UseMessagesReturn {
  const addMessage = useMessageStore((state) => state.addMessage);
  const { onNewMessage, onMessageStatus, onStreamingChunk } = options;
  const subscribedConversationRef = useRef<string | null>(null);

  // Use refs for callbacks to avoid dependency issues
  const onNewMessageRef = useRef(onNewMessage);
  const onMessageStatusRef = useRef(onMessageStatus);
  const onStreamingChunkRef = useRef(onStreamingChunk);
  onNewMessageRef.current = onNewMessage;
  onMessageStatusRef.current = onMessageStatus;
  onStreamingChunkRef.current = onStreamingChunk;

  // Subscribe to new messages
  useEffect(() => {
    const unsubscribeNew = websocket.subscribe<MessageNewPayload>(
      'message:new',
      (data) => {
        // Only process messages for the active conversation
        if (conversationId && data.conversationId === conversationId) {
          console.log('[useMessages] New message received:', data.id);

          // Pass raw data to addMessage - it will transform to the correct format
          const rawMessage = {
            id: data.id,
            conversationId: data.conversationId,
            role: data.role,
            content: data.content,
            contentType: (data as any).contentType,
            mediaUrl: (data as any).mediaUrl,
            mediaMimeType: (data as any).mediaMimeType,
            agentId: data.agentId,
            agentName: data.agentName,
            senderId: (data as any).senderId,
            senderName: (data as any).senderName,
            metadata: data.metadata,
            createdAt: data.createdAt,
            platform: (data as any).platform,
          };

          addMessage(rawMessage);
          onNewMessageRef.current?.(rawMessage as any);
        }
      }
    );

    return () => {
      unsubscribeNew();
    };
  }, [conversationId, addMessage]);

  // Subscribe to message status updates
  useEffect(() => {
    const unsubscribeStatus = websocket.subscribe<MessageStatusPayload>(
      'message:status',
      (data) => {
        if (conversationId && data.conversationId === conversationId) {
          console.log('[useMessages] Message status update:', data.messageId, data.status);

          // Update message status in store if needed
          // Note: The current messageStore doesn't have updateMessageStatus,
          // so we log it and call the callback if provided
          onMessageStatusRef.current?.(data);
        }
      }
    );

    return () => {
      unsubscribeStatus();
    };
  }, [conversationId]);

  // Subscribe to streaming message chunks
  useEffect(() => {
    const unsubscribeStreaming = websocket.subscribe<MessageStreamingPayload>(
      'message:streaming',
      (data) => {
        if (conversationId && data.conversationId === conversationId) {
          onStreamingChunkRef.current?.(data);
        }
      }
    );

    return () => {
      unsubscribeStreaming();
    };
  }, [conversationId]);

  // Subscribe to message reactions
  useEffect(() => {
    const unsubscribeReaction = websocket.subscribe<MessageReactionPayload>(
      'message:reaction',
      (data) => {
        if (conversationId && data.conversationId === conversationId) {
          console.log('[useMessages] Message reaction:', data.messageId, data.reaction);
          // Handle reaction update if needed
        }
      }
    );

    return () => {
      unsubscribeReaction();
    };
  }, [conversationId]);

  // Subscribe to conversation when conversationId changes
  useEffect(() => {
    if (conversationId && conversationId !== subscribedConversationRef.current) {
      // Unsubscribe from previous conversation
      if (subscribedConversationRef.current) {
        websocket.unsubscribeFromConversation(subscribedConversationRef.current);
      }

      // Subscribe to new conversation
      websocket.subscribeToConversation(conversationId);
      subscribedConversationRef.current = conversationId;
    }

    return () => {
      if (subscribedConversationRef.current) {
        websocket.unsubscribeFromConversation(subscribedConversationRef.current);
        subscribedConversationRef.current = null;
      }
    };
  }, [conversationId]);

  const subscribeToConversation = useCallback((convId: string) => {
    websocket.subscribeToConversation(convId);
  }, []);

  const unsubscribeFromConversation = useCallback((convId: string) => {
    websocket.unsubscribeFromConversation(convId);
  }, []);

  return {
    subscribeToConversation,
    unsubscribeFromConversation,
  };
}

/**
 * Hook for subscribing to all new messages (not conversation-specific)
 * Useful for notification badges or message counters
 */
export function useAllMessages(
  onNewMessage?: (message: MessageNewPayload) => void
): void {
  // Use ref for callback to avoid dependency issues
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;

  useEffect(() => {
    const unsubscribe = websocket.subscribe<MessageNewPayload>(
      'message:new',
      (data) => {
        onNewMessageRef.current?.(data);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);
}
