import { create } from 'zustand'
import api from '../services/api'
import { extractErrorMessage } from '../lib/utils'

// Dashboard Agent with real metrics
export interface DashboardAgent {
  id: string
  name: string
  model: string
  status: 'idle' | 'busy' | 'offline'
  systemPrompt: string
  skills: string[]
  messageCount: number
  conversationCount: number
  reputationScore: number
  // Platform info for sync functionality
  platformAccountId: string | null
  platformType: 'whatsapp' | 'telegram' | 'email' | null
  platformStatus: 'connected' | 'disconnected' | 'error' | 'qr_pending' | null
}

// Dashboard statistics
export interface DashboardStats {
  totalAgents: number
  activeAgents: number
  messagesToday: number
  activeTasks: number
  aiCostToday: number
  aiTokensToday: number
}

// Swarm health metrics
export interface SwarmHealth {
  connectivity: number
  averageLoad: number
  collaborationRate: number
  consensusSuccess: number
}

// Recent handoff for dashboard
export interface DashboardHandoff {
  id: string
  fromAgent: {
    id: string
    name: string
  }
  toAgent: {
    id: string
    name: string
  }
  reason: string
  status: string
  timestamp: string
}

// AI Usage statistics
export interface AIUsage {
  totalTokens: number
  totalCost: number
  byProvider: Record<string, { tokens: number; cost: number }>
  byModel: Record<string, { tokens: number; cost: number }>
  byDay: Array<{ date: string; tokens: number; cost: number }>
  period: 'day' | 'week' | 'month'
}

// Schedule for dashboard display
export interface DashboardSchedule {
  id: string
  flowId: string
  flowName: string
  cronExpression: string
  cronDescription: string
  timezone: string
  enabled: boolean
  nextRunAt: string
  nextRunDescription: string
  countdownSeconds: number
  countdownFormatted: string
  lastRunAt?: string
  lastRunDescription?: string | null
  scheduleName?: string
  description?: string
  upcomingExecutions: string[]
  createdAt: string
  updatedAt: string
}

// Schedule summary for dashboard
export interface ScheduleSummary {
  totalSchedules: number
  enabledSchedules: number
  disabledSchedules: number
  nextExecution: {
    scheduleId: string
    flowId: string
    flowName: string
    scheduleName?: string
    nextRunAt: string
    nextRunDescription: string
    countdownSeconds: number
    countdownFormatted: string
  } | null
}

interface DashboardState {
  agents: DashboardAgent[]
  stats: DashboardStats | null
  swarmHealth: SwarmHealth | null
  recentHandoffs: DashboardHandoff[]
  aiUsage: AIUsage | null
  schedules: DashboardSchedule[]
  scheduleSummary: ScheduleSummary | null
  isLoading: boolean
  error: string | null
  lastUpdated: Date | null

  // Actions
  fetchDashboardStats: () => Promise<void>
  fetchAIUsage: (period?: 'day' | 'week' | 'month') => Promise<void>
  fetchSchedules: () => Promise<void>
  refresh: () => Promise<void>
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  agents: [],
  stats: null,
  swarmHealth: null,
  recentHandoffs: [],
  aiUsage: null,
  schedules: [],
  scheduleSummary: null,
  isLoading: false,
  error: null,
  lastUpdated: null,

  fetchDashboardStats: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get('/dashboard/stats')
      const data = response.data

      set({
        agents: Array.isArray(data.agents) ? data.agents : [],
        stats: data.stats,
        swarmHealth: data.swarmHealth,
        recentHandoffs: Array.isArray(data.recentHandoffs) ? data.recentHandoffs : [],
        isLoading: false,
        lastUpdated: new Date(),
      })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch dashboard stats'), isLoading: false })
    }
  },

  fetchAIUsage: async (period = 'week') => {
    try {
      const response = await api.get(`/dashboard/ai-usage?period=${period}`)
      set({ aiUsage: response.data })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch AI usage') })
    }
  },

  fetchSchedules: async () => {
    try {
      const response = await api.get('/dashboard/schedules')
      const data = response.data
      set({
        schedules: data.schedules,
        scheduleSummary: {
          totalSchedules: data.summary?.totalSchedules || 0,
          enabledSchedules: data.summary?.enabledSchedules || 0,
          disabledSchedules: data.summary?.disabledSchedules || 0,
          nextExecution: data.summary?.nextExecution || null,
        },
      })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch schedules') })
    }
  },

  refresh: async () => {
    const { fetchDashboardStats, fetchAIUsage, fetchSchedules } = get()
    await Promise.all([
      fetchDashboardStats(),
      fetchAIUsage(),
      fetchSchedules(),
    ])
  },
}))
