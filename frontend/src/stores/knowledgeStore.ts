/**
 * Knowledge Store - Frontend state management for RAG Knowledge Base
 *
 * Provides comprehensive state management for:
 * - Library CRUD operations
 * - Folder management
 * - Document management
 * - Document ingestion (file upload, web crawl, GitHub, manual)
 * - RAG queries and context generation
 * - Usage statistics
 */
import { create } from 'zustand'
import api from '../services/api'
import { extractErrorMessage } from '../lib/utils'

// =============================================================================
// TYPES
// =============================================================================

export interface KnowledgeLibrary {
  id: string
  name: string
  description?: string
  userId: string
  embeddingProvider: string
  embeddingModel: string
  chunkSize: number
  chunkOverlap: number
  chunkingStrategy: 'fixed_size' | 'sentence' | 'paragraph' | 'semantic' | 'recursive'
  documentCount: number
  totalChunks: number
  totalSize: number
  createdAt: string
  updatedAt: string
  autoIngest?: {
    enabled: boolean
    keywords: string[]
    sources: string[]
  }
}

export interface KnowledgeFolder {
  id: string
  libraryId: string
  name: string
  parentId?: string
  documentCount: number
  createdAt: string
}

export interface KnowledgeDocument {
  id: string
  libraryId: string
  folderId?: string
  fileName: string
  sourceType: 'upload' | 'web' | 'github' | 'manual' | 'api'
  sourceUrl?: string
  mimeType?: string
  size: number
  chunkCount: number
  status: 'pending' | 'processing' | 'indexed' | 'failed' | 'expired'
  errorMessage?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface IngestionProgress {
  documentId: string
  stage: 'uploading' | 'parsing' | 'chunking' | 'embedding' | 'indexing' | 'complete' | 'failed'
  progress: number // 0-100
  message?: string
  error?: string
}

export interface IngestionResult {
  documentId: string
  libraryId: string
  status: 'processing' | 'indexed' | 'failed'
  chunkCount?: number
  message?: string
}

export interface RAGQueryResult {
  id: string
  text: string
  score: number
  document: {
    id: string
    fileName: string
    sourceType: string
    libraryId: string
    folderId?: string
  }
  metadata?: Record<string, unknown>
}

export interface RAGQueryResponse {
  query: string
  results: RAGQueryResult[]
  totalFound: number
  searchTimeMs: number
}

export interface ContextGenerationResult {
  context: string
  chunksUsed: number
  tokensUsed: number
  sources: Array<{
    documentId: string
    fileName: string
    chunkId: string
  }>
}

export interface KnowledgeStatistics {
  totalLibraries: number
  totalDocuments: number
  totalChunks: number
  totalSize: number
  queriesExecuted: number
  averageQueryTime: number
  libraryStats: Array<{
    libraryId: string
    libraryName: string
    documentCount: number
    chunkCount: number
    size: number
  }>
}

// Auto-ingest configuration
export interface AutoIngestConfig {
  enabled: boolean
  keywords: string[]
  sources: Array<'@newsletter' | '@broadcast' | '@channel' | 'group' | 'direct'>
}

// Request types
export interface CreateLibraryRequest {
  name: string
  description?: string
  embeddingProvider?: string
  embeddingModel?: string
  chunkSize?: number
  chunkOverlap?: number
  chunkingStrategy?: 'fixed_size' | 'sentence' | 'paragraph' | 'semantic' | 'recursive'
  autoIngest?: AutoIngestConfig
}

export interface CreateFolderRequest {
  name: string
  parentId?: string
}

export interface WebIngestionRequest {
  url: string
  crawlDepth?: number
  maxPages?: number
  includePatterns?: string[]
  excludePatterns?: string[]
  respectRobotsTxt?: boolean
  rateLimit?: number
  folderId?: string
  options?: IngestionOptions
}

export interface GitHubIngestionRequest {
  repoUrl: string
  branch?: string
  token?: string
  includePaths?: string[]
  excludePaths?: string[]
  fileExtensions?: string[]
  folderId?: string
  options?: IngestionOptions
}

export interface ManualIngestionRequest {
  type: 'qa' | 'text' | 'markdown'
  content: string
  title?: string
  qaPairs?: Array<{
    question: string
    answer: string
    tags?: string[]
  }>
  folderId?: string
  options?: IngestionOptions
}

export interface IngestionOptions {
  enableOCR?: boolean
  extractTables?: boolean
  preserveFormatting?: boolean
  customMetadata?: Record<string, unknown>
  expiresAt?: string
}

export interface RAGQueryRequest {
  query: string
  libraryIds: string[]
  topK?: number
  scoreThreshold?: number
  filters?: {
    documentIds?: string[]
    folderIds?: string[]
    fileTypes?: string[]
    dateRange?: {
      start: string
      end: string
    }
    metadata?: Record<string, unknown>
  }
  options?: {
    includeMetadata?: boolean
    includeScores?: boolean
    includeContent?: boolean
    rerank?: boolean
    rerankModel?: string
    hybridSearch?: boolean
    hybridAlpha?: number
    maxTokens?: number
  }
}

export interface ContextGenerationRequest {
  query: string
  config: {
    enabled?: boolean
    libraryIds: string[]
    topK?: number
    scoreThreshold?: number
    maxTokens?: number
    template?: string
    position?: 'before_system' | 'after_system' | 'before_user' | 'after_user'
    separator?: string
    includeSource?: boolean
  }
}

// =============================================================================
// AUDIT TYPES
// =============================================================================

export interface IngestionHistoryItem {
  id: string
  documentId: string
  libraryId: string
  libraryName: string
  libraryKeywords: string[]
  documentTitle: string
  documentStatus: string
  documentPreview: string | null
  source: string
  sourceName: string | null
  reliabilityScore: number | null
  matchScore: number | null
  createdAt: string
  documentCreatedAt: string
}

export interface LibraryMatch {
  libraryId: string
  libraryName: string
  description: string | null
  autoIngestEnabled: boolean
  keywords: string[]
  matchedKeywords: string[]
  matchScore: number
  keywordScore?: number   // 75% weight
  nameScore?: number      // 10% weight
  descScore?: number      // 15% weight
  isCurrentLibrary: boolean
}

export interface UncategorizedLibrary {
  id: string
  name: string
  description: string
}

export interface RecheckResult {
  document: {
    id: string
    title: string
    contentPreview: string
    currentLibraryId: string
  }
  currentLibrary: LibraryMatch | null
  bestMatch: LibraryMatch | null
  isMismatched: boolean
  noMatch: boolean
  uncategorizedLibrary: UncategorizedLibrary | null
  minimumThreshold: number
  suggestion: string | null
  allMatches: LibraryMatch[]
}

export interface BulkRecheckResult {
  total: number
  correct: number
  mismatched: number
  suggestions: Array<{
    documentId: string
    documentTitle: string
    currentLibraryId: string
    currentLibraryName: string
    currentScore: number
    suggestedLibraryId: string
    suggestedLibraryName: string
    suggestedScore: number
  }>
}

// =============================================================================
// STORE STATE INTERFACE
// =============================================================================

interface KnowledgeState {
  // State
  libraries: KnowledgeLibrary[]
  currentLibrary: KnowledgeLibrary | null
  folders: KnowledgeFolder[]
  documents: KnowledgeDocument[]
  statistics: KnowledgeStatistics | null
  ingestionProgress: Map<string, IngestionProgress>
  queryResults: RAGQueryResponse | null

