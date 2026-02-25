import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import api from '../services/api'
import { extractErrorMessage } from '../lib/utils'
import type { MessageContent, MessageContentType, MediaContent, Platform, MessageSender } from '../types'

// Cache key for localStorage
const CACHE_STORAGE_KEY = 'swarm-message-cache'
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours max age for persisted cache
const CACHE_TTL = 300000 // 5 minutes for in-memory cache freshness

// Helper: Load cache from localStorage
function loadCacheFromStorage(): Map<string, any> {
  try {
    const stored = localStorage.getItem(CACHE_STORAGE_KEY)
    if (!stored) return new Map()

    const parsed = JSON.parse(stored)
    const now = Date.now()
    const cache = new Map<string, any>()

    // Filter out expired entries (older than 24 hours)
    for (const [key, value] of Object.entries(parsed)) {
      const entry = value as { lastFetched: number }
      if (now - entry.lastFetched < CACHE_MAX_AGE) {
        cache.set(key, value)
      }
    }

    return cache
  } catch {
    return new Map()
  }
}

// Helper: Save cache to localStorage
function saveCacheToStorage(cache: Map<string, any>) {
  try {
    const obj: Record<string, any> = {}
    const now = Date.now()

    // Only persist entries that are less than 24 hours old
    cache.forEach((value, key) => {
      if (now - value.lastFetched < CACHE_MAX_AGE) {
        obj[key] = value
      }
    })

    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

// MessageCache interface will be defined later after Message interface
// Using 'any' for the helper return type - actual type is enforced by the store

/**
 * Transform raw API/WebSocket message to store format with nested MessageContent
 */
function transformRawMessage(msg: any): Message {
  // If already in the correct format (has content.type), return as-is
  if (msg.content && typeof msg.content === 'object' && msg.content.type) {
    return {
      id: msg.id,
      conversationId: msg.conversationId,
      role: msg.role || (msg.direction === 'incoming' ? 'assistant' : 'user'),
      content: msg.content,
      agentId: msg.agentId,
      agentName: msg.agentName,
      sender: msg.sender || {
        id: msg.senderId || 'unknown',
        name: msg.senderName || 'Unknown',
      },
      metadata: msg.metadata,
      createdAt: msg.createdAt,
      timestamp: msg.timestamp || msg.createdAt,
      status: msg.status,
      isFromAI: msg.isFromAI || msg.aiGenerated,
      platform: msg.platform || 'whatsapp',
      replyToId: msg.replyToId,
      reactions: msg.reactions,
    }
  }

  // Transform flat structure to nested MessageContent
  const contentType: MessageContentType = msg.contentType || 'text'

  // Build media object if this is a media message
  let media: MediaContent | undefined
  if (msg.mediaUrl || msg.mediaPath) {
    // Check if this is an auto-analyzed image - don't use content as caption
    // Auto-analyzed images have ocrExtracted, visionDescription, or autoAnalyzed in metadata
    const isAutoAnalyzed = msg.metadata?.ocrExtracted ||
                           msg.metadata?.visionDescription ||
                           msg.metadata?.autoAnalyzed;

    // For auto-analyzed images, content contains the analysis text which is displayed
    // separately in OCRDisplay or VisionAIDisplay - not as caption
    const shouldUseContentAsCaption = contentType !== 'text' &&
                                       !isAutoAnalyzed &&
                                       typeof msg.content === 'string' &&
                                       msg.content.length > 0;

    media = {
      type: contentType as MediaContent['type'],
      url: msg.mediaUrl,
      localPath: msg.mediaPath,
      mimeType: msg.mediaMimeType,
      fileName: msg.mediaFileName,
      fileSize: msg.mediaFileSize,
      duration: msg.mediaDuration,
      thumbnail: msg.mediaThumbnail,
      caption: msg.mediaCaption || (shouldUseContentAsCaption ? msg.content : undefined),
    }
  }

  // Build the MessageContent object
  const content: MessageContent = {
    type: contentType,
    text: typeof msg.content === 'string' ? msg.content : undefined,
    media,
    location: msg.location,
    contact: msg.contact,
    poll: msg.poll,
    reaction: msg.reaction,
  }

  // Build sender object
  const sender: MessageSender = {
    id: msg.senderId || msg.senderPhone || 'unknown',
    name: msg.senderName || 'Unknown',
    phone: msg.senderPhone,
    avatarUrl: msg.senderAvatar,
    isBot: msg.isFromBot,
  }

  return {
    id: msg.id,
    conversationId: msg.conversationId,
    role: msg.role || (msg.direction === 'incoming' ? 'assistant' : 'user'),
    content,
    agentId: msg.agentId,
    agentName: msg.agentName,
    sender,
    metadata: msg.metadata,
    createdAt: msg.createdAt,
    timestamp: msg.createdAt,
    status: msg.status,
    isFromAI: msg.aiGenerated,
    platform: msg.platform || 'whatsapp',
    replyToId: msg.replyToId,
    reactions: msg.reactions,
  }
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  // Content is now a structured object matching MessageBubble expectations
  content: MessageContent
  agentId?: string
  agentName?: string
  sender: MessageSender
  metadata?: Record<string, any>
  createdAt: string
  timestamp: string
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  isFromAI?: boolean
  platform: Platform
  replyToId?: string
  reactions?: Array<{ emoji: string; targetMessageId: string; isRemoval?: boolean }>
}

export interface Conversation {
  id: string
  title: string
  agentId?: string
  agentName?: string
  platform?: string
  isGroup?: boolean
  isPinned?: boolean
  isMuted?: boolean
  isArchived?: boolean
  contactId?: string
  contactName?: string
  contactAvatar?: string
  externalId?: string
  unreadCount?: number
  lastMessage?: string
  lastMessageAt?: string
  messageCount: number
  createdAt: string
  updatedAt: string
  metadata?: Record<string, any>
  category?: string
}

// Message cache structure for conversation messages
export interface MessageCache {
  messages: Message[]
  hasMore: boolean
  nextCursor: string | null
  lastFetched: number
}

// MessageCache interface is defined above with localStorage helpers

interface MessageState {
  conversations: Conversation[]
  currentConversation: Conversation | null
  messages: Message[]
  isLoading: boolean
  isRefreshing: boolean  // For background updates (no skeleton)
  isLoadingMore: boolean  // For loading older messages
  isSending: boolean
  error: string | null
  // Pagination state
  hasMoreMessages: boolean
  messageCursor: string | null
  // Conversation message cache
  conversationCache: Map<string, MessageCache>
  // Actions
  fetchConversations: (options?: { silent?: boolean }) => Promise<void>
  mergeConversations: () => Promise<number>  // Incremental update
  fetchMessages: (conversationId: string) => Promise<void>
  loadOlderMessages: (conversationId: string) => Promise<number>  // Load more via pagination
  // Merge new messages without replacing existing ones (prevents page blink on sync)
  mergeMessages: (conversationId: string) => Promise<number>
  sendMessage: (conversationId: string, content: string, agentId?: string) => Promise<Message>
  createConversation: (title: string, agentId?: string) => Promise<Conversation>
  updateConversation: (id: string, updates: Partial<Pick<Conversation, 'isPinned' | 'isMuted' | 'isArchived' | 'title'>>) => Promise<Conversation>
  deleteConversation: (id: string) => Promise<void>
  setCurrentConversation: (conversation: Conversation | null) => void
  // addMessage accepts any format - it will transform to the correct structure internally
  addMessage: (message: Message | any) => void
  addMessageWithStatus: (message: Message | any, status?: 'pending' | 'sent' | 'delivered' | 'read') => void
  updateMessageStatus: (messageId: string, status: 'pending' | 'sent' | 'delivered' | 'read') => void
  // Update a conversation in the list when a new message arrives (for inbox realtime)
  updateConversationFromMessage: (conversationId: string, lastMessage: string, lastMessageAt: string, incrementUnread?: boolean) => void
  // Clear cache for a conversation (force refetch)
  clearConversationCache: (conversationId: string) => void
  // WebSocket-first: Set conversations received via WebSocket (no REST API call)
  setConversationsFromWebSocket: (conversations: any[], total: number) => void
  // WebSocket-first: Set messages received via WebSocket (no REST API call)
  setMessagesFromWebSocket: (conversationId: string, messages: any[], pagination: { hasMore: boolean; nextCursor: string | null; total: number }) => void
}

// Export transform function for use by WebSocket handlers
export { transformRawMessage }

// Initialize cache from localStorage on module load
const initialCache = loadCacheFromStorage()

export const useMessageStore = create<MessageState>((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  isLoading: false,
  isRefreshing: false,
  isLoadingMore: false,
  isSending: false,
  error: null,
  hasMoreMessages: false,
  messageCursor: null,
  conversationCache: initialCache,  // Load from localStorage

  fetchConversations: async (options?: { silent?: boolean }) => {
    const state = get()
    // Only show loading skeleton on initial load (prevents blink on refresh)
    if (!options?.silent && state.conversations.length === 0) {
      set({ isLoading: true })
    } else if (!options?.silent) {
      set({ isRefreshing: true })
    }
    try {
      const response = await api.get('/conversations')
      const rawConversations = Array.isArray(response.data) ? response.data : (response.data?.conversations || [])
      // Map API response to store format
      const conversations = rawConversations.map((conv: any) => ({
        id: conv.id,
        title: conv.title || conv.contactName || 'Unknown',
        agentId: conv.agentId,
        agentName: conv.agentName,
        platform: conv.platform || 'whatsapp',
        isGroup: conv.isGroup || false,
        isPinned: conv.isPinned || false,
        isMuted: conv.isMuted || false,
        isArchived: conv.isArchived || false,
        contactId: conv.contactId,
        contactName: conv.contactName,
        contactAvatar: conv.contactAvatar,
        externalId: conv.externalId,
        unreadCount: conv.unreadCount || 0,
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.lastMessageAt,
        messageCount: conv.messageCount || 0,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        metadata: conv.metadata,
        category: conv.category || 'chat',
      }))
      set({ conversations, isLoading: false, isRefreshing: false })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch conversations'), isLoading: false, isRefreshing: false })
    }
  },

  // Incremental update: merge new/changed conversations without full replacement
  mergeConversations: async () => {
    try {
      const response = await api.get('/conversations')
      const rawConversations = Array.isArray(response.data) ? response.data : (response.data?.conversations || [])
      const fetchedConversations = rawConversations.map((conv: any) => ({
        id: conv.id,
        title: conv.title || conv.contactName || 'Unknown',
        agentId: conv.agentId,
        agentName: conv.agentName,
        platform: conv.platform || 'whatsapp',
        isGroup: conv.isGroup || false,
        isPinned: conv.isPinned || false,
        isMuted: conv.isMuted || false,
        isArchived: conv.isArchived || false,
        contactId: conv.contactId,
        contactName: conv.contactName,
        contactAvatar: conv.contactAvatar,
        externalId: conv.externalId,
        unreadCount: conv.unreadCount || 0,
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.lastMessageAt,
        messageCount: conv.messageCount || 0,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        metadata: conv.metadata,
        category: conv.category || 'chat',
      }))

      const existingIds = new Set(get().conversations.map(c => c.id))
      const newConversations = fetchedConversations.filter((c: Conversation) => !existingIds.has(c.id))

      if (newConversations.length > 0) {
        set((state) => {
          // Merge: update existing, add new
          const updatedMap = new Map(state.conversations.map(c => [c.id, c]))
          for (const conv of fetchedConversations) {
            updatedMap.set(conv.id, conv)
          }
          const merged = Array.from(updatedMap.values())
          // Sort: pinned first, then by lastMessageAt descending
          merged.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1
            if (!a.isPinned && b.isPinned) return 1
            const aTime = a.lastMessageAt || a.updatedAt || ''
            const bTime = b.lastMessageAt || b.updatedAt || ''
            return bTime.localeCompare(aTime)
          })
          return { conversations: merged }
        })
      }

      return newConversations.length
    } catch (error: unknown) {
      console.error('Failed to merge conversations:', extractErrorMessage(error, 'Unknown error'))
      return 0
    }
  },

  fetchMessages: async (conversationId) => {
    const cache = get().conversationCache.get(conversationId)
    const CACHE_TTL = 300000 // 5 minutes - longer cache to prevent constant refetching

    // Use cache if fresh
    if (cache && (Date.now() - cache.lastFetched) < CACHE_TTL) {
      set({
        messages: cache.messages,
        hasMoreMessages: cache.hasMore,
        messageCursor: cache.nextCursor,
        isLoading: false
      })
      return
    }

    // DON'T clear messages while loading - show existing content or cache while fetching
    // This prevents the 5-10 second blank loading screen
    if (cache) {
      // Use stale cache while refreshing in background
      set({
        messages: cache.messages,
        hasMoreMessages: cache.hasMore,
        messageCursor: cache.nextCursor,
        isLoading: true  // Show subtle loading indicator, but keep content visible
      })
    } else {
      // No cache at all - only then show loading with empty messages
      set({ isLoading: true, messages: [] })
    }
    try {
      const response = await api.get(`/conversations/${conversationId}/messages`)
      const rawMessages = Array.isArray(response.data) ? response.data : (response.data?.messages || [])
      const pagination = response.data?.pagination || { hasMore: false, nextCursor: null }

      // Transform all messages using the helper function
      const messages = rawMessages.map(transformRawMessage)

      // Update cache
      const newCache: MessageCache = {
        messages,
        hasMore: pagination.hasMore,
        nextCursor: pagination.nextCursor,
        lastFetched: Date.now()
      }
      const updatedCacheMap = new Map(get().conversationCache)
      updatedCacheMap.set(conversationId, newCache)

      // Persist to localStorage for next page load
      saveCacheToStorage(updatedCacheMap)

      set({
        messages,
        hasMoreMessages: pagination.hasMore,
        messageCursor: pagination.nextCursor,
        isLoading: false,
        conversationCache: updatedCacheMap
      })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch messages'), isLoading: false })
    }
  },

  // Load older messages using cursor-based pagination
  loadOlderMessages: async (conversationId) => {
    const { messageCursor, hasMoreMessages, isLoadingMore } = get()

    if (!hasMoreMessages || isLoadingMore || !messageCursor) {
      return 0
    }

    set({ isLoadingMore: true })
    try {
      const response = await api.get(`/conversations/${conversationId}/messages?before=${encodeURIComponent(messageCursor)}`)
      const rawMessages = Array.isArray(response.data) ? response.data : (response.data?.messages || [])
      const pagination = response.data?.pagination || { hasMore: false, nextCursor: null }

      const olderMessages = rawMessages.map(transformRawMessage)

      if (olderMessages.length > 0) {
        set((state) => {
          // Prepend older messages (they come in chronological order after reverse)
          const merged = [...olderMessages, ...state.messages]

          // Update cache
          const updatedCacheMap = new Map(state.conversationCache)
          const existingCache = updatedCacheMap.get(conversationId)
          if (existingCache) {
            updatedCacheMap.set(conversationId, {
              ...existingCache,
              messages: merged,
              hasMore: pagination.hasMore,
              nextCursor: pagination.nextCursor
            })
          }

          // Persist to localStorage
          saveCacheToStorage(updatedCacheMap)

          return {
            messages: merged,
            hasMoreMessages: pagination.hasMore,
            messageCursor: pagination.nextCursor,
            isLoadingMore: false,
            conversationCache: updatedCacheMap
          }
        })
      } else {
        set({ isLoadingMore: false, hasMoreMessages: false })
      }

      return olderMessages.length
    } catch (error: unknown) {
      console.error('Failed to load older messages:', extractErrorMessage(error, 'Unknown error'))
      set({ isLoadingMore: false })
      return 0
    }
  },

  // Merge new messages without replacing existing ones (prevents page blink)
  // Returns the number of new messages added
  mergeMessages: async (conversationId) => {
    try {
      const response = await api.get(`/conversations/${conversationId}/messages`)
      const rawMessages = Array.isArray(response.data) ? response.data : (response.data?.messages || [])
      const fetchedMessages = rawMessages.map(transformRawMessage)

      // Get existing message IDs for fast lookup
      const existingIds = new Set(get().messages.map((m: Message) => m.id))

      // Filter to only new messages
      const newMessages = fetchedMessages.filter((m: Message) => !existingIds.has(m.id))

      if (newMessages.length > 0) {
        set((state) => ({
          // Merge and sort by createdAt to maintain order
          messages: [...state.messages, ...newMessages].sort((a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          ),
        }))
      }

      return newMessages.length
    } catch (error: unknown) {
      console.error('Failed to merge messages:', extractErrorMessage(error, 'Unknown error'))
      return 0
    }
  },

  sendMessage: async (conversationId, content, agentId) => {
    // Optimistic update: show message immediately with pending status
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const pendingMessage: Message = {
      id: tempId,
      conversationId,
      role: 'user',
      content: { type: 'text', text: content },
      sender: { id: 'self', name: 'You' },
      createdAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      status: 'pending',
      platform: (get().currentConversation?.platform || 'whatsapp') as Platform,
    };

    set((state) => ({
      messages: [...state.messages, pendingMessage],
      isSending: true
    }));

    try {
      const response = await api.post(`/conversations/${conversationId}/messages`, {
        content,
        agentId,
      });
      const msg = response.data;
      // Transform to store format
      const newMessage = transformRawMessage(msg);

      // Replace temp message with real one
      set((state) => ({
        messages: state.messages.map(m =>
          m.id === tempId ? { ...newMessage, status: 'sent' as const } : m
        ),
        isSending: false,
      }));

      // Update cache
      const updatedCacheMap = new Map(get().conversationCache);
      const existingCache = updatedCacheMap.get(conversationId);
      if (existingCache) {
        updatedCacheMap.set(conversationId, {
          ...existingCache,
          messages: existingCache.messages.map((m: Message) =>
            m.id === tempId ? { ...newMessage, status: 'sent' as const } : m
          )
        });
        set({ conversationCache: updatedCacheMap });
      }

      return newMessage;
    } catch (error: unknown) {
      // Mark message as failed
      set((state) => ({
        messages: state.messages.map(m =>
          m.id === tempId ? { ...m, status: 'failed' as const } : m
        ),
        error: extractErrorMessage(error, 'Failed to send message'),
        isSending: false
      }));
      throw error;
    }
  },

  createConversation: async (title, agentId) => {
    set({ isLoading: true })
    try {
      const response = await api.post('/conversations', { title, agentId })
      const newConversation = response.data
      set((state) => ({
        conversations: [newConversation, ...state.conversations],
        currentConversation: newConversation,
        isLoading: false,
      }))
      return newConversation
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to create conversation'), isLoading: false })
      throw error
    }
  },

  updateConversation: async (id, updates) => {
    try {
      const response = await api.patch(`/conversations/${id}`, updates)
      const updatedConversation = response.data?.conversation || response.data
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, ...updatedConversation } : c
        ),
        currentConversation:
          state.currentConversation?.id === id
            ? { ...state.currentConversation, ...updatedConversation }
            : state.currentConversation,
      }))
      return updatedConversation
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to update conversation') })
      throw error
    }
  },

  deleteConversation: async (id) => {
    try {
      await api.delete(`/conversations/${id}`)
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        currentConversation:
          state.currentConversation?.id === id ? null : state.currentConversation,
        messages: state.currentConversation?.id === id ? [] : state.messages,
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to delete conversation') })
      throw error
    }
  },

  setCurrentConversation: (conversation) => {
    const currentId = get().currentConversation?.id;
    const newId = conversation?.id;

    // If switching to the same conversation, just update the object without clearing messages
    // This prevents page blink when conversations array updates trigger re-selection
    if (currentId && newId && currentId === newId) {
      set({ currentConversation: conversation });
      return;
    }

    // CRITICAL: When switching to a DIFFERENT conversation, immediately update currentConversation
    // and clear messages to prevent showing stale messages from the previous conversation
    console.log('[messageStore] Switching conversation from', currentId, 'to', newId);

    // Check if we have cached messages for the NEW conversation
    let cache = conversation ? get().conversationCache.get(conversation.id) : null;
    const CACHE_TTL = 300000; // 5 minutes - match fetchMessages TTL

    // CRITICAL: Validate cache integrity - ensure all cached messages belong to this conversation
    // This prevents showing messages from a different conversation due to cache corruption
    if (cache && cache.messages.length > 0) {
      const invalidMessages = cache.messages.filter((m: Message) => m.conversationId && m.conversationId !== conversation?.id);
      if (invalidMessages.length > 0) {
        console.warn('[messageStore] Cache corruption detected for conversation', conversation?.id, '- found', invalidMessages.length, 'messages from other conversations. Clearing cache.');
        // Clear corrupted cache
        const updatedCacheMap = new Map(get().conversationCache);
        updatedCacheMap.delete(conversation!.id);
        saveCacheToStorage(updatedCacheMap);
        set({ conversationCache: updatedCacheMap });
        cache = null; // Force fresh fetch
      }
    }

    if (cache && (Date.now() - cache.lastFetched) < CACHE_TTL) {
      // Use fresh cached messages for the NEW conversation - no loading, no blink
      set({
        currentConversation: conversation,
        messages: cache.messages,
        hasMoreMessages: cache.hasMore,
        messageCursor: cache.nextCursor,
        isLoading: false  // Ensure loading is false when using cache
      });
    } else if (cache) {
      // Stale cache for the NEW conversation - show cached content while fetching fresh data
      set({
        currentConversation: conversation,
        messages: cache.messages,  // Show stale cache content for THIS conversation
        hasMoreMessages: cache.hasMore,
        messageCursor: cache.nextCursor,
        isLoading: true  // Show loading indicator since we're fetching fresh data
      });
      // WebSocket-first: emit messages:fetch via WebSocket if available
      // The WebSocket handler will call setMessagesFromWebSocket when data arrives
      if (conversation && typeof window !== 'undefined' && (window as any).__websocket?.isConnected) {
        console.log('[messageStore] Using WebSocket-first for messages:', conversation.id);
        (window as any).__websocket.emit('messages:fetch', { conversationId: conversation.id });
      } else if (conversation) {
        get().fetchMessages(conversation.id);
      }
    } else {
      // No cache at all for the NEW conversation - show empty state and fetch
      set({
        currentConversation: conversation,
        messages: [],  // Clear messages since we have no cache for this conversation
        hasMoreMessages: false,
        messageCursor: null,
        isLoading: true  // Show loading indicator
      });
      // WebSocket-first: emit messages:fetch via WebSocket if available
      if (conversation && typeof window !== 'undefined' && (window as any).__websocket?.isConnected) {
        console.log('[messageStore] Using WebSocket-first for messages:', conversation.id);
        (window as any).__websocket.emit('messages:fetch', { conversationId: conversation.id });
      } else if (conversation) {
        get().fetchMessages(conversation.id);
      }
    }
  },

  addMessage: (message) => {
    set((state) => {
      // Transform to ensure correct format (handles both old flat format and new nested format)
      const transformedMessage = transformRawMessage(message)
      const convId = transformedMessage.conversationId

      // CRITICAL: Only add to displayed messages if this message is for the CURRENT conversation
      // This prevents cross-contamination when messages arrive for other conversations
      const isCurrentConversation = state.currentConversation?.id === convId

      if (!isCurrentConversation) {
        // Message is for a different conversation - only update its cache, not displayed messages
        console.log('[messageStore] addMessage for non-current conversation', convId, '(current:', state.currentConversation?.id, ')');
        if (convId) {
          const updatedCacheMap = new Map(state.conversationCache)
          const existingCache = updatedCacheMap.get(convId)
          if (existingCache) {
            // Add to that conversation's cached messages (not state.messages!)
            const messageExistsInCache = existingCache.messages.some((m: Message) => m.id === transformedMessage.id)
            if (!messageExistsInCache) {
              updatedCacheMap.set(convId, {
                ...existingCache,
                messages: [...existingCache.messages, transformedMessage],
                lastFetched: Date.now()
              })
              saveCacheToStorage(updatedCacheMap)
              return { conversationCache: updatedCacheMap }
            }
          }
        }
        return state // No change to displayed messages
      }

      // Message is for current conversation - add to displayed messages
      const messageExists = state.messages.some((m) => m.id === transformedMessage.id)
      if (messageExists) {
        return state // Don't add duplicate
      }

      const newMessages = [...state.messages, transformedMessage]

      // Also update the cache for this conversation so it persists
      if (convId) {
        const updatedCacheMap = new Map(state.conversationCache)
        const existingCache = updatedCacheMap.get(convId)
        if (existingCache) {
          updatedCacheMap.set(convId, {
            ...existingCache,
            messages: newMessages,
            lastFetched: Date.now()  // Refresh timestamp since we have new data
          })
          // Persist to localStorage
          saveCacheToStorage(updatedCacheMap)
          return {
            messages: newMessages,
            conversationCache: updatedCacheMap
          }
        }
      }

      return {
        messages: newMessages,
      }
    })
  },

  // Add message with additional tracking for status
  addMessageWithStatus: (message, status: 'pending' | 'sent' | 'delivered' | 'read' = 'sent') => {
    set((state) => {
      // Transform to ensure correct format
      const transformedMessage = transformRawMessage(message)
      const convId = transformedMessage.conversationId

      // CRITICAL: Only add to displayed messages if this message is for the CURRENT conversation
      if (convId && state.currentConversation?.id !== convId) {
        console.log('[messageStore] addMessageWithStatus for non-current conversation', convId, '(current:', state.currentConversation?.id, ')');
        return state
      }

      const messageExists = state.messages.some((m) => m.id === message.id)
      if (messageExists) {
        return state
      }
      return {
        messages: [...state.messages, { ...transformedMessage, status }],
      }
    })
  },

  // Update message status
  updateMessageStatus: (messageId: string, status: 'pending' | 'sent' | 'delivered' | 'read') => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, status } : m
      ),
    }))
  },

  // Update a conversation in the list when a new message arrives (for inbox realtime)
  updateConversationFromMessage: (conversationId: string, lastMessage: string, lastMessageAt: string, incrementUnread = true) => {
    set((state) => {
      const isCurrentConversation = state.currentConversation?.id === conversationId;
      const updatedConversations = state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          lastMessage,
          lastMessageAt,
          messageCount: (c.messageCount || 0) + 1,
          unreadCount: incrementUnread && !isCurrentConversation ? (c.unreadCount || 0) + 1 : c.unreadCount || 0,
          updatedAt: lastMessageAt,
        };
      });

      // Sort conversations: pinned first, then by lastMessageAt descending
      updatedConversations.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const aTime = a.lastMessageAt || a.updatedAt || '';
        const bTime = b.lastMessageAt || b.updatedAt || '';
        return bTime.localeCompare(aTime);
      });

      return { conversations: updatedConversations };
    })
  },

  // Clear cache for a conversation (force refetch on next access)
  clearConversationCache: (conversationId: string) => {
    set((state) => {
      const updatedCacheMap = new Map(state.conversationCache);
      updatedCacheMap.delete(conversationId);
      // Persist to localStorage
      saveCacheToStorage(updatedCacheMap);
      return { conversationCache: updatedCacheMap };
    });
  },

  // WebSocket-first: Set conversations received via WebSocket (no REST API call)
  setConversationsFromWebSocket: (rawConversations: any[], _total: number) => {
    // Map raw data to store format (same transform as fetchConversations)
    const conversations = rawConversations.map((conv: any) => ({
      id: conv.id,
      title: conv.title || conv.contactName || 'Unknown',
      agentId: conv.agentId,
      agentName: conv.agentName,
      platform: conv.platform || 'whatsapp',
      isGroup: conv.isGroup || false,
      isPinned: conv.isPinned || false,
      isMuted: conv.isMuted || false,
      isArchived: conv.isArchived || false,
      contactId: conv.contactId,
      contactName: conv.contactName,
      contactAvatar: conv.contactAvatar,
      externalId: conv.externalId,
      unreadCount: conv.unreadCount || 0,
      lastMessage: conv.lastMessage,
      lastMessageAt: conv.lastMessageAt,
      messageCount: conv.messageCount || 0,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      metadata: conv.metadata,
      category: conv.category || 'chat',
    }));
    set({ conversations, isLoading: false, isRefreshing: false });
  },

  // WebSocket-first: Set messages received via WebSocket (no REST API call)
  setMessagesFromWebSocket: (conversationId: string, rawMessages: any[], pagination: { hasMore: boolean; nextCursor: string | null; total: number }) => {
    // Transform all messages using the helper function
    const messages = rawMessages.map(transformRawMessage);

    // Update cache (always update cache even if not current conversation)
    const newCache: MessageCache = {
      messages,
      hasMore: pagination.hasMore,
      nextCursor: pagination.nextCursor,
      lastFetched: Date.now()
    };
    const updatedCacheMap = new Map(get().conversationCache);
    updatedCacheMap.set(conversationId, newCache);

    // Persist to localStorage
    saveCacheToStorage(updatedCacheMap);

    // CRITICAL: Only update displayed messages if this is STILL the current conversation
    // This prevents stale WebSocket responses from overwriting when user switches conversations quickly
    const currentConvId = get().currentConversation?.id;
    if (currentConvId !== conversationId) {
      console.log('[messageStore] Ignoring stale WebSocket messages for', conversationId, '(current:', currentConvId, ')');
      // Only update the cache, not the displayed messages
      set({ conversationCache: updatedCacheMap });
      return;
    }

    set({
      messages,
      hasMoreMessages: pagination.hasMore,
      messageCursor: pagination.nextCursor,
      isLoading: false,
      conversationCache: updatedCacheMap
    });
  },
}))
