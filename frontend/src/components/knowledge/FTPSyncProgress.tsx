/**
 * FTPSyncProgress Component
 *
 * Real-time sync progress display with stats, progress bar, and current file
 */
import React from 'react'
import {
  Loader2,
  FileText,
  FilePlus,
  FileEdit,
  FileX,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Server,
  Search,
  FolderSync,
  Download,
} from 'lucide-react'
import { SyncProgress } from '../../stores/ftpStore'

interface FTPSyncProgressProps {
  progress: SyncProgress
  showDetails?: boolean
}

const FTPSyncProgress: React.FC<FTPSyncProgressProps> = ({ progress, showDetails = true }) => {
  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case 'connecting':
        return <Server className="w-4 h-4" />
      case 'listing':
        return <Search className="w-4 h-4" />
      case 'detecting':
        return <FileText className="w-4 h-4" />
      case 'syncing':
        return <Download className="w-4 h-4" />
      case 'completing':
        return <CheckCircle className="w-4 h-4" />
      default:
        return <Loader2 className="w-4 h-4 animate-spin" />
    }
  }

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case 'connecting':
        return 'Connecting to server...'
      case 'listing':
        return 'Listing remote files...'
      case 'detecting':
        return 'Detecting changes...'
      case 'syncing':
        return 'Syncing files...'
      case 'completing':
        return 'Completing sync...'
      default:
        return 'Processing...'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-blue-600 dark:text-blue-400'
      case 'completed':
        return 'text-green-600 dark:text-green-400'
      case 'partial':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'failed':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getProgressBarColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-500'
      case 'completed':
        return 'bg-green-500'
      case 'partial':
        return 'bg-yellow-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const percentage = progress.percentage || 0
  const isRunning = progress.status === 'running'

  return (
    <div className="p-4 space-y-3">
      {/* Phase indicator */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 ${getStatusColor(progress.status)}`}>
          {isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : progress.status === 'completed' ? (
            <CheckCircle className="w-4 h-4" />
          ) : progress.status === 'failed' ? (
            <XCircle className="w-4 h-4" />
          ) : (
            getPhaseIcon(progress.phase)
          )}
          <span className="font-medium">
            {isRunning ? getPhaseLabel(progress.phase) : progress.status === 'completed' ? 'Sync completed' : 'Sync failed'}
          </span>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {percentage.toFixed(0)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${getProgressBarColor(progress.status)} transition-all duration-300 ease-out ${
            isRunning && percentage < 100 ? 'animate-pulse' : ''
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Current file */}
      {progress.currentFile && isRunning && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <FileText className="w-4 h-4 flex-shrink-0" />
          <span className="truncate font-mono text-xs">{progress.currentFile}</span>
        </div>
      )}

      {/* Stats */}
      {showDetails && (progress.filesDiscovered || progress.filesNew || progress.filesModified || progress.filesDeleted || progress.filesFailed) && (
        <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
          {/* Discovered */}
          {progress.filesDiscovered !== undefined && progress.filesDiscovered > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <Search className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">
                {progress.filesDiscovered} discovered
              </span>
            </div>
          )}

          {/* New files */}
          {progress.filesNew !== undefined && progress.filesNew > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <FilePlus className="w-4 h-4 text-green-500" />
              <span className="text-green-600 dark:text-green-400">
                {progress.filesNew} new
              </span>
            </div>
          )}

          {/* Modified files */}
          {progress.filesModified !== undefined && progress.filesModified > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <FileEdit className="w-4 h-4 text-blue-500" />
              <span className="text-blue-600 dark:text-blue-400">
                {progress.filesModified} modified
              </span>
            </div>
          )}

          {/* Deleted files */}
          {progress.filesDeleted !== undefined && progress.filesDeleted > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <FileX className="w-4 h-4 text-orange-500" />
              <span className="text-orange-600 dark:text-orange-400">
                {progress.filesDeleted} deleted
              </span>
            </div>
          )}

          {/* Failed files */}
          {progress.filesFailed !== undefined && progress.filesFailed > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-red-600 dark:text-red-400">
                {progress.filesFailed} failed
              </span>
            </div>
          )}

          {/* Processed */}
          {progress.filesProcessed !== undefined && progress.filesDiscovered && progress.filesDiscovered > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <FolderSync className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">
                {progress.filesProcessed}/{progress.filesDiscovered} processed
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FTPSyncProgress
