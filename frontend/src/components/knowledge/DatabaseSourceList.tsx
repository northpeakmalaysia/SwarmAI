/**
 * Database Source List
 *
 * Displays database sources for a knowledge library with sync status and actions.
 */

import React, { useEffect, useState } from 'react'
import {
  Database,
  RefreshCw,
  Edit3,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Play,
  StopCircle,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../common'
import {
  useDatabaseSourceStore,
  type DatabaseSource,
} from '../../stores/databaseSourceStore'
import toast from 'react-hot-toast'
import { formatDateTime } from '@/utils/dateFormat'

interface DatabaseSourceListProps {
  libraryId: string
  onEdit?: (source: DatabaseSource) => void
  onDelete?: (source: DatabaseSource) => void
}

const statusConfig = {
  connected: {
    icon: CheckCircle,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20',
    label: 'Connected',
  },
  disconnected: {
    icon: XCircle,
    color: 'text-gray-400',
    bg: 'bg-gray-500/20',
    label: 'Disconnected',
  },
  syncing: {
    icon: RefreshCw,
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    label: 'Syncing',
  },
  error: {
    icon: AlertTriangle,
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    label: 'Error',
  },
}

const DatabaseSourceList: React.FC<DatabaseSourceListProps> = ({
  libraryId,
  onEdit,
  onDelete,
}) => {
  const {
    sources,
    fetchSources,
    triggerSync,
    cancelSync,
    testSourceConnection,
    isLoading,
  } = useDatabaseSourceStore()

  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchSources(libraryId)
  }, [libraryId, fetchSources])

  const handleSync = async (source: DatabaseSource) => {
    setSyncingIds((prev) => new Set(prev).add(source.id))
    try {
      await triggerSync(source.id)
      toast.success(`Sync started for ${source.name}`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev)
        next.delete(source.id)
        return next
      })
    }
  }

  const handleCancelSync = async (source: DatabaseSource) => {
    try {
      await cancelSync(source.id)
      toast.success('Sync cancelled')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleTestConnection = async (source: DatabaseSource) => {
    setTestingIds((prev) => new Set(prev).add(source.id))
    try {
      const result = await testSourceConnection(source.id)
      if (result.success) {
        toast.success(`Connected to ${source.name}`)
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev)
        next.delete(source.id)
        return next
      })
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never'
    return formatDateTime(dateString)
  }

  const librarySources = sources.filter((s) => s.libraryId === libraryId)

  if (isLoading && librarySources.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading database sources...
      </div>
    )
  }

  if (librarySources.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No database sources connected</p>
        <p className="text-sm mt-1">Click &quot;Database&quot; to add a connection</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {librarySources.map((source) => {
        const status = statusConfig[source.status] || statusConfig.disconnected
        const StatusIcon = status.icon
        const isSyncing = source.status === 'syncing' || syncingIds.has(source.id)
        const isTesting = testingIds.has(source.id)

        return (
          <div
            key={source.id}
            className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={cn('p-2 rounded-lg', status.bg)}>
                  <Database className={cn('w-5 h-5', status.color)} />
                </div>
                <div>
                  <h4 className="font-medium text-white">{source.name}</h4>
                  <p className="text-sm text-gray-400">
                    {source.host}:{source.port} / {source.databaseName}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <StatusIcon
                        className={cn('w-3 h-3', status.color, isSyncing && 'animate-spin')}
                      />
                      {isSyncing ? 'Syncing...' : status.label}
                    </span>
                    <span>{source.itemCount} documents</span>
                    <span>Last sync: {formatDate(source.lastSyncAt)}</span>
                  </div>
                  {source.lastSyncError && (
                    <p className="text-xs text-red-400 mt-1">{source.lastSyncError}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isSyncing ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelSync(source)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <StopCircle className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSync(source)}
                    disabled={!source.extractionQuery}
                    title={source.extractionQuery ? 'Sync now' : 'Configure query first'}
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTestConnection(source)}
                  disabled={isTesting}
                  title="Test connection"
                >
                  {isTesting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit?.(source)}
                  title="Edit"
                >
                  <Edit3 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete?.(source)}
                  className="text-red-400 hover:text-red-300"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Schedule indicator */}
            {source.scheduleEnabled && (
              <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-2 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                <span>Auto-sync enabled: {source.cronExpression}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default DatabaseSourceList