  // Loading states
  isLoading: boolean
  isIngesting: boolean
  isQuerying: boolean
  error: string | null

  // Library actions
  fetchLibraries: () => Promise<void>
  fetchLibrary: (id: string) => Promise<KnowledgeLibrary>
  createLibrary: (data: CreateLibraryRequest) => Promise<KnowledgeLibrary>
  updateLibrary: (id: string, updates: Partial<CreateLibraryRequest>) => Promise<KnowledgeLibrary>
  deleteLibrary: (id: string) => Promise<void>
  setCurrentLibrary: (library: KnowledgeLibrary | null) => void

  // Folder actions
  fetchFolders: (libraryId: string, parentId?: string) => Promise<void>
  createFolder: (libraryId: string, data: CreateFolderRequest) => Promise<KnowledgeFolder>
  deleteFolder: (folderId: string) => Promise<void>

  // Document actions
  fetchDocuments: (libraryId: string, options?: { folderId?: string; status?: string; limit?: number; offset?: number }) => Promise<void>
  getDocument: (documentId: string) => Promise<KnowledgeDocument>
  getDocumentContent: (documentId: string) => Promise<{ id: string; title: string; content: string; sourceType: string; createdAt: string }>
  deleteDocument: (documentId: string) => Promise<void>
  bulkDeleteDocuments: (options: { documentIds?: string[]; status?: string; libraryId?: string }) => Promise<{ deletedCount: number }>

