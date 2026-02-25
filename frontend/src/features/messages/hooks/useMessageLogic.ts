import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useMessageStore, Message as StoreMessage } from '../../../stores/messageStore';
import { useAgentStore } from '../../../stores/agentStore';
import { useContactStore } from '../../../stores/contactStore';
import { websocket } from '../../../services/websocket';
import { api } from '../../../services/api';
import { convertToChat, convertToMessage } from '../utils/converters';
import { ViewMode } from '../types';
import type { Chat, Message, Platform } from '../../../types';

export const useMessageLogic = () => {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  
  // Stores
  const {
    conversations,
    currentConversation,
    messages,
    isLoading,
    isLoadingMore,
    isSending,
    hasMoreMessages,
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
    mergeMessages,
    updateConversationFromMessage,
    updateMessageStatus,
    // WebSocket-first methods
    setConversationsFromWebSocket,
    setMessagesFromWebSocket,
  } = useMessageStore();
  
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

  // Local State
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('chats');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>('chat');
  const [contactConversations, setContactConversations] = useState<Chat[]>([]);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [contactFilterTag, setContactFilterTag] = useState<string>('all');
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [resyncToastId, setResyncToastId] = useState<string | null>(null);
  const [showResyncModal, setShowResyncModal] = useState(false);

  // -- Effects --

  // WebSocket-first: Subscribe to conversations and messages events
  useEffect(() => {
    // Handler for receiving conversations via WebSocket
    const handleConversationsInitial = (payload: { conversations: any[]; total: number }) => {
      console.log('[useMessageLogic] WebSocket conversations:initial received:', payload.conversations?.length, 'conversations');
      setConversationsFromWebSocket(payload.conversations || [], payload.total || 0);
    };

    // Handler for receiving messages via WebSocket
    const handleMessagesInitial = (payload: { conversationId: string; messages: any[]; pagination: { hasMore: boolean; nextCursor: string | null; total: number } }) => {
      console.log('[useMessageLogic] WebSocket messages:initial received:', payload.messages?.length, 'messages for', payload.conversationId);
      setMessagesFromWebSocket(payload.conversationId, payload.messages || [], payload.pagination);
    };

    // Handler for WebSocket errors
    const handleConversationsError = (payload: { error: string }) => {
      console.error('[useMessageLogic] WebSocket conversations:error:', payload.error);
      // Fallback to REST API if WebSocket fails
      fetchConversations();
    };

    const handleMessagesError = (payload: { error: string }) => {
      console.error('[useMessageLogic] WebSocket messages:error:', payload.error);
    };

    // Subscribe to WebSocket events
    const unsubConversations = websocket.subscribe('conversations:initial', handleConversationsInitial);
    const unsubMessages = websocket.subscribe('messages:initial', handleMessagesInitial);
    const unsubConversationsError = websocket.subscribe('conversations:error', handleConversationsError);
    const unsubMessagesError = websocket.subscribe('messages:error', handleMessagesError);

    return () => {
      unsubConversations();
      unsubMessages();
      unsubConversationsError();
      unsubMessagesError();
    };
  }, [setConversationsFromWebSocket, setMessagesFromWebSocket, fetchConversations]);

  // Fetch data on mount - use WebSocket-first if connected, fallback to REST API
  useEffect(() => {
    // Small delay to let WebSocket connect, then use WebSocket-first approach
    const timer = setTimeout(() => {
      if (websocket.isConnected) {
        console.log('[useMessageLogic] Using WebSocket-first for conversations');
        websocket.emit('conversations:fetch', {});
      } else {
        console.log('[useMessageLogic] WebSocket not connected, using REST API');
        fetchConversations();
      }
    }, 100);

    fetchAgents();
    fetchContacts();

    return () => clearTimeout(timer);
  }, [fetchConversations, fetchAgents, fetchContacts]);

  // Select conversation from URL param
  // Only set conversation when URL changes or when initially loading (currentConversation is null)
  // Don't re-set when conversations array updates from new messages - this prevents page blink
  useEffect(() => {
    if (conversationId) {
      // Skip if already viewing this conversation (prevents re-fetch on conversation list updates)
      if (currentConversation?.id === conversationId) {
        return;
      }
      const conversation = conversations?.find((c) => c.id === conversationId);
      if (conversation) {
        setCurrentConversation(conversation);
        setSelectedAgentId(conversation.agentId);
      }
    }
  }, [conversationId, conversations, setCurrentConversation, currentConversation?.id]);

  // Auto-fetch linked contact when conversation is selected (for contact info panel)
  useEffect(() => {
    const loadLinkedContact = async () => {
      if (currentConversation) {
        // Get contactId from conversation metadata or direct property
        const contactId = currentConversation.contactId ||
          (currentConversation.metadata?.contactId as string);

        if (contactId && (!selectedContact || selectedContact.id !== contactId)) {
          // Fetch the linked contact to populate contact info panel
          const contact = await fetchContactById(contactId);
          if (contact) {
            // Select the contact to populate identifiers, tags, etc.
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

  // Convert contact conversations to Chat type when they change
  useEffect(() => {
    if (selectedContactConversations.length > 0 && viewMode === 'contacts') {
      const chats = selectedContactConversations.map((conv: any) => {
        // Support both old format (conversationId) and new format (id)
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

  // Subscribe to ALL agents so we receive message:new events for the entire inbox
  useEffect(() => {
    if (!agents || agents.length === 0) return;

    // Subscribe to all agents for global message notifications
    console.log('[useMessageLogic] Subscribing to agents:', agents.map(a => a.id));
    agents.forEach((agent) => {
      websocket.subscribeToAgent(agent.id);
    });

    // Global handler: update conversation list when any new message arrives
    console.log('[useMessageLogic] Setting up global message:new handler for', agents.length, 'agents');
    const unsubGlobalMessage = websocket.subscribe<any>('message:new', (payload) => {
      console.log('[useMessageLogic] Global handler received message:new:', payload);
      // Unwrap broadcast envelope: { data: { message, conversation, contact }, timestamp }
      const data = payload?.data || payload;
      const msgData = data?.message || payload?.message || payload;
      const conversationData = data?.conversation;
      const conversationId = msgData?.conversationId || msgData?.conversation_id;

      if (!conversationId) return;

      const content = typeof msgData.content === 'object'
        ? (msgData.content?.text || String(msgData.content))
        : (msgData.content || '');

      const messageTime = msgData.createdAt || new Date().toISOString();

      // Check if conversation exists in current state
      const currentConversations = useMessageStore.getState().conversations;
      const conversationExists = currentConversations.some((c) => c.id === conversationId);

      if (conversationExists) {
        // Update existing conversation (bump to top, update last message, increment unread)
        updateConversationFromMessage(conversationId, content, messageTime);
      } else if (conversationData) {
        // New conversation created by incoming message - add it to the list
        console.log('[useMessageLogic] New conversation from incoming message:', conversationId);
        const newConversation = {
          id: conversationData.id || conversationId,
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
        useMessageStore.setState((state) => ({
          conversations: [newConversation, ...state.conversations],
        }));
      } else {
        // No conversation data in payload - use incremental merge to get the new one
        console.log('[useMessageLogic] New conversation without data, merging:', conversationId);
        mergeConversations();
      }
    });

    return () => {
      // Unsubscribe from all agents
      agents.forEach((agent) => {
        websocket.unsubscribeFromAgent(agent.id);
      });
      unsubGlobalMessage();
    };
  }, [agents, updateConversationFromMessage, mergeConversations]);

  // Subscribe to resync status WebSocket events when an agent is selected
  // Note: Agent room subscription is handled by the global agent subscription effect above
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

    // Also listen for sync:status (from Sync Contacts / Sync Chats buttons)
    const unsubSyncStatus = websocket.subscribe<{
      type: 'contacts' | 'chats';
      status: string;
      stats?: Record<string, number>;
    }>('sync:status', (data) => {
      if (data.status === 'completed') {
        // Auto-refresh conversations and contacts when any sync completes
        // Use mergeConversations for incremental update (no blink)
        mergeConversations();
        fetchContacts();
      }
    });

    // Note: messages:synced subscription is handled per-conversation in the effect below
    // to avoid calling mergeMessages for non-current conversations (which would be a no-op
    // but causes unnecessary re-renders)

    return () => {
      unsubResyncStatus();
      unsubSyncStatus();
    };
  }, [selectedAgentId, resyncToastId, fetchConversations, mergeConversations, fetchContacts]);

  // Subscribe to WebSocket events (messages, typing) for the CURRENT conversation
  useEffect(() => {
    if (!currentConversation) return;

    websocket.subscribeToConversation(currentConversation.id);

    const unsubMessage = websocket.subscribe<any>('message:new', (payload) => {
      // Unwrap broadcast envelope: { data: { message, conversation, contact }, timestamp }
      const msgData = payload?.data?.message || payload?.message || payload;
      const conversationId = msgData?.conversationId || msgData?.conversation_id;

      if (conversationId !== currentConversation.id) return;

      const content = typeof msgData.content === 'object'
        ? (msgData.content.text || String(msgData.content))
        : (msgData.content || '');

      const direction = msgData.direction;
      const role = direction
        ? (direction === 'incoming' ? 'assistant' : 'user')
        : (msgData.role || 'assistant');

      // Pass raw message data - addMessage will transform to correct format
      addMessage({
        id: msgData.id,
        conversationId,
        role: role as 'user' | 'assistant' | 'system',
        content,
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
    });

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

    // Listen for lazy-load sync completion - merge new messages when synced
    // Use mergeMessages instead of fetchMessages to prevent page blink
    const unsubSynced = websocket.subscribe<{ conversationId: string; messagesSynced: number }>(
      'messages:synced',
      (data) => {
        if (data.conversationId === currentConversation.id && data.messagesSynced > 0) {
          // Merge only new messages to prevent page blink
          mergeMessages(currentConversation.id);
        }
      }
    );

    // Listen for message status updates (read receipts)
    const unsubStatusUpdated = websocket.subscribe<{
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
      unsubMessage();
      unsubTyping();
      unsubSynced();
      unsubStatusUpdated();
    };
  }, [currentConversation, addMessage, mergeMessages, updateMessageStatus]);

  // Navigate to first conversation when contact conversations are loaded
  useEffect(() => {
    if (selectedContact && selectedContactConversations.length > 0 && viewMode === 'contacts') {
      const firstConvData = selectedContactConversations[0] as any;
      const firstConvId = firstConvData?.conversationId || firstConvData?.id;
      const firstConv = conversations?.find((c) => c.id === firstConvId);
      if (firstConv && currentConversation?.id !== firstConv.id) {
        navigate(`/messages/${firstConv.id}`);
      }
    }
  }, [selectedContact, selectedContactConversations, viewMode, conversations, navigate, currentConversation?.id]);


  // -- Computed Values --

  const currentAgent = agents?.find((a) => a.id === selectedAgentId);

  // Filter and map conversations to Chat objects
  const chats: Chat[] = (conversations || [])
    .filter((conv) => {
      // Filter by selected agent
      if (selectedAgentId && conv.agentId !== selectedAgentId) {
        return false;
      }
      // Filter by category
      if (categoryFilter) {
        const convCategory = (conv as any).category || 'chat';
        return convCategory === categoryFilter;
      }
      return true;
    })
    .map((conv) => {
      const agent = agents?.find((a) => a.id === conv.agentId);
      return convertToChat(conv, agent ? {
        id: agent.id,
        name: agent.name,
        platform: 'whatsapp' as Platform,
        avatar: agent.avatar,
      } : undefined);
    });

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

        // Extract tag names from tags array (can be strings or {name, color} objects)
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
        // Search filter
        if (contactSearchQuery) {
          const searchLower = contactSearchQuery.toLowerCase();
          const nameMatch = contact.displayName.toLowerCase().includes(searchLower);
          const phoneMatch = contact.primaryPhone?.toLowerCase().includes(searchLower);
          const emailMatch = contact.primaryEmail?.toLowerCase().includes(searchLower);
          if (!nameMatch && !phoneMatch && !emailMatch) return false;
        }
        // Tag filter
        if (contactFilterTag && contactFilterTag !== 'all') {
          if (!contact.tags.includes(contactFilterTag)) return false;
        }
        return true;
      });
  }, [contacts, contactSearchQuery, contactFilterTag]);


  // -- Handlers --

  const handleSelectChat = useCallback(
    (chat: Chat) => {
      navigate(`/messages/${chat.id}`);
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
      navigate(`/messages/${conversation.id}`);
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
        if (currentConversation?.id === chatId) {
          navigate('/messages');
        }
      } catch {
        toast.error('Failed to delete conversation');
      }
    }
  };

  const handleUpdateChat = async (chatId: string, updates: { isPinned?: boolean; isMuted?: boolean; isArchived?: boolean }) => {
    try {
      await updateConversation(chatId, updates);
      // Show appropriate toast message
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
      // TODO: Handle attachments when API supports it
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
      // Use mergeConversations for incremental update (no blink)
      await mergeConversations();
      // Use mergeMessages to add any new messages without clearing existing ones (prevents blink)
      if (currentConversation) {
        await mergeMessages(currentConversation.id);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Load older messages when scrolling up (pagination)
  const handleLoadMore = useCallback(async () => {
    if (!currentConversation || isLoadingMore || !hasMoreMessages) return;
    await loadOlderMessages(currentConversation.id);
  }, [currentConversation, isLoadingMore, hasMoreMessages, loadOlderMessages]);

  // Opens the resync modal after validation
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

    // Check platform connection status before attempting resync
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

    // Open the modal instead of using window.confirm
    setShowResyncModal(true);
  };

  // Execute the actual resync API call (called by ForceResyncModal)
  const executeForceResync = async () => {
    if (!currentAgent) {
      throw new Error('No agent selected');
    }

    const platformAccountId = currentAgent.platformAccountId || currentAgent.id;
    if (!platformAccountId) {
      throw new Error('No platform account found');
    }

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

      // Success - modal will handle WebSocket progress updates
      setCurrentConversation(null);
      navigate('/messages');
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

  // Called when resync completes (from modal)
  const handleResyncComplete = useCallback(() => {
    setIsRefreshing(false);
    setShowResyncModal(false);
    fetchConversations();
  }, [fetchConversations]);

  // Close resync modal
  const handleCloseResyncModal = useCallback(() => {
    setShowResyncModal(false);
  }, []);

  // Sync Contacts Only (non-blocking, progress via WebSocket toast)
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

  // Sync Chats & Messages Only (non-blocking, progress via WebSocket toast)
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

  // Called when any sync completes (from SyncProgressToast)
  const handleSyncComplete = useCallback(() => {
    fetchConversations();
    fetchContacts();
  }, [fetchConversations, fetchContacts]);

  const handleAddContactSuccess = () => {
    fetchContacts();
    toast.success('Contact created successfully');
  };

  const handleBack = useCallback(() => {
    navigate('/messages');
    setCurrentConversation(null);
    setShowInfoPanel(false);
    if (viewMode === 'contacts') {
      selectContact(null);
    }
  }, [navigate, setCurrentConversation, viewMode, selectContact]);

  // Delete All Messages for current agent
  const handleDeleteAllMessages = useCallback(async () => {
    if (!currentAgent) {
      toast.error('No agent selected');
      throw new Error('No agent selected');
    }

    const data = await api.delete<{ deletedConversations?: number; deletedMessages?: number; deletedMedia?: number }>(`/messages/agent/${currentAgent.id}`);
    toast.success(`Deleted ${data.deletedConversations || 0} conversations, ${data.deletedMessages || 0} messages, ${data.deletedMedia || 0} media files`);

    // Refresh conversations list
    fetchConversations();
    setCurrentConversation(null);
    navigate('/messages');
  }, [currentAgent, fetchConversations, setCurrentConversation, navigate]);

  // Delete All Contacts for current agent
  const handleDeleteAllContacts = useCallback(async () => {
    if (!currentAgent) {
      toast.error('No agent selected');
      throw new Error('No agent selected');
    }

    const data = await api.delete<{ deletedContacts?: number }>(`/contacts/agent/${currentAgent.id}`);
    toast.success(`Deleted ${data.deletedContacts || 0} contacts`);

    // Refresh contacts list
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
    viewMode,
    setViewMode,
    categoryFilter,
    setCategoryFilter,
    showAddContactModal,
    setShowAddContactModal,
    contactFilterTag,
    setContactFilterTag,
    contactSearchQuery,
    setContactSearchQuery,
    isRefreshing,
    isLoading,
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
