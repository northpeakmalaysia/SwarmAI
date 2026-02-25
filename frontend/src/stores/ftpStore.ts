/**
 * FTP Store - Frontend state management for FTP/SFTP Sync
 *
 * Provides comprehensive state management for:
 * - FTP source CRUD operations
 * - Connection testing
 * - Sync operations (trigger, cancel)
 * - Real-time sync progress via WebSocket
 * - Sync history
 * - Schedule management
 */
import { create } from 'zustand'
import { api } from '../services/api'
import { websocket } from '../services/websocket'
import { extractErrorMessage } from '../lib/utils'

// =============================================================================
// TYPES
// =============================================================================

export type FTPProtocol = 'ftp' | 'sftp'
export type SyncMode = 'full' | 'incremental'
export type SyncStatus = 'pending' | 'synced' | 'modified' | 'deleted' | 'failed' | 'skipped'
export type SyncHistoryStatus = 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'
export type TriggerType = 'manual' | 'scheduled'

export interface FTPSource {
  id: string
  libraryId: string
  userId: string
  name: string
  description?: string
  protocol: FTPProtocol
  host: string
  port: number
  username: string
  remotePath: string
  recursive: boolean
  filePatterns: string
  excludePatterns?: string
  syncMode: SyncMode
  maxFileSize: number
  scheduleEnabled: boolean
  cronExpression?: string
  timezone: string
  lastSyncAt?: string
  lastSyncStatus?: 'success' | 'partial' | 'failed'
  lastSyncError?: string
  nextSyncAt?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface FTPTrackedFile {
  id: string
  sourceId: string
  libraryId: string
  documentId?: string
  remotePath: string
  fileName: string
  fileSize?: number
  remoteMtime?: string
  contentHash?: string
  syncStatus: SyncStatus
  lastSyncedAt?: string
  errorMessage?: string
  createdAt: string
}

export interface FTPSyncHistory {
  id: string
  sourceId: string
  libraryId: string
  userId: string
  triggerType: TriggerType
  status: SyncHistoryStatus
  filesDiscovered: number
  filesNew: number
  filesModified: number
  filesDeleted: number
  filesUnchanged: number
  filesFailed: number
  filesSkipped: number
  bytesTransferred: number
  startedAt: string
  completedAt?: string
  durationMs?: number
  errorMessage?: string
  createdAt: string
}

export interface SyncProgress {
  syncId: string
  sourceId: string
  sourceName: string
  status: SyncHistoryStatus
  phase: 'connecting' | 'listing' | 'detecting' | 'syncing' | 'completing'
  filesDiscovered?: number
  filesNew?: number
  filesModified?: number
  filesDeleted?: number
  filesProcessed?: number
  filesFailed?: number
  currentFile?: string
  percentage?: number
  startedAt: string
}

export interface RemoteFile {
  name: string
  path: string
  size: number
  mtime: string
  isDirectory: boolean
}

// Request types
export interface CreateFTPSourceRequest {
  libraryId: string
  name: string
  description?: string
  protocol: FTPProtocol
  host: string
  port?: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  remotePath?: string
  recursive?: boolean
  filePatterns?: string[]
  excludePatterns?: string[]
  syncMode?: SyncMode
  maxFileSize?: number
  scheduleEnabled?: boolean
  cronExpression?: string
  timezone?: string
}

export interface UpdateFTPSourceRequest {
  name?: string
  description?: string
  host?: string
  port?: number
  username?: string
  password?: string
  privateKey?: string
  passphrase?: string
  remotePath?: string
  recursive?: boolean
  filePatterns?: string[]
  excludePatterns?: string[]
  syncMode?: SyncMode
  maxFileSize?: number
  scheduleEnabled?: boolean
  cronExpression?: string
  timezone?: string
  isActive?: boolean
}

export interface TestConnectionRequest {
  protocol: FTPProtocol
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  remotePath?: string
}

export interface TestConnectionResult {
  success: boolean
  message: string
  details?: {
    serverInfo?: string
    remotePath?: string
    filesFound?: number
    error?: string
  }
}

// =============================================================================
// STORE STATE INTERFACE
// =============================================================================

interface FTPState {
  // State
  sources: FTPSource[]
  currentSource: FTPSource | null
  trackedFiles: FTPTrackedFile[]
  syncHistory: FTPSyncHistory[]
  syncProgress: Map<string, SyncProgress>
  remoteBrowse: RemoteFile[]

