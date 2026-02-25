import { create } from 'zustand'
import api from '../services/api'
import { extractErrorMessage } from '../lib/utils'
import type { MessageContent, MessageContentType, MediaContent, Platform, MessageSender } from '../types'

// =============================================================================
// Message Store V2 - Simplified Architecture
// =============================================================================
//
// KEY CHANGES FROM V1:
// 1. Single Map<conversationId, Message[]> instead of flat array + separate cache
// 2. No localStorage persistence for messages (fetch fresh, cache in memory only)
// 3. Built-in deduplication via Set<string> per conversation
// 4. Conversation switch lock prevents race conditions
// 5. One clear data flow: REST for initial load, WS for real-time updates
// 6. No WebSocket-first fetching (removed window.__websocket dependency)
//
// DATA FLOW:
//   Switch conversation → fetchMessages(REST) → store in messagesMap
//   WebSocket message:new → addMessage() → only if convId matches or goes to cache
//   No localStorage, no stale cache, no cache TTL, no cache corruption
// =============================================================================

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

  let media: MediaContent | undefined
  if (msg.mediaUrl || msg.mediaPath) {
    const isAutoAnalyzed = msg.metadata?.ocrExtracted ||
                           msg.metadata?.visionDescription ||
                           msg.metadata?.autoAnalyzed;
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

  const content: MessageContent = {
    type: contentType,
    text: typeof msg.content === 'string' ? msg.content : undefined,
    media,
    location: msg.location,
    contact: msg.contact,
    poll: msg.poll,
    reaction: msg.reaction,
  }

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

// Per-conversation pagination state
interface ConversationPagination {
  hasMore: boolean
  nextCursor: string | null
}

interface MessageStateV2 {
  // --- Core State ---
  conversations: Conversation[]
  currentConversationId: string | null  // Just the ID, not the full object
  // Single source of truth: Map<conversationId, Message[]>
  messagesMap: Map<string, Message[]>
  // Dedup tracking: Map<conversationId, Set<messageId>>
  messageIds: Map<string, Set<string>>
  // Per-conversation pagination
  paginationMap: Map<string, ConversationPagination>

  // --- Loading State ---
  isLoading: boolean          // Conversation list loading (initial fetch)
  isLoadingMessages: boolean  // Message loading for current conversation
  isLoadingMore: boolean
  isSending: boolean
  error: string | null
  // Lock: prevents stale fetch responses from overwriting during rapid switching
  _fetchingForConversation: string | null

  // --- Computed Getters ---
  /** Get current conversation object */
  getCurrentConversation: () => Conversation | null
  /** Get messages for current conversation */
  getMessages: () => Message[]
  /** Get pagination for current conversation */
  getPagination: () => ConversationPagination
  /** Get total unread count for a specific platform type */
  getUnreadCountByPlatform: (platform: string) => number
  /** Get unread count for a specific agent's conversations */
  getUnreadCountByAgent: (agentId: string) => number

  // --- Conversation Actions ---
  fetchConversations: (options?: { silent?: boolean }) => Promise<void>
  mergeConversations: () => Promise<number>
  createConversation: (title: string, agentId?: string) => Promise<Conversation>
  updateConversation: (id: string, updates: Partial<Pick<Conversation, 'isPinned' | 'isMuted' | 'isArchived' | 'title'>>) => Promise<Conversation>
  deleteConversation: (id: string) => Promise<void>
  updateConversationFromMessage: (conversationId: string, lastMessage: string, lastMessageAt: string, incrementUnread?: boolean) => void

  // --- Message Actions ---
  setCurrentConversation: (conversation: Conversation | null) => void
  fetchMessages: (conversationId: string) => Promise<void>
  loadOlderMessages: (conversationId: string) => Promise<number>
  sendMessage: (conversationId: string, content: string, agentId?: string) => Promise<Message>
  addMessage: (message: Message | any) => void
  updateMessageStatus: (messageId: string, status: 'pending' | 'sent' | 'delivered' | 'read') => void
  syncMessages: (conversationId: string) => Promise<{ success: boolean; messagesSynced: number; totalMessages: number; reason?: string }>
  clearConversationCache: (conversationId: string) => void
}

// Export transform function for use by WebSocket handlers
export { transformRawMessage }

// Helper: transform raw conversation from API
function transformConversation(conv: any): Conversation {
  return {
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
  }
}

// Helper: sort conversations (pinned first, then by lastMessageAt desc)
function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1
    if (!a.isPinned && b.isPinned) return 1
    const aTime = a.lastMessageAt || a.updatedAt || ''
    const bTime = b.lastMessageAt || b.updatedAt || ''
    return bTime.localeCompare(aTime)
  })
}