  // Ingestion actions
  uploadFile: (libraryId: string, file: File, folderId?: string, options?: IngestionOptions, onProgress?: (progress: number) => void) => Promise<IngestionResult>
  uploadLargeFile: (libraryId: string, file: File, folderId?: string, options?: IngestionOptions, onProgress?: (progress: number, stage: string) => void) => Promise<IngestionResult>
  splitUploadPdf: (libraryId: string, file: File, folderId?: string, options?: { pagesPerSplit?: number; targetSizeMB?: number; ocrLanguages?: string }, onProgress?: (progress: number, stage: string) => void) => Promise<{ success: boolean; splitUsed: boolean; totalParts: number; documents: unknown[] }>
  getPdfInfo: (file: File) => Promise<{ pageCount: number; fileSizeMB: number; recommendations: { splitRecommended: boolean; estimatedParts: number } }>
  ingestWeb: (libraryId: string, data: WebIngestionRequest) => Promise<IngestionResult>
  ingestGitHub: (libraryId: string, data: GitHubIngestionRequest) => Promise<IngestionResult>
  ingestManual: (libraryId: string, data: ManualIngestionRequest) => Promise<IngestionResult>
  getIngestionProgress: (documentId: string) => Promise<IngestionProgress>
  pollIngestionProgress: (documentId: string, interval?: number) => () => void

  // Query actions
  query: (data: RAGQueryRequest) => Promise<RAGQueryResponse>
  generateContext: (data: ContextGenerationRequest) => Promise<ContextGenerationResult>

  // Statistics actions
  fetchStatistics: () => Promise<void>

  // Audit actions
  auditHistory: IngestionHistoryItem[]
  auditTotal: number
  isAuditing: boolean
  fetchIngestionHistory: (options?: { limit?: number; offset?: number; libraryId?: string }) => Promise<void>
  recheckDocument: (documentId: string) => Promise<RecheckResult>
  moveDocument: (documentId: string, targetLibraryId: string) => Promise<void>
  bulkRecheck: (libraryId?: string) => Promise<BulkRecheckResult>

  // Utility
  clearError: () => void
  clearQueryResults: () => void
  clearAuditHistory: () => void
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  // Initial state
  libraries: [],
  currentLibrary: null,
  folders: [],
  documents: [],
  statistics: null,
  ingestionProgress: new Map(),
  queryResults: null,
  auditHistory: [],
  auditTotal: 0,
  isLoading: false,
  isIngesting: false,
  isQuerying: false,
  isAuditing: false,
  error: null,

  // ==========================================================================
  // LIBRARY ACTIONS
  // ==========================================================================

