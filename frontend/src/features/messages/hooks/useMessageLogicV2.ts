import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useMessageStoreV2, type Message as StoreMessage } from '../../../stores/messageStoreV2';
import { useAgentStore } from '../../../stores/agentStore';
import { useContactStore } from '../../../stores/contactStore';
import { usePlatformAccountStore } from '../../../stores/platformAccountStore';
import { websocket } from '../../../services/websocket';
import { api } from '../../../services/api';
import { convertToChat, convertToMessage } from '../utils/converters';
import { ViewMode, isPlatformTab } from '../types';
import type { Chat, Message, Platform } from '../../../types';

// =============================================================================
// useMessageLogicV2 - Simplified Message Hook
// =============================================================================
//
// KEY CHANGES FROM V1:
// 1. SINGLE WebSocket handler for message:new (no dual global + per-conversation)
// 2. No WebSocket-first fetching (REST only, WS for real-time push)
// 3. Store does all the heavy lifting (addMessage handles dedup + routing)
// 4. Simpler conversation switching (store handles cache + loading)
// 5. Clean separation: hook = UI logic + WS wiring, store = data management
//
// V2.1 CHANGES (Platform Tabs):
// - viewMode is now ViewMode union (simple string | PlatformTabSelection)
// - categoryFilter removed (derived from viewMode)
// - Platform account store for dynamic tabs
// - Filtering by platform + accountId
// =============================================================================