export const useMessageStoreV2 = create<MessageStateV2>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messagesMap: new Map(),
  messageIds: new Map(),
  paginationMap: new Map(),
  isLoading: false,
  isLoadingMessages: false,
  isLoadingMore: false,
  isSending: false,
  error: null,
  _fetchingForConversation: null,

  // ---------------------------------------------------------------------------
  // Computed Getters
  // ---------------------------------------------------------------------------

  getCurrentConversation: () => {
    const { currentConversationId, conversations } = get()
    if (!currentConversationId) return null
    return conversations.find(c => c.id === currentConversationId) || null
  },

  getMessages: () => {
    const { currentConversationId, messagesMap } = get()
    if (!currentConversationId) return []
    return messagesMap.get(currentConversationId) || []
  },

  getPagination: () => {
    const { currentConversationId, paginationMap } = get()
    if (!currentConversationId) return { hasMore: false, nextCursor: null }
    return paginationMap.get(currentConversationId) || { hasMore: false, nextCursor: null }
  },

  getUnreadCountByPlatform: (platform: string) => {
    const { conversations } = get()
    // Normalize telegram variants
    const match = (p: string | undefined) => {
      if (!p) return false
      if (platform === 'telegram') return p === 'telegram' || p === 'telegram-bot' || p === 'telegram-user'
      return p === platform
    }
    return conversations.reduce((sum, c) => match(c.platform) ? sum + (c.unreadCount || 0) : sum, 0)
  },

  getUnreadCountByAgent: (agentId: string) => {
    const { conversations } = get()
    return conversations.reduce((sum, c) => c.agentId === agentId ? sum + (c.unreadCount || 0) : sum, 0)
  },

  // ---------------------------------------------------------------------------
  // Conversation Actions
  // ---------------------------------------------------------------------------

  fetchConversations: async (options) => {
    const state = get()
    if (!options?.silent && state.conversations.length === 0) {
      set({ isLoading: true })
    }
    try {
      const response = await api.get('/conversations')
      const raw = Array.isArray(response.data) ? response.data : (response.data?.conversations || [])
      const conversations = sortConversations(raw.map(transformConversation))
      set({ conversations, isLoading: false })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch conversations'), isLoading: false })
    }
  },

  mergeConversations: async () => {
    try {
      const response = await api.get('/conversations')
      const raw = Array.isArray(response.data) ? response.data : (response.data?.conversations || [])
      const fetched = raw.map(transformConversation)

      const existing = get().conversations
      const existingIds = new Set(existing.map(c => c.id))
      const newOnes = fetched.filter((c: Conversation) => !existingIds.has(c.id))

      if (newOnes.length > 0 || fetched.length !== existing.length) {
        const mergedMap = new Map(existing.map(c => [c.id, c]))
        for (const conv of fetched) {
          mergedMap.set(conv.id, conv)
        }
        set({ conversations: sortConversations(Array.from(mergedMap.values())) })
      }

      return newOnes.length
    } catch (error: unknown) {
      console.error('Failed to merge conversations:', extractErrorMessage(error, 'Unknown error'))
      return 0
    }
  },

  createConversation: async (title, agentId) => {
    set({ isLoading: true })
    try {
      const response = await api.post('/conversations', { title, agentId })
      const newConv = transformConversation(response.data)
      set((state) => ({
        conversations: [newConv, ...state.conversations],
        currentConversationId: newConv.id,
        isLoading: false,
      }))
      return newConv
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to create conversation'), isLoading: false })
      throw error
    }
  },

  updateConversation: async (id, updates) => {
    try {
      const response = await api.patch(`/conversations/${id}`, updates)
      const updated = response.data?.conversation || response.data
      set((state) => ({
        conversations: state.conversations.map(c =>
          c.id === id ? { ...c, ...updated } : c
        ),
      }))
      return updated
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to update conversation') })
      throw error
    }
  },

  deleteConversation: async (id) => {
    try {
      await api.delete(`/conversations/${id}`)
      set((state) => {
        const newMap = new Map(state.messagesMap)
        const newIds = new Map(state.messageIds)
        const newPag = new Map(state.paginationMap)
        newMap.delete(id)
        newIds.delete(id)
        newPag.delete(id)
        return {
          conversations: state.conversations.filter(c => c.id !== id),
          currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
          messagesMap: newMap,
          messageIds: newIds,
          paginationMap: newPag,
        }
      })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to delete conversation') })
      throw error
    }
  },

  updateConversationFromMessage: (conversationId, lastMessage, lastMessageAt, incrementUnread = true) => {
    set((state) => {
      const isCurrentConv = state.currentConversationId === conversationId
      const updated = state.conversations.map(c => {
        if (c.id !== conversationId) return c
        return {
          ...c,
          lastMessage,
          lastMessageAt,
          messageCount: (c.messageCount || 0) + 1,
          unreadCount: incrementUnread && !isCurrentConv ? (c.unreadCount || 0) + 1 : c.unreadCount || 0,
          updatedAt: lastMessageAt,
        }
      })
      return { conversations: sortConversations(updated) }
    })
  },

  // ---------------------------------------------------------------------------
  // Message Actions
  // ---------------------------------------------------------------------------

  setCurrentConversation: (conversation) => {
    const currentId = get().currentConversationId
    const newId = conversation?.id || null

    // Same conversation - no-op
    if (currentId === newId) return

    console.log('[messageStoreV2] Switching conversation:', currentId, '->', newId)

    if (!newId) {
      set({ currentConversationId: null, isLoadingMessages: false })
      return
    }

    // Check if we already have messages cached in memory for this conversation
    const existingMessages = get().messagesMap.get(newId)

    if (existingMessages && existingMessages.length > 0) {
      // We have in-memory cache - use it immediately, no loading state
      set({ currentConversationId: newId, isLoadingMessages: false })
    } else {
      // No cache - set loading and fetch (only messages loading, not conversation list)
      set({ currentConversationId: newId, isLoadingMessages: true })
      get().fetchMessages(newId)
    }
  },

  fetchMessages: async (conversationId) => {
    // Set lock to track which conversation we're fetching for
    set({ _fetchingForConversation: conversationId })

    try {
      const response = await api.get(`/conversations/${conversationId}/messages`)
      const rawMessages = Array.isArray(response.data) ? response.data : (response.data?.messages || [])
      const pagination = response.data?.pagination || { hasMore: false, nextCursor: null }

      // CRITICAL: Check if user has switched away during fetch
      if (get()._fetchingForConversation !== conversationId) {
        console.log('[messageStoreV2] Discarding stale fetch response for', conversationId)
        // Still store in map for future use, but don't update loading state
        const messages = rawMessages.map(transformRawMessage)
        set((state) => {
          const newMap = new Map(state.messagesMap)
          const newIds = new Map(state.messageIds)
          const newPag = new Map(state.paginationMap)
          newMap.set(conversationId, messages)
          newIds.set(conversationId, new Set(messages.map((m: Message) => m.id)))
          newPag.set(conversationId, { hasMore: pagination.hasMore, nextCursor: pagination.nextCursor })
          return { messagesMap: newMap, messageIds: newIds, paginationMap: newPag }
        })
        return
      }

      const messages = rawMessages.map(transformRawMessage)

      set((state) => {
        const newMap = new Map(state.messagesMap)
        const newIds = new Map(state.messageIds)
        const newPag = new Map(state.paginationMap)
        newMap.set(conversationId, messages)
        newIds.set(conversationId, new Set(messages.map((m: Message) => m.id)))
        newPag.set(conversationId, { hasMore: pagination.hasMore, nextCursor: pagination.nextCursor })
        return {
          messagesMap: newMap,
          messageIds: newIds,
          paginationMap: newPag,
          isLoadingMessages: false,
          _fetchingForConversation: null,
        }
      })
    } catch (error: unknown) {
      // Only update error if still relevant
      if (get()._fetchingForConversation === conversationId) {
        set({
          error: extractErrorMessage(error, 'Failed to fetch messages'),
          isLoadingMessages: false,
          _fetchingForConversation: null,
        })
      }
    }
  },

  loadOlderMessages: async (conversationId) => {
    const pagination = get().paginationMap.get(conversationId)
    if (!pagination?.hasMore || !pagination.nextCursor || get().isLoadingMore) {
      return 0
    }

    set({ isLoadingMore: true })
    try {
      const response = await api.get(
        `/conversations/${conversationId}/messages?before=${encodeURIComponent(pagination.nextCursor)}`
      )
      const rawMessages = Array.isArray(response.data) ? response.data : (response.data?.messages || [])
      const newPagination = response.data?.pagination || { hasMore: false, nextCursor: null }

      const olderMessages = rawMessages.map(transformRawMessage)

      if (olderMessages.length > 0) {
        set((state) => {
          const newMap = new Map(state.messagesMap)
          const newIds = new Map(state.messageIds)
          const newPag = new Map(state.paginationMap)

          const existing = newMap.get(conversationId) || []
          const existingIdSet = newIds.get(conversationId) || new Set()

          // Deduplicate older messages
          const uniqueOlder = olderMessages.filter((m: Message) => !existingIdSet.has(m.id))
          uniqueOlder.forEach((m: Message) => existingIdSet.add(m.id))

          // Prepend older messages
          newMap.set(conversationId, [...uniqueOlder, ...existing])
          newIds.set(conversationId, existingIdSet)
          newPag.set(conversationId, { hasMore: newPagination.hasMore, nextCursor: newPagination.nextCursor })

          return {
            messagesMap: newMap,
            messageIds: newIds,
            paginationMap: newPag,
            isLoadingMore: false,
          }
        })
      } else {
        set((state) => {
          const newPag = new Map(state.paginationMap)
          newPag.set(conversationId, { hasMore: false, nextCursor: null })
          return { paginationMap: newPag, isLoadingMore: false }
        })
      }

      return olderMessages.length
    } catch (error: unknown) {
      console.error('Failed to load older messages:', extractErrorMessage(error, 'Unknown error'))
      set({ isLoadingMore: false })
      return 0
    }
  },

  sendMessage: async (conversationId, content, agentId) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const currentConv = get().conversations.find(c => c.id === conversationId)
    const pendingMessage: Message = {
      id: tempId,
      conversationId,
      role: 'user',
      content: { type: 'text', text: content },
      sender: { id: 'self', name: 'You' },
      createdAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      status: 'pending',
      platform: (currentConv?.platform || 'whatsapp') as Platform,
    }

    // Optimistic: add pending message
    set((state) => {
      const newMap = new Map(state.messagesMap)
      const newIds = new Map(state.messageIds)
      const existing = newMap.get(conversationId) || []
      const idSet = newIds.get(conversationId) || new Set()
      idSet.add(tempId)
      newMap.set(conversationId, [...existing, pendingMessage])
      newIds.set(conversationId, idSet)
      return { messagesMap: newMap, messageIds: newIds, isSending: true }
    })

    try {
      const response = await api.post(`/conversations/${conversationId}/messages`, {
        content,
        agentId,
      })
      // API returns { message: {...} } - unwrap the response
      const rawMsg = response.data?.message || response.data
      const newMessage = transformRawMessage(rawMsg)

      // Replace temp with real message
      set((state) => {
        const newMap = new Map(state.messagesMap)
        const newIds = new Map(state.messageIds)
        const msgs = newMap.get(conversationId) || []
        const idSet = newIds.get(conversationId) || new Set()

        idSet.delete(tempId)
        idSet.add(newMessage.id)

        newMap.set(
          conversationId,
          msgs.map(m => m.id === tempId ? { ...newMessage, status: 'sent' as const } : m)
        )
        newIds.set(conversationId, idSet)
        return { messagesMap: newMap, messageIds: newIds, isSending: false }
      })

      // Update conversation list sidebar (lastMessage, position bump)
      const msgContent = typeof content === 'string' ? content : String(content)
      get().updateConversationFromMessage(
        conversationId,
        msgContent,
        newMessage.createdAt || new Date().toISOString(),
        false // don't increment unread for own messages
      )

      return newMessage
    } catch (error: unknown) {
      // Mark as failed
      set((state) => {
        const newMap = new Map(state.messagesMap)
        const msgs = newMap.get(conversationId) || []
        newMap.set(
          conversationId,
          msgs.map(m => m.id === tempId ? { ...m, status: 'failed' as const } : m)
        )
        return {
          messagesMap: newMap,
          error: extractErrorMessage(error, 'Failed to send message'),
          isSending: false,
        }
      })
      throw error
    }
  },

  addMessage: (message) => {
    const transformed = transformRawMessage(message)
    const convId = transformed.conversationId

    if (!convId) return

    set((state) => {
      const newMap = new Map(state.messagesMap)
      const newIds = new Map(state.messageIds)

      const existing = newMap.get(convId) || []
      const idSet = newIds.get(convId) || new Set()

      // Dedup check - O(1) with Set
      if (idSet.has(transformed.id)) {
        return state // Already exists, no change
      }

      idSet.add(transformed.id)
      newMap.set(convId, [...existing, transformed])
      newIds.set(convId, idSet)

      return { messagesMap: newMap, messageIds: newIds }
    })
  },

  updateMessageStatus: (messageId, status) => {
    set((state) => {
      const convId = state.currentConversationId
      if (!convId) return state

      const newMap = new Map(state.messagesMap)
      const msgs = newMap.get(convId)
      if (!msgs) return state

      newMap.set(convId, msgs.map(m => m.id === messageId ? { ...m, status } : m))
      return { messagesMap: newMap }
    })
  },

  syncMessages: async (conversationId) => {
    try {
      const response = await api.post(`/conversations/${conversationId}/sync-messages`)
      const data = response.data || response
      return {
        success: data.success ?? true,
        messagesSynced: data.messagesSynced || 0,
        totalMessages: data.totalMessages || 0,
        reason: data.reason,
      }
    } catch (error: unknown) {
      console.error('Failed to sync messages:', extractErrorMessage(error, 'Unknown error'))
      return { success: false, messagesSynced: 0, totalMessages: 0, reason: 'Request failed' }
    }
  },

  clearConversationCache: (conversationId) => {
    set((state) => {
      const newMap = new Map(state.messagesMap)
      const newIds = new Map(state.messageIds)
      const newPag = new Map(state.paginationMap)
      newMap.delete(conversationId)
      newIds.delete(conversationId)
      newPag.delete(conversationId)
      return { messagesMap: newMap, messageIds: newIds, paginationMap: newPag }
    })
  },
}))