  fetchLibraries: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get('/knowledge/libraries')
      const libraries = Array.isArray(response.data) ? response.data : (response.data?.libraries || [])
      set({ libraries, isLoading: false })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch libraries')
      set({ error: errorMessage, isLoading: false })
    }
  },

  fetchLibrary: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get(`/knowledge/libraries/${id}`)
      const library = response.data
      set({ currentLibrary: library, isLoading: false })
      return library
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch library')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  createLibrary: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/knowledge/libraries', data)
      const newLibrary = response.data
      set((state) => ({
        libraries: [...state.libraries, newLibrary],
        isLoading: false,
      }))
      return newLibrary
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to create library')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  updateLibrary: async (id, updates) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.patch(`/knowledge/libraries/${id}`, updates)
      const updatedLibrary = response.data
      set((state) => ({
        libraries: state.libraries.map((lib) => (lib.id === id ? updatedLibrary : lib)),
        currentLibrary: state.currentLibrary?.id === id ? updatedLibrary : state.currentLibrary,
        isLoading: false,
      }))
      return updatedLibrary
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to update library')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  deleteLibrary: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await api.delete(`/knowledge/libraries/${id}`)
      set((state) => ({
        libraries: state.libraries.filter((lib) => lib.id !== id),
        currentLibrary: state.currentLibrary?.id === id ? null : state.currentLibrary,
        isLoading: false,
      }))
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to delete library')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  setCurrentLibrary: (library) => set({ currentLibrary: library }),

  // ==========================================================================
  // FOLDER ACTIONS
  // ==========================================================================

  fetchFolders: async (libraryId, parentId) => {
    set({ isLoading: true, error: null })
    try {
      const url = parentId
        ? `/knowledge/libraries/${libraryId}/folders?parentId=${parentId}`
        : `/knowledge/libraries/${libraryId}/folders`
      const response = await api.get(url)
      const folders = Array.isArray(response.data) ? response.data : (response.data?.folders || [])
      set({ folders, isLoading: false })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch folders')
      set({ error: errorMessage, isLoading: false })
    }
  },

  createFolder: async (libraryId, data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post(`/knowledge/libraries/${libraryId}/folders`, data)
      const newFolder = response.data
      set((state) => ({
        folders: [...state.folders, newFolder],
        isLoading: false,
      }))
      return newFolder
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to create folder')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  deleteFolder: async (folderId) => {
    set({ isLoading: true, error: null })
    try {
      await api.delete(`/knowledge/folders/${folderId}`)
      set((state) => ({
        folders: state.folders.filter((f) => f.id !== folderId),
        isLoading: false,
      }))
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to delete folder')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  // ==========================================================================
  // DOCUMENT ACTIONS
  // ==========================================================================

  fetchDocuments: async (libraryId, options = {}) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (options.folderId) params.append('folderId', options.folderId)
      if (options.status) params.append('status', options.status)
      if (options.limit) params.append('limit', options.limit.toString())
      if (options.offset) params.append('offset', options.offset.toString())

      const url = `/knowledge/libraries/${libraryId}/documents${params.toString() ? `?${params}` : ''}`
      const response = await api.get(url)
      const documents = Array.isArray(response.data) ? response.data : (response.data?.documents || [])
      set({ documents, isLoading: false })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch documents')
      set({ error: errorMessage, isLoading: false })
    }
  },

  getDocument: async (documentId) => {
    try {
      const response = await api.get(`/knowledge/documents/${documentId}`)
      return response.data
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to get document')
      set({ error: errorMessage })
      throw error
    }
  },

  getDocumentContent: async (documentId) => {
    try {
      const response = await api.get(`/knowledge/documents/${documentId}/content`)
      return response.data
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to get document content')
      set({ error: errorMessage })
      throw error
    }
  },

  deleteDocument: async (documentId) => {
    set({ isLoading: true, error: null })
    try {
      await api.delete(`/knowledge/documents/${documentId}`)
      set((state) => ({
        documents: state.documents.filter((d) => d.id !== documentId),
        isLoading: false,
      }))
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to delete document')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  bulkDeleteDocuments: async (options) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/knowledge/documents/bulk-delete', options)
      const { deletedCount } = response.data

      // Remove deleted documents from state
      if (options.documentIds) {
        set((state) => ({
          documents: state.documents.filter((d) => !options.documentIds!.includes(d.id)),
          isLoading: false,
        }))
      } else if (options.status) {
        // If deleting by status, filter out documents matching that status
        set((state) => ({
          documents: options.libraryId
            ? state.documents.filter((d) => !(d.libraryId === options.libraryId && d.status === options.status))
            : state.documents.filter((d) => d.status !== options.status),
          isLoading: false,
        }))
      } else {
        set({ isLoading: false })
      }

      return { deletedCount }
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to bulk delete documents')
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  // ==========================================================================
  // INGESTION ACTIONS
  // ==========================================================================

  uploadFile: async (libraryId, file, folderId, options, onProgress) => {
    // For files > 10MB, automatically use chunked upload
    const TEN_MB = 10 * 1024 * 1024
    if (file.size > TEN_MB) {
      return get().uploadLargeFile(libraryId, file, folderId, options, onProgress ? (p) => onProgress(p) : undefined)
    }

    set({ isIngesting: true, error: null })
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (folderId) formData.append('folderId', folderId)
      if (options) formData.append('options', JSON.stringify(options))

      const response = await api.post(`/knowledge/libraries/${libraryId}/ingest/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress(progress)
          }
        },
      })

      set({ isIngesting: false })
      return response.data
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to upload file')
      set({ error: errorMessage, isIngesting: false })
      throw error
    }
  },

  // Chunked upload for large files (>10MB)
  uploadLargeFile: async (libraryId, file, folderId, options, onProgress) => {
    set({ isIngesting: true, error: null })

    const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

    try {
      // Step 1: Initialize upload session
      if (onProgress) onProgress(0, 'Initializing upload...')

      const initResponse = await api.post('/knowledge/chunked-upload/init', {
        fileName: file.name,
        fileSize: file.size,
        totalChunks,
        libraryId,
        folderId,
        options: options ? JSON.stringify(options) : undefined
      })

      const { uploadId } = initResponse.data

      // Step 2: Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const chunk = file.slice(start, end)

        const formData = new FormData()
        formData.append('chunk', chunk)
        formData.append('chunkIndex', String(i))

        await api.post(`/knowledge/chunked-upload/${uploadId}/chunk`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        // Progress: upload phase is 0-80%, processing is 80-100%
        const uploadProgress = Math.round(((i + 1) / totalChunks) * 80)
        if (onProgress) onProgress(uploadProgress, `Uploading chunk ${i + 1}/${totalChunks}`)
      }

      // Step 3: Complete and process
      if (onProgress) onProgress(85, 'Processing file...')

      const completeResponse = await api.post(`/knowledge/chunked-upload/${uploadId}/complete`)

      if (onProgress) onProgress(100, 'Complete')

      set({ isIngesting: false })
      return completeResponse.data
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to upload large file')
      set({ error: errorMessage, isIngesting: false })
      throw error
    }
  },

  // Split large PDF into multiple documents
  splitUploadPdf: async (libraryId, file, folderId, options, onProgress) => {
    set({ isIngesting: true, error: null })

    try {
      if (onProgress) onProgress(0, 'Preparing PDF for split...')

      const formData = new FormData()
      formData.append('file', file)
      if (folderId) formData.append('folderId', folderId)
      if (options) formData.append('options', JSON.stringify(options))

      if (onProgress) onProgress(10, 'Uploading PDF...')

      const response = await api.post(`/knowledge/libraries/${libraryId}/ingest/split-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000, // 10 minutes for large PDFs
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            // Upload phase is 10-50%
            const uploadProgress = 10 + Math.round((progressEvent.loaded / progressEvent.total) * 40)
            onProgress(uploadProgress, 'Uploading PDF...')
          }
        }
      })

      if (onProgress) onProgress(100, 'Complete')

      set({ isIngesting: false })
      return response.data
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to split and upload PDF')
      set({ error: errorMessage, isIngesting: false })
      throw error
    }
  },

  // Get PDF info to decide if split is needed
  getPdfInfo: async (file) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post('/knowledge/pdf/info', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      return response.data
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to get PDF info')
      throw new Error(errorMessage)
    }
  },

  ingestWeb: async (libraryId, data) => {
    set({ isIngesting: true, error: null })
    try {
      const response = await api.post(`/knowledge/libraries/${libraryId}/ingest/web`, data)
      set({ isIngesting: false })
      return response.data
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to ingest web content')
      set({ error: errorMessage, isIngesting: false })
      throw error
    }
  },

  ingestGitHub: async (libraryId, data) => {
    set({ isIngesting: true, error: null })
    try {
      const response = await api.post(`/knowledge/libraries/${libraryId}/ingest/github`, data)
      set({ isIngesting: false })
      return response.data
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to ingest GitHub content')
      set({ error: errorMessage, isIngesting: false })
      throw error
    }
  },

  ingestManual: async (libraryId, data) => {
    set({ isIngesting: true, error: null })
    try {
      const response = await api.post(`/knowledge/libraries/${libraryId}/ingest/manual`, data)
      set({ isIngesting: false })
      return response.data
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to ingest manual content')
      set({ error: errorMessage, isIngesting: false })
      throw error
    }
  },

  getIngestionProgress: async (documentId) => {
    try {
      const response = await api.get(`/knowledge/ingestion/${documentId}/progress`)
      const progress = response.data as IngestionProgress

      set((state) => {
        const newProgress = new Map(state.ingestionProgress)
        newProgress.set(documentId, progress)
        return { ingestionProgress: newProgress }
      })

      return progress
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to get ingestion progress')
      set({ error: errorMessage })
      throw error
    }
  },

  pollIngestionProgress: (documentId, interval = 2000) => {
    let timerId: ReturnType<typeof setInterval> | null = null

    const poll = async () => {
      try {
        const progress = await get().getIngestionProgress(documentId)

        if (progress.stage === 'complete' || progress.stage === 'failed') {
          if (timerId) {
            clearInterval(timerId)
            timerId = null
          }
        }
      } catch {
        // Stop polling on error
        if (timerId) {
          clearInterval(timerId)
          timerId = null
        }
      }
    }

    // Initial poll
    poll()

    // Set up interval
    timerId = setInterval(poll, interval)

    // Return cleanup function
    return () => {
      if (timerId) {
        clearInterval(timerId)
        timerId = null
      }
    }
  },

  // ==========================================================================
  // QUERY ACTIONS
  // ==========================================================================

  query: async (data) => {
    set({ isQuerying: true, error: null })
    try {
      const response = await api.post('/knowledge/query', data)
      const results = response.data as RAGQueryResponse
      set({ queryResults: results, isQuerying: false })
      return results
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to execute query')
      set({ error: errorMessage, isQuerying: false })
      throw error
    }
  },

  generateContext: async (data) => {
    set({ isQuerying: true, error: null })
    try {
      const response = await api.post('/knowledge/context', data)
      set({ isQuerying: false })
      return response.data as ContextGenerationResult
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to generate context')
      set({ error: errorMessage, isQuerying: false })
      throw error
    }
  },

  // ==========================================================================
  // STATISTICS ACTIONS
  // ==========================================================================

  fetchStatistics: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get('/knowledge/statistics')
      set({ statistics: response.data, isLoading: false })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch statistics')
      set({ error: errorMessage, isLoading: false })
    }
  },

  // ==========================================================================
  // AUDIT ACTIONS
  // ==========================================================================

  fetchIngestionHistory: async (options = {}) => {
    set({ isAuditing: true, error: null })
    try {
      const params = new URLSearchParams()
      if (options.limit) params.append('limit', String(options.limit))
      if (options.offset) params.append('offset', String(options.offset))
      if (options.libraryId) params.append('libraryId', options.libraryId)

      const response = await api.get(`/knowledge/audit/ingestion-history?${params.toString()}`)
      set({
        auditHistory: response.data.history || [],
        auditTotal: response.data.total || 0,
        isAuditing: false,
      })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch ingestion history')
      set({ error: errorMessage, isAuditing: false })
    }
  },

  recheckDocument: async (documentId) => {
    set({ isAuditing: true, error: null })
    try {
      const response = await api.post(`/knowledge/audit/recheck/${documentId}`)
      set({ isAuditing: false })
      return response.data
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to recheck document')
      set({ error: errorMessage, isAuditing: false })
      throw error
    }
  },

  moveDocument: async (documentId, targetLibraryId) => {
    set({ isAuditing: true, error: null })
    try {
      await api.post('/knowledge/audit/move', { documentId, targetLibraryId })
      // Refresh history after move
      await get().fetchIngestionHistory()
      set({ isAuditing: false })
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to move document')
      set({ error: errorMessage, isAuditing: false })
      throw error
    }
  },

  bulkRecheck: async (libraryId) => {
    set({ isAuditing: true, error: null })
    try {
      const response = await api.post('/knowledge/audit/bulk-recheck', { libraryId })
      set({ isAuditing: false })
      return response.data
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error, 'Failed to bulk recheck')
      set({ error: errorMessage, isAuditing: false })
      throw error
    }
  },

  // ==========================================================================
  // UTILITY ACTIONS
  // ==========================================================================

  clearError: () => set({ error: null }),

  clearQueryResults: () => set({ queryResults: null }),

  clearAuditHistory: () => set({ auditHistory: [], auditTotal: 0 }),
}))