  // Loading states
  isLoading: boolean
  isSyncing: boolean
  isTesting: boolean
  isBrowsing: boolean
  error: string | null

  // Source actions
  fetchSources: (libraryId?: string) => Promise<void>
  fetchSource: (sourceId: string) => Promise<FTPSource>
  createSource: (data: CreateFTPSourceRequest) => Promise<FTPSource>
  updateSource: (sourceId: string, updates: UpdateFTPSourceRequest) => Promise<FTPSource>
  deleteSource: (sourceId: string) => Promise<void>
  setCurrentSource: (source: FTPSource | null) => void

  // Connection actions
  testConnection: (data: TestConnectionRequest) => Promise<TestConnectionResult>
  testSourceConnection: (sourceId: string) => Promise<TestConnectionResult>

  // Sync actions
  triggerSync: (sourceId: string) => Promise<{ syncId: string }>
  cancelSync: (sourceId: string) => Promise<void>
  getSyncStatus: (sourceId: string) => Promise<SyncProgress | null>

  // File tracking
  fetchTrackedFiles: (sourceId: string) => Promise<void>
  browseRemote: (sourceId: string, path?: string) => Promise<void>

  // History
  fetchSyncHistory: (sourceId: string, limit?: number) => Promise<void>

  // Schedule
  enableSchedule: (sourceId: string) => Promise<void>
  disableSchedule: (sourceId: string) => Promise<void>
  updateSchedule: (sourceId: string, cronExpression: string, timezone?: string) => Promise<void>

  // WebSocket subscriptions
  subscribeToSource: (sourceId: string) => void
  unsubscribeFromSource: (sourceId: string) => void
  subscribeToAllFTP: () => void
  unsubscribeFromAllFTP: () => void

