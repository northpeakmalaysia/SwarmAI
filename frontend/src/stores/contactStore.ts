import { create } from 'zustand'
import api from '../services/api'
import { extractErrorMessage } from '../lib/utils'

// ==========================================
// Types
// ==========================================

export type PlatformType = 'whatsapp' | 'whatsapp-business' | 'telegram-bot' | 'telegram-user' | 'email' | 'http-api'
export type IdentifierType = 'phone' | 'email' | 'telegram_user_id' | 'telegram_username' | 'external_id'

export interface TeamMembership {
  agenticId: string
  agenticName: string
  role: string
  department: string | null
  skills: string[]
  gender: string | null
  isAvailable: boolean
}

export interface Contact {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  primaryPhone: string | null
  primaryEmail: string | null
  primaryTelegramUsername: string | null
  company: string | null
  notes: string | null
  gender: string | null
  isBlocked: boolean
  isFavorite: boolean
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
  lastContactAt: string | null
  teamMemberships?: TeamMembership[]
}

export interface ContactIdentifier {
  id: string
  contactId: string
  platform: PlatformType
  identifierType: IdentifierType
  identifierValue: string
  identifierNormalized: string
  isPrimary: boolean
  isVerified: boolean
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface ContactTag {
  name: string
  color: string | null
}

export interface ContactStats {
  total: number
  blocked: number
  favorites: number
  withPhone: number
  withEmail: number
  withTelegram: number
}

export interface DuplicateGroup {
  contacts: Contact[]
  matchReasons: string[]
  confidence: number
}

export interface MergePreview {
  primaryContact: Contact
  secondaryContact: Contact
  mergedFields: Record<string, any>
  identifiersToTransfer: number
  conversationsToTransfer: number
  tagsToMerge: string[]
}

export interface MergeResult {
  mergedContact: Contact
  deletedContactId: string
  identifiersTransferred: number
  conversationsTransferred: number
  tagsMerged: number
}

export interface ContactSearchOptions {
  query?: string
  tags?: string[]
  platform?: PlatformType
  isBlocked?: boolean
  isFavorite?: boolean
  hasPhone?: boolean
  hasEmail?: boolean
  limit?: number
  offset?: number
  sortBy?: 'display_name' | 'last_contact_at' | 'created_at'
  sortOrder?: 'asc' | 'desc'
}

export interface ContactCreateInput {
  displayName: string
  avatarUrl?: string
  primaryPhone?: string
  primaryEmail?: string
  primaryTelegramUsername?: string
  company?: string
  notes?: string
  gender?: string | null
  metadata?: Record<string, any>
}

export interface ContactUpdateInput {
  displayName?: string
  avatarUrl?: string | null
  primaryPhone?: string | null
  primaryEmail?: string | null
  primaryTelegramUsername?: string | null
  company?: string | null
  notes?: string | null
  gender?: string | null
  isBlocked?: boolean
  isFavorite?: boolean
  metadata?: Record<string, any>
}

export interface IdentifierInput {
  platform: PlatformType
  identifierType: IdentifierType
  identifierValue: string
  isPrimary?: boolean
  metadata?: Record<string, any>
}

// ==========================================
// Store Interface
// ==========================================

interface ContactState {
  contacts: Contact[]
  selectedContact: Contact | null
  selectedContactIdentifiers: ContactIdentifier[]
  selectedContactTags: ContactTag[]
  selectedContactConversations: any[]
  stats: ContactStats | null
  allTags: string[]
  duplicates: DuplicateGroup[]
  isLoading: boolean
  error: string | null

  // CRUD
  fetchContacts: (options?: ContactSearchOptions) => Promise<void>
  fetchContactById: (id: string) => Promise<Contact | null>
  createContact: (input: ContactCreateInput) => Promise<Contact>
  updateContact: (id: string, input: ContactUpdateInput) => Promise<Contact>
  deleteContact: (id: string) => Promise<void>

  // Selection
  selectContact: (contact: Contact | null) => Promise<void>
  clearSelection: () => void

  // Stats & Tags
  fetchStats: () => Promise<void>
  fetchAllTags: () => Promise<void>

  // Identifiers
  fetchIdentifiers: (contactId: string) => Promise<void>
  addIdentifier: (contactId: string, input: IdentifierInput) => Promise<ContactIdentifier>
  removeIdentifier: (contactId: string, identifierId: string) => Promise<void>
  setPrimaryIdentifier: (contactId: string, identifierId: string) => Promise<void>

  // Tags
  fetchTags: (contactId: string) => Promise<void>
  addTag: (contactId: string, tagName: string, color?: string) => Promise<void>
  removeTag: (contactId: string, tagName: string) => Promise<void>

  // Conversations
  fetchConversations: (contactId: string) => Promise<void>

  // Actions
  blockContact: (id: string) => Promise<void>
  unblockContact: (id: string) => Promise<void>
  favoriteContact: (id: string) => Promise<void>
  unfavoriteContact: (id: string) => Promise<void>

