import { create } from 'zustand'
import api from '../services/api'
import { extractErrorMessage } from '../lib/utils'

// Platform info from backend
interface PlatformInfo {
  id: string
  platform: string
  status: string
  metadata?: Record<string, unknown> | null
}

export interface Agent {
  id: string
  name: string
  description: string
  avatar?: string
  systemPrompt: string
  model: string
  provider: 'openrouter' | 'ollama' | 'anthropic' | 'google'
  status: 'idle' | 'busy' | 'offline'
  skills: string[]
  temperature: number
  maxTokens: number
  createdAt: string
  updatedAt: string
  // Platform connection info (derived from platforms array)
  platform?: string
  platformStatus?: string
  platformAccountId?: string
  // Platform identifiers extracted from connection metadata
  phoneNumber?: string
  email?: string
  telegramUsername?: string
  // Full platforms array from backend
  platforms?: PlatformInfo[]
}

interface AgentState {
  agents: Agent[]
  selectedAgent: Agent | null
  isLoading: boolean
  error: string | null
  fetchAgents: () => Promise<void>
  createAgent: (agent: Partial<Agent>) => Promise<Agent>
  updateAgent: (id: string, updates: Partial<Agent>) => Promise<Agent>
  deleteAgent: (id: string) => Promise<void>
  selectAgent: (agent: Agent | null) => void
  activateAgent: (id: string) => Promise<void>
  deactivateAgent: (id: string) => Promise<void>
  reconnectPlatform: (id: string, platform: string) => Promise<void>
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  selectedAgent: null,
  isLoading: false,
  error: null,

  fetchAgents: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get('/agents')
      // Ensure agents is always an array (defensive handling for API response variations)
      // response.data is the full response body: { agents: [...] } or just [...]
      const responseData = response.data || response
      let rawAgents: any[] = []
      if (Array.isArray(responseData)) {
        rawAgents = responseData
      } else if (responseData?.agents && Array.isArray(responseData.agents)) {
        rawAgents = responseData.agents
      }

      // Transform agents to extract platform info from platforms array
      const agents: Agent[] = rawAgents.map((agent: any) => {
        // Get primary platform from platforms array (first one)
        const primaryPlatform = agent.platforms?.[0]

        // Extract contact identifiers from platform metadata
        let phoneNumber: string | undefined
        let email: string | undefined
        let telegramUsername: string | undefined

        for (const platform of agent.platforms || []) {
          const meta = platform.metadata as Record<string, unknown> | undefined
          if (platform.platform === 'whatsapp' && meta?.wid) {
            phoneNumber = `+${meta.wid}`
          } else if (platform.platform === 'telegram-bot' && meta?.username) {
            telegramUsername = `@${meta.username}`
          } else if (platform.platform === 'email' && meta?.email) {
            email = meta.email as string
          }
        }

        return {
          ...agent,
          // Extract platform info for convenience
          platform: primaryPlatform?.platform,
          platformStatus: primaryPlatform?.status,
          platformAccountId: primaryPlatform?.id,
          // Contact identifiers
          phoneNumber,
          email,
          telegramUsername,
        }
      })

      set({ agents, isLoading: false })
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch agents'), isLoading: false, agents: [] })
    }
  },

  createAgent: async (agentData) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/agents', agentData)
      // Backend returns { agent: {...} }
      const rawAgent = response.data.agent || response.data
      // Extract platform info from platforms array
      const primaryPlatform = rawAgent.platforms?.[0]

      // Extract contact identifiers from platform metadata
      let phoneNumber: string | undefined
      let email: string | undefined
      let telegramUsername: string | undefined

      for (const platform of rawAgent.platforms || []) {
        const meta = platform.metadata as Record<string, unknown> | undefined
        if (platform.platform === 'whatsapp' && meta?.wid) {
          phoneNumber = `+${meta.wid}`
        } else if (platform.platform === 'telegram-bot' && meta?.username) {
          telegramUsername = `@${meta.username}`
        } else if (platform.platform === 'email' && meta?.email) {
          email = meta.email as string
        }
      }

      const newAgent: Agent = {
        ...rawAgent,
        platform: primaryPlatform?.platform,
        platformStatus: primaryPlatform?.status,
        platformAccountId: primaryPlatform?.id,
        phoneNumber,
        email,
        telegramUsername,
      }
      set((state) => ({
        agents: [...state.agents, newAgent],
        isLoading: false,
      }))
      return newAgent
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to create agent'), isLoading: false })
      throw error
    }
  },

  updateAgent: async (id, updates) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.put(`/agents/${id}`, updates)
      // Backend returns { agent: {...} }
      const rawAgent = response.data.agent || response.data
      // Extract platform info from platforms array
      const primaryPlatform = rawAgent.platforms?.[0]

      // Extract contact identifiers from platform metadata
      let phoneNumber: string | undefined
      let email: string | undefined
      let telegramUsername: string | undefined

      for (const platform of rawAgent.platforms || []) {
        const meta = platform.metadata as Record<string, unknown> | undefined
        if (platform.platform === 'whatsapp' && meta?.wid) {
          phoneNumber = `+${meta.wid}`
        } else if (platform.platform === 'telegram-bot' && meta?.username) {
          telegramUsername = `@${meta.username}`
        } else if (platform.platform === 'email' && meta?.email) {
          email = meta.email as string
        }
      }

      const updatedAgent: Agent = {
        ...rawAgent,
        platform: primaryPlatform?.platform,
        platformStatus: primaryPlatform?.status,
        platformAccountId: primaryPlatform?.id,
        phoneNumber,
        email,
        telegramUsername,
      }
      set((state) => ({
        agents: state.agents.map((a) => (a.id === id ? updatedAgent : a)),
        selectedAgent: state.selectedAgent?.id === id ? updatedAgent : state.selectedAgent,
        isLoading: false,
      }))
      return updatedAgent
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to update agent'), isLoading: false })
      throw error
    }
  },

  deleteAgent: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await api.delete(`/agents/${id}`)
      set((state) => ({
        agents: state.agents.filter((a) => a.id !== id),
        selectedAgent: state.selectedAgent?.id === id ? null : state.selectedAgent,
        isLoading: false,
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to delete agent'), isLoading: false })
      throw error
    }
  },

  selectAgent: (agent) => set({ selectedAgent: agent }),

  activateAgent: async (id) => {
    try {
      await api.post(`/agents/${id}/activate`)
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === id ? { ...a, status: 'idle' as const } : a
        ),
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to activate agent') })
      throw error
    }
  },

  deactivateAgent: async (id) => {
    try {
      await api.post(`/agents/${id}/deactivate`)
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === id ? { ...a, status: 'offline' as const } : a
        ),
      }))
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to deactivate agent') })
      throw error
    }
  },

  reconnectPlatform: async (agentId, platform) => {
    try {
      // Create a new platform connection for the agent
      // API: POST /api/platforms/{platform} with { agentId } in body
      await api.post(`/platforms/${platform}`, { agentId })
      // Refetch agents to get updated status
      get().fetchAgents()
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to reconnect platform') })
      throw error
    }
  },
}))
