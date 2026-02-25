/**
 * FTPSourceList Component
 *
 * Displays configured FTP sources with sync status, actions, and progress
 */
import React, { useEffect, useState } from 'react'
import {
  Server,
  Play,
  Pause,
  Trash2,
  Edit2,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  FolderSync,
} from 'lucide-react'
import {
  useFTPStore,
  FTPSource,
  SyncProgress,
  setupFTPWebSocketListeners,
  cleanupFTPWebSocketListeners,
} from '../../stores/ftpStore'
import FTPSyncProgress from './FTPSyncProgress'
import { formatDateTime } from '@/utils/dateFormat'

interface FTPSourceListProps {
  libraryId: string
  onEdit: (source: FTPSource) => void
  onDelete: (source: FTPSource) => void
}

const FTPSourceList: React.FC<FTPSourceListProps> = ({ libraryId, onEdit, onDelete }) => {
  const {
    sources,
    syncProgress,
    isLoading,
    isSyncing,
    error,
    fetchSources,
    triggerSync,
    cancelSync,
    enableSchedule,
    disableSchedule,
    subscribeToSource,
    unsubscribeFromSource,
  } = useFTPStore()

  const [expandedSource, setExpandedSource] = useState<string | null>(null)
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null)

  // Setup WebSocket listeners and fetch sources
  useEffect(() => {
    setupFTPWebSocketListeners()
    fetchSources(libraryId)

    return () => {
      cleanupFTPWebSocketListeners()
    }
  }, [libraryId, fetchSources])

  // Subscribe to WebSocket events for all sources
  useEffect(() => {
    sources.forEach((source) => {
      subscribeToSource(source.id)
    })

    return () => {
      sources.forEach((source) => {
        unsubscribeFromSource(source.id)
      })
    }
  }, [sources, subscribeToSource, unsubscribeFromSource])

  const handleTriggerSync = async (sourceId: string) => {
    try {
      setSyncingSourceId(sourceId)
      await triggerSync(sourceId)
    } catch (err) {
      console.error('Failed to trigger sync:', err)
    } finally {
      setSyncingSourceId(null)
    }
  }

  const handleCancelSync = async (sourceId: string) => {
    try {
      await cancelSync(sourceId)
    } catch (err) {
      console.error('Failed to cancel sync:', err)
    }
  }

  const handleToggleSchedule = async (source: FTPSource) => {
    try {
      if (source.scheduleEnabled) {
        await disableSchedule(source.id)
      } else {
        await enableSchedule(source.id)
      }
    } catch (err) {
      console.error('Failed to toggle schedule:', err)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never'
    return formatDateTime(dateStr)
  }

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffMins = Math.round(diffMs / 60000)

    if (diffMins < 0) {
      const absDiff = Math.abs(diffMins)
      if (absDiff < 60) return `${absDiff}m ago`
      const hours = Math.floor(absDiff / 60)
      if (hours < 24) return `${hours}h ago`
      const days = Math.floor(hours / 24)
      return `${days}d ago`
    } else {
      if (diffMins < 60) return `in ${diffMins}m`
      const hours = Math.floor(diffMins / 60)
      if (hours < 24) return `in ${hours}h`
      const days = Math.floor(hours / 24)
      return `in ${days}d`
    }
  }

  const getStatusIcon = (source: FTPSource) => {
    const progress = syncProgress.get(source.id)

    if (progress && progress.status === 'running') {
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
    }

    switch (source.lastSyncStatus) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'partial':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusText = (source: FTPSource) => {
    const progress = syncProgress.get(source.id)

    if (progress && progress.status === 'running') {
      return `Syncing... ${progress.percentage || 0}%`
    }

    switch (source.lastSyncStatus) {
      case 'success':
        return 'Last sync successful'
      case 'partial':
        return 'Partial sync (some files failed)'
      case 'failed':
        return source.lastSyncError || 'Last sync failed'
      default:
        return 'Not synced yet'
    }
  }

  const filteredSources = sources.filter((s) => s.libraryId === libraryId)

  if (isLoading && filteredSources.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading FTP sources...
      </div>
    )
  }

  if (filteredSources.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="font-medium">No FTP sources configured</p>
        <p className="text-sm mt-1">Add an FTP or SFTP source to sync files automatically</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {filteredSources.map((source) => {
        const progress = syncProgress.get(source.id)
        const isExpanded = expandedSource === source.id
        const isSyncRunning = progress?.status === 'running'

        return (
          <div
            key={source.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            {/* Header */}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {/* Protocol icon */}
                  <div
                    className={`p-2 rounded-lg ${
                      source.protocol === 'sftp'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    <Server className="w-5 h-5" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900 dark:text-white">{source.name}</h4>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          source.protocol === 'sftp'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        }`}
                      >
                        {source.protocol.toUpperCase()}
                      </span>
                      {!source.isActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          Inactive
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {source.host}:{source.port} {source.remotePath}
                    </p>

                    {/* Status line */}
                    <div className="flex items-center gap-2 mt-2 text-sm">
                      {getStatusIcon(source)}
                      <span className="text-gray-600 dark:text-gray-400">{getStatusText(source)}</span>
                    </div>

                    {/* Schedule info */}
                    {source.scheduleEnabled && source.cronExpression && (
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <Calendar className="w-4 h-4" />
                        <span>
                          Next: {formatDate(source.nextSyncAt)}
                          {source.nextSyncAt && (
                            <span className="ml-1 text-gray-400">
                              ({formatRelativeTime(source.nextSyncAt)})
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {/* Sync button */}
                  {isSyncRunning ? (
                    <button
                      onClick={() => handleCancelSync(source.id)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Cancel sync"
                    >
                      <Pause className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTriggerSync(source.id)}
                      disabled={syncingSourceId === source.id}
                      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
                      title="Sync now"
                    >
                      {syncingSourceId === source.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-5 h-5" />
                      )}
                    </button>
                  )}

                  {/* Schedule toggle */}
                  <button
                    onClick={() => handleToggleSchedule(source)}
                    className={`p-2 rounded-lg transition-colors ${
                      source.scheduleEnabled
                        ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                        : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    title={source.scheduleEnabled ? 'Disable schedule' : 'Enable schedule'}
                  >
                    <Clock className="w-5 h-5" />
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => onEdit(source)}
                    className="p-2 text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Edit source"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => onDelete(source)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete source"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>

                  {/* Expand/collapse */}
                  <button
                    onClick={() => setExpandedSource(isExpanded ? null : source.id)}
                    className="p-2 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Sync Progress (if running) */}
            {isSyncRunning && progress && (
              <div className="border-t border-gray-200 dark:border-gray-700">
                <FTPSyncProgress progress={progress} />
              </div>
            )}

            {/* Expanded details */}
            {isExpanded && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">File Patterns:</span>
                    <p className="text-gray-900 dark:text-white font-mono text-xs mt-1">
                      {source.filePatterns || '*.*'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Exclude Patterns:</span>
                    <p className="text-gray-900 dark:text-white font-mono text-xs mt-1">
                      {source.excludePatterns || 'None'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Sync Mode:</span>
                    <p className="text-gray-900 dark:text-white capitalize mt-1">{source.syncMode}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Recursive:</span>
                    <p className="text-gray-900 dark:text-white mt-1">{source.recursive ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Last Sync:</span>
                    <p className="text-gray-900 dark:text-white mt-1">{formatDate(source.lastSyncAt)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Created:</span>
                    <p className="text-gray-900 dark:text-white mt-1">{formatDate(source.createdAt)}</p>
                  </div>
                  {source.scheduleEnabled && source.cronExpression && (
                    <div className="col-span-2">
                      <span className="text-gray-500 dark:text-gray-400">Schedule:</span>
                      <p className="text-gray-900 dark:text-white font-mono text-xs mt-1">
                        {source.cronExpression} ({source.timezone})
                      </p>
                    </div>
                  )}
                  {source.description && (
                    <div className="col-span-2">
                      <span className="text-gray-500 dark:text-gray-400">Description:</span>
                      <p className="text-gray-900 dark:text-white mt-1">{source.description}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default FTPSourceList