  // Duplicates & Merging
  findDuplicates: () => Promise<void>
  previewMerge: (primaryId: string, secondaryId: string) => Promise<MergePreview>
  mergeContacts: (primaryId: string, secondaryId: string) => Promise<MergeResult>

  // Lookup
  lookupContact: (platform: PlatformType, value: string) => Promise<Contact | null>
}

// ==========================================
// Store Implementation
// ==========================================

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  selectedContact: null,
  selectedContactIdentifiers: [],
  selectedContactTags: [],
  selectedContactConversations: [],
  stats: null,
  allTags: [],
  duplicates: [],
  isLoading: false,
  error: null,

  // ==========================================
  // CRUD Operations
  // ==========================================

  fetchContacts: async (options = {}) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (options.query) params.append('query', options.query)
      if (options.tags) options.tags.forEach(t => params.append('tags', t))
      if (options.platform) params.append('platform', options.platform)
      if (options.isBlocked !== undefined) params.append('isBlocked', String(options.isBlocked))
      if (options.isFavorite !== undefined) params.append('isFavorite', String(options.isFavorite))
      if (options.hasPhone !== undefined) params.append('hasPhone', String(options.hasPhone))
      if (options.hasEmail !== undefined) params.append('hasEmail', String(options.hasEmail))
      if (options.limit) params.append('limit', String(options.limit))
      if (options.offset) params.append('offset', String(options.offset))
      if (options.sortBy) params.append('sortBy', options.sortBy)
      if (options.sortOrder) params.append('sortOrder', options.sortOrder)

