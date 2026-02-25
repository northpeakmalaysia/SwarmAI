/**
 * MCP (Model Context Protocol) Store
 *
 * Zustand store for managing MCP servers and tools
 */

import { create } from 'zustand'
import api from '../services/api'
import { extractErrorMessage } from '../lib/utils'

export interface MCPServer {
  id: string
  name: string
  transport: 'stdio' | 'http' | 'websocket'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  capabilities?: string[]
  isActive: boolean
  isConnected?: boolean
}

export interface MCPTool {
  name: string
  description?: string
  inputSchema: {
    type: string
    properties?: Record<string, {
      type: string
      description?: string
      enum?: string[]
      default?: unknown
    }>
    required?: string[]
  }
  serverId: string
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

interface MCPStore {
  // State
  servers: MCPServer[]
  tools: MCPTool[]
  resources: MCPResource[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchServers: () => Promise<void>
  fetchTools: () => Promise<void>
  getToolsByServer: (serverId: string) => MCPTool[]
  getToolInputSchema: (toolName: string) => MCPTool['inputSchema'] | null
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>

  // Server management
  createServer: (data: Omit<MCPServer, 'id' | 'isConnected'>) => Promise<MCPServer>
  updateServer: (serverId: string, data: Partial<MCPServer>) => Promise<MCPServer>
  deleteServer: (serverId: string) => Promise<void>
  connectServer: (serverId: string) => Promise<void>
  disconnectServer: (serverId: string) => Promise<void>

  // Internal
  clearError: () => void
}

const API_BASE = '/ai/mcp'

export const useMCPStore = create<MCPStore>((set, get) => ({
  servers: [],
  tools: [],
  resources: [],
  isLoading: false,
  error: null,

  fetchServers: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.get(`${API_BASE}/servers`) as { servers?: MCPServer[]; data?: MCPServer[] }
      set({ servers: result.servers || result.data || [], isLoading: false })
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch MCP servers')
      set({ error: message, isLoading: false })
      throw new Error(message)
    }
  },

  fetchTools: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.get(`${API_BASE}/tools`) as { tools?: MCPTool[]; data?: MCPTool[] }
      set({ tools: result.tools || result.data || [], isLoading: false })
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch MCP tools')
      set({ error: message, isLoading: false })
      throw new Error(message)
    }
  },

  getToolsByServer: (serverId: string) => {
    return get().tools.filter(tool => tool.serverId === serverId)
  },

  getToolInputSchema: (toolName: string) => {
    const tool = get().tools.find(t => t.name === toolName)
    return tool?.inputSchema || null
  },

  callTool: async (toolName: string, args: Record<string, unknown>) => {
    try {
      const result = await api.post<{ data?: unknown }>(`${API_BASE}/tools/${encodeURIComponent(toolName)}/call`, args)
      return result.data
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to call MCP tool')
      set({ error: message })
      throw new Error(message)
    }
  },

  createServer: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.post(`${API_BASE}/servers`, data) as { server?: MCPServer; data?: MCPServer }
      const server = result.server || result.data

      if (!server) {
        throw new Error('No server data returned')
      }

      set((state) => ({
        servers: [...state.servers, server],
        isLoading: false,
      }))

      // Refresh tools after adding server
      await get().fetchTools()

      return server
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to create MCP server')
      set({ error: message, isLoading: false })
      throw new Error(message)
    }
  },

  updateServer: async (serverId, data) => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.put(`${API_BASE}/servers/${serverId}`, data) as { server?: MCPServer; data?: MCPServer }
      const server = result.server || result.data

      if (!server) {
        throw new Error('No server data returned')
      }

      set((state) => ({
        servers: state.servers.map((s) => (s.id === serverId ? server : s)),
        isLoading: false,
      }))

      // Refresh tools after updating server
      await get().fetchTools()

      return server
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to update MCP server')
      set({ error: message, isLoading: false })
      throw new Error(message)
    }
  },

  deleteServer: async (serverId) => {
    set({ isLoading: true, error: null })
    try {
      await api.delete(`${API_BASE}/servers/${serverId}`)

      set((state) => ({
        servers: state.servers.filter((s) => s.id !== serverId),
        tools: state.tools.filter((t) => t.serverId !== serverId),
        isLoading: false,
      }))
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to delete MCP server')
      set({ error: message, isLoading: false })
      throw new Error(message)
    }
  },

  connectServer: async (serverId) => {
    try {
      await api.post(`${API_BASE}/servers/${serverId}/connect`)

      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === serverId ? { ...s, isConnected: true } : s
        ),
      }))

      // Refresh tools after connecting
      await get().fetchTools()
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to connect to MCP server')
      set({ error: message })
      throw new Error(message)
    }
  },

  disconnectServer: async (serverId) => {
    try {
      await api.post(`${API_BASE}/servers/${serverId}/disconnect`)

      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === serverId ? { ...s, isConnected: false } : s
        ),
        tools: state.tools.filter((t) => t.serverId !== serverId),
      }))
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to disconnect from MCP server')
      set({ error: message })
      throw new Error(message)
    }
  },

  clearError: () => set({ error: null }),
}))

export default useMCPStore
