import { create } from 'zustand'
import api from '../services/api'
import { extractErrorMessage } from '../lib/utils'

export interface SwarmTask {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  assignedAgents: string[]
  createdAt: string
  completedAt?: string
}

export interface SwarmStatus {
  activeAgents: number
  totalAgents: number
  pendingTasks: number
  activeTasks: number
  completedTasks: number
  collaborations: number
}

export interface SwarmHandoff {
  id: string
  conversationId: string
  fromAgent: { id: string; name: string }
  toAgent: { id: string; name: string }
  reason: string
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'timeout'
  createdAt: string
  acceptedAt?: string
  completedAt?: string
}

export interface LeaderboardEntry {
  rank: number
  agentId: string
  agentName: string
  overallScore: number
  taskCompletionRate: number
  averageResponseTime: number
  userSatisfactionScore: number
  handoffSuccessRate: number
  collaborationScore: number
  totalTasksCompleted: number
}

export type ConsensusStatus = 'voting' | 'passed' | 'failed' | 'expired'

export interface ConsensusOption {
  id: string
  label: string
  votes: number
  percentage: number
}

export interface ConsensusRequest {
  id: string
  title: string
  description?: string
  options: ConsensusOption[]
  totalVoters: number
  votedCount: number
  status: ConsensusStatus
  createdAt: string
  expiresAt: string
  result?: string
}

export interface ExtendedSwarmStats {
  basic: {
    totalAgents: number
    activeAgents: number
    inactiveAgents: number
    pendingTasks: number
    activeTasks: number
    completedTasks: number
    pendingHandoffs: number
  }
  handoffs: {
    pendingCount: number
    acceptedCount: number
    completedToday: number
    averageAcceptTimeMs: number | null
  }
  collaborations: {
    activeSessionsCount: number
    pendingTasksCount: number
    inProgressTasksCount: number
    completedTasksCount: number
  }
  consensus: {
    openSessionsCount: number
    decidedSessionsCount: number
    noConsensusCount: number
  }
  loadBalance: Record<string, { agentId: string; currentLoad: number; maxConcurrent: number }>
  reputation: {
    topScore: number
    averageScore: number
    agentsAboveThreshold: number
  }
}

interface SwarmState {
  status: SwarmStatus | null
  extendedStats: ExtendedSwarmStats | null
  leaderboard: LeaderboardEntry[]
  tasks: SwarmTask[]
  handoffs: SwarmHandoff[]
  consensus: ConsensusRequest[]
  isLoading: boolean
  error: string | null
  fetchStatus: () => Promise<void>
  fetchExtendedStats: () => Promise<void>
  fetchLeaderboard: (limit?: number) => Promise<void>
  fetchTasks: () => Promise<void>
  fetchHandoffs: (limit?: number) => Promise<void>
  fetchConsensus: (limit?: number) => Promise<void>
  createTask: (title: string, description: string, type?: string, priority?: string) => Promise<SwarmTask>
  createConsensus: (topic: string, description: string, options: Array<{label: string, description: string}>, participantAgentIds: string[]) => Promise<ConsensusRequest>
  initiateHandoff: (fromAgentId: string, toAgentId: string, conversationId: string) => Promise<void>
  startCollaboration: (taskDescription: string, agentIds: string[]) => Promise<SwarmTask>
  broadcast: (message: string, agentIds?: string[]) => Promise<void>
}

export const useSwarmStore = create<SwarmState>((set) => ({
  status: null,
  extendedStats: null,
  leaderboard: [],
  tasks: [],
  handoffs: [],
  consensus: [],
  isLoading: false,
  error: null,

  fetchStatus: async () => {
    try {
      const response = await api.get('/swarm/status')
      set({ status: response.data })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch swarm status') })
    }
  },

  fetchExtendedStats: async () => {
    try {
      const response = await api.get('/swarm/stats/extended')
      set({ extendedStats: response.data })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch extended stats'), extendedStats: null })
    }
  },

  fetchLeaderboard: async (limit = 50) => {
    try {
      const response = await api.get(`/swarm/leaderboard?limit=${limit}`)
      const leaderboard = response.data.leaderboard || []
      set({ leaderboard })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch leaderboard'), leaderboard: [] })
    }
  },

  fetchTasks: async () => {
    set({ isLoading: true })
    try {
      const response = await api.get('/swarm/tasks')
      // API returns { tasks: [...], count, limit, offset } - extract the tasks array
      const tasks = Array.isArray(response.data) ? response.data : (response.data.tasks || [])
      set({ tasks, isLoading: false })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch tasks'), isLoading: false, tasks: [] })
    }
  },

  fetchHandoffs: async (limit = 10) => {
    try {
      const response = await api.get(`/swarm/handoffs/recent?limit=${limit}`)
      const handoffs = response.data.handoffs || []
      set({ handoffs })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch handoffs'), handoffs: [] })
    }
  },

  fetchConsensus: async (limit = 50) => {
    try {
      const response = await api.get(`/swarm/consensus?limit=${limit}`)
      const consensus = response.data.consensus || []
      set({ consensus })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch consensus'), consensus: [] })
    }
  },

  createTask: async (title, description, type = 'collaboration', priority = 'normal') => {
    set({ isLoading: true })
    try {
      const response = await api.post('/swarm/tasks', {
        title,
        description,
        type,
        priority,
      })
      const newTask = response.data
      set((state) => ({
        tasks: [...state.tasks, newTask],
        isLoading: false,
      }))
      return newTask
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to create task'), isLoading: false })
      throw error
    }
  },

  createConsensus: async (topic, description, options, participantAgentIds) => {
    try {
      const response = await api.post('/swarm/consensus', {
        topic,
        description,
        options: options.map(opt => ({
          label: opt.label,
          description: opt.description,
          proposedBy: 'user'
        })),
        requiredParticipants: participantAgentIds,
      })
      const newConsensus = response.data
      // Refresh consensus list to get the formatted data
      const listResponse = await api.get('/swarm/consensus?limit=50')
      set({ consensus: listResponse.data.consensus || [] })
      return newConsensus
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to create consensus') })
      throw error
    }
  },

  initiateHandoff: async (fromAgentId, toAgentId, conversationId) => {
    try {
      await api.post('/swarm/handoff', {
        fromAgentId,
        toAgentId,
        conversationId,
      })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to initiate handoff') })
      throw error
    }
  },

  startCollaboration: async (taskDescription, agentIds) => {
    set({ isLoading: true })
    try {
      const response = await api.post('/swarm/collaborate', {
        description: taskDescription,
        agentIds,
      })
      const newTask = response.data
      set((state) => ({
        tasks: [...state.tasks, newTask],
        isLoading: false,
      }))
      return newTask
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to start collaboration'), isLoading: false })
      throw error
    }
  },

  broadcast: async (message, agentIds) => {
    try {
      await api.post('/swarm/broadcast', { message, agentIds })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to broadcast message') })
      throw error
    }
  },
}))