  // Utility
  clearError: () => void
  clearSyncProgress: (sourceId: string) => void
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useFTPStore = create<FTPState>((set, get) => ({
  // Initial state
  sources: [],
  currentSource: null,
  trackedFiles: [],
  syncHistory: [],
  syncProgress: new Map(),
  remoteBrowse: [],
  isLoading: false,
  isSyncing: false,
  isTesting: false,
  isBrowsing: false,
  error: null,

  // ==========================================================================
  // SOURCE ACTIONS
  // ==========================================================================

  fetchSources: async (libraryId) => {
    set({ isLoading: true, error: null })
    try {
      const url = libraryId ? `/ftp/sources?libraryId=${libraryId}` : '/ftp/sources'
      const response = await api.get<{ sources: FTPSource[] }>(url)
      // api.get returns response.data directly, so response IS the data
      // API returns { sources: [...] }, extract the array
      const sourcesArray = response?.sources || []
      set({ sources: Array.isArray(sourcesArray) ? sourcesArray : [], isLoading: false })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch FTP sources')
      set({ error: errorMessage, isLoading: false, sources: [] })
    }
  },

  fetchSource: async (sourceId) => {
    set({ isLoading: true, error: null })
    try {
      // api.get returns response.data directly
      const source = await api.get<FTPSource>(`/ftp/sources/${sourceId}`)
      set({ currentSource: source, isLoading: false })
      return source
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch FTP source')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  createSource: async (data) => {
    set({ isLoading: true, error: null })
    try {
      // api.post returns response.data directly
      const newSource = await api.post<FTPSource>('/ftp/sources', data)
      set((state) => ({
        sources: [...state.sources, newSource],
        isLoading: false,
      }))
      return newSource
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to create FTP source')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  updateSource: async (sourceId, updates) => {
    set({ isLoading: true, error: null })
    try {
      // api.put returns response.data directly
      const updatedSource = await api.put<FTPSource>(`/ftp/sources/${sourceId}`, updates)
      set((state) => ({
        sources: state.sources.map((s) => (s.id === sourceId ? updatedSource : s)),
        currentSource: state.currentSource?.id === sourceId ? updatedSource : state.currentSource,
        isLoading: false,
      }))
      return updatedSource
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to update FTP source')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  deleteSource: async (sourceId) => {
    set({ isLoading: true, error: null })
    try {
      await api.delete(`/ftp/sources/${sourceId}`)
      set((state) => ({
        sources: state.sources.filter((s) => s.id !== sourceId),
        currentSource: state.currentSource?.id === sourceId ? null : state.currentSource,
        isLoading: false,
      }))
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to delete FTP source')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  setCurrentSource: (source) => set({ currentSource: source }),

  // ==========================================================================
  // CONNECTION ACTIONS
  // ==========================================================================

  testConnection: async (data) => {
    set({ isTesting: true, error: null })
    try {
      // api.post returns response.data directly
      const result = await api.post<TestConnectionResult>('/ftp/test-connection', data)
      set({ isTesting: false })
      return result
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Connection test failed')
      set({ error: errorMessage, isTesting: false })
      throw error
    }
  },

  testSourceConnection: async (sourceId) => {
    set({ isTesting: true, error: null })
    try {
      // api.post returns response.data directly
      const result = await api.post<TestConnectionResult>(`/ftp/sources/${sourceId}/test`)
      set({ isTesting: false })
      return result
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Connection test failed')
      set({ error: errorMessage, isTesting: false })
      throw error
    }
  },

  // ==========================================================================
  // SYNC ACTIONS
  // ==========================================================================

  triggerSync: async (sourceId) => {
    set({ isSyncing: true, error: null })
    try {
      // api.post returns response.data directly
      const result = await api.post<{ syncId: string }>(`/ftp/sources/${sourceId}/sync`)
      // Don't set isSyncing to false here - it will be updated via WebSocket events
      return result
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to start sync')
      set({ error: errorMessage, isSyncing: false })
      throw error
    }
  },

  cancelSync: async (sourceId) => {
    try {
      await api.post(`/ftp/sources/${sourceId}/sync/cancel`)
      set({ isSyncing: false })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to cancel sync')
      set({ error: errorMessage })
      throw error
    }
  },

  getSyncStatus: async (sourceId) => {
    try {
      // api.get returns response.data directly
      const status = await api.get<SyncProgress | null>(`/ftp/sources/${sourceId}/sync/status`)
      return status
    } catch (error: unknown) {
      // 404 means no active sync
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        return null
      }
      throw error
    }
  },

  // ==========================================================================
  // FILE TRACKING
  // ==========================================================================

  fetchTrackedFiles: async (sourceId) => {
    set({ isLoading: true, error: null })
    try {
      // api.get returns response.data directly
      const files = await api.get<FTPTrackedFile[]>(`/ftp/sources/${sourceId}/files`)
      set({ trackedFiles: Array.isArray(files) ? files : [], isLoading: false })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch tracked files')
      set({ error: errorMessage, isLoading: false, trackedFiles: [] })
    }
  },

  browseRemote: async (sourceId, path) => {
    set({ isBrowsing: true, error: null })
    try {
      const url = path
        ? `/ftp/sources/${sourceId}/browse?path=${encodeURIComponent(path)}`
        : `/ftp/sources/${sourceId}/browse`
      // api.get returns response.data directly
      const files = await api.get<RemoteFile[]>(url)
      set({ remoteBrowse: Array.isArray(files) ? files : [], isBrowsing: false })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to browse remote directory')
      set({ error: errorMessage, isBrowsing: false, remoteBrowse: [] })
    }
  },

  // ==========================================================================
  // HISTORY
  // ==========================================================================

  fetchSyncHistory: async (sourceId, limit = 10) => {
    set({ isLoading: true, error: null })
    try {
      // api.get returns response.data directly
      const history = await api.get<FTPSyncHistory[]>(`/ftp/sources/${sourceId}/history?limit=${limit}`)
      set({ syncHistory: Array.isArray(history) ? history : [], isLoading: false })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch sync history')
      set({ error: errorMessage, isLoading: false, syncHistory: [] })
    }
  },

  // ==========================================================================
  // SCHEDULE
  // ==========================================================================

  enableSchedule: async (sourceId) => {
    set({ isLoading: true, error: null })
    try {
      await api.post(`/ftp/sources/${sourceId}/schedule/enable`)
      set((state) => ({
        sources: state.sources.map((s) =>
          s.id === sourceId ? { ...s, scheduleEnabled: true } : s
        ),
        isLoading: false,
      }))
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to enable schedule')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  disableSchedule: async (sourceId) => {
    set({ isLoading: true, error: null })
    try {
      await api.post(`/ftp/sources/${sourceId}/schedule/disable`)
      set((state) => ({
        sources: state.sources.map((s) =>
          s.id === sourceId ? { ...s, scheduleEnabled: false } : s
        ),
        isLoading: false,
      }))
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to disable schedule')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  updateSchedule: async (sourceId, cronExpression, timezone = 'UTC') => {
    set({ isLoading: true, error: null })
    try {
      await api.put(`/ftp/sources/${sourceId}/schedule`, { cronExpression, timezone })
      set((state) => ({
        sources: state.sources.map((s) =>
          s.id === sourceId ? { ...s, cronExpression, timezone } : s
        ),
        isLoading: false,
      }))
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to update schedule')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  // ==========================================================================
  // WEBSOCKET SUBSCRIPTIONS
  // ==========================================================================

  subscribeToSource: (sourceId) => {
    websocket.emit('ftp:subscribe', sourceId)
  },

  unsubscribeFromSource: (sourceId) => {
    websocket.emit('ftp:unsubscribe', sourceId)
  },

  subscribeToAllFTP: () => {
    websocket.emit('ftp:subscribeAll')
  },

  unsubscribeFromAllFTP: () => {
    websocket.emit('ftp:unsubscribeAll')
  },

  // ==========================================================================
  // UTILITY
  // ==========================================================================

  clearError: () => set({ error: null }),

  clearSyncProgress: (sourceId) => {
    set((state) => {
      const newProgress = new Map(state.syncProgress)
      newProgress.delete(sourceId)
      return { syncProgress: newProgress }
    })
  },
}))

// =============================================================================
// WEBSOCKET EVENT HANDLERS
// =============================================================================

// Store unsubscribe functions for cleanup
let ftpWebSocketUnsubscribers: Array<() => void> = []

// Setup WebSocket event listeners for FTP sync
export function setupFTPWebSocketListeners() {
  // Clear any existing subscriptions first
  cleanupFTPWebSocketListeners()

  // Sync started
  ftpWebSocketUnsubscribers.push(
    websocket.subscribe('ftp:sync:started', (data: {
      syncId: string
      sourceId: string
      sourceName: string
      triggerType: TriggerType
      startedAt: string
    }) => {
      useFTPStore.setState((state) => {
        const newProgress = new Map(state.syncProgress)
        newProgress.set(data.sourceId, {
          syncId: data.syncId,
          sourceId: data.sourceId,
          sourceName: data.sourceName,
          status: 'running',
          phase: 'connecting',
          startedAt: data.startedAt,
        })
        return { syncProgress: newProgress, isSyncing: true }
      })
    })
  )

  // Sync progress
  ftpWebSocketUnsubscribers.push(
    websocket.subscribe('ftp:sync:progress', (data: {
      syncId: string
      sourceId: string
      sourceName: string
      phase: 'connecting' | 'listing' | 'detecting' | 'syncing' | 'completing'
      filesDiscovered?: number
      filesNew?: number
      filesModified?: number
      filesDeleted?: number
      filesProcessed?: number
      filesFailed?: number
      currentFile?: string
      percentage?: number
    }) => {
      useFTPStore.setState((state) => {
        const newProgress = new Map(state.syncProgress)
        const existing = newProgress.get(data.sourceId)
        newProgress.set(data.sourceId, {
          ...existing,
          ...data,
          status: 'running',
          startedAt: existing?.startedAt || new Date().toISOString(),
        })
        return { syncProgress: newProgress }
      })
    })
  )

  // File processed
  ftpWebSocketUnsubscribers.push(
    websocket.subscribe('ftp:sync:file:processed', (data: {
      syncId: string
      sourceId: string
      remotePath: string
      fileName: string
      status: 'synced' | 'skipped' | 'failed'
      changeType: 'new' | 'modified' | 'deleted' | 'unchanged'
      documentId?: string
      error?: string
    }) => {
      // Update progress with current file
      useFTPStore.setState((state) => {
        const newProgress = new Map(state.syncProgress)
        const existing = newProgress.get(data.sourceId)
        if (existing) {
          newProgress.set(data.sourceId, {
            ...existing,
            currentFile: data.fileName,
          })
        }
        return { syncProgress: newProgress }
      })
    })
  )

  // Sync completed
  ftpWebSocketUnsubscribers.push(
    websocket.subscribe('ftp:sync:completed', (data: {
      syncId: string
      sourceId: string
      sourceName: string
      status: 'success' | 'partial' | 'failed'
      filesNew: number
      filesModified: number
      filesDeleted: number
      filesFailed: number
      bytesTransferred: number
      durationMs: number
      completedAt: string
    }) => {
      useFTPStore.setState((state) => {
        const newProgress = new Map(state.syncProgress)
        const existing = newProgress.get(data.sourceId)
        newProgress.set(data.sourceId, {
          ...existing,
          syncId: data.syncId,
          sourceId: data.sourceId,
          sourceName: data.sourceName,
          status: data.status === 'success' ? 'completed' : data.status === 'partial' ? 'partial' : 'failed',
          phase: 'completing',
          filesNew: data.filesNew,
          filesModified: data.filesModified,
          filesDeleted: data.filesDeleted,
          filesFailed: data.filesFailed,
          percentage: 100,
          startedAt: existing?.startedAt || new Date().toISOString(),
        })

        // Update source last sync info
        const sources = state.sources.map((s) =>
          s.id === data.sourceId
            ? {
                ...s,
                lastSyncAt: data.completedAt,
                lastSyncStatus: data.status,
              }
            : s
        )

        return { syncProgress: newProgress, sources, isSyncing: false }
      })
    })
  )

  // Sync failed
  ftpWebSocketUnsubscribers.push(
    websocket.subscribe('ftp:sync:failed', (data: {
      syncId: string
      sourceId: string
      sourceName: string
      error: string
      failedAt: string
    }) => {
      useFTPStore.setState((state) => {
        const newProgress = new Map(state.syncProgress)
        const existing = newProgress.get(data.sourceId)
        newProgress.set(data.sourceId, {
          ...existing,
          syncId: data.syncId,
          sourceId: data.sourceId,
          sourceName: data.sourceName,
          status: 'failed',
          phase: 'completing',
          startedAt: existing?.startedAt || new Date().toISOString(),
        })

        // Update source last sync info
        const sources = state.sources.map((s) =>
          s.id === data.sourceId
            ? {
                ...s,
                lastSyncAt: data.failedAt,
                lastSyncStatus: 'failed' as const,
                lastSyncError: data.error,
              }
            : s
        )

        return { syncProgress: newProgress, sources, isSyncing: false, error: data.error }
      })
    })
  )

  // Schedule events
  ftpWebSocketUnsubscribers.push(
    websocket.subscribe('ftp:schedule:enabled', (data: {
      sourceId: string
      sourceName: string
      cronExpression: string
      nextRunAt: string
    }) => {
      useFTPStore.setState((state) => ({
        sources: state.sources.map((s) =>
          s.id === data.sourceId
            ? { ...s, scheduleEnabled: true, cronExpression: data.cronExpression, nextSyncAt: data.nextRunAt }
            : s
        ),
      }))
    })
  )

  ftpWebSocketUnsubscribers.push(
    websocket.subscribe('ftp:schedule:disabled', (data: {
      sourceId: string
      sourceName: string
    }) => {
      useFTPStore.setState((state) => ({
        sources: state.sources.map((s) =>
          s.id === data.sourceId
            ? { ...s, scheduleEnabled: false, nextSyncAt: undefined }
            : s
        ),
      }))
    })
  )

  ftpWebSocketUnsubscribers.push(
    websocket.subscribe('ftp:schedule:triggered', (data: {
      sourceId: string
      sourceName: string
      cronExpression: string
      timestamp: string
    }) => {
      // Schedule triggered - sync will start shortly
      console.log(`FTP schedule triggered for ${data.sourceName}`)
    })
  )

  ftpWebSocketUnsubscribers.push(
    websocket.subscribe('ftp:schedule:executed', (data: {
      sourceId: string
      sourceName: string
      syncId: string
      status: string
      nextRun: string | null
    }) => {
      useFTPStore.setState((state) => ({
        sources: state.sources.map((s) =>
          s.id === data.sourceId
            ? { ...s, nextSyncAt: data.nextRun || undefined }
            : s
        ),
      }))
    })
  )

  ftpWebSocketUnsubscribers.push(
    websocket.subscribe('ftp:schedule:error', (data: {
      sourceId: string
      sourceName: string
      error: string
    }) => {
      console.error(`FTP schedule error for ${data.sourceName}:`, data.error)
    })
  )
}

// Cleanup WebSocket listeners
export function cleanupFTPWebSocketListeners() {
  ftpWebSocketUnsubscribers.forEach((unsubscribe) => unsubscribe())
  ftpWebSocketUnsubscribers = []
}
