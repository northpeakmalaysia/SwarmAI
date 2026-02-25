/**
 * useEmailLogic Hook
 * Handles email-specific business logic and state management
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useMessageStore } from '../../../stores/messageStore';
import { useAgentStore } from '../../../stores/agentStore';
import { websocket } from '../../../services/websocket';
import { api } from '../../../services/api';
import { formatDateTime } from '../../../utils/dateFormat';
import type { Platform } from '../../../types';
import type {
  EmailThread,
  EmailMessage,
  EmailFolder,
  EmailComposeState,
} from '../types';

export function useEmailLogic() {
  // Stores
  const {
    conversations,
    messages,
    currentConversation,
    isLoading,
    isLoadingMore,
    hasMoreMessages,
    fetchConversations,
    setCurrentConversation,
    fetchMessages,
    loadOlderMessages,
    sendMessage,
    updateMessageStatus,
  } = useMessageStore();

  const { agents } = useAgentStore();

  // Local state
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();
  const [selectedFolder, setSelectedFolder] = useState<EmailFolder>('inbox');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [composerState, setComposerState] = useState<Partial<EmailComposeState> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter for email agents only
  const emailAgents = useMemo(() =>
    agents.filter(a => a.platform === 'email'),
    [agents]
  );

  // Auto-select first email agent
  useEffect(() => {
    if (!selectedAgentId && emailAgents.length > 0) {
      setSelectedAgentId(emailAgents[0].id);
    }
  }, [emailAgents, selectedAgentId]);

  // Convert conversations to email threads
  const emailThreads = useMemo(() => {
    return conversations
      .filter(c => {
        // Filter by email platform
        if (c.platform !== 'email') return false;
        // Filter by selected agent
        if (selectedAgentId && c.agentId !== selectedAgentId) return false;
        // Filter by search
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            c.title.toLowerCase().includes(q) ||
            c.lastMessage?.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .map((conv) => {
        // Extract email metadata
        const emailMeta = conv.metadata?.email as Record<string, unknown> | undefined;

        return {
          id: conv.id,
          agentId: conv.agentId || '',
          subject: emailMeta?.subject as string || conv.title || '(No Subject)',
          participants: conv.contactName
            ? [{ id: conv.contactId || conv.externalId || '', name: conv.contactName, email: conv.externalId?.replace('email:', '') || '', type: 'from' as const }]
            : [],
          preview: conv.lastMessage || '',
          messageCount: conv.messageCount,
          unreadCount: conv.unreadCount || 0,
          hasAttachments: Boolean(emailMeta?.hasAttachments),
          isStarred: Boolean(emailMeta?.isStarred),
          labels: (emailMeta?.labels as string[]) || [],
          lastMessageAt: conv.lastMessageAt || conv.updatedAt,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
        } as EmailThread;
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [conversations, selectedAgentId, searchQuery]);

  // Selected thread
  const selectedThread = useMemo(() =>
    emailThreads.find(t => t.id === selectedThreadId),
    [emailThreads, selectedThreadId]
  );

  // Convert messages to email messages
  const emailMessages = useMemo(() => {
    if (!selectedThreadId) return [];

    return messages.map((msg) => {
      const emailMeta = msg.metadata?.email as Record<string, unknown> | undefined;

      // Resolve from email: metadata > sender.email > sender.name (if it looks like email) > conversation externalId
      const fromEmail = (emailMeta?.from as string)
        || msg.sender.email
        || (msg.sender.name?.includes('@') ? msg.sender.name : '')
        || currentConversation?.externalId?.replace('email:', '')
        || '';

      return {
        id: msg.id,
        threadId: selectedThreadId,
        conversationId: msg.conversationId,
        platform: msg.platform,
        subject: emailMeta?.subject as string || '',
        from: {
          id: msg.sender.id,
          name: msg.sender.name,
          email: fromEmail,
          avatarUrl: msg.sender.avatarUrl,
          type: 'from' as const,
        },
        to: (emailMeta?.to as string[] || []).map((email, i) => ({
          id: `to-${i}`,
          name: email.split('@')[0],
          email,
          type: 'to' as const,
        })),
        cc: (emailMeta?.cc as string[] || []).map((email, i) => ({
          id: `cc-${i}`,
          name: email.split('@')[0],
          email,
          type: 'cc' as const,
        })),
        bcc: [],
        replyTo: emailMeta?.replyTo as string,
        inReplyTo: emailMeta?.inReplyTo as string,
        references: emailMeta?.references as string[],
        content: {
          type: msg.content.type === 'text' ? 'text' as const : 'html' as const,
          text: msg.content.text,
          html: emailMeta?.htmlContent as string,
        },
        attachments: (emailMeta?.attachments as Array<{
          id?: string;
          filename: string;
          mimeType: string;
          size: number;
          url?: string;
          contentId?: string;
          isInline?: boolean;
        }> || []).map((a) => ({
          id: a.id || crypto.randomUUID(),
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          url: a.url,
          contentId: a.contentId,
          isInline: a.isInline || false,
        })),
        isRead: msg.status === 'read',
        isStarred: Boolean(emailMeta?.isStarred),
        isFromAI: msg.isFromAI,
        agentId: msg.agentId,
        agentName: msg.agentName,
        metadata: msg.metadata,
        timestamp: msg.timestamp,
        createdAt: msg.createdAt,
      } as EmailMessage;
    });
  }, [messages, selectedThreadId, currentConversation]);

  // WebSocket for real-time updates
  useEffect(() => {
    // Subscribe to email-specific events
    const unsubNew = websocket.subscribe<{
      conversationId: string;
      platform: string;
    }>('message:new', (data) => {
      if (data.platform === 'email') {
        // Refresh conversations silently
        fetchConversations({ silent: true });
      }
    });

    const unsubStatus = websocket.subscribe<{
      messageId: string;
      status: 'pending' | 'sent' | 'delivered' | 'read';
    }>('message:status_updated', (data) => {
      updateMessageStatus(data.messageId, data.status);
    });

    return () => {
      unsubNew();
      unsubStatus();
    };
  }, [fetchConversations, updateMessageStatus]);

  // Fetch conversations on mount and agent change
  useEffect(() => {
    fetchConversations();
  }, [selectedAgentId, fetchConversations]);

  // Handle thread selection
  const handleSelectThread = useCallback(async (thread: EmailThread) => {
    setSelectedThreadId(thread.id);

    // Find the full conversation object
    const conversation = conversations.find(c => c.id === thread.id);
    if (conversation) {
      // Set current conversation in store using the conversation directly
      setCurrentConversation({
        ...conversation,
        title: thread.subject,
      });

      // Fetch messages for this thread
      await fetchMessages(conversation.id);
    }
  }, [conversations, setCurrentConversation, fetchMessages]);

  // Handle back to list
  const handleBack = useCallback(() => {
    setSelectedThreadId(null);
    setCurrentConversation(null);
  }, [setCurrentConversation]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchConversations();
      if (selectedThreadId) {
        await fetchMessages(selectedThreadId);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchConversations, fetchMessages, selectedThreadId]);

  // Handle load more messages
  const handleLoadMore = useCallback(async () => {
    if (selectedThreadId && !isLoadingMore && hasMoreMessages) {
      await loadOlderMessages(selectedThreadId);
    }
  }, [selectedThreadId, isLoadingMore, hasMoreMessages, loadOlderMessages]);

  // Handle reply
  const handleReply = useCallback((messageId: string, type: 'reply' | 'replyAll' | 'forward') => {
    const message = emailMessages.find(m => m.id === messageId);
    if (!message) return;

    const state: Partial<EmailComposeState> = {
      subject: type === 'forward'
        ? `Fwd: ${message.subject}`
        : message.subject.startsWith('Re:')
          ? message.subject
          : `Re: ${message.subject}`,
      replyToMessageId: type !== 'forward' ? messageId : undefined,
      forwardMessageId: type === 'forward' ? messageId : undefined,
    };

    if (type === 'reply') {
      state.to = [message.from.email].filter(Boolean);
    } else if (type === 'replyAll') {
      state.to = [message.from.email, ...message.to.map(p => p.email)].filter(Boolean);
      state.cc = message.cc.map(p => p.email).filter(Boolean);
    }

    if (type === 'forward') {
      state.body = `\n\n---------- Forwarded message ----------\nFrom: ${message.from.name} <${message.from.email}>\nDate: ${formatDateTime(message.timestamp)}\nSubject: ${message.subject}\n\n${message.content.text || ''}`;
    }

    setComposerState(state);
    setShowComposer(true);
  }, [emailMessages]);

  // Handle star
  const handleStar = useCallback(async (idOrMessageId: string, isStarred: boolean) => {
    try {
      // Determine if this is a thread or message
      const thread = emailThreads.find(t => t.id === idOrMessageId);
      if (thread) {
        await api.patch(`/api/conversations/${idOrMessageId}`, {
          metadata: { email: { isStarred } },
        });
      } else {
        await api.patch(`/api/messages/${idOrMessageId}`, {
          metadata: { email: { isStarred } },
        });
      }
      // Refresh
      await fetchConversations({ silent: true });
    } catch (error) {
      console.error('Failed to star:', error);
    }
  }, [emailThreads, fetchConversations]);

  // Handle send email
  const handleSendEmail = useCallback(async (email: EmailComposeState) => {
    if (!selectedAgentId) {
      throw new Error('No email agent selected');
    }

    // If replying, send to existing conversation
    if (email.replyToMessageId && currentConversation) {
      await sendMessage(currentConversation.id, email.body, selectedAgentId);
    } else {
      // Create new conversation for new email
      const response = await api.post<{ conversation?: { id: string }; id?: string }>('/api/conversations', {
        agentId: selectedAgentId,
        title: email.subject || '(No Subject)',
        platform: 'email',
        metadata: {
          email: {
            to: email.to,
            cc: email.cc,
            bcc: email.bcc,
            subject: email.subject,
          },
        },
      });

      const newConvId = response.conversation?.id || response.id;
      if (newConvId) {
        await sendMessage(newConvId, email.body, selectedAgentId);
      }
    }

    // Close composer
    setShowComposer(false);
    setComposerState(null);

    // Refresh
    await fetchConversations({ silent: true });
  }, [selectedAgentId, currentConversation, sendMessage, fetchConversations]);

  // Handle translate
  const handleTranslate = useCallback(async (messageId: string) => {
    // This would trigger the translation modal/flow
    console.log('Translate message:', messageId);
  }, []);

  // Handle rephrase
  const handleRephrase = useCallback(async (text: string): Promise<string> => {
    try {
      const response = await api.post<{ rephrased?: string }>('/api/ai/rephrase', {
        text,
        style: 'professional',
      });
      return response.rephrased || text;
    } catch (error) {
      console.error('Rephrase failed:', error);
      return text;
    }
  }, []);

  // Handle compose new
  const handleComposeNew = useCallback(() => {
    setComposerState({});
    setShowComposer(true);
  }, []);

  // Handle close composer
  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    setComposerState(null);
  }, []);

  return {
    // State
    selectedAgentId,
    setSelectedAgentId,
    selectedFolder,
    setSelectedFolder,
    selectedThreadId,
    searchQuery,
    setSearchQuery,
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasMoreMessages,
    showComposer,
    composerState,

    // Data
    emailAgents,
    emailThreads,
    selectedThread,
    emailMessages,

    // Handlers
    handleSelectThread,
    handleBack,
    handleRefresh,
    handleLoadMore,
    handleReply,
    handleStar,
    handleSendEmail,
    handleTranslate,
    handleRephrase,
    handleComposeNew,
    handleCloseComposer,
  };
}
