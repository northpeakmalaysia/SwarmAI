import { create } from 'zustand'
import api from '../services/api'
import { extractErrorMessage } from '../lib/utils'

// ==========================================
// Types
// ==========================================

export type ActionType =
  | 'message_received'
  | 'message_sent'
  | 'ai_completion'
  | 'tool_call'
  | 'handoff_initiated'
  | 'handoff_received'
  | 'rag_query'
  | 'flow_triggered'
  | 'consensus_vote'
  | 'error'
  | 'warning'
  | 'debug'

export interface AgentActivityLog {
  id: string
  agentId: string
  conversationId: string | null
  messageId: string | null
  actionType: ActionType
  actionDetails: Record<string, any>
  inputData: any | null
  outputData: any | null
  durationMs: number | null
  tokensUsed: number | null
  costUsd: number | null
  errorMessage: string | null
  parentLogId: string | null
  createdAt: string
}

export interface LogQueryOptions {
  agentId?: string
  conversationId?: string
  messageId?: string
  actionTypes?: ActionType[]
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
  hasError?: boolean
}

export interface AgentStats {
  totalLogs: number
  totalTokens: number
  totalCost: number
  averageDuration: number
  byActionType: Record<string, number>
}

export interface AgentLogSummary {
  totalAgents: number
  totalLogs: number
  totalTokens: number
  totalCost: number
  agentStats: Array<{
    agentId: string
    agentName: string
    totalLogs: number
    totalTokens: number
    totalCost: number
    averageDuration: number
    byActionType: Record<string, number>
  }>
}

// ==========================================
// Store Interface
// ==========================================

interface AgentLogState {
  logs: AgentActivityLog[]
  selectedLog: AgentActivityLog | null
  childLogs: AgentActivityLog[]
  conversationLogs: AgentActivityLog[]
  agentStats: AgentStats | null
  summary: AgentLogSummary | null
  filters: LogQueryOptions
  isLoading: boolean
  error: string | null

  // Query
  fetchLogs: (options?: LogQueryOptions) => Promise<void>
  fetchLogById: (id: string) => Promise<AgentActivityLog | null>
  fetchChildLogs: (parentId: string) => Promise<void>
  fetchConversationLogs: (conversationId: string, options?: LogQueryOptions) => Promise<void>

  // Stats
  fetchAgentStats: (agentId: string, period?: 'hour' | 'day' | 'week' | 'month') => Promise<void>
  fetchAgentErrors: (agentId: string, limit?: number) => Promise<AgentActivityLog[]>
  fetchAgentBreakdown: (agentId: string, period?: 'hour' | 'day' | 'week' | 'month') => Promise<any>
  fetchSummary: (period?: 'hour' | 'day' | 'week' | 'month') => Promise<void>

  // Selection
  selectLog: (log: AgentActivityLog | null) => Promise<void>

  // Filters
  setFilters: (filters: LogQueryOptions) => void
  clearFilters: () => void
}

// ==========================================
// Store Implementation
// ==========================================

export const useAgentLogStore = create<AgentLogState>((set, get) => ({
  logs: [],
  selectedLog: null,
  childLogs: [],
  conversationLogs: [],
  agentStats: null,
  summary: null,
  filters: {},
  isLoading: false,
  error: null,

  // ==========================================
  // Query
  // ==========================================

  fetchLogs: async (options = {}) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      const mergedOptions = { ...get().filters, ...options }

      if (mergedOptions.agentId) params.append('agentId', mergedOptions.agentId)
      if (mergedOptions.conversationId) params.append('conversationId', mergedOptions.conversationId)
      if (mergedOptions.messageId) params.append('messageId', mergedOptions.messageId)
      if (mergedOptions.actionTypes?.length) {
        params.append('actionTypes', mergedOptions.actionTypes.join(','))
      }
      if (mergedOptions.startDate) params.append('startDate', mergedOptions.startDate)
      if (mergedOptions.endDate) params.append('endDate', mergedOptions.endDate)
      if (mergedOptions.limit) params.append('limit', String(mergedOptions.limit))
      if (mergedOptions.offset) params.append('offset', String(mergedOptions.offset))
      if (mergedOptions.hasError !== undefined) params.append('hasError', String(mergedOptions.hasError))

      const response = await api.get(`/agent-logs?${params.toString()}`)
      const logs = Array.isArray(response.data) ? response.data : (response.data?.logs || [])
      set({ logs, isLoading: false })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch logs'), isLoading: false })
    }
  },

  fetchLogById: async (id: string) => {
    try {
      const response = await api.get(`/agent-logs/${id}`)
      return response.data
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch log') })
      return null
    }
  },

  fetchChildLogs: async (parentId: string) => {
    try {
      const response = await api.get(`/agent-logs/${parentId}/children`)
      const childLogs = Array.isArray(response.data) ? response.data : (response.data?.children || [])
      set({ childLogs })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch child logs') })
    }
  },

  fetchConversationLogs: async (conversationId: string, options = {}) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (options.actionTypes?.length) {
        params.append('actionTypes', options.actionTypes.join(','))
      }
      if (options.limit) params.append('limit', String(options.limit))
      if (options.offset) params.append('offset', String(options.offset))

      const response = await api.get(`/agent-logs/conversation/${conversationId}?${params.toString()}`)
      const conversationLogs = Array.isArray(response.data) ? response.data : (response.data?.logs || [])
      set({ conversationLogs, isLoading: false })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch conversation logs'), isLoading: false })
    }
  },

  // ==========================================
  // Stats
  // ==========================================

  fetchAgentStats: async (agentId: string, period = 'day') => {
    try {
      const response = await api.get(`/agent-logs/agent/${agentId}/stats?period=${period}`)
      set({ agentStats: response.data })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch agent stats') })
    }
  },

  fetchAgentErrors: async (agentId: string, limit = 50) => {
    try {
      const response = await api.get(`/agent-logs/agent/${agentId}/errors?limit=${limit}`)
      return response.data
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch agent errors') })
      return []
    }
  },

  fetchAgentBreakdown: async (agentId: string, period = 'day') => {
    try {
      const response = await api.get(`/agent-logs/agent/${agentId}/breakdown?period=${period}`)
      return response.data
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch agent breakdown') })
      return null
    }
  },

  fetchSummary: async (period = 'day') => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get(`/agent-logs/summary?period=${period}`)
      set({ summary: response.data, isLoading: false })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch summary'), isLoading: false })
    }
  },

  // ==========================================
  // Selection
  // ==========================================

  selectLog: async (log: AgentActivityLog | null) => {
    set({ selectedLog: log, childLogs: [] })
    if (log) {
      await get().fetchChildLogs(log.id)
    }
  },

  // ==========================================
  // Filters
  // ==========================================

  setFilters: (filters: LogQueryOptions) => {
    set({ filters })
  },

  clearFilters: () => {
    set({ filters: {} })
  },
}))
