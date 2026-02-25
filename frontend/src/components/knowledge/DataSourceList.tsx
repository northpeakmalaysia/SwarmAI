/**
 * Data Source List Component
 *
 * Lists all data sources for a knowledge library with management actions.
 * Features:
 * - Status indicators (active, syncing, error)
 * - Manual sync trigger
 * - Schedule toggle
 * - Edit/Delete actions
 * - Sync progress display
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Database,
  Globe,
  Play,
  Pause,
  Trash2,
  Edit,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Info,
  Loader2,
  MoreVertical,
  History,
  Server,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../common'
import { useDataSourceStore, DataSource, SyncProgress, SyncHistoryItem } from '../../stores/dataSourceStore'
import { formatDistanceToNow } from 'date-fns'

interface DataSourceListProps {
  libraryId: string
  onEdit?: (source: DataSource) => void
  onAdd?: () => void
  className?: string
}

const DataSourceList: React.FC<DataSourceListProps> = ({
  libraryId,
  onEdit,
  onAdd,
  className,
}) => {
  const {
    sources,
    syncProgress,
    isLoading,
    isSyncing,
    error,
    fetchSources,
    triggerSync,
    cancelSync,
    deleteSource,
    enableSchedule,
    disableSchedule,
    getSyncHistory,
  } = useDataSourceStore()

  const [expandedSource, setExpandedSource] = useState<string | null>(null)
  const [syncHistoryMap, setSyncHistoryMap] = useState<Record<string, SyncHistoryItem[]>>({})
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Filter sources by library
  const librarySources = sources.filter((s) => s.libraryId === libraryId)

  // Fetch sources on mount
  useEffect(() => {
    fetchSources(libraryId)
  }, [fetchSources, libraryId])

  const handleSync = async (sourceId: string) => {
    try {
      await triggerSync(sourceId)
    } catch (err) {
      // Error handled by store
    }
  }

  const handleCancelSync = async (sourceId: string) => {
    try {
      await cancelSync(sourceId)
    } catch (err) {
      // Error handled by store
    }
  }

  const handleToggleSchedule = async (source: DataSource) => {
    try {
      if (source.scheduleEnabled) {
        await disableSchedule(source.id)
      } else {
        await enableSchedule(source.id)
      }
    } catch (err) {
      // Error handled by store
    }
  }

  const handleDelete = async (sourceId: string) => {
    try {
      await deleteSource(sourceId)
      setDeleteConfirm(null)
    } catch (err) {
      // Error handled by store
    }
  }

  const loadSyncHistory = async (sourceId: string) => {
    try {
      const result = await getSyncHistory(sourceId, 5)
      setSyncHistoryMap((prev) => ({ ...prev, [sourceId]: result.items }))
    } catch (err) {
      // Error handled by store
    }
  }

  const toggleExpand = useCallback((sourceId: string) => {
    setExpandedSource((prev) => {
      if (prev === sourceId) return null
      loadSyncHistory(sourceId)
      return sourceId
    })
  }, [])

  const getStatusIcon = (source: DataSource) => {
    const progress = syncProgress.get(source.id)

    if (progress?.status === 'running') {
      return <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
    }

    if (source.lastSyncStatus === 'failed') {
      return <XCircle className="w-4 h-4 text-red-400" />
    }

    if (source.lastSyncStatus === 'completed') {
      return <CheckCircle className="w-4 h-4 text-emerald-400" />
    }

    if (!source.isActive) {
      return <Pause className="w-4 h-4 text-gray-500" />
    }

    return <Clock className="w-4 h-4 text-gray-400" />
  }

  const getSourceIcon = (source: DataSource) => {
    if (source.sourceType === 'database') {
      return <Database className="w-5 h-5 text-emerald-400" />
    }
    return <Globe className="w-5 h-5 text-blue-400" />
  }

  if (isLoading && librarySources.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-medium text-white">Data Sources</h3>
          <span className="px-2 py-0.5 text-xs bg-slate-700 text-gray-400 rounded-full">
            {librarySources.length}
          </span>
        </div>
        {onAdd && (
          <Button size="sm" onClick={onAdd}>
            <Database className="w-4 h-4 mr-2" />
            Add Source
          </Button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {librarySources.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-slate-700 rounded-xl">
          <Database className="w-12 h-12 mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400 mb-4">No data sources configured</p>
          <p className="text-sm text-gray-500 mb-4">
            Connect databases or APIs to automatically sync data into your knowledge base
          </p>
          {onAdd && (
            <Button variant="outline" onClick={onAdd}>
              <Database className="w-4 h-4 mr-2" />
              Add Data Source
            </Button>
          )}
        </div>
      )}

      {/* Source List */}
      <div className="space-y-3">
        {librarySources.map((source) => {
          const progress = syncProgress.get(source.id)
          const isExpanded = expandedSource === source.id
          const history = syncHistoryMap[source.id] || []

          return (
            <div
              key={source.id}
              className="border border-slate-700 rounded-xl overflow-hidden bg-slate-800/30"
            >
              {/* Main Row */}
              <div className="flex items-center gap-4 p-4">
                {/* Icon */}
                <div className="flex-shrink-0">{getSourceIcon(source)}</div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-white truncate">{source.name}</h4>
                    {getStatusIcon(source)}
                    {source.scheduleEnabled && (
                      <span title="Scheduled sync enabled">
                        <Calendar className="w-4 h-4 text-amber-400" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>{source.sourceType}</span>
                    <span>•</span>
                    <span>{source.itemCount} items</span>
                    {source.lastSyncAt && (
                      <>
                        <span>•</span>
                        <span>
                          Last sync: {formatDistanceToNow(new Date(source.lastSyncAt), { addSuffix: true })}
                        </span>
                      </>
                    )}
                  </div>
                  {source.description && (
                    <p className="mt-1 text-xs text-gray-500 truncate">{source.description}</p>
                  )}
                </div>

                {/* Progress Bar */}
                {progress?.status === 'running' && (
                  <div className="flex-shrink-0 w-32">
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 transition-all duration-300"
                        style={{ width: `${progress.percentage || 0}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1 text-center">
                      {progress.itemsProcessed}/{progress.itemsDiscovered}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {progress?.status === 'running' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelSync(source.id)}
                      disabled={isSyncing}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSync(source.id)}
                      disabled={isSyncing || !source.isActive}
                      title="Start sync"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpand(source.id)}
                    title="View details"
                  >
                    <Info className="w-4 h-4" />
                  </Button>

                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActionMenuOpen(actionMenuOpen === source.id ? null : source.id)}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>

                    {actionMenuOpen === source.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setActionMenuOpen(null)}
                        />
                        <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1">
                          {onEdit && (
                            <button
                              onClick={() => {
                                onEdit(source)
                                setActionMenuOpen(null)
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                              Edit Source
                            </button>
                          )}
                          <button
                            onClick={() => {
                              handleToggleSchedule(source)
                              setActionMenuOpen(null)
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 transition-colors"
                          >
                            {source.scheduleEnabled ? (
                              <>
                                <Pause className="w-4 h-4" />
                                Disable Schedule
                              </>
                            ) : (
                              <>
                                <Calendar className="w-4 h-4" />
                                Enable Schedule
                              </>
                            )}
                          </button>
                          <hr className="border-slate-700 my-1" />
                          <button
                            onClick={() => {
                              setDeleteConfirm(source.id)
                              setActionMenuOpen(null)
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-slate-700 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete Source
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-slate-700 p-4 bg-slate-800/50 space-y-4">
                  {/* MCP Config */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">MCP Server:</span>
                      <span className="ml-2 text-white">{source.mcpToolConfig.serverId || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Tool:</span>
                      <span className="ml-2 text-white">{source.mcpToolConfig.toolName || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Data Path:</span>
                      <span className="ml-2 text-white font-mono text-xs">{source.dataPath}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Change Mode:</span>
                      <span className="ml-2 text-white">{source.changeMode}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500">Content Fields:</span>
                      <span className="ml-2 text-white">{source.contentFields.join(', ')}</span>
                    </div>
                  </div>

                  {/* Sync History */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <History className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-white">Sync History</span>
                    </div>

                    {history.length === 0 ? (
                      <p className="text-sm text-gray-500">No sync history yet</p>
                    ) : (
                      <div className="space-y-2">
                        {history.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg text-xs"
                          >
                            <div className="flex items-center gap-2">
                              {item.status === 'completed' ? (
                                <CheckCircle className="w-3 h-3 text-emerald-400" />
                              ) : item.status === 'failed' ? (
                                <XCircle className="w-3 h-3 text-red-400" />
                              ) : (
                                <Loader2 className="w-3 h-3 text-sky-400 animate-spin" />
                              )}
                              <span className="text-gray-300">
                                {formatDistanceToNow(new Date(item.startedAt), { addSuffix: true })}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-gray-500">
                              {item.itemsNew > 0 && (
                                <span className="text-emerald-400">+{item.itemsNew}</span>
                              )}
                              {item.itemsModified > 0 && (
                                <span className="text-amber-400">~{item.itemsModified}</span>
                              )}
                              {item.itemsDeleted > 0 && (
                                <span className="text-red-400">-{item.itemsDeleted}</span>
                              )}
                              {item.itemsFailed > 0 && (
                                <span className="text-red-400">({item.itemsFailed} failed)</span>
                              )}
                              {item.durationMs && (
                                <span>{(item.durationMs / 1000).toFixed(1)}s</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Error Display */}
                  {source.lastSyncError && (
                    <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-800 rounded-lg text-xs text-red-300">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{source.lastSyncError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Delete Confirmation */}
              {deleteConfirm === source.id && (
                <div className="border-t border-slate-700 p-4 bg-red-900/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-red-300">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Delete this data source? This cannot be undone.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(source.id)}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DataSourceList
