import { create } from 'zustand'
import api from '../services/api'
import { extractErrorMessage } from '../lib/utils'

// ==========================================
// Types
// ==========================================

export type AuthenticationType = 'none' | 'bearer' | 'api_key' | 'hmac'

export interface HttpWebhook {
  id: string
  userId: string
  agentId: string
  name: string
  description: string | null
  endpointPath: string
  secretToken: string
  isActive: boolean
  authenticationType: AuthenticationType
  allowedIps: string[]
  rateLimitPerMinute: number
  autoRespond: boolean
  triggerFlowId: string | null
  metadata: Record<string, any>
  lastCalledAt: string | null
  callCount: number
  createdAt: string
}

export interface WebhookLog {
  id: string
  webhookId: string
  requestMethod: string
  requestHeaders: Record<string, string>
  requestBody: any
  responseStatus: number
  responseBody: any
  ipAddress: string | null
  durationMs: number | null
  errorMessage: string | null
  messageId: string | null
  createdAt: string
}

export interface WebhookCreateInput {
  agentId: string
  name: string
  description?: string
  authenticationType?: AuthenticationType
  allowedIps?: string[]
  rateLimitPerMinute?: number
  autoRespond?: boolean
  triggerFlowId?: string
  metadata?: Record<string, any>
}

export interface WebhookUpdateInput {
  name?: string
  description?: string | null
  isActive?: boolean
  authenticationType?: AuthenticationType
  allowedIps?: string[]
  rateLimitPerMinute?: number
  autoRespond?: boolean
  triggerFlowId?: string | null
  metadata?: Record<string, any>
}

// ==========================================
// Store Interface
// ==========================================

interface WebhookState {
  webhooks: HttpWebhook[]
  selectedWebhook: HttpWebhook | null
  webhookLogs: WebhookLog[]
  isLoading: boolean
  error: string | null

  // CRUD
  fetchWebhooks: () => Promise<void>
  fetchWebhookById: (id: string) => Promise<HttpWebhook | null>
  createWebhook: (input: WebhookCreateInput) => Promise<{ webhook: HttpWebhook; token: string }>
  updateWebhook: (id: string, input: WebhookUpdateInput) => Promise<HttpWebhook>
  deleteWebhook: (id: string) => Promise<void>

  // Selection
  selectWebhook: (webhook: HttpWebhook | null) => Promise<void>

  // Token
  regenerateToken: (id: string) => Promise<{ webhook: HttpWebhook; token: string }>

  // Logs
  fetchLogs: (webhookId: string, limit?: number, offset?: number) => Promise<void>

  // Helpers
  getWebhookUrl: (webhook: HttpWebhook) => string
}

// ==========================================
// Store Implementation
// ==========================================

export const useWebhookStore = create<WebhookState>((set, get) => ({
  webhooks: [],
  selectedWebhook: null,
  webhookLogs: [],
  isLoading: false,
  error: null,

  // ==========================================
  // CRUD Operations
  // ==========================================

  fetchWebhooks: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get('/webhook/http-webhooks')
      const webhooks = Array.isArray(response.data) ? response.data : (response.data?.webhooks || [])
      set({ webhooks, isLoading: false })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch webhooks'), isLoading: false })
    }
  },

  fetchWebhookById: async (id: string) => {
    try {
      const response = await api.get(`/webhook/http-webhooks/${id}`)
      return response.data
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch webhook') })
      return null
    }
  },

  createWebhook: async (input: WebhookCreateInput) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/webhook/http-webhooks', input)
      const result = response.data
      set((state) => ({
        webhooks: [...state.webhooks, result.webhook || result],
        isLoading: false,
      }))
      return result
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to create webhook'), isLoading: false })
      throw error
    }
  },

  updateWebhook: async (id: string, input: WebhookUpdateInput) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.put(`/webhook/http-webhooks/${id}`, input)
      const updatedWebhook = response.data
      set((state) => ({
        webhooks: state.webhooks.map((w) => (w.id === id ? updatedWebhook : w)),
        selectedWebhook: state.selectedWebhook?.id === id ? updatedWebhook : state.selectedWebhook,
        isLoading: false,
      }))
      return updatedWebhook
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to update webhook'), isLoading: false })
      throw error
    }
  },

  deleteWebhook: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      await api.delete(`/webhook/http-webhooks/${id}`)
      set((state) => ({
        webhooks: state.webhooks.filter((w) => w.id !== id),
        selectedWebhook: state.selectedWebhook?.id === id ? null : state.selectedWebhook,
        isLoading: false,
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to delete webhook'), isLoading: false })
      throw error
    }
  },

  // ==========================================
  // Selection
  // ==========================================

  selectWebhook: async (webhook: HttpWebhook | null) => {
    set({ selectedWebhook: webhook, webhookLogs: [] })
    if (webhook) {
      await get().fetchLogs(webhook.id)
    }
  },

  // ==========================================
  // Token
  // ==========================================

  regenerateToken: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post(`/webhook/http-webhooks/${id}/regenerate-token`)
      const result = response.data
      set((state) => ({
        webhooks: state.webhooks.map((w) => (w.id === id ? result.webhook : w)),
        selectedWebhook: state.selectedWebhook?.id === id ? result.webhook : state.selectedWebhook,
        isLoading: false,
      }))
      return result
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to regenerate token'), isLoading: false })
      throw error
    }
  },

  // ==========================================
  // Logs
  // ==========================================

  fetchLogs: async (webhookId: string, limit = 100, offset = 0) => {
    try {
      const response = await api.get(`/webhook/http-webhooks/${webhookId}/logs?limit=${limit}&offset=${offset}`)
      set({ webhookLogs: response.data })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch webhook logs') })
    }
  },

  // ==========================================
  // Helpers
  // ==========================================

  getWebhookUrl: (webhook: HttpWebhook) => {
    // Get the base URL from the API config
    const baseUrl = api.defaults.baseURL?.replace('/api', '') || window.location.origin
    return `${baseUrl}/api/webhook/hook/${webhook.endpointPath}`
  },
}))
