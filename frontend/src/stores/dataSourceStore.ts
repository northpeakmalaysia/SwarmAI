/**
 * Data Source Store
 *
 * Zustand store for managing database/API data sources for RAG ingestion
 */

import { create } from 'zustand'

export interface MCPToolConfig {
  serverId: string
  toolName: string
  defaultArgs?: Record<string, unknown>
}

export interface DataSource {
  id: string
  libraryId: string
  userId: string
  name: string
  description?: string
  sourceType: 'database' | 'api'
  mcpToolConfig: MCPToolConfig
  extractionQuery?: string
  dataPath: string
  contentFields: string[]
  titleField?: string
  idField?: string
  metadataFields?: string[]
  changeMode: 'full' | 'timestamp' | 'id' | 'hash'
  changeField?: string
  lastChangeValue?: string
  scheduleEnabled: boolean
  cronExpression?: string
  timezone: string
  lastSyncAt?: string
  lastSyncStatus?: string
  lastSyncError?: string
  nextSyncAt?: string
  itemCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SyncProgress {
  syncId: string
  sourceId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  percentage: number
  itemsDiscovered: number
  itemsProcessed: number
  itemsFailed: number
  currentItem?: string
  error?: string
  startedAt: string
}

export interface SyncHistoryItem {
  id: string
  sourceId: string
  libraryId: string
  triggerType: string
  status: string
  itemsDiscovered: number
  itemsNew: number
  itemsModified: number
  itemsDeleted: number
  itemsFailed: number
  startedAt: string
  completedAt?: string
  durationMs?: number
  errorMessage?: string
  log: string[]
  createdAt: string
}

export interface DataItem {
  id: string
  sourceId: string
  libraryId: string
  documentId?: string
  externalId: string
  contentHash?: string
  lastModified?: string
  syncStatus: string
  lastSyncedAt?: string
  errorMessage?: string
  createdAt: string
}

export interface DataSourceStatistics {
  sources: {
    total: number
    database: number
    api: number
    active: number
    scheduled: number
    totalItems: number
  }
  syncs: {
    total: number
    successful: number
    failed: number
    itemsNew: number
    itemsModified: number
    itemsDeleted: number
    avgDurationMs: number
  }
  period: string
}

interface DataSourceStore {
  // State
  sources: DataSource[]
  syncProgress: Map<string, SyncProgress>
  isLoading: boolean
  isSyncing: boolean
  error: string | null

  // Actions
  fetchSources: (libraryId?: string) => Promise<void>
  getSource: (sourceId: string) => Promise<DataSource | null>
  createSource: (data: Partial<DataSource>) => Promise<DataSource>
  updateSource: (sourceId: string, data: Partial<DataSource>) => Promise<DataSource>
  deleteSource: (sourceId: string) => Promise<void>

  // Sync operations
  triggerSync: (sourceId: string, options?: { force?: boolean; dryRun?: boolean }) => Promise<void>
  cancelSync: (sourceId: string) => Promise<void>
  getSyncHistory: (sourceId: string, limit?: number, offset?: number) => Promise<{ items: SyncHistoryItem[]; total: number }>
  getSyncProgress: (sourceId: string) => Promise<SyncProgress | null>

  // Schedule operations
  enableSchedule: (sourceId: string) => Promise<DataSource>
  disableSchedule: (sourceId: string) => Promise<DataSource>

  // Items
  getItems: (sourceId: string, limit?: number, offset?: number) => Promise<{ items: DataItem[]; total: number }>

  // Statistics
  getStatistics: () => Promise<DataSourceStatistics>

  // Internal
  setSyncProgress: (sourceId: string, progress: SyncProgress | null) => void
  clearError: () => void
}

const API_BASE = '/api/data'

export const useDataSourceStore = create<DataSourceStore>((set, get) => ({
  sources: [],
  syncProgress: new Map(),
  isLoading: false,
  isSyncing: false,
  error: null,

  fetchSources: async (libraryId?: string) => {
    set({ isLoading: true, error: null })
    try {
      const url = libraryId ? `${API_BASE}/sources?libraryId=${libraryId}` : `${API_BASE}/sources`
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch data sources')
      }

      const sources = await response.json()
      set({ sources, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  getSource: async (sourceId: string) => {
    try {
      const response = await fetch(`${API_BASE}/sources/${sourceId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error('Failed to fetch data source')
      }

      return await response.json()
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  createSource: async (data: Partial<DataSource>) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/sources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to create data source')
      }

      const source = await response.json()
      set((state) => ({
        sources: [...state.sources, source],
        isLoading: false,
      }))
      return source
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  updateSource: async (sourceId: string, data: Partial<DataSource>) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/sources/${sourceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to update data source')
      }

      const source = await response.json()
      set((state) => ({
        sources: state.sources.map((s) => (s.id === sourceId ? source : s)),
        isLoading: false,
      }))
      return source
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  deleteSource: async (sourceId: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/sources/${sourceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete data source')
      }

      set((state) => ({
        sources: state.sources.filter((s) => s.id !== sourceId),
        isLoading: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  triggerSync: async (sourceId: string, options?: { force?: boolean; dryRun?: boolean }) => {
    set({ isSyncing: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/sources/${sourceId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(options || {}),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to trigger sync')
      }

      const result = await response.json()

      // Update source with sync result
      set((state) => ({
        sources: state.sources.map((s) =>
          s.id === sourceId
            ? {
                ...s,
                lastSyncAt: result.completedAt || new Date().toISOString(),
                lastSyncStatus: result.status,
                lastSyncError: result.errorMessage,
                itemCount: s.itemCount + (result.itemsNew || 0) - (result.itemsDeleted || 0),
              }
            : s
        ),
        isSyncing: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, isSyncing: false })
      throw error
    }
  },

  cancelSync: async (sourceId: string) => {
    try {
      const response = await fetch(`${API_BASE}/sources/${sourceId}/sync/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to cancel sync')
      }

      // Clear sync progress
      get().setSyncProgress(sourceId, null)
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  getSyncHistory: async (sourceId: string, limit = 20, offset = 0) => {
    try {
      const response = await fetch(
        `${API_BASE}/sources/${sourceId}/history?limit=${limit}&offset=${offset}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch sync history')
      }

      return await response.json()
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  getSyncProgress: async (sourceId: string) => {
    try {
      const response = await fetch(`${API_BASE}/sources/${sourceId}/sync/progress`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch sync progress')
      }

      return await response.json()
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  enableSchedule: async (sourceId: string) => {
    return get().updateSource(sourceId, { scheduleEnabled: true })
  },

  disableSchedule: async (sourceId: string) => {
    return get().updateSource(sourceId, { scheduleEnabled: false })
  },

  getItems: async (sourceId: string, limit = 50, offset = 0) => {
    try {
      const response = await fetch(
        `${API_BASE}/sources/${sourceId}/items?limit=${limit}&offset=${offset}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch items')
      }

      return await response.json()
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  getStatistics: async () => {
    try {
      const response = await fetch(`${API_BASE}/statistics`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch statistics')
      }

      return await response.json()
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  setSyncProgress: (sourceId: string, progress: SyncProgress | null) => {
    set((state) => {
      const newProgress = new Map(state.syncProgress)
      if (progress) {
        newProgress.set(sourceId, progress)
      } else {
        newProgress.delete(sourceId)
      }
      return { syncProgress: newProgress }
    })
  },

  clearError: () => set({ error: null }),
}))

export default useDataSourceStore