      const response = await api.get(`/contacts?${params.toString()}`)
      const contacts = Array.isArray(response.data) ? response.data : (response.data?.contacts || [])
      set({ contacts, isLoading: false })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch contacts'), isLoading: false })
    }
  },

  fetchContactById: async (id: string) => {
    try {
      const response = await api.get(`/contacts/${id}`)
      return response.data
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch contact') })
      return null
    }
  },

  createContact: async (input: ContactCreateInput) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/contacts', input)
      const newContact = response.data
      set((state) => ({
        contacts: [...state.contacts, newContact],
        isLoading: false,
      }))
      return newContact
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to create contact'), isLoading: false })
      throw error
    }
  },

  updateContact: async (id: string, input: ContactUpdateInput) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.put(`/contacts/${id}`, input)
      const updatedContact = response.data
      set((state) => ({
        contacts: state.contacts.map((c) => (c.id === id ? updatedContact : c)),
        selectedContact: state.selectedContact?.id === id ? updatedContact : state.selectedContact,
        isLoading: false,
      }))
      return updatedContact
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to update contact'), isLoading: false })
      throw error
    }
  },

  deleteContact: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      await api.delete(`/contacts/${id}`)
      set((state) => ({
        contacts: state.contacts.filter((c) => c.id !== id),
        selectedContact: state.selectedContact?.id === id ? null : state.selectedContact,
        isLoading: false,
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to delete contact'), isLoading: false })
      throw error
    }
  },

  // ==========================================
  // Selection
  // ==========================================

  selectContact: async (contact: Contact | null) => {
    set({ selectedContact: contact })
    if (contact) {
      // Fetch related data
      await Promise.all([
        get().fetchIdentifiers(contact.id),
        get().fetchTags(contact.id),
        get().fetchConversations(contact.id),
      ])
    } else {
      set({
        selectedContactIdentifiers: [],
        selectedContactTags: [],
        selectedContactConversations: [],
      })
    }
  },

  clearSelection: () => {
    set({
      selectedContact: null,
      selectedContactIdentifiers: [],
      selectedContactTags: [],
      selectedContactConversations: [],
    })
  },

  // ==========================================
  // Stats & Tags
  // ==========================================

  fetchStats: async () => {
    try {
      const response = await api.get('/contacts/stats')
      set({ stats: response.data })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch contact stats') })
    }
  },

  fetchAllTags: async () => {
    try {
      const response = await api.get('/contacts/tags')
      set({ allTags: response.data })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch tags') })
    }
  },

  // ==========================================
  // Identifiers
  // ==========================================

  fetchIdentifiers: async (contactId: string) => {
    try {
      const response = await api.get(`/contacts/${contactId}/identifiers`)
      set({ selectedContactIdentifiers: response.data.identifiers || [] })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch identifiers') })
    }
  },

  addIdentifier: async (contactId: string, input: IdentifierInput) => {
    try {
      const response = await api.post(`/contacts/${contactId}/identifiers`, input)
      const newIdentifier = response.data
      set((state) => ({
        selectedContactIdentifiers: [...state.selectedContactIdentifiers, newIdentifier],
      }))
      return newIdentifier
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to add identifier') })
      throw error
    }
  },

  removeIdentifier: async (contactId: string, identifierId: string) => {
    try {
      await api.delete(`/contacts/${contactId}/identifiers/${identifierId}`)
      set((state) => ({
        selectedContactIdentifiers: state.selectedContactIdentifiers.filter((i) => i.id !== identifierId),
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to remove identifier') })
      throw error
    }
  },

  setPrimaryIdentifier: async (contactId: string, identifierId: string) => {
    try {
      await api.post(`/contacts/${contactId}/identifiers/${identifierId}/primary`)
      // Refetch identifiers to get updated state
      await get().fetchIdentifiers(contactId)
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to set primary identifier') })
      throw error
    }
  },

  // ==========================================
  // Tags
  // ==========================================

  fetchTags: async (contactId: string) => {
    try {
      const response = await api.get(`/contacts/${contactId}/tags`)
      set({ selectedContactTags: response.data })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch contact tags') })
    }
  },

  addTag: async (contactId: string, tagName: string, color?: string) => {
    try {
      await api.post(`/contacts/${contactId}/tags`, { tagName, color })
      set((state) => ({
        selectedContactTags: [...state.selectedContactTags, { name: tagName, color: color || null }],
      }))
      // Update allTags if this is a new tag
      set((state) => ({
        allTags: state.allTags.includes(tagName) ? state.allTags : [...state.allTags, tagName],
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to add tag') })
      throw error
    }
  },

  removeTag: async (contactId: string, tagName: string) => {
    try {
      await api.delete(`/contacts/${contactId}/tags/${encodeURIComponent(tagName)}`)
      set((state) => ({
        selectedContactTags: state.selectedContactTags.filter((t) => t.name !== tagName),
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to remove tag') })
      throw error
    }
  },

  // ==========================================
  // Conversations
  // ==========================================

  fetchConversations: async (contactId: string) => {
    try {
      const response = await api.get(`/contacts/${contactId}/conversations`)
      set({ selectedContactConversations: response.data })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch conversations') })
    }
  },

  // ==========================================
  // Actions
  // ==========================================

  blockContact: async (id: string) => {
    try {
      await api.post(`/contacts/${id}/block`)
      set((state) => ({
        contacts: state.contacts.map((c) => (c.id === id ? { ...c, isBlocked: true } : c)),
        selectedContact: state.selectedContact?.id === id ? { ...state.selectedContact, isBlocked: true } : state.selectedContact,
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to block contact') })
      throw error
    }
  },

  unblockContact: async (id: string) => {
    try {
      await api.post(`/contacts/${id}/unblock`)
      set((state) => ({
        contacts: state.contacts.map((c) => (c.id === id ? { ...c, isBlocked: false } : c)),
        selectedContact: state.selectedContact?.id === id ? { ...state.selectedContact, isBlocked: false } : state.selectedContact,
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to unblock contact') })
      throw error
    }
  },

  favoriteContact: async (id: string) => {
    try {
      await api.post(`/contacts/${id}/favorite`)
      set((state) => ({
        contacts: state.contacts.map((c) => (c.id === id ? { ...c, isFavorite: true } : c)),
        selectedContact: state.selectedContact?.id === id ? { ...state.selectedContact, isFavorite: true } : state.selectedContact,
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to favorite contact') })
      throw error
    }
  },

  unfavoriteContact: async (id: string) => {
    try {
      await api.post(`/contacts/${id}/unfavorite`)
      set((state) => ({
        contacts: state.contacts.map((c) => (c.id === id ? { ...c, isFavorite: false } : c)),
        selectedContact: state.selectedContact?.id === id ? { ...state.selectedContact, isFavorite: false } : state.selectedContact,
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to unfavorite contact') })
      throw error
    }
  },

  // ==========================================
  // Duplicates & Merging
  // ==========================================

  findDuplicates: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get('/contacts/duplicates')
      set({ duplicates: response.data, isLoading: false })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to find duplicates'), isLoading: false })
    }
  },

  previewMerge: async (primaryId: string, secondaryId: string) => {
    try {
      const response = await api.post('/contacts/merge/preview', {
        primaryContactId: primaryId,
        secondaryContactId: secondaryId,
      })
      return response.data
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to preview merge') })
      throw error
    }
  },

  mergeContacts: async (primaryId: string, secondaryId: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/contacts/merge', {
        primaryContactId: primaryId,
        secondaryContactId: secondaryId,
      })
      const result = response.data
      // Update contacts list
      set((state) => ({
        contacts: state.contacts
          .filter((c) => c.id !== result.deletedContactId)
          .map((c) => (c.id === primaryId ? result.mergedContact : c)),
        selectedContact: state.selectedContact?.id === primaryId ? result.mergedContact : state.selectedContact,
        isLoading: false,
      }))
      return result
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to merge contacts'), isLoading: false })
      throw error
    }
  },

  // ==========================================
  // Lookup
  // ==========================================

  lookupContact: async (platform: PlatformType, value: string) => {
    try {
      const response = await api.get(`/contacts/lookup?platform=${platform}&value=${encodeURIComponent(value)}`)
      return response.data
    } catch (error: unknown) {
      const apiError = error as { response?: { status?: number } }
      if (apiError.response?.status === 404) {
        return null
      }
      set({ error: extractErrorMessage(error, 'Failed to lookup contact') })
      throw error
    }
  },
}))
