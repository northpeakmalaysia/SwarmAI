import { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload,
  FileText,
  Trash2,
  Search,
  Database,
  Loader2,
  Plus,
  FolderPlus,
  Folder,
  FolderOpen,
  Globe,
  Github,
  Edit3,
  BarChart3,
  Library,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Settings2,
  X,
  Server,
  CheckSquare,
  Square,
  Filter,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Eye,
  Download,
  Copy,
  ClipboardCheck,
  ArrowRight,
  MoveRight,
  AlertTriangle,
  FolderInput,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Tabs, ConfirmDialog, Modal, Badge } from '../components/common'
import {
  useKnowledgeStore,
  type KnowledgeLibrary,
  type KnowledgeFolder,
  type KnowledgeDocument,
  type IngestionProgress,
  type IngestionHistoryItem,
  type RecheckResult,
  type BulkRecheckResult,
} from '../stores/knowledgeStore'
import { useFTPStore, type FTPSource } from '../stores/ftpStore'
import { useDatabaseSourceStore, type DatabaseSource } from '../stores/databaseSourceStore'
import FTPIngestionModal from '../components/knowledge/FTPIngestionModal'
import FTPSourceList from '../components/knowledge/FTPSourceList'
import DatabaseIngestionModal from '../components/knowledge/DatabaseIngestionModal'
import DatabaseSourceList from '../components/knowledge/DatabaseSourceList'
import { formatDate } from '@/utils/dateFormat'

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const getStatusColor = (status: KnowledgeDocument['status']): string => {
  switch (status) {
    case 'indexed': return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'processing': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'pending': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'expired': return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

const getProgressStageLabel = (stage: IngestionProgress['stage']): string => {
  switch (stage) {
    case 'uploading': return 'Uploading...'
    case 'parsing': return 'Parsing document...'
    case 'chunking': return 'Chunking content...'
    case 'embedding': return 'Generating embeddings...'
    case 'indexing': return 'Indexing vectors...'
    case 'complete': return 'Complete'
    case 'failed': return 'Failed'
    default: return 'Processing...'
  }
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface CreateLibraryModalProps {
  open: boolean
  onClose: () => void
}

function CreateLibraryModal({ open, onClose }: CreateLibraryModalProps) {
  const { createLibrary, isLoading } = useKnowledgeStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [chunkSize, setChunkSize] = useState(512)
  const [chunkOverlap, setChunkOverlap] = useState(50)
  const [chunkingStrategy, setChunkingStrategy] = useState<'fixed_size' | 'sentence' | 'paragraph' | 'semantic' | 'recursive'>('recursive')

  // Auto-ingest settings
  const [autoIngestEnabled, setAutoIngestEnabled] = useState(false)
  const [keywords, setKeywords] = useState('')
  const [selectedSources, setSelectedSources] = useState<string[]>(['@newsletter', '@broadcast'])

  const availableSources = [
    { value: '@newsletter', label: 'Newsletter' },
    { value: '@broadcast', label: 'Broadcast' },
    { value: '@channel', label: 'Channel' },
    { value: 'group', label: 'Group Chat' },
    { value: 'direct', label: 'Direct Message' },
  ]

  const handleSourceToggle = (source: string) => {
    setSelectedSources(prev =>
      prev.includes(source)
        ? prev.filter(s => s !== source)
        : [...prev, source]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Library name is required')
      return
    }

    // Parse keywords from comma-separated string
    const keywordList = keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)

    if (autoIngestEnabled && keywordList.length === 0) {
      toast.error('Please add at least one keyword for auto-ingestion')
      return
    }

    try {
      await createLibrary({
        name: name.trim(),
        description: description.trim() || undefined,
        chunkSize,
        chunkOverlap,
        chunkingStrategy,
        autoIngest: autoIngestEnabled ? {
          enabled: true,
          keywords: keywordList,
          sources: selectedSources as Array<'@newsletter' | '@broadcast' | '@channel' | 'group' | 'direct'>,
        } : undefined,
      })
      toast.success('Library created successfully')
      setName('')
      setDescription('')
      setKeywords('')
      setAutoIngestEnabled(false)
      onClose()
    } catch {
      toast.error('Failed to create library')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Knowledge Library" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Product Documentation"
            className="input w-full"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the purpose of this library..."
            className="input w-full h-20 resize-none"
          />
        </div>

        {/* Auto-Ingest Settings */}
        <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <label className="block text-sm font-medium text-white">Auto-Ingest from Messages</label>
              <p className="text-xs text-gray-500">Automatically save newsletter/broadcast content to this library</p>
            </div>
            <button
              type="button"
              onClick={() => setAutoIngestEnabled(!autoIngestEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoIngestEnabled ? 'bg-primary-500' : 'bg-slate-600'
              }`}
              role="switch"
              aria-checked={autoIngestEnabled ? 'true' : 'false'}
              aria-label="Toggle auto-ingest"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoIngestEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {autoIngestEnabled && (
            <div className="space-y-4 mt-4 pt-4 border-t border-slate-700">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Keywords (comma-separated) *
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g., Palestine, Gaza, Israel, war, conflict"
                  className="input w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Content matching these keywords will be auto-saved to this library
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Message Sources
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableSources.map(source => (
                    <button
                      key={source.value}
                      type="button"
                      onClick={() => handleSourceToggle(source.value)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        selectedSources.includes(source.value)
                          ? 'bg-primary-500/20 text-primary-400 border-primary-500/50'
                          : 'bg-slate-700 text-gray-400 border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      {source.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Select which message sources to monitor for auto-ingestion
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
          <ChevronRight className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
        </button>

        {showAdvanced && (
          <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Chunking Strategy
              </label>
              <select
                value={chunkingStrategy}
                onChange={(e) => setChunkingStrategy(e.target.value as typeof chunkingStrategy)}
                className="input w-full"
                aria-label="Chunking Strategy"
              >
                <option value="recursive">Recursive (Recommended)</option>
                <option value="fixed_size">Fixed Size</option>
                <option value="sentence">By Sentence</option>
                <option value="paragraph">By Paragraph</option>
                <option value="semantic">Semantic</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Chunk Size (tokens)
                </label>
                <input
                  type="number"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                  min={100}
                  max={4000}
                  className="input w-full"
                  aria-label="Chunk size in tokens"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Chunk Overlap
                </label>
                <input
                  type="number"
                  value={chunkOverlap}
                  onChange={(e) => setChunkOverlap(Number(e.target.value))}
                  min={0}
                  max={500}
                  className="input w-full"
                  aria-label="Chunk overlap"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Create Library
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface EditLibraryModalProps {
  open: boolean
  onClose: () => void
  library: KnowledgeLibrary | null
}

function EditLibraryModal({ open, onClose, library }: EditLibraryModalProps) {
  const { updateLibrary, isLoading } = useKnowledgeStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Auto-ingest settings
  const [autoIngestEnabled, setAutoIngestEnabled] = useState(false)
  const [keywords, setKeywords] = useState('')
  const [selectedSources, setSelectedSources] = useState<string[]>([])

  const availableSources = [
    { value: '@newsletter', label: 'Newsletter' },
    { value: '@broadcast', label: 'Broadcast' },
    { value: '@channel', label: 'Channel' },
    { value: 'group', label: 'Group Chat' },
    { value: 'direct', label: 'Direct Message' },
  ]

  // Reset form when library changes
  useEffect(() => {
    if (library) {
      setName(library.name || '')
      setDescription(library.description || '')
      setAutoIngestEnabled(library.autoIngest?.enabled || false)
      setKeywords((library.autoIngest?.keywords || []).join(', '))
      setSelectedSources(library.autoIngest?.sources || ['@newsletter', '@broadcast'])
    }
  }, [library])

  const handleSourceToggle = (source: string) => {
    setSelectedSources(prev =>
      prev.includes(source)
        ? prev.filter(s => s !== source)
        : [...prev, source]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!library || !name.trim()) {
      toast.error('Library name is required')
      return
    }

    // Parse keywords from comma-separated string
    const keywordList = keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)

    if (autoIngestEnabled && keywordList.length === 0) {
      toast.error('Please add at least one keyword for auto-ingestion')
      return
    }

    try {
      await updateLibrary(library.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        autoIngest: {
          enabled: autoIngestEnabled,
          keywords: keywordList,
          sources: selectedSources as Array<'@newsletter' | '@broadcast' | '@channel' | 'group' | 'direct'>,
        },
      })
      toast.success('Library updated successfully')
      onClose()
    } catch {
      toast.error('Failed to update library')
    }
  }

  if (!library) return null

  return (
    <Modal open={open} onClose={onClose} title="Edit Library" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Product Documentation"
            className="input w-full"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the purpose of this library..."
            className="input w-full h-20 resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            This description helps the AI match content to this library
          </p>
        </div>

        {/* Auto-Ingest Settings */}
        <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <label className="block text-sm font-medium text-white">Auto-Ingest from Messages</label>
              <p className="text-xs text-gray-500">Automatically save newsletter/broadcast content to this library</p>
            </div>
            <button
              type="button"
              onClick={() => setAutoIngestEnabled(!autoIngestEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoIngestEnabled ? 'bg-primary-500' : 'bg-slate-600'
              }`}
              role="switch"
              aria-checked={autoIngestEnabled}
              aria-label="Toggle auto-ingest"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoIngestEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {autoIngestEnabled && (
            <div className="space-y-4 mt-4 pt-4 border-t border-slate-700">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Keywords (comma-separated) *
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g., Palestine, Gaza, Israel, war, conflict"
                  className="input w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Content matching these keywords will be auto-saved to this library
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Message Sources
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableSources.map(source => (
                    <button
                      key={source.value}
                      type="button"
                      onClick={() => handleSourceToggle(source.value)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        selectedSources.includes(source.value)
                          ? 'bg-primary-500/20 text-primary-400 border-primary-500/50'
                          : 'bg-slate-700 text-gray-400 border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      {source.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Select which message sources to monitor for auto-ingestion
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface IngestionProgressBarProps {
  progress: IngestionProgress
  onClose?: () => void
}

function IngestionProgressBar({ progress, onClose }: IngestionProgressBarProps) {
  const isComplete = progress.stage === 'complete'
  const isFailed = progress.stage === 'failed'

  return (
    <div className={`p-4 rounded-lg border ${
      isFailed ? 'bg-red-500/10 border-red-500/30' :
      isComplete ? 'bg-green-500/10 border-green-500/30' :
      'bg-blue-500/10 border-blue-500/30'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isFailed ? (
            <AlertCircle className="w-4 h-4 text-red-400" />
          ) : isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          )}
          <span className="text-sm font-medium text-white">
            {getProgressStageLabel(progress.stage)}
          </span>
        </div>
        {onClose && (isComplete || isFailed) && (
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!isComplete && !isFailed && (
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      )}

      {progress.message && (
        <p className="mt-2 text-xs text-gray-400">{progress.message}</p>
      )}
      {progress.error && (
        <p className="mt-2 text-xs text-red-400">{progress.error}</p>
      )}
    </div>
  )
}

interface WebIngestionModalProps {
  open: boolean
  onClose: () => void
  libraryId: string
}

function WebIngestionModal({ open, onClose, libraryId }: WebIngestionModalProps) {
  const { ingestWeb, isIngesting, pollIngestionProgress } = useKnowledgeStore()
  const [url, setUrl] = useState('')
  const [crawlDepth, setCrawlDepth] = useState(1)
  const [maxPages, setMaxPages] = useState(10)
  const [progress, setProgress] = useState<IngestionProgress | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) {
      toast.error('URL is required')
      return
    }

    try {
      const result = await ingestWeb(libraryId, {
        url: url.trim(),
        crawlDepth,
        maxPages,
        respectRobotsTxt: true,
      })

      // Start polling for progress
      const cleanup = pollIngestionProgress(result.documentId, 1000)

      // Track progress updates
      const checkProgress = setInterval(() => {
        const currentProgress = useKnowledgeStore.getState().ingestionProgress.get(result.documentId)
        if (currentProgress) {
          setProgress(currentProgress)
          if (currentProgress.stage === 'complete' || currentProgress.stage === 'failed') {
            clearInterval(checkProgress)
            cleanup()
            if (currentProgress.stage === 'complete') {
              toast.success('Web content ingested successfully')
            }
          }
        }
      }, 500)

      toast.success('Web ingestion started')
    } catch {
      toast.error('Failed to start web ingestion')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ingest Web Content" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">URL *</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.example.com"
            className="input w-full"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Crawl Depth</label>
            <input
              type="number"
              value={crawlDepth}
              onChange={(e) => setCrawlDepth(Number(e.target.value))}
              min={1}
              max={5}
              className="input w-full"
              aria-label="Crawl depth"
            />
            <p className="text-xs text-gray-500 mt-1">How many links deep to crawl</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Max Pages</label>
            <input
              type="number"
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              min={1}
              max={100}
              className="input w-full"
              aria-label="Maximum pages"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum pages to index</p>
          </div>
        </div>

        {progress && <IngestionProgressBar progress={progress} onClose={() => setProgress(null)} />}

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isIngesting} className="btn-primary">
            {isIngesting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Globe className="w-4 h-4 mr-2" />}
            Start Ingestion
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface GitHubIngestionModalProps {
  open: boolean
  onClose: () => void
  libraryId: string
}

function GitHubIngestionModal({ open, onClose, libraryId }: GitHubIngestionModalProps) {
  const { ingestGitHub, isIngesting, pollIngestionProgress } = useKnowledgeStore()
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [fileExtensions, setFileExtensions] = useState('.md,.txt,.mdx')
  const [progress, setProgress] = useState<IngestionProgress | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repoUrl.trim()) {
      toast.error('Repository URL is required')
      return
    }

    try {
      const result = await ingestGitHub(libraryId, {
        repoUrl: repoUrl.trim(),
        branch,
        fileExtensions: fileExtensions.split(',').map(ext => ext.trim()),
      })

      // Start polling for progress
      const cleanup = pollIngestionProgress(result.documentId, 1000)

      const checkProgress = setInterval(() => {
        const currentProgress = useKnowledgeStore.getState().ingestionProgress.get(result.documentId)
        if (currentProgress) {
          setProgress(currentProgress)
          if (currentProgress.stage === 'complete' || currentProgress.stage === 'failed') {
            clearInterval(checkProgress)
            cleanup()
            if (currentProgress.stage === 'complete') {
              toast.success('GitHub repository ingested successfully')
            }
          }
        }
      }, 500)

      toast.success('GitHub ingestion started')
    } catch {
      toast.error('Failed to start GitHub ingestion')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ingest GitHub Repository" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Repository URL *</label>
          <input
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/username/repo"
            className="input w-full"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Branch</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">File Extensions</label>
            <input
              type="text"
              value={fileExtensions}
              onChange={(e) => setFileExtensions(e.target.value)}
              placeholder=".md,.txt,.mdx"
              className="input w-full"
            />
          </div>
        </div>

        {progress && <IngestionProgressBar progress={progress} onClose={() => setProgress(null)} />}

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isIngesting} className="btn-primary">
            {isIngesting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Github className="w-4 h-4 mr-2" />}
            Start Ingestion
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface ManualIngestionModalProps {
  open: boolean
  onClose: () => void
  libraryId: string
}

function ManualIngestionModal({ open, onClose, libraryId }: ManualIngestionModalProps) {
  const { ingestManual, isIngesting } = useKnowledgeStore()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [contentType, setContentType] = useState<'text' | 'markdown' | 'qa'>('markdown')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) {
      toast.error('Content is required')
      return
    }

    try {
      await ingestManual(libraryId, {
        type: contentType,
        content: content.trim(),
        title: title.trim() || undefined,
      })
      toast.success('Content added successfully')
      setTitle('')
      setContent('')
      onClose()
    } catch {
      toast.error('Failed to add content')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Manual Content" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Optional title for this content"
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Content Type</label>
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as typeof contentType)}
              className="input w-full"
              aria-label="Content type"
            >
              <option value="markdown">Markdown</option>
              <option value="text">Plain Text</option>
              <option value="qa">Q&A Format</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Content *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={contentType === 'qa'
              ? 'Q: What is SwarmAI?\nA: SwarmAI is a multi-agent messaging platform.\n\nQ: How does it work?\nA: It uses AI agents that collaborate together.'
              : 'Enter your content here...'
            }
            className="input w-full h-64 resize-none font-mono text-sm"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isIngesting} className="btn-primary">
            {isIngesting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Add Content
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface ViewDocumentModalProps {
  open: boolean
  onClose: () => void
  documentId: string | null
  documentTitle: string
}

function ViewDocumentModal({ open, onClose, documentId, documentTitle }: ViewDocumentModalProps) {
  const { getDocumentContent } = useKnowledgeStore()
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open && documentId) {
      setLoading(true)
      setError(null)
      getDocumentContent(documentId)
        .then((data) => {
          setContent(data.content || '(No content available)')
          setLoading(false)
        })
        .catch((err) => {
          setError(err.message || 'Failed to load content')
          setLoading(false)
        })
    }
  }, [open, documentId, getDocumentContent])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${documentTitle || 'document'}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <Modal open={open} onClose={onClose} title={documentTitle || 'View Document'} size="lg">
      <div className="space-y-4">
        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={loading || !content}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={loading || !content}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>

        {/* Content area */}
        <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 text-red-400" />
              <p className="text-red-400">{error}</p>
            </div>
          ) : (
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">{content}</pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function KnowledgePage() {
  const {
    libraries,
    currentLibrary,
    folders,
    documents,
    statistics,
    queryResults,
    ingestionProgress,
    auditHistory,
    auditTotal,
    isLoading,
    isIngesting,
    isQuerying,
    isAuditing,
    error,
    fetchLibraries,
    fetchLibrary,
    deleteLibrary,
    setCurrentLibrary,
    fetchFolders,
    createFolder,
    deleteFolder,
    fetchDocuments,
    deleteDocument,
    bulkDeleteDocuments,
    uploadFile,
    query,
    fetchStatistics,
    fetchIngestionHistory,
    recheckDocument,
    moveDocument,
    bulkRecheck,
    clearError,
    clearQueryResults,
  } = useKnowledgeStore()

  const [activeTab, setActiveTab] = useState('libraries')
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

  // Document management state
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{ open: boolean; type: 'selected' | 'status' }>({
    open: false,
    type: 'selected',
  })

  // Modals
  const [createLibraryOpen, setCreateLibraryOpen] = useState(false)
  const [editLibraryOpen, setEditLibraryOpen] = useState(false)
  const [editingLibrary, setEditingLibrary] = useState<KnowledgeLibrary | null>(null)
  const [webIngestionOpen, setWebIngestionOpen] = useState(false)
  const [githubIngestionOpen, setGitHubIngestionOpen] = useState(false)
  const [manualIngestionOpen, setManualIngestionOpen] = useState(false)
  const [ftpIngestionOpen, setFTPIngestionOpen] = useState(false)
  const [editingFTPSource, setEditingFTPSource] = useState<FTPSource | null>(null)
  const [databaseIngestionOpen, setDatabaseIngestionOpen] = useState(false)
  const [editingDatabaseSource, setEditingDatabaseSource] = useState<DatabaseSource | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; type: 'library' | 'folder' | 'document' | 'ftp' | 'database'; id: string | null }>({
    open: false,
    type: 'document',
    id: null,
  })
  const [viewDocumentModal, setViewDocumentModal] = useState<{ open: boolean; documentId: string | null; documentTitle: string }>({
    open: false,
    documentId: null,
    documentTitle: '',
  })

  // Audit state
  const [auditPage, setAuditPage] = useState(1)
  const auditPageSize = 20
  const [auditLibraryFilter, setAuditLibraryFilter] = useState<string>('all')
  const [recheckResult, setRecheckResult] = useState<RecheckResult | null>(null)
  const [bulkRecheckResult, setBulkRecheckResult] = useState<BulkRecheckResult | null>(null)
  const [showRecheckModal, setShowRecheckModal] = useState(false)
  const [showBulkRecheckModal, setShowBulkRecheckModal] = useState(false)

  // Handle edit library
  const handleEditLibrary = (library: KnowledgeLibrary, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingLibrary(library)
    setEditLibraryOpen(true)
  }
  const [isDeleting, setIsDeleting] = useState(false)

  // FTP store
  const { deleteSource: deleteFTPSource } = useFTPStore()

  // Database store
  const { deleteSource: deleteDatabaseSource } = useDatabaseSourceStore()

  // Initial load
  useEffect(() => {
    fetchLibraries()
    fetchStatistics()
  }, [fetchLibraries, fetchStatistics])

  // Load documents when library changes
  useEffect(() => {
    if (currentLibrary) {
      fetchDocuments(currentLibrary.id, {
        folderId: currentFolderId || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      })
      fetchFolders(currentLibrary.id, currentFolderId || undefined)
    }
    setSelectedDocuments([]) // Clear selection when library/folder changes
  }, [currentLibrary, currentFolderId, statusFilter, currentPage, fetchDocuments, fetchFolders])

  // Clear error on unmount
  useEffect(() => {
    return () => clearError()
  }, [clearError])

  // File upload dropzone
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!currentLibrary || acceptedFiles.length === 0) return

    setUploadProgress(0)
    try {
      for (const file of acceptedFiles) {
        await uploadFile(
          currentLibrary.id,
          file,
          currentFolderId || undefined,
          undefined,
          (progress) => setUploadProgress(progress)
        )
      }
      toast.success(`${acceptedFiles.length} file(s) uploaded successfully`)
      fetchDocuments(currentLibrary.id, { folderId: currentFolderId || undefined })
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploadProgress(null)
    }
  }, [currentLibrary, currentFolderId, uploadFile, fetchDocuments])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
      'text/markdown': ['.md', '.mdx'],
      'application/json': ['.json'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    disabled: !currentLibrary,
  })

  // Handlers
  const handleLibrarySelect = (library: KnowledgeLibrary) => {
    setCurrentLibrary(library)
    setCurrentFolderId(null)
    setActiveTab('documents')
  }

  const handleFolderSelect = (folder: KnowledgeFolder) => {
    setCurrentFolderId(folder.id)
  }

  const handleBackToRoot = () => {
    setCurrentFolderId(null)
  }

  const handleSearch = async () => {
    if (!searchQuery.trim() || libraries.length === 0) return

    try {
      await query({
        query: searchQuery.trim(),
        libraryIds: currentLibrary ? [currentLibrary.id] : libraries.map(l => l.id),
        topK: 10,
        options: {
          includeContent: true,
          includeScores: true,
        },
      })
    } catch {
      toast.error('Search failed')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.id) return

    setIsDeleting(true)
    try {
      switch (deleteDialog.type) {
        case 'library':
          await deleteLibrary(deleteDialog.id)
          toast.success('Library deleted')
          break
        case 'folder':
          await deleteFolder(deleteDialog.id)
          toast.success('Folder deleted')
          break
        case 'document':
          await deleteDocument(deleteDialog.id)
          toast.success('Document deleted')
          break
        case 'ftp':
          await deleteFTPSource(deleteDialog.id)
          toast.success('FTP source deleted')
          break
        case 'database':
          await deleteDatabaseSource(deleteDialog.id)
          toast.success('Database source deleted')
          break
      }
      setDeleteDialog({ open: false, type: 'document', id: null })
    } catch {
      toast.error(`Failed to delete ${deleteDialog.type}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCreateFolder = async () => {
    if (!currentLibrary) return

    const name = prompt('Enter folder name:')
    if (!name?.trim()) return

    try {
      await createFolder(currentLibrary.id, {
        name: name.trim(),
        parentId: currentFolderId || undefined,
      })
      toast.success('Folder created')
    } catch {
      toast.error('Failed to create folder')
    }
  }

  // Document selection handlers
  const handleToggleDocument = (docId: string) => {
    setSelectedDocuments((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    )
  }

  const handleSelectAll = () => {
    if (selectedDocuments.length === documents.length) {
      setSelectedDocuments([])
    } else {
      setSelectedDocuments(documents.map((d) => d.id))
    }
  }

  const handleBulkDelete = async () => {
    if (!currentLibrary) return

    setIsDeleting(true)
    try {
      let result: { deletedCount: number }

      if (bulkDeleteDialog.type === 'selected' && selectedDocuments.length > 0) {
        result = await bulkDeleteDocuments({ documentIds: selectedDocuments })
        toast.success(`Deleted ${result.deletedCount} document(s)`)
        setSelectedDocuments([])
      } else if (bulkDeleteDialog.type === 'status' && statusFilter !== 'all') {
        result = await bulkDeleteDocuments({
          status: statusFilter,
          libraryId: currentLibrary.id,
        })
        toast.success(`Deleted ${result.deletedCount} ${statusFilter} document(s)`)
      }

      setBulkDeleteDialog({ open: false, type: 'selected' })
      // Refresh documents
      fetchDocuments(currentLibrary.id, {
        folderId: currentFolderId || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      })
    } catch {
      toast.error('Failed to delete documents')
    } finally {
      setIsDeleting(false)
    }
  }

  // Filter documents by status (client-side for immediate feedback)
  const filteredDocuments = statusFilter === 'all'
    ? documents
    : documents.filter((d) => d.status === statusFilter)

  // Active ingestions
  const activeIngestions = Array.from(ingestionProgress.entries())
    .filter(([, p]) => p.stage !== 'complete' && p.stage !== 'failed')

  return (
    <div className="page-container stack-lg">
      {/* Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Knowledge Base</h1>
          <p className="page-subtitle">
            Manage RAG knowledge libraries, documents, and semantic search
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeIngestions.length > 0 && (
            <Badge variant="info" className="flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {activeIngestions.length} ingestion{activeIngestions.length > 1 ? 's' : ''} in progress
            </Badge>
          )}
          <button
            onClick={() => setCreateLibraryOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Library
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
          <button type="button" onClick={clearError} className="text-red-400 hover:text-red-300" aria-label="Dismiss error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Trigger value="libraries" icon={<Library className="w-4 h-4" />}>
            Libraries ({libraries.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="documents" icon={<FileText className="w-4 h-4" />} disabled={!currentLibrary}>
            Documents {currentLibrary ? `(${documents.length})` : ''}
          </Tabs.Trigger>
          <Tabs.Trigger value="search" icon={<Search className="w-4 h-4" />}>
            Search
          </Tabs.Trigger>
          <Tabs.Trigger value="statistics" icon={<BarChart3 className="w-4 h-4" />}>
            Statistics
          </Tabs.Trigger>
          <Tabs.Trigger value="audit" icon={<ClipboardCheck className="w-4 h-4" />}>
            Audit
          </Tabs.Trigger>
        </Tabs.List>

        {/* Libraries Tab */}
        <Tabs.Content value="libraries">
          {isLoading && libraries.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          ) : libraries.length === 0 ? (
            <div className="card text-center py-12">
              <Database className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-medium text-white mb-2">No Libraries Yet</h3>
              <p className="text-gray-400 mb-4">Create your first knowledge library to get started</p>
              <button type="button" onClick={() => setCreateLibraryOpen(true)} className="btn-primary">
                <Plus className="w-4 h-4 mr-2" />
                Create Library
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {libraries.map((library) => (
                <div
                  key={library.id}
                  onClick={() => handleLibrarySelect(library)}
                  className={`card cursor-pointer transition-all hover:border-primary-500/50 ${
                    currentLibrary?.id === library.id ? 'border-primary-500 bg-primary-500/5' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 bg-primary-500/20 rounded-lg">
                      <Library className="w-6 h-6 text-primary-400" />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleEditLibrary(library, e)}
                        className="p-1 text-gray-500 hover:text-primary-400 transition-colors"
                        aria-label="Edit library"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteDialog({ open: true, type: 'library', id: library.id })
                        }}
                        className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                        aria-label="Delete library"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="font-semibold text-white mb-1">{library.name}</h3>
                  {library.description && (
                    <p className="text-sm text-gray-400 mb-3 line-clamp-2">{library.description}</p>
                  )}

                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>{library.documentCount} documents</span>
                    <span>•</span>
                    <span>{library.totalChunks} chunks</span>
                    <span>•</span>
                    <span>{formatSize(library.totalSize)}</span>
                  </div>

                  {/* Auto-ingest status and keywords */}
                  {library.autoIngest?.enabled && (
                    <div className="mt-3 pt-3 border-t border-gray-800">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                          Auto-Ingest
                        </span>
                      </div>
                      {library.autoIngest.keywords && library.autoIngest.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {library.autoIngest.keywords.slice(0, 5).map((keyword, i) => (
                            <span key={i} className="px-1.5 py-0.5 text-xs bg-slate-700 text-gray-400 rounded">
                              {keyword}
                            </span>
                          ))}
                          {library.autoIngest.keywords.length > 5 && (
                            <span className="text-xs text-gray-500">+{library.autoIngest.keywords.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Tabs.Content>

        {/* Documents Tab */}
        <Tabs.Content value="documents">
          {currentLibrary ? (
            <div className="space-y-4">
              {/* Library header */}
              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{currentLibrary.name}</h2>
                    <p className="text-sm text-gray-400">
                      {currentLibrary.documentCount} documents • {currentLibrary.totalChunks} chunks
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleCreateFolder} className="btn-secondary text-sm">
                      <FolderPlus className="w-4 h-4 mr-1" /> New Folder
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebIngestionOpen(true)}
                      className="btn-secondary text-sm"
                    >
                      <Globe className="w-4 h-4 mr-1" /> Web
                    </button>
                    <button
                      type="button"
                      onClick={() => setGitHubIngestionOpen(true)}
                      className="btn-secondary text-sm"
                    >
                      <Github className="w-4 h-4 mr-1" /> GitHub
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFTPSource(null)
                        setFTPIngestionOpen(true)
                      }}
                      className="btn-secondary text-sm"
                    >
                      <Server className="w-4 h-4 mr-1" /> FTP
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDatabaseSource(null)
                        setDatabaseIngestionOpen(true)
                      }}
                      className="btn-secondary text-sm"
                    >
                      <Database className="w-4 h-4 mr-1" /> Database
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualIngestionOpen(true)}
                      className="btn-secondary text-sm"
                    >
                      <Edit3 className="w-4 h-4 mr-1" /> Manual
                    </button>
                  </div>
                </div>
              </div>

              {/* Breadcrumb */}
              {currentFolderId && (
                <div className="flex items-center gap-2 text-sm">
                  <button type="button" onClick={handleBackToRoot} className="text-primary-400 hover:text-primary-300">
                    {currentLibrary.name}
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                  <span className="text-white">
                    {folders.find(f => f.id === currentFolderId)?.name || 'Folder'}
                  </span>
                </div>
              )}

              {/* Upload area */}
              <div
                {...getRootProps()}
                className={`card border-2 border-dashed cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <input {...getInputProps()} />
                <div className="py-6 text-center">
                  {uploadProgress !== null ? (
                    <div className="space-y-2">
                      <Loader2 className="w-10 h-10 mx-auto text-primary-500 animate-spin" />
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden max-w-xs mx-auto">
                        <div
                          className="h-full bg-primary-500 transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-400">Uploading... {uploadProgress}%</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 mx-auto text-gray-500" />
                      <p className="mt-3 text-gray-300">
                        {isDragActive ? 'Drop files here...' : 'Drag & drop files, or click to select'}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        PDF, TXT, MD, MDX, JSON, CSV, DOCX
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* FTP Sources */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="section-title mb-0">FTP/SFTP Sources</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFTPSource(null)
                      setFTPIngestionOpen(true)
                    }}
                    className="btn-secondary text-sm"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add Source
                  </button>
                </div>
                <FTPSourceList
                  libraryId={currentLibrary.id}
                  onEdit={(source) => {
                    setEditingFTPSource(source)
                    setFTPIngestionOpen(true)
                  }}
                  onDelete={(source) => {
                    setDeleteDialog({ open: true, type: 'ftp', id: source.id })
                  }}
                />
              </div>

              {/* Database Sources */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="section-title mb-0">Database Sources</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDatabaseSource(null)
                      setDatabaseIngestionOpen(true)
                    }}
                    className="btn-secondary text-sm"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add Database
                  </button>
                </div>
                <DatabaseSourceList
                  libraryId={currentLibrary.id}
                  onEdit={(source) => {
                    setEditingDatabaseSource(source)
                    setDatabaseIngestionOpen(true)
                  }}
                  onDelete={(source) => {
                    setDeleteDialog({ open: true, type: 'database', id: source.id })
                  }}
                />
              </div>

              {/* Folders */}
              {folders.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      onClick={() => handleFolderSelect(folder)}
                      className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-primary-500/50 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        {currentFolderId === folder.id ? (
                          <FolderOpen className="w-5 h-5 text-primary-400" />
                        ) : (
                          <Folder className="w-5 h-5 text-yellow-500" />
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteDialog({ open: true, type: 'folder', id: folder.id })
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400"
                          aria-label="Delete folder"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-sm font-medium text-white truncate">{folder.name}</p>
                      <p className="text-xs text-gray-500">{folder.documentCount} docs</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Documents list */}
              <div className="card">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-700">
                  <div className="flex items-center gap-4">
                    <h3 className="section-title !mb-0">Documents</h3>
                    {documents.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white"
                      >
                        {selectedDocuments.length === documents.length ? (
                          <CheckSquare className="w-4 h-4 text-primary-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                        {selectedDocuments.length > 0
                          ? `${selectedDocuments.length} selected`
                          : 'Select all'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Status Filter */}
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-gray-500" />
                      <select
                        value={statusFilter}
                        onChange={(e) => {
                          setStatusFilter(e.target.value)
                          setCurrentPage(1)
                          setSelectedDocuments([])
                        }}
                        className="input py-1.5 text-sm bg-slate-800"
                        aria-label="Filter documents by status"
                      >
                        <option value="all">All Status</option>
                        <option value="indexed">Indexed</option>
                        <option value="processing">Processing</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>

                    {/* Bulk Delete Buttons */}
                    {selectedDocuments.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setBulkDeleteDialog({ open: true, type: 'selected' })}
                        className="btn-danger text-sm py-1.5 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete {selectedDocuments.length}
                      </button>
                    )}
                    {statusFilter !== 'all' && documents.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setBulkDeleteDialog({ open: true, type: 'status' })}
                        className="btn-secondary text-sm py-1.5 flex items-center gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete all {statusFilter}
                      </button>
                    )}
                  </div>
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>
                      {statusFilter !== 'all'
                        ? `No ${statusFilter} documents`
                        : `No documents in this ${currentFolderId ? 'folder' : 'library'}`}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                      {filteredDocuments.map((doc) => (
                        <div
                          key={doc.id}
                          className={`flex items-center justify-between p-3 rounded-lg hover:bg-slate-800 transition-colors ${
                            selectedDocuments.includes(doc.id)
                              ? 'bg-primary-500/10 border border-primary-500/30'
                              : 'bg-slate-800/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleToggleDocument(doc.id)}
                              className="text-gray-400 hover:text-white"
                            >
                              {selectedDocuments.includes(doc.id) ? (
                                <CheckSquare className="w-5 h-5 text-primary-400" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>
                            <FileText className="w-6 h-6 text-primary-400" />
                            <div>
                              <p className="font-medium text-white">{doc.fileName}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>{formatSize(doc.size)}</span>
                                <span>•</span>
                                <span>{doc.chunkCount} chunks</span>
                                <span>•</span>
                                <span>{formatDate(doc.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 text-xs rounded border ${getStatusColor(doc.status)}`}>
                              {doc.status}
                            </span>
                            <button
                              type="button"
                              onClick={() => setViewDocumentModal({ open: true, documentId: doc.id, documentTitle: doc.fileName })}
                              className="p-1 text-gray-500 hover:text-primary-400"
                              aria-label="View document content"
                              title="View content"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteDialog({ open: true, type: 'document', id: doc.id })}
                              className="p-1 text-gray-500 hover:text-red-400"
                              aria-label="Delete document"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {documents.length >= pageSize && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
                        <p className="text-sm text-gray-500">
                          Showing {filteredDocuments.length} of {documents.length} documents
                          {currentPage > 1 && ` (page ${currentPage})`}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="btn-secondary py-1.5 px-3 disabled:opacity-50"
                            aria-label="Previous page"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-sm text-gray-400">Page {currentPage}</span>
                          <button
                            type="button"
                            onClick={() => setCurrentPage((p) => p + 1)}
                            disabled={documents.length < pageSize}
                            className="btn-secondary py-1.5 px-3 disabled:opacity-50"
                            aria-label="Next page"
                          >
                            <ChevronRightIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="card text-center py-12">
              <Library className="w-12 h-12 mx-auto mb-4 text-gray-600" />
              <p className="text-gray-400">Select a library to view documents</p>
            </div>
          )}
        </Tabs.Content>

        {/* Search Tab */}
        <Tabs.Content value="search">
          <div className="card">
            <h2 className="section-title">Semantic Search</h2>
            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={`Search ${currentLibrary ? currentLibrary.name : 'all libraries'}...`}
                className="input flex-1"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={isQuerying || !searchQuery.trim()}
                className="btn-primary flex items-center gap-2"
              >
                {isQuerying ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
                Search
              </button>
              {queryResults && (
                <button onClick={clearQueryResults} className="btn-secondary">
                  Clear
                </button>
              )}
            </div>

            {currentLibrary && (
              <p className="text-sm text-gray-500 mb-4">
                Searching in: <span className="text-primary-400">{currentLibrary.name}</span>
                <button
                  onClick={() => setCurrentLibrary(null)}
                  className="ml-2 text-xs text-gray-400 hover:text-white"
                >
                  (search all)
                </button>
              </p>
            )}

            {queryResults && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <span>Found {queryResults.totalFound} results</span>
                  <span>Search time: {queryResults.searchTimeMs}ms</span>
                </div>

                {queryResults.results.map((result, i) => (
                  <div
                    key={result.id || i}
                    className="p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-primary-400">{result.document.fileName}</span>
                      <span className="text-xs text-gray-500">
                        Score: {(result.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{result.text}</p>
                  </div>
                ))}
              </div>
            )}

            {!queryResults && !isQuerying && (
              <div className="text-center py-8 text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Enter a query to search your knowledge base</p>
              </div>
            )}
          </div>
        </Tabs.Content>

        {/* Statistics Tab */}
        <Tabs.Content value="statistics">
          {statistics ? (
            <div className="space-y-4">
              {/* Overview cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Library className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{statistics.totalLibraries ?? 0}</p>
                      <p className="text-xs text-gray-500">Libraries</p>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <FileText className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{statistics.totalDocuments ?? 0}</p>
                      <p className="text-xs text-gray-500">Documents</p>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <Database className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{(statistics.totalChunks ?? 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Chunks</p>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-500/20 rounded-lg">
                      <Clock className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{(statistics.averageQueryTime ?? 0).toFixed(0)}ms</p>
                      <p className="text-xs text-gray-500">Avg Query Time</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Library breakdown */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="section-title mb-0">Library Breakdown</h3>
                  <button type="button" onClick={() => fetchStatistics()} className="btn-secondary text-sm">
                    <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                  </button>
                </div>

                {(statistics.libraryStats?.length ?? 0) > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                          <th className="pb-3 font-medium">Library</th>
                          <th className="pb-3 font-medium text-right">Documents</th>
                          <th className="pb-3 font-medium text-right">Chunks</th>
                          <th className="pb-3 font-medium text-right">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(statistics.libraryStats ?? []).map((lib) => (
                          <tr key={lib.libraryId} className="border-b border-gray-800/50">
                            <td className="py-3 text-white">{lib.libraryName}</td>
                            <td className="py-3 text-right text-gray-400">{lib.documentCount}</td>
                            <td className="py-3 text-right text-gray-400">{(lib.chunkCount ?? 0).toLocaleString()}</td>
                            <td className="py-3 text-right text-gray-400">{formatSize(lib.size)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No library data available</p>
                )}
              </div>

              {/* Query stats */}
              <div className="card">
                <h3 className="section-title">Query Statistics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <p className="text-3xl font-bold text-white">{(statistics.queriesExecuted ?? 0).toLocaleString()}</p>
                    <p className="text-sm text-gray-500">Total Queries</p>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <p className="text-3xl font-bold text-white">{formatSize(statistics.totalSize ?? 0)}</p>
                    <p className="text-sm text-gray-500">Total Storage</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card text-center py-12">
              <Loader2 className="w-8 h-8 mx-auto mb-4 text-primary-500 animate-spin" />
              <p className="text-gray-400">Loading statistics...</p>
            </div>
          )}
        </Tabs.Content>

        {/* Audit Tab */}
        <Tabs.Content value="audit">
          <div className="space-y-4">
            {/* Audit Header */}
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Auto-Ingest Audit</h2>
                  <p className="text-sm text-gray-400">
                    Review and verify auto-ingested documents match their assigned libraries
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={auditLibraryFilter}
                    onChange={(e) => {
                      setAuditLibraryFilter(e.target.value)
                      setAuditPage(1)
                    }}
                    className="input py-1.5 text-sm bg-slate-800"
                    aria-label="Filter by library"
                  >
                    <option value="all">All Libraries</option>
                    {libraries.map(lib => (
                      <option key={lib.id} value={lib.id}>{lib.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      fetchIngestionHistory({
                        limit: auditPageSize,
                        offset: 0,
                        libraryId: auditLibraryFilter !== 'all' ? auditLibraryFilter : undefined,
                      })
                      setAuditPage(1)
                    }}
                    className="btn-secondary text-sm"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const result = await bulkRecheck(auditLibraryFilter !== 'all' ? auditLibraryFilter : undefined)
                        setBulkRecheckResult(result)
                        setShowBulkRecheckModal(true)
                      } catch {
                        toast.error('Failed to run bulk recheck')
                      }
                    }}
                    disabled={isAuditing}
                    className="btn-primary text-sm"
                  >
                    {isAuditing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-1" />}
                    Bulk Recheck
                  </button>
                </div>
              </div>
            </div>

            {/* Audit History Table */}
            <div className="card">
              <h3 className="section-title">Ingestion History</h3>

              {isAuditing && auditHistory.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                </div>
              ) : auditHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ClipboardCheck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No auto-ingested documents found</p>
                  <button
                    type="button"
                    onClick={() => fetchIngestionHistory({ limit: auditPageSize, offset: 0 })}
                    className="btn-secondary text-sm mt-4"
                  >
                    Load History
                  </button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-slate-900">
                        <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                          <th className="pb-3 font-medium">Document</th>
                          <th className="pb-3 font-medium">Library</th>
                          <th className="pb-3 font-medium">Source</th>
                          <th className="pb-3 font-medium text-right">Match Score</th>
                          <th className="pb-3 font-medium text-right">Reliability</th>
                          <th className="pb-3 font-medium">Date</th>
                          <th className="pb-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditHistory.map((item) => (
                          <tr key={item.id} className="border-b border-gray-800/50 hover:bg-slate-800/30">
                            <td className="py-3">
                              <div>
                                <p className="text-white font-medium text-sm truncate max-w-[200px]">
                                  {item.documentTitle}
                                </p>
                                {item.documentPreview && (
                                  <p className="text-xs text-gray-500 truncate max-w-[200px]">
                                    {item.documentPreview.substring(0, 50)}...
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-3">
                              <span className="px-2 py-1 text-xs rounded bg-primary-500/20 text-primary-400">
                                {item.libraryName}
                              </span>
                            </td>
                            <td className="py-3 text-sm text-gray-400">
                              {item.source || 'Unknown'}
                            </td>
                            <td className="py-3 text-right">
                              {item.matchScore !== null ? (
                                <span className={`text-sm ${item.matchScore >= 0.7 ? 'text-green-400' : item.matchScore >= 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>
                                  {Math.round(item.matchScore * 100)}%
                                </span>
                              ) : (
                                <span className="text-gray-500 text-sm">-</span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              {item.reliabilityScore !== null ? (
                                <span className={`text-sm ${item.reliabilityScore >= 0.7 ? 'text-green-400' : item.reliabilityScore >= 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>
                                  {Math.round(item.reliabilityScore * 100)}%
                                </span>
                              ) : (
                                <span className="text-gray-500 text-sm">-</span>
                              )}
                            </td>
                            <td className="py-3 text-sm text-gray-400">
                              {formatDate(item.createdAt)}
                            </td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const result = await recheckDocument(item.documentId)
                                    setRecheckResult(result)
                                    setShowRecheckModal(true)
                                  } catch {
                                    toast.error('Failed to recheck document')
                                  }
                                }}
                                disabled={isAuditing}
                                className="p-1 text-gray-500 hover:text-primary-400"
                                title="Recheck document"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
                    <p className="text-sm text-gray-500">
                      Showing {auditHistory.length} of {auditTotal} entries
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const newPage = Math.max(1, auditPage - 1)
                          setAuditPage(newPage)
                          fetchIngestionHistory({
                            limit: auditPageSize,
                            offset: (newPage - 1) * auditPageSize,
                            libraryId: auditLibraryFilter !== 'all' ? auditLibraryFilter : undefined,
                          })
                        }}
                        disabled={auditPage === 1 || isAuditing}
                        className="btn-secondary py-1.5 px-3 disabled:opacity-50"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-sm text-gray-400">Page {auditPage}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newPage = auditPage + 1
                          setAuditPage(newPage)
                          fetchIngestionHistory({
                            limit: auditPageSize,
                            offset: (newPage - 1) * auditPageSize,
                            libraryId: auditLibraryFilter !== 'all' ? auditLibraryFilter : undefined,
                          })
                        }}
                        disabled={auditHistory.length < auditPageSize || isAuditing}
                        className="btn-secondary py-1.5 px-3 disabled:opacity-50"
                        aria-label="Next page"
                      >
                        <ChevronRightIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </Tabs.Content>
      </Tabs>

      {/* Recheck Result Modal */}
      <Modal open={showRecheckModal} onClose={() => setShowRecheckModal(false)} title="Document Recheck Result" size="lg">
        {recheckResult && (
          <div className="space-y-4">
            {/* Document Info */}
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <h4 className="font-medium text-white mb-2">{recheckResult.document.title}</h4>
              <p className="text-sm text-gray-400">{recheckResult.document.contentPreview}</p>
            </div>

            {/* No Match Warning - document doesn't match any library well */}
            {recheckResult.noMatch && !recheckResult.isMismatched && (
              <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-orange-400">No Matching Library Found</p>
                  <p className="text-sm text-orange-300/80">{recheckResult.suggestion}</p>
                  {recheckResult.uncategorizedLibrary && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await moveDocument(recheckResult.document.id, recheckResult.uncategorizedLibrary!.id)
                          toast.success(`Moved to "${recheckResult.uncategorizedLibrary!.name}"`)
                          setShowRecheckModal(false)
                          fetchIngestionHistory({
                            limit: auditPageSize,
                            offset: (auditPage - 1) * auditPageSize,
                            libraryId: auditLibraryFilter !== 'all' ? auditLibraryFilter : undefined,
                          })
                          // Refresh libraries to show the new Uncategorized library if created
                          fetchLibraries()
                        } catch {
                          toast.error('Failed to move document')
                        }
                      }}
                      className="mt-3 btn-primary text-sm py-1.5 px-3 bg-orange-500 hover:bg-orange-600"
                    >
                      <FolderInput className="w-4 h-4 mr-2" /> Move to Uncategorized
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Mismatch Warning - better library exists */}
            {recheckResult.isMismatched && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-400">Potential Mismatch Detected</p>
                  <p className="text-sm text-yellow-300/80">{recheckResult.suggestion}</p>
                </div>
              </div>
            )}

            {/* Current vs Best Match */}
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-4 rounded-lg border ${
                recheckResult.noMatch && !recheckResult.isMismatched
                  ? 'border-orange-500/30 bg-orange-500/10'
                  : recheckResult.isMismatched
                    ? 'border-gray-700 bg-slate-800/30'
                    : 'border-green-500/30 bg-green-500/10'
              }`}>
                <p className="text-xs text-gray-500 mb-1">Current Library</p>
                <p className="font-medium text-white">{recheckResult.currentLibrary?.libraryName || 'Unknown'}</p>
                <p className="text-sm text-gray-400">
                  Total Score: {recheckResult.currentLibrary ? Math.round(recheckResult.currentLibrary.matchScore * 100) : 0}%
                </p>
                {recheckResult.currentLibrary && (
                  <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                    <p>Keywords: {Math.round((recheckResult.currentLibrary.keywordScore ?? 0) * 100)}% × 0.75</p>
                    <p>Name: {Math.round((recheckResult.currentLibrary.nameScore ?? 0) * 100)}% × 0.10</p>
                    <p>Description: {Math.round((recheckResult.currentLibrary.descScore ?? 0) * 100)}% × 0.15</p>
                  </div>
                )}
                {(recheckResult.currentLibrary?.matchedKeywords?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {recheckResult.currentLibrary?.matchedKeywords?.map((kw, i) => (
                      <span key={i} className="px-1.5 py-0.5 text-xs bg-slate-700 text-gray-400 rounded">{kw}</span>
                    ))}
                  </div>
                )}
              </div>

              {recheckResult.bestMatch && recheckResult.isMismatched && (
                <div className="p-4 rounded-lg border border-primary-500/30 bg-primary-500/10">
                  <p className="text-xs text-gray-500 mb-1">Suggested Library</p>
                  <p className="font-medium text-white">{recheckResult.bestMatch.libraryName}</p>
                  <p className="text-sm text-primary-400">
                    Total Score: {Math.round(recheckResult.bestMatch.matchScore * 100)}%
                  </p>
                  <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                    <p>Keywords: {Math.round((recheckResult.bestMatch.keywordScore ?? 0) * 100)}% × 0.75</p>
                    <p>Name: {Math.round((recheckResult.bestMatch.nameScore ?? 0) * 100)}% × 0.10</p>
                    <p>Description: {Math.round((recheckResult.bestMatch.descScore ?? 0) * 100)}% × 0.15</p>
                  </div>
                  {recheckResult.bestMatch.matchedKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {recheckResult.bestMatch.matchedKeywords.map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 text-xs bg-primary-500/20 text-primary-400 rounded">{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* All Matches */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-300">All Library Matches</h4>
                <span className="text-xs text-gray-500">
                  Min threshold: {Math.round(recheckResult.minimumThreshold * 100)}%
                </span>
              </div>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {recheckResult.allMatches.map((match) => (
                  <div
                    key={match.libraryId}
                    className={`flex items-center justify-between p-2 rounded ${
                      match.isCurrentLibrary ? 'bg-slate-700/50' :
                      match.matchScore < recheckResult.minimumThreshold ? 'bg-slate-800/20 opacity-60' : 'bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white">{match.libraryName}</span>
                      {match.isCurrentLibrary && (
                        <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">Current</span>
                      )}
                      {match.matchScore < recheckResult.minimumThreshold && (
                        <span className="px-1.5 py-0.5 text-xs bg-gray-600/30 text-gray-500 rounded">Below threshold</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-sm cursor-help ${match.matchScore >= 0.7 ? 'text-green-400' : match.matchScore >= recheckResult.minimumThreshold ? 'text-yellow-400' : 'text-gray-500'}`}
                        title={`Keywords: ${Math.round((match.keywordScore ?? 0) * 100)}% × 0.75\nName: ${Math.round((match.nameScore ?? 0) * 100)}% × 0.10\nDesc: ${Math.round((match.descScore ?? 0) * 100)}% × 0.15`}
                      >
                        {Math.round(match.matchScore * 100)}%
                      </span>
                      {!match.isCurrentLibrary && match.matchScore > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await moveDocument(recheckResult.document.id, match.libraryId)
                              toast.success(`Moved to "${match.libraryName}"`)
                              setShowRecheckModal(false)
                              fetchIngestionHistory({
                                limit: auditPageSize,
                                offset: (auditPage - 1) * auditPageSize,
                                libraryId: auditLibraryFilter !== 'all' ? auditLibraryFilter : undefined,
                              })
                            } catch {
                              toast.error('Failed to move document')
                            }
                          }}
                          className="btn-secondary text-xs py-1 px-2"
                        >
                          <MoveRight className="w-3 h-3 mr-1" /> Move
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button type="button" onClick={() => setShowRecheckModal(false)} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Recheck Result Modal */}
      <Modal open={showBulkRecheckModal} onClose={() => setShowBulkRecheckModal(false)} title="Bulk Recheck Results" size="lg">
        {bulkRecheckResult && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-slate-800/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-white">{bulkRecheckResult.total}</p>
                <p className="text-sm text-gray-500">Total Checked</p>
              </div>
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-400">{bulkRecheckResult.correct}</p>
                <p className="text-sm text-gray-500">Correct</p>
              </div>
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
                <p className="text-2xl font-bold text-yellow-400">{bulkRecheckResult.mismatched}</p>
                <p className="text-sm text-gray-500">Mismatched</p>
              </div>
            </div>

            {/* Suggestions */}
            {bulkRecheckResult.suggestions.length > 0 ? (
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">Suggested Moves</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {bulkRecheckResult.suggestions.map((suggestion) => (
                    <div key={suggestion.documentId} className="p-3 bg-slate-800/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{suggestion.documentTitle}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                            <span className="text-red-400">{suggestion.currentLibraryName} ({Math.round(suggestion.currentScore * 100)}%)</span>
                            <ArrowRight className="w-3 h-3" />
                            <span className="text-green-400">{suggestion.suggestedLibraryName} ({Math.round(suggestion.suggestedScore * 100)}%)</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await moveDocument(suggestion.documentId, suggestion.suggestedLibraryId)
                              toast.success(`Moved "${suggestion.documentTitle}" to "${suggestion.suggestedLibraryName}"`)
                              // Refresh bulk recheck
                              const result = await bulkRecheck(auditLibraryFilter !== 'all' ? auditLibraryFilter : undefined)
                              setBulkRecheckResult(result)
                            } catch {
                              toast.error('Failed to move document')
                            }
                          }}
                          className="btn-secondary text-xs py-1 px-2"
                        >
                          <MoveRight className="w-3 h-3 mr-1" /> Move
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-400" />
                <p className="text-green-400 font-medium">All documents are correctly assigned!</p>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button type="button" onClick={() => setShowBulkRecheckModal(false)} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modals */}
      <CreateLibraryModal open={createLibraryOpen} onClose={() => setCreateLibraryOpen(false)} />
      <EditLibraryModal
        open={editLibraryOpen}
        onClose={() => {
          setEditLibraryOpen(false)
          setEditingLibrary(null)
        }}
        library={editingLibrary}
      />

      {currentLibrary && (
        <>
          <WebIngestionModal
            open={webIngestionOpen}
            onClose={() => setWebIngestionOpen(false)}
            libraryId={currentLibrary.id}
          />
          <GitHubIngestionModal
            open={githubIngestionOpen}
            onClose={() => setGitHubIngestionOpen(false)}
            libraryId={currentLibrary.id}
          />
          <ManualIngestionModal
            open={manualIngestionOpen}
            onClose={() => setManualIngestionOpen(false)}
            libraryId={currentLibrary.id}
          />
          <FTPIngestionModal
            open={ftpIngestionOpen}
            onClose={() => {
              setFTPIngestionOpen(false)
              setEditingFTPSource(null)
            }}
            libraryId={currentLibrary.id}
            source={editingFTPSource}
          />
          <DatabaseIngestionModal
            isOpen={databaseIngestionOpen}
            onClose={() => {
              setDatabaseIngestionOpen(false)
              setEditingDatabaseSource(null)
            }}
            libraryId={currentLibrary.id}
            source={editingDatabaseSource}
          />
        </>
      )}

      {/* View Document Modal */}
      <ViewDocumentModal
        open={viewDocumentModal.open}
        onClose={() => setViewDocumentModal({ open: false, documentId: null, documentTitle: '' })}
        documentId={viewDocumentModal.documentId}
        documentTitle={viewDocumentModal.documentTitle}
      />

      <ConfirmDialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, type: 'document', id: null })}
        onConfirm={handleDeleteConfirm}
        title={`Delete ${deleteDialog.type.charAt(0).toUpperCase() + deleteDialog.type.slice(1)}`}
        message={`Are you sure you want to delete this ${deleteDialog.type === 'ftp' ? 'FTP source' : deleteDialog.type === 'database' ? 'database source' : deleteDialog.type}? ${
          deleteDialog.type === 'library' ? 'All documents in this library will be permanently deleted.' :
          deleteDialog.type === 'folder' ? 'All documents in this folder will be moved to the root.' :
          deleteDialog.type === 'ftp' ? 'All synced files from this source will remain in the library.' :
          deleteDialog.type === 'database' ? 'All synced data from this source will remain in the library.' :
          'This action cannot be undone.'
        }`}
        confirmText="Delete"
        variant="danger"
        loading={isDeleting}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        open={bulkDeleteDialog.open}
        onClose={() => setBulkDeleteDialog({ open: false, type: 'selected' })}
        onConfirm={handleBulkDelete}
        title="Bulk Delete Documents"
        message={
          bulkDeleteDialog.type === 'selected'
            ? `Are you sure you want to delete ${selectedDocuments.length} selected document(s)? This action cannot be undone.`
            : `Are you sure you want to delete ALL documents with status "${statusFilter}" in this library? This action cannot be undone.`
        }
        confirmText={
          bulkDeleteDialog.type === 'selected'
            ? `Delete ${selectedDocuments.length} Documents`
            : `Delete All ${statusFilter}`
        }
        variant="danger"
        loading={isDeleting}
      />
    </div>
  )
}