export const useMessageLogicV2 = (basePath = '/messages') => {
  const { conversationId } = useParams();
  const navigate = useNavigate();

  // Stores
  const {
    conversations,
    currentConversationId,
    isLoading,
    isLoadingMessages,
    isLoadingMore,
    isSending,
    getCurrentConversation,
    getMessages,
    getPagination,
    getUnreadCountByPlatform,
    getUnreadCountByAgent,
    fetchConversations,
    mergeConversations,
    setCurrentConversation,
    createConversation,
    updateConversation,
    deleteConversation,
    sendMessage,
    addMessage,
    fetchMessages,
    loadOlderMessages,
    updateConversationFromMessage,
    updateMessageStatus,
    syncMessages,
  } = useMessageStoreV2();

  const { agents, fetchAgents } = useAgentStore();

  const {
    contacts,
    selectedContact,
    selectedContactIdentifiers,
    selectedContactTags,
    selectedContactConversations,
    isLoading: isContactsLoading,
    fetchContacts,
    fetchContactById,
    selectContact,
    fetchConversations: fetchContactConversations,
  } = useContactStore();

  const {
    fetchAccounts: fetchPlatformAccounts,
    getGroupedAccounts,
    getAccountsByPlatform,
    getConnectedPlatformTypes,
    accounts: platformAccounts,
  } = usePlatformAccountStore();

  // Local State
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  // Start as null — auto-resolved once platform accounts load
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [contactConversations, setContactConversations] = useState<Chat[]>([]);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [contactFilterTag, setContactFilterTag] = useState<string>('all');
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [resyncToastId, setResyncToastId] = useState<string | null>(null);
  const [showResyncModal, setShowResyncModal] = useState(false);

  // Derived state from store
  const currentConversation = getCurrentConversation();
  const messages = getMessages();
  const { hasMore: hasMoreMessages } = getPagination();

  // Platform groups (memoized)
  const platformGroups = useMemo(() => getGroupedAccounts(), [platformAccounts]);
  const hasEmailAccounts = useMemo(
    () => platformAccounts.some(a => a.platform === 'email'),
    [platformAccounts]
  );

  // -- Effects --

  // Fetch initial data on mount (REST only - no WebSocket-first complexity)
  useEffect(() => {
    fetchConversations();
    fetchAgents();
    fetchContacts();
    fetchPlatformAccounts();
  }, [fetchConversations, fetchAgents, fetchContacts, fetchPlatformAccounts]);

  // Auto-resolve default view: first platform tab > news > contacts
  useEffect(() => {
    if (viewMode !== null) return; // already set by user
    if (platformGroups.length > 0) {
      const first = platformGroups[0];
      setViewMode({ type: 'platform', platform: first.platform as 'whatsapp' | 'telegram' });
    } else if (hasEmailAccounts) {
      setViewMode('email');
    }
    // If no platforms loaded yet, stay null (shows loading state)
  }, [viewMode, platformGroups, hasEmailAccounts]);

  // Select conversation from URL param
  useEffect(() => {
    if (conversationId) {
      // Skip if already viewing this conversation
      if (currentConversationId === conversationId) return;
      const conversation = conversations?.find((c) => c.id === conversationId);
      if (conversation) {
        setCurrentConversation(conversation);
        setSelectedAgentId(conversation.agentId);
      }
    }
  }, [conversationId, conversations, setCurrentConversation, currentConversationId]);

  // Auto-fetch linked contact when conversation is selected
  useEffect(() => {
    const loadLinkedContact = async () => {
      if (currentConversation) {
        const contactId = currentConversation.contactId ||
          (currentConversation.metadata?.contactId as string);
        if (contactId && (!selectedContact || selectedContact.id !== contactId)) {
          const contact = await fetchContactById(contactId);
          if (contact) {
            await selectContact(contact);
          }
        }
      }
    };
    loadLinkedContact();
  }, [currentConversation, fetchContactById, selectContact, selectedContact]);

  // Load conversations when contact is selected
  useEffect(() => {
    if (selectedContact && viewMode === 'contacts') {
      fetchContactConversations(selectedContact.id);
    }
  }, [selectedContact, viewMode, fetchContactConversations]);

  // Convert contact conversations to Chat type
  useEffect(() => {
    if (selectedContactConversations.length > 0 && viewMode === 'contacts') {
      const chats = selectedContactConversations.map((conv: any) => {
        const convId = conv.conversationId || conv.id;
        const conversation = conversations?.find((c) => c.id === convId);
        if (conversation) {
          return convertToChat(conversation, {
            id: '',
            name: '',
            platform: (conv.platform || 'whatsapp') as Platform,
          });
        }
        return null;
      }).filter(Boolean) as Chat[];
      setContactConversations(chats);
    } else {
      setContactConversations([]);
    }
  }, [selectedContactConversations, viewMode, conversations]);

  // =========================================================================
  // SINGLE WebSocket handler for message:new
  // Replaces the dual handler pattern (global + per-conversation) from V1
  // =========================================================================
  useEffect(() => {
    if (!agents || agents.length === 0) return;

    // Subscribe to all agents
    agents.forEach((agent) => {
      websocket.subscribeToAgent(agent.id);
    });

    // ONE handler for ALL message:new events
    const unsubMessage = websocket.subscribe<any>('message:new', (payload) => {
      const data = payload?.data || payload;
      const msgData = data?.message || payload?.message || payload;
      const conversationData = data?.conversation;
      const msgConversationId = msgData?.conversationId || msgData?.conversation_id;

      if (!msgConversationId) return;

      // 1) Add message to store (store handles dedup + routing to correct conversation)
      const direction = msgData.direction;
      const role = direction
        ? (direction === 'incoming' ? 'assistant' : 'user')
        : (msgData.role || 'assistant');

      addMessage({
        id: msgData.id,
        conversationId: msgConversationId,
        role: role as 'user' | 'assistant' | 'system',
        content: msgData.content,
        contentType: msgData.contentType || 'text',
        mediaUrl: msgData.mediaUrl,
        mediaMimeType: msgData.mediaMimeType,
        agentId: msgData.agentId,
        agentName: msgData.agentName,
        senderId: msgData.senderId,
        senderName: msgData.senderName,
        createdAt: msgData.createdAt,
        isFromAI: msgData.isFromAI === true,
        status: 'delivered',
        platform: msgData.platform,
        metadata: msgData.metadata as Record<string, any>,
      });

      // 2) Update conversation list (last message, unread count, bump to top)
      const content = typeof msgData.content === 'object'
        ? (msgData.content?.text || String(msgData.content))
        : (msgData.content || '');
      const messageTime = msgData.createdAt || new Date().toISOString();

      const currentConversations = useMessageStoreV2.getState().conversations;
      const conversationExists = currentConversations.some((c) => c.id === msgConversationId);

      if (conversationExists) {
        updateConversationFromMessage(msgConversationId, content, messageTime);
      } else if (conversationData) {
        // New conversation from incoming message - add to list
        const newConversation = {
          id: conversationData.id || msgConversationId,
          title: conversationData.title || conversationData.contactName || 'Unknown',
          agentId: conversationData.agentId || conversationData.agent_id,
          agentName: conversationData.agentName,
          platform: conversationData.platform || 'whatsapp',
          isGroup: conversationData.isGroup || false,
          isPinned: conversationData.isPinned || false,
          isMuted: conversationData.isMuted || false,
          isArchived: conversationData.isArchived || false,
          contactName: conversationData.contactName || conversationData.contact_name,
          externalId: conversationData.externalId || conversationData.external_id,
          unreadCount: 1,
          lastMessage: content,
          lastMessageAt: messageTime,
          messageCount: 1,
          createdAt: conversationData.createdAt || messageTime,
          updatedAt: messageTime,
          metadata: conversationData.metadata,
          category: conversationData.category || 'chat',
        };
        useMessageStoreV2.setState((state) => ({
          conversations: [newConversation, ...state.conversations],
        }));
      } else {
        // Unknown conversation - merge from server
        mergeConversations();
      }
    });

    return () => {
      agents.forEach((agent) => {
        websocket.unsubscribeFromAgent(agent.id);
      });
      unsubMessage();
    };
  }, [agents, addMessage, updateConversationFromMessage, mergeConversations]);

  // Subscribe to conversation-specific events (typing, status, sync)
  useEffect(() => {
    if (!currentConversation) return;

    websocket.subscribeToConversation(currentConversation.id);

    const unsubTyping = websocket.subscribe<{ userId: string; userName: string; isTyping: boolean }>(
      'message:streaming',
      (data) => {
        if (data.isTyping) {
          setTypingUsers((prev) =>
            prev.includes(data.userName) ? prev : [...prev, data.userName]
          );
        } else {
          setTypingUsers((prev) => prev.filter((name) => name !== data.userName));
        }
      }
    );

    // Lazy-load sync: merge new messages when backend syncs more
    const unsubSynced = websocket.subscribe<{ conversationId: string; messagesSynced: number }>(
      'messages:synced',
      (data) => {
        if (data.conversationId === currentConversation.id && data.messagesSynced > 0) {
          // Re-fetch to get the newly synced messages
          fetchMessages(currentConversation.id);
        }
      }
    );

    // Message status updates (read receipts)
    const unsubStatus = websocket.subscribe<{
      messageId: string;
      status: 'pending' | 'sent' | 'delivered' | 'read';
      conversationId: string;
    }>('message:status_updated', (data) => {
      if (data.conversationId === currentConversation.id) {
        updateMessageStatus(data.messageId, data.status);
      }
    });

    return () => {
      websocket.unsubscribeFromConversation(currentConversation.id);
      unsubTyping();
      unsubSynced();
      unsubStatus();
    };
  }, [currentConversation, fetchMessages, updateMessageStatus]);

  // Resync WebSocket events
  useEffect(() => {
    if (!selectedAgentId) return;

    const unsubResyncStatus = websocket.subscribe<{
      status: 'started' | 'deleting_messages' | 'deleting_conversations' | 'syncing_contacts' | 'syncing_chats' | 'completed' | 'error';
      messagesDeleted?: number;
      conversationsDeleted?: number;
      conversationsSynced?: number;
      contactsSynced?: number;
      error?: string;
      timestamp: string;
    }>('resync:status', (data) => {
      const statusMessages: Record<string, string> = {
        started: '🔄 Starting force resync...',
        deleting_messages: '🗑️ Deleting old messages...',
        deleting_conversations: '🗑️ Deleting old conversations...',
        syncing_contacts: '📱 Syncing contacts from WhatsApp...',
        syncing_chats: '💬 Syncing conversations from WhatsApp...',
        completed: `✅ Resync complete! Synced ${data.conversationsSynced || 0} conversations and ${data.contactsSynced || 0} contacts.`,
        error: `❌ Resync error: ${data.error || 'Unknown error'}`,
      };

      const message = statusMessages[data.status] || `Resync status: ${data.status}`;

      if (data.status === 'completed') {
        if (resyncToastId) toast.dismiss(resyncToastId);
        toast.success(message, { duration: 5000 });
        setResyncToastId(null);
        setIsRefreshing(false);
        fetchConversations();
      } else if (data.status === 'error') {
        if (resyncToastId) toast.dismiss(resyncToastId);
        toast.error(message, { duration: 5000 });
        setResyncToastId(null);
        setIsRefreshing(false);
      } else {
        if (resyncToastId) {
          toast.loading(message, { id: resyncToastId });
        } else {
          const newToastId = toast.loading(message);
          setResyncToastId(newToastId);
        }
      }
    });

    const unsubSyncStatus = websocket.subscribe<{
      type: 'contacts' | 'chats';
      status: string;
      stats?: Record<string, number>;
    }>('sync:status', (data) => {
      if (data.status === 'completed') {
        mergeConversations();
        fetchContacts();
      }
    });

    return () => {
      unsubResyncStatus();
      unsubSyncStatus();
    };
  }, [selectedAgentId, resyncToastId, fetchConversations, mergeConversations, fetchContacts]);

  // Refresh platform accounts when platform status changes via WebSocket
  useEffect(() => {
    const unsubPlatformStatus = websocket.subscribe<any>('agent:platform_status', () => {
      fetchPlatformAccounts();
    });
    return () => { unsubPlatformStatus(); };
  }, [fetchPlatformAccounts]);

  // Navigate to first conversation when contact conversations are loaded
  useEffect(() => {
    if (selectedContact && selectedContactConversations.length > 0 && viewMode === 'contacts') {
      const firstConvData = selectedContactConversations[0] as any;
      const firstConvId = firstConvData?.conversationId || firstConvData?.id;
      const firstConv = conversations?.find((c) => c.id === firstConvId);
      if (firstConv && currentConversationId !== firstConv.id) {
        navigate(`${basePath}/${firstConv.id}`);
      }
    }
  }, [selectedContact, selectedContactConversations, viewMode, conversations, navigate, currentConversationId]);

  // -- Computed Values --

  const currentAgent = agents?.find((a) => a.id === selectedAgentId);

  // Effective viewMode — fallback to 'news' if not resolved yet
  const effectiveViewMode: ViewMode = viewMode ?? 'news';

  // Build the agentIds set for platform tab filtering
  const platformAgentIds = useMemo(() => {
    if (!isPlatformTab(effectiveViewMode)) return null;
    const { platform, accountId } = effectiveViewMode;
    if (accountId) {
      // Specific account — find the agentId for that platform account
      const account = platformAccounts.find(a => a.id === accountId);
      return account ? new Set([account.agentId]) : new Set<string>();
    }
    // "All" for this platform — collect all agentIds for this platform type
    const accounts = getAccountsByPlatform(platform);
    return new Set(accounts.map(a => a.agentId));
  }, [effectiveViewMode, platformAccounts, getAccountsByPlatform]);

  const chats: Chat[] = useMemo(() => {
    return (conversations || [])
      .filter((conv) => {
        // Agent filter (only for 'chat' tab where agent selector is visible)
        if (!isPlatformTab(effectiveViewMode) && effectiveViewMode === 'chat' && selectedAgentId) {
          if (conv.agentId !== selectedAgentId) return false;
        }

        // Filter by effectiveViewMode
        if (isPlatformTab(effectiveViewMode)) {
          // Platform tab: filter by platform type + optionally by agent
          const convPlatform = conv.platform || '';
          const targetPlatform = effectiveViewMode.platform;

          // Match platform (normalize telegram variants)
          const platformMatch = targetPlatform === 'telegram'
            ? (convPlatform === 'telegram' || convPlatform === 'telegram-bot' || convPlatform === 'telegram-user')
            : convPlatform === targetPlatform;
          if (!platformMatch) return false;

          // If specific account selected, filter by agentId
          if (platformAgentIds && platformAgentIds.size > 0) {
            if (conv.agentId && !platformAgentIds.has(conv.agentId)) return false;
          }

          // Exclude newsletters from platform tabs — they belong in News
          const convCategory = (conv as any).category || 'chat';
          if (convCategory === 'news') return false;

          // WhatsApp sub-filter (chat vs status)
          if (effectiveViewMode.platform === 'whatsapp' && effectiveViewMode.subFilter) {
            if (effectiveViewMode.subFilter === 'status') {
              return convCategory === 'status';
            }
            return convCategory !== 'status'; // 'chat' subFilter shows everything except status
          }

          return true;
        }

        // Simple view modes
        switch (effectiveViewMode) {
          case 'chat': {
            // AI-direct conversations — no platform or generic platform
            const convPlatform = conv.platform || '';
            const isNonPlatform = !convPlatform || convPlatform === 'direct' || convPlatform === 'web';
            return isNonPlatform;
          }
          case 'news': {
            const convCategory = (conv as any).category || 'chat';
            return convCategory === 'news';
          }
          default:
            return true;
        }
      })
      .map((conv) => {
        const agent = agents?.find((a) => a.id === conv.agentId);
        return convertToChat(conv, agent ? {
          id: agent.id,
          name: agent.name,
          platform: (conv.platform || 'whatsapp') as Platform,
          avatar: agent.avatar,
        } : undefined);
      });
  }, [conversations, effectiveViewMode, selectedAgentId, agents, platformAgentIds]);

  const selectedChat = currentConversation
    ? chats.find((c) => c.id === currentConversation.id)
    : null;

  const chatPlatform = selectedChat?.platform || 'whatsapp';
  const chatTitle = selectedChat?.title;
  const contactAvatar = selectedChat?.participants?.[0]?.avatarUrl;
  const convertedMessages: Message[] = messages.map((msg) =>
    convertToMessage(msg, chatPlatform, chatTitle, contactAvatar)
  );

  const contactsWithPlatforms = useMemo(() => {
    return contacts
      .map((contact) => {
        const platforms: string[] = [];
        if (contact.primaryPhone) platforms.push('whatsapp');
        if (contact.primaryEmail) platforms.push('email');
        if (contact.primaryTelegramUsername) platforms.push('telegram-user');

        const rawTags = (contact as any).tags || (contact.metadata?.tags as string[]) || [];
        const tagNames: string[] = rawTags.map((t: any) => typeof t === 'string' ? t : t?.name).filter(Boolean);

        return {
          id: contact.id,
          displayName: contact.displayName,
          primaryPhone: contact.primaryPhone || undefined,
          primaryEmail: contact.primaryEmail || undefined,
          primaryTelegramUsername: contact.primaryTelegramUsername || undefined,
          avatarUrl: contact.avatarUrl || undefined,
          lastContactAt: contact.lastContactAt || undefined,
          platforms,
          conversationCount: 0,
          tags: tagNames,
        };
      })
      .filter((contact) => {
        if (contactSearchQuery) {
          const searchLower = contactSearchQuery.toLowerCase();
          const nameMatch = contact.displayName.toLowerCase().includes(searchLower);
          const phoneMatch = contact.primaryPhone?.toLowerCase().includes(searchLower);
          const emailMatch = contact.primaryEmail?.toLowerCase().includes(searchLower);
          if (!nameMatch && !phoneMatch && !emailMatch) return false;
        }
        if (contactFilterTag && contactFilterTag !== 'all') {
          if (!contact.tags.includes(contactFilterTag)) return false;
        }
        return true;
      });
  }, [contacts, contactSearchQuery, contactFilterTag]);

  // -- Handlers --

  const handleSelectChat = useCallback(
    (chat: Chat) => {
      navigate(`${basePath}/${chat.id}`);
    },
    [navigate]
  );

  const handleSelectContact = useCallback(
    async (contactId: string) => {
      const contact = contacts?.find(c => c.id === contactId);
      if (contact) {
        await selectContact(contact);
      }
    },
    [selectContact, contacts]
  );

  const handleCreateConversation = async () => {
    try {
      const conversation = await createConversation('New Conversation');
      navigate(`${basePath}/${conversation.id}`);
      toast.success('Conversation created');
    } catch {
      toast.error('Failed to create conversation');
    }
  };

  const handleDeleteConversation = async (chatId: string) => {
    if (window.confirm('Are you sure you want to delete this conversation?')) {
      try {
        await deleteConversation(chatId);
        toast.success('Conversation deleted');
        if (currentConversationId === chatId) {
          navigate(basePath);
        }
      } catch {
        toast.error('Failed to delete conversation');
      }
    }
  };

  const handleUpdateChat = async (chatId: string, updates: { isPinned?: boolean; isMuted?: boolean; isArchived?: boolean }) => {
    try {
      await updateConversation(chatId, updates);
      if (updates.isPinned !== undefined) {
        toast.success(updates.isPinned ? 'Chat pinned' : 'Chat unpinned');
      } else if (updates.isMuted !== undefined) {
        toast.success(updates.isMuted ? 'Chat muted' : 'Chat unmuted');
      } else if (updates.isArchived !== undefined) {
        toast.success(updates.isArchived ? 'Chat archived' : 'Chat unarchived');
      }
    } catch {
      toast.error('Failed to update chat');
    }
  };

  const handleSendMessage = async (content: string, attachments?: File[]) => {
    if (!currentConversation) return;
    try {
      await sendMessage(currentConversation.id, content, selectedAgentId);
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handleTyping = (isTyping: boolean) => {
    if (currentConversation) {
      websocket.emit('message:typing', {
        conversationId: currentConversation.id,
        isTyping,
      });
    }
  };

  const handleRefreshMessages = async () => {
    if (!currentConversation || isRefreshing) return;
    setIsRefreshing(true);
    try {
      // For WhatsApp: trigger actual sync from WhatsApp before fetching
      if (currentConversation.platform === 'whatsapp') {
        const syncResult = await syncMessages(currentConversation.id);
        if (syncResult.success && syncResult.messagesSynced > 0) {
          toast.success(`Synced ${syncResult.messagesSynced} messages from WhatsApp`);
        } else if (!syncResult.success) {
          toast.error(syncResult.reason || 'WhatsApp sync failed');
        } else {
          toast.success('No new messages from WhatsApp');
        }
      }
      // Re-fetch messages from DB
      await mergeConversations();
      if (currentConversation) {
        await fetchMessages(currentConversation.id);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLoadMore = useCallback(async () => {
    if (!currentConversation || isLoadingMore || !hasMoreMessages) return;
    await loadOlderMessages(currentConversation.id);
  }, [currentConversation, isLoadingMore, hasMoreMessages, loadOlderMessages]);

  const handleForceResync = () => {
    if (!currentAgent) {
      toast.error('Please select an agent first');
      return;
    }

    const platformAccountId = currentAgent.platformAccountId || currentAgent.id;
    if (!platformAccountId) {
      toast.error('No platform account found for this agent');
      return;
    }

    const platformStatus = currentAgent.platformStatus;
    if (platformStatus !== 'connected') {
      const statusMessages: Record<string, string> = {
        'qr_pending': 'WhatsApp requires QR code scan. Please connect WhatsApp first.',
        'disconnected': 'WhatsApp is disconnected. Please reconnect in Platform settings.',
        'error': 'WhatsApp connection has an error. Please check Platform settings.',
        'connecting': 'WhatsApp is still connecting. Please wait and try again.',
      };
      const message = statusMessages[platformStatus || ''] || `WhatsApp is not connected (status: ${platformStatus || 'unknown'}). Please connect WhatsApp first.`;
      toast.error(message);
      return;
    }

    setShowResyncModal(true);
  };

  const executeForceResync = async () => {
    if (!currentAgent) throw new Error('No agent selected');

    const platformAccountId = currentAgent.platformAccountId || currentAgent.id;
    if (!platformAccountId) throw new Error('No platform account found');

    setIsRefreshing(true);

    try {
      const result = await api.post<{
        success: boolean;
        message?: string;
        error?: string;
      }>(`/platforms/${platformAccountId}/force-resync`, undefined, {
        timeout: 300000,
      });

      if (!result.success) {
        setIsRefreshing(false);
        throw new Error(result.error || 'Failed to start resync');
      }

      setCurrentConversation(null);
      navigate(basePath);
    } catch (error: any) {
      setIsRefreshing(false);
      const statusCode = error?.response?.status;
      let errorMessage = error?.response?.data?.error || error?.message || 'Failed to force resync';

      if (statusCode === 400) {
        errorMessage = 'WhatsApp is not connected. Please check your WhatsApp connection and try again.';
      } else if (statusCode === 404) {
        errorMessage = 'WhatsApp account not found. Please ensure the agent has a connected WhatsApp account.';
      }

      throw new Error(errorMessage);
    }
  };

  const handleResyncComplete = useCallback(() => {
    setIsRefreshing(false);
    setShowResyncModal(false);
    fetchConversations();
  }, [fetchConversations]);

  const handleCloseResyncModal = useCallback(() => {
    setShowResyncModal(false);
  }, []);

  const handleSyncContacts = useCallback(async () => {
    if (!currentAgent) {
      toast.error('Please select an agent first');
      return;
    }

    const platformAccountId = currentAgent.platformAccountId || currentAgent.id;
    if (!platformAccountId) {
      toast.error('No platform account found for this agent');
      return;
    }

    if (currentAgent.platformStatus !== 'connected') {
      toast.error('WhatsApp is not connected. Please connect WhatsApp first.');
      return;
    }

    try {
      await api.post(`/platforms/${platformAccountId}/sync-contacts`);
      toast.success('Contact sync started');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to start contact sync');
    }
  }, [currentAgent]);

  const handleSyncChats = useCallback(async () => {
    if (!currentAgent) {
      toast.error('Please select an agent first');
      return;
    }

    const platformAccountId = currentAgent.platformAccountId || currentAgent.id;
    if (!platformAccountId) {
      toast.error('No platform account found for this agent');
      return;
    }

    if (currentAgent.platformStatus !== 'connected') {
      toast.error('WhatsApp is not connected. Please connect WhatsApp first.');
      return;
    }

    try {
      await api.post(`/platforms/${platformAccountId}/sync-chats`);
      toast.success('Chat sync started');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to start chat sync');
    }
  }, [currentAgent]);

  const handleSyncComplete = useCallback(() => {
    fetchConversations();
    fetchContacts();
  }, [fetchConversations, fetchContacts]);

  const handleAddContactSuccess = () => {
    fetchContacts();
    toast.success('Contact created successfully');
  };

  const handleBack = useCallback(() => {
    navigate(basePath);
    setCurrentConversation(null);
    setShowInfoPanel(false);
    if (viewMode === 'contacts') {
      selectContact(null);
    }
  }, [navigate, setCurrentConversation, viewMode, selectContact]);

  const handleDeleteAllMessages = useCallback(async () => {
    if (!currentAgent) {
      toast.error('No agent selected');
      throw new Error('No agent selected');
    }

    const data = await api.delete<{ deletedConversations?: number; deletedMessages?: number; deletedMedia?: number }>(`/messages/agent/${currentAgent.id}`);
    toast.success(`Deleted ${data.deletedConversations || 0} conversations, ${data.deletedMessages || 0} messages, ${data.deletedMedia || 0} media files`);

    fetchConversations();
    setCurrentConversation(null);
    navigate(basePath);
  }, [currentAgent, fetchConversations, setCurrentConversation, navigate]);

  const handleDeleteAllContacts = useCallback(async () => {
    if (!currentAgent) {
      toast.error('No agent selected');
      throw new Error('No agent selected');
    }

    const data = await api.delete<{ deletedContacts?: number }>(`/contacts/agent/${currentAgent.id}`);
    toast.success(`Deleted ${data.deletedContacts || 0} contacts`);

    fetchContacts();
    selectContact(null);
  }, [currentAgent, fetchContacts, selectContact]);

  return {
    // State
    conversationId,
    selectedAgentId,
    setSelectedAgentId,
    showInfoPanel,
    setShowInfoPanel,
    showLeftPanel,
    setShowLeftPanel,
    typingUsers,
    viewMode: effectiveViewMode,
    setViewMode,
    showAddContactModal,
    setShowAddContactModal,
    contactFilterTag,
    setContactFilterTag,
    contactSearchQuery,
    setContactSearchQuery,
    isRefreshing,
    isLoading,
    isLoadingMessages,
    isLoadingMore,
    isContactsLoading,
    isSending,
    hasMoreMessages,

    // Data
    agents,
    currentAgent,
    chats,
    selectedChat,
    convertedMessages,
    contactsWithPlatforms,
    selectedContact,
    selectedContactIdentifiers,
    selectedContactTags,
    // Expose currentConversation for compatibility with components that need it
    currentConversation,

    // Platform data
    platformGroups,
    hasEmailAccounts,
    getUnreadByPlatform: getUnreadCountByPlatform,
    getUnreadByAgent: getUnreadCountByAgent,

    // Handlers
    handleSelectChat,
    handleSelectContact,
    handleCreateConversation,
    handleDeleteConversation,
    handleUpdateChat,
    handleSendMessage,
    handleTyping,
    handleRefreshMessages,
    handleLoadMore,
    handleForceResync,
    executeForceResync,
    handleResyncComplete,
    handleCloseResyncModal,
    handleSyncContacts,
    handleSyncChats,
    handleSyncComplete,
    handleAddContactSuccess,
    handleBack,
    handleDeleteAllMessages,
    handleDeleteAllContacts,

    // Modal state
    showResyncModal,
  };
};
