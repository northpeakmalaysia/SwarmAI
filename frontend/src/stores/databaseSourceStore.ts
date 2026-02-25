/**
 * Database Source Store
 *
 * Zustand store for managing database connections and sync operations for RAG ingestion
 */

import { create } from 'zustand'

export interface DatabaseSource {
  id: string
  libraryId?: string
  userId: string
  name: string
  dbType: 'sqlserver' | 'postgres' | 'mysql'
  host: string
  port: number
  databaseName: string
  username: string
  encrypt: boolean
  trustServerCertificate: boolean
  extractionQuery?: string
  contentFields: string[]
  titleField?: string
  idField?: string
  metadataFields?: string[]
  scheduleEnabled: boolean
  cronExpression?: string
  lastSyncAt?: string
  lastSyncStatus?: string
  lastSyncError?: string
  itemCount: number
  status: 'disconnected' | 'connected' | 'syncing' | 'error'
  createdAt: string
  updatedAt: string
}

export interface DatabaseTable {
  name: string
  schema: string
  type: 'table' | 'view'
  rowCount: number
}

export interface DatabaseColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
}

export interface SyncHistory {
  id: string
  sourceId: string
  status: string
  rowsDiscovered: number
  rowsIngested: number
  rowsFailed: number
  errorMessage?: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  createdAt: string
}

export interface ConnectionTestResult {
  success: boolean
  message: string
  serverVersion?: string
  durationMs?: number
  error?: string
}

export interface PreviewResult {
  rows: Record<string, unknown>[]
  columns: { name: string; type: string; nullable: boolean }[]
  rowCount: number
  preview: boolean
}

interface DatabaseSourceStore {
  // State
  sources: DatabaseSource[]
  tables: DatabaseTable[]
  columns: DatabaseColumn[]
  isLoading: boolean
  isTesting: boolean
  isSyncing: boolean
  error: string | null

  // Actions
  fetchSources: (libraryId?: string) => Promise<void>
  getSource: (sourceId: string) => Promise<DatabaseSource | null>
  createSource: (data: Partial<DatabaseSource> & { password?: string }) => Promise<DatabaseSource>
  updateSource: (sourceId: string, data: Partial<DatabaseSource> & { password?: string }) => Promise<DatabaseSource>
  deleteSource: (sourceId: string) => Promise<void>

  // Connection
  testConnection: (config: {
    host: string
    port?: number
    databaseName: string
    username: string
    password?: string
    dbType?: string
    encrypt?: boolean
    trustServerCertificate?: boolean
  }) => Promise<ConnectionTestResult>
  testSourceConnection: (sourceId: string) => Promise<ConnectionTestResult>

  // Schema browsing
  getTables: (sourceId: string) => Promise<DatabaseTable[]>
  getColumns: (sourceId: string, table: string, schema?: string) => Promise<DatabaseColumn[]>
  previewQuery: (sourceId: string, query: string, limit?: number) => Promise<PreviewResult>

  // Sync operations
  triggerSync: (sourceId: string) => Promise<{ syncId: string; status: string }>
  cancelSync: (sourceId: string) => Promise<void>
  getSyncStatus: (sourceId: string) => Promise<{
    status: string
    lastSyncAt?: string
    lastSyncStatus?: string
    lastSyncError?: string
    itemCount: number
  }>
  getSyncHistory: (sourceId: string, limit?: number, offset?: number) => Promise<{ history: SyncHistory[]; total: number }>

  // Internal
  clearError: () => void
  setLoading: (loading: boolean) => void
}

const API_BASE = '/api/database'

export const useDatabaseSourceStore = create<DatabaseSourceStore>((set, get) => ({
  sources: [],
  tables: [],
  columns: [],
  isLoading: false,
  isTesting: false,
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
        throw new Error('Failed to fetch database sources')
      }

      const data = await response.json()
      set({ sources: data.sources || [], isLoading: false })
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
        throw new Error('Failed to fetch database source')
      }

      const data = await response.json()
      return data.source
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  createSource: async (data) => {
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
        throw new Error(errorData.error || 'Failed to create database source')
      }

      const result = await response.json()
      set((state) => ({
        sources: [...state.sources, result.source],
        isLoading: false,
      }))
      return result.source
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  updateSource: async (sourceId: string, data) => {
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
        throw new Error(errorData.error || 'Failed to update database source')
      }

      const result = await response.json()
      set((state) => ({
        sources: state.sources.map((s) => (s.id === sourceId ? result.source : s)),
        isLoading: false,
      }))
      return result.source
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
        throw new Error('Failed to delete database source')
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

  testConnection: async (config) => {
    set({ isTesting: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(config),
      })

      const result = await response.json()
      set({ isTesting: false })
      return result
    } catch (error) {
      set({ error: (error as Error).message, isTesting: false })
      throw error
    }
  },

  testSourceConnection: async (sourceId: string) => {
    set({ isTesting: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/sources/${sourceId}/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      const result = await response.json()

      // Update source status in store
      if (result.success) {
        set((state) => ({
          sources: state.sources.map((s) =>
            s.id === sourceId ? { ...s, status: 'connected' as const } : s
          ),
          isTesting: false,
        }))
      } else {
        set({ isTesting: false })
      }

      return result
    } catch (error) {
      set({ error: (error as Error).message, isTesting: false })
      throw error
    }
  },

  getTables: async (sourceId: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/sources/${sourceId}/tables`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to fetch tables')
      }

      const data = await response.json()
      set({ tables: data.tables || [], isLoading: false })
      return data.tables || []
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  getColumns: async (sourceId: string, table: string, schema = 'dbo') => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(
        `${API_BASE}/sources/${sourceId}/columns?table=${encodeURIComponent(table)}&schema=${encodeURIComponent(schema)}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to fetch columns')
      }

      const data = await response.json()
      set({ columns: data.columns || [], isLoading: false })
      return data.columns || []
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  previewQuery: async (sourceId: string, query: string, limit = 10) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/sources/${sourceId}/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ query, limit }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to preview query')
      }

      const result = await response.json()
      set({ isLoading: false })
      return result
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  triggerSync: async (sourceId: string) => {
    set({ isSyncing: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/sources/${sourceId}/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to trigger sync')
      }

      const result = await response.json()

      // Update source status to syncing
      set((state) => ({
        sources: state.sources.map((s) =>
          s.id === sourceId ? { ...s, status: 'syncing' as const } : s
        ),
        isSyncing: false,
      }))

      return result
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

      // Update source status
      set((state) => ({
        sources: state.sources.map((s) =>
          s.id === sourceId ? { ...s, status: 'connected' as const } : s
        ),
      }))
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  getSyncStatus: async (sourceId: string) => {
    try {
      const response = await fetch(`${API_BASE}/sources/${sourceId}/sync/status`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to get sync status')
      }

      return await response.json()
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

  clearError: () => set({ error: null }),
  setLoading: (loading: boolean) => set({ isLoading: loading }),
}))

export default useDatabaseSourceStore
