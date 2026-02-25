/**
 * Version History Panel
 *
 * Displays flow version history with commit, rollback, compare,
 * and tagging functionality.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  History,
  GitCommit,
  GitBranch,
  RotateCcw,
  Tag,
  Trash2,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  AlertTriangle,
  Check,
  Loader2,
  Clock,
  Layers,
  ArrowLeftRight,
  Eye,
  Download,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useFlowStore } from '../../../stores/flowStore'
import toast from 'react-hot-toast'
import { formatDate as formatDateUtil, formatDateTime } from '@/utils/dateFormat'

// Types
interface FlowVersion {
  id: string
  flowId: string
  version: number
  name?: string
  message?: string
  nodesCount: number
  edgesCount: number
  createdBy: string
  createdAt: string
  snapshot?: {
    name: string
    description?: string
    nodes: any[]
    edges: any[]
    settings?: any
  }
}

interface VersionDiff {
  versionA: number
  versionB: number
  nodes: {
    added: { id: string; type: string; label?: string }[]
    removed: { id: string; type: string; label?: string }[]
    modified: { id: string; type: string; label?: string; changes: any[] }[]
  }
  edges: {
    added: number
    removed: number
  }
  summary: {
    nodesAdded: number
    nodesRemoved: number
    nodesModified: number
    edgesAdded: number
    edgesRemoved: number
    settingsChanged: boolean
  }
}

interface VersionHistoryPanelProps {
  flowId: string
  className?: string
  onClose?: () => void
  onVersionApplied?: (version: FlowVersion) => void
}

// API helper functions
const API_BASE = '/api/flows'

async function fetchVersions(flowId: string): Promise<{ versions: FlowVersion[]; total: number }> {
  const response = await fetch(`${API_BASE}/${flowId}/versions`, {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new Error('Failed to fetch versions')
  return response.json()
}

async function createVersion(
  flowId: string,
  data: { name?: string; message?: string }
): Promise<FlowVersion> {
  const response = await fetch(`${API_BASE}/${flowId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to create version')
  return response.json()
}

async function rollbackVersion(
  flowId: string,
  version: number
): Promise<{ success: boolean; snapshot: any }> {
  const response = await fetch(`${API_BASE}/${flowId}/versions/${version}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new Error('Failed to rollback')
  return response.json()
}

async function tagVersion(flowId: string, version: number, name: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${flowId}/versions/${version}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error('Failed to tag version')
}

async function deleteVersion(flowId: string, version: number): Promise<void> {
  const response = await fetch(`${API_BASE}/${flowId}/versions/${version}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new Error('Failed to delete version')
}

async function compareVersions(
  flowId: string,
  versionA: number,
  versionB: number
): Promise<VersionDiff> {
  const response = await fetch(
    `${API_BASE}/${flowId}/versions/compare?versionA=${versionA}&versionB=${versionB}`,
    {
      headers: { 'Content-Type': 'application/json' },
    }
  )
  if (!response.ok) throw new Error('Failed to compare versions')
  return response.json()
}

// Version Item Component
interface VersionItemProps {
  version: FlowVersion
  isLatest: boolean
  isSelected: boolean
  compareMode: boolean
  compareVersions: number[]
  onSelect: () => void
  onCompareSelect: (version: number) => void
  onRollback: () => void
  onTag: (name: string) => void
  onDelete: () => void
}

const VersionItem: React.FC<VersionItemProps> = ({
  version,
  isLatest,
  isSelected,
  compareMode,
  compareVersions,
  onSelect,
  onCompareSelect,
  onRollback,
  onTag,
  onDelete,
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isTagging, setIsTagging] = useState(false)
  const [tagInput, setTagInput] = useState(version.name || '')
  const isInCompare = compareVersions.includes(version.version)

  const formatDate = (dateStr: string) => {
    return formatDateUtil(dateStr)
  }

  const handleTagSubmit = () => {
    if (tagInput.trim()) {
      onTag(tagInput.trim())
    }
    setIsTagging(false)
  }

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden transition-all',
        isSelected
          ? 'border-indigo-500/50 bg-indigo-500/10'
          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600',
        isInCompare && 'ring-2 ring-amber-500/50'
      )}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Compare checkbox */}
        {compareMode && (
          <input
            type="checkbox"
            checked={isInCompare}
            onChange={() => onCompareSelect(version.version)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-indigo-500"
          />
        )}

        {/* Expand toggle */}
        <button
          type="button"
          className="p-0.5 text-slate-400 hover:text-white"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Version icon */}
        <GitCommit className={cn('w-4 h-4', isLatest ? 'text-green-400' : 'text-slate-500')} />

        {/* Version info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200">v{version.version}</span>
            {version.name && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                {version.name}
              </span>
            )}
            {isLatest && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                Current
              </span>
            )}
          </div>
          {version.message && (
            <p className="text-[10px] text-slate-500 truncate">{version.message}</p>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="flex items-center gap-0.5">
            <Layers className="w-3 h-3" />
            {version.nodesCount}
          </span>
          <span>{formatDate(version.createdAt)}</span>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-700/50 space-y-3">
          {/* Details */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-slate-500">Nodes:</span>
              <span className="ml-1 text-slate-300">{version.nodesCount}</span>
            </div>
            <div>
              <span className="text-slate-500">Edges:</span>
              <span className="ml-1 text-slate-300">{version.edgesCount}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500">Created:</span>
              <span className="ml-1 text-slate-300">
                {formatDateTime(version.createdAt)}
              </span>
            </div>
          </div>

          {/* Tag input */}
          {isTagging ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTagSubmit()}
                placeholder="Version name..."
                className={cn(
                  'flex-1 px-2 py-1 bg-slate-900/50 border border-slate-600 rounded',
                  'text-sm text-slate-200 placeholder-slate-500',
                  'focus:outline-none focus:border-indigo-500'
                )}
                autoFocus
              />
              <button
                type="button"
                onClick={handleTagSubmit}
                className="p-1 text-green-400 hover:bg-green-500/10 rounded"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsTagging(false)}
                className="p-1 text-slate-400 hover:bg-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Actions */
            <div className="flex items-center gap-1">
              {!isLatest && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRollback()
                  }}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors',
                    'text-amber-400 hover:bg-amber-500/10'
                  )}
                >
                  <RotateCcw className="w-3 h-3" />
                  Rollback
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsTagging(true)
                }}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors',
                  'text-slate-400 hover:bg-slate-700 hover:text-white'
                )}
              >
                <Tag className="w-3 h-3" />
                {version.name ? 'Rename' : 'Tag'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect()
                }}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors',
                  'text-slate-400 hover:bg-slate-700 hover:text-white'
                )}
              >
                <Eye className="w-3 h-3" />
                Preview
              </button>
              {!isLatest && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors',
                    'text-red-400 hover:bg-red-500/10'
                  )}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Compare View Component
interface CompareViewProps {
  diff: VersionDiff
  onClose: () => void
}

const CompareView: React.FC<CompareViewProps> = ({ diff, onClose }) => {
  const { summary } = diff

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-slate-200">
            v{diff.versionA} → v{diff.versionB}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 bg-green-500/10 border border-green-500/20 rounded text-center">
          <div className="text-lg font-bold text-green-400">{summary.nodesAdded}</div>
          <div className="text-[10px] text-slate-400">Added</div>
        </div>
        <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-center">
          <div className="text-lg font-bold text-amber-400">{summary.nodesModified}</div>
          <div className="text-[10px] text-slate-400">Modified</div>
        </div>
        <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-center">
          <div className="text-lg font-bold text-red-400">{summary.nodesRemoved}</div>
          <div className="text-[10px] text-slate-400">Removed</div>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 text-sm">
        {/* Added nodes */}
        {diff.nodes.added.length > 0 && (
          <div className="p-2 bg-green-500/5 border border-green-500/20 rounded">
            <div className="text-green-400 font-medium text-[11px] mb-1">Added Nodes</div>
            {diff.nodes.added.map((node) => (
              <div key={node.id} className="text-[11px] text-slate-300">
                + {node.label || node.id} ({node.type})
              </div>
            ))}
          </div>
        )}

        {/* Modified nodes */}
        {diff.nodes.modified.length > 0 && (
          <div className="p-2 bg-amber-500/5 border border-amber-500/20 rounded">
            <div className="text-amber-400 font-medium text-[11px] mb-1">Modified Nodes</div>
            {diff.nodes.modified.map((node) => (
              <div key={node.id} className="text-[11px] text-slate-300">
                ~ {node.label || node.id} ({node.type})
              </div>
            ))}
          </div>
        )}

        {/* Removed nodes */}
        {diff.nodes.removed.length > 0 && (
          <div className="p-2 bg-red-500/5 border border-red-500/20 rounded">
            <div className="text-red-400 font-medium text-[11px] mb-1">Removed Nodes</div>
            {diff.nodes.removed.map((node) => (
              <div key={node.id} className="text-[11px] text-slate-300">
                - {node.label || node.id} ({node.type})
              </div>
            ))}
          </div>
        )}

        {/* Edge changes */}
        {(summary.edgesAdded > 0 || summary.edgesRemoved > 0) && (
          <div className="p-2 bg-slate-500/10 border border-slate-600 rounded">
            <div className="text-slate-300 font-medium text-[11px] mb-1">Edge Changes</div>
            <div className="text-[11px] text-slate-400">
              {summary.edgesAdded > 0 && (
                <span className="text-green-400 mr-2">+{summary.edgesAdded} added</span>
              )}
              {summary.edgesRemoved > 0 && (
                <span className="text-red-400">-{summary.edgesRemoved} removed</span>
              )}
            </div>
          </div>
        )}

        {/* Settings changed */}
        {summary.settingsChanged && (
          <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded">
            <div className="text-purple-400 font-medium text-[11px]">Settings Modified</div>
          </div>
        )}
      </div>
    </div>
  )
}

// Main Component
export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  flowId,
  className,
  onClose,
  onVersionApplied,
}) => {
  const [versions, setVersions] = useState<FlowVersion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<FlowVersion | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [selectedCompareVersions, setSelectedCompareVersions] = useState<number[]>([])
  const [diff, setDiff] = useState<VersionDiff | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [showCommitForm, setShowCommitForm] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [commitName, setCommitName] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [isRollingBack, setIsRollingBack] = useState(false)
  const [confirmRollback, setConfirmRollback] = useState<number | null>(null)

  // Load versions
  const loadVersions = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await fetchVersions(flowId)
      setVersions(data.versions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load versions')
    } finally {
      setIsLoading(false)
    }
  }, [flowId])

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

  // Handle commit
  const handleCommit = async () => {
    try {
      setIsCommitting(true)
      await createVersion(flowId, {
        name: commitName.trim() || undefined,
        message: commitMessage.trim() || undefined,
      })
      toast.success('Version created')
      setShowCommitForm(false)
      setCommitMessage('')
      setCommitName('')
      loadVersions()
    } catch (err) {
      toast.error('Failed to create version')
    } finally {
      setIsCommitting(false)
    }
  }

  // Handle rollback
  const handleRollback = async (version: number) => {
    try {
      setIsRollingBack(true)
      const result = await rollbackVersion(flowId, version)
      toast.success(`Rolled back to v${version}`)
      setConfirmRollback(null)
      loadVersions()
      onVersionApplied?.({
        version,
        snapshot: result.snapshot,
      } as FlowVersion)
    } catch (err) {
      toast.error('Failed to rollback')
    } finally {
      setIsRollingBack(false)
    }
  }

  // Handle tag
  const handleTag = async (version: number, name: string) => {
    try {
      await tagVersion(flowId, version, name)
      toast.success('Version tagged')
      loadVersions()
    } catch (err) {
      toast.error('Failed to tag version')
    }
  }

  // Handle delete
  const handleDelete = async (version: number) => {
    try {
      await deleteVersion(flowId, version)
      toast.success('Version deleted')
      loadVersions()
    } catch (err) {
      toast.error('Failed to delete version')
    }
  }

  // Handle compare selection
  const handleCompareSelect = (version: number) => {
    setSelectedCompareVersions((prev) => {
      if (prev.includes(version)) {
        return prev.filter((v) => v !== version)
      }
      if (prev.length >= 2) {
        return [prev[1], version]
      }
      return [...prev, version]
    })
  }

  // Perform comparison
  const performCompare = async () => {
    if (selectedCompareVersions.length !== 2) return
    try {
      setIsComparing(true)
      const sorted = [...selectedCompareVersions].sort((a, b) => a - b)
      const result = await compareVersions(flowId, sorted[0], sorted[1])
      setDiff(result)
    } catch (err) {
      toast.error('Failed to compare versions')
    } finally {
      setIsComparing(false)
    }
  }

  return (
    <div className={cn('flex flex-col h-full bg-slate-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-slate-200">Version History</span>
          {versions.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
              {versions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setCompareMode(!compareMode)
              setSelectedCompareVersions([])
              setDiff(null)
            }}
            className={cn(
              'p-1.5 rounded transition-colors',
              compareMode
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'text-slate-400 hover:bg-slate-700 hover:text-white'
            )}
            title="Compare versions"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Compare bar */}
      {compareMode && (
        <div className="px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center gap-2">
          <span className="text-[11px] text-indigo-300">
            Select 2 versions to compare ({selectedCompareVersions.length}/2)
          </span>
          <div className="flex-1" />
          {selectedCompareVersions.length === 2 && (
            <button
              type="button"
              onClick={performCompare}
              disabled={isComparing}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors',
                'bg-indigo-500 text-white hover:bg-indigo-600',
                isComparing && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isComparing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ArrowLeftRight className="w-3 h-3" />
              )}
              Compare
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Diff view */}
        {diff && (
          <CompareView
            diff={diff}
            onClose={() => {
              setDiff(null)
              setSelectedCompareVersions([])
            }}
          />
        )}

        {/* Commit form */}
        {showCommitForm && (
          <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-slate-200">Create Version</span>
            </div>
            <input
              type="text"
              value={commitName}
              onChange={(e) => setCommitName(e.target.value)}
              placeholder="Version name (optional)"
              className={cn(
                'w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded',
                'text-sm text-slate-200 placeholder-slate-500',
                'focus:outline-none focus:border-indigo-500'
              )}
            />
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Describe your changes..."
              rows={2}
              className={cn(
                'w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded resize-none',
                'text-sm text-slate-200 placeholder-slate-500',
                'focus:outline-none focus:border-indigo-500'
              )}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCommitForm(false)}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={isCommitting}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded text-sm',
                  'bg-green-500/20 text-green-400 hover:bg-green-500/30',
                  isCommitting && 'opacity-50 cursor-not-allowed'
                )}
              >
                {isCommitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Create
              </button>
            </div>
          </div>
        )}

        {/* Create version button */}
        {!showCommitForm && !diff && (
          <button
            type="button"
            onClick={() => setShowCommitForm(true)}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-3 py-2',
              'border border-dashed border-slate-600 rounded-lg',
              'text-sm text-slate-400 hover:text-white hover:border-slate-500',
              'transition-colors'
            )}
          >
            <Plus className="w-4 h-4" />
            Create Version
          </button>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        )}

        {/* Rollback confirmation */}
        {confirmRollback !== null && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">Confirm Rollback</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Are you sure you want to rollback to v{confirmRollback}? This will replace the
              current flow state with this version. A backup will be created automatically.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRollback(null)}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRollback(confirmRollback)}
                disabled={isRollingBack}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded text-sm',
                  'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30',
                  isRollingBack && 'opacity-50 cursor-not-allowed'
                )}
              >
                {isRollingBack ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                Rollback
              </button>
            </div>
          </div>
        )}

        {/* Versions list */}
        {!isLoading && !diff && versions.length > 0 && (
          <div className="space-y-2">
            {versions.map((version, index) => (
              <VersionItem
                key={version.id}
                version={version}
                isLatest={index === 0}
                isSelected={selectedVersion?.id === version.id}
                compareMode={compareMode}
                compareVersions={selectedCompareVersions}
                onSelect={() =>
                  setSelectedVersion(selectedVersion?.id === version.id ? null : version)
                }
                onCompareSelect={handleCompareSelect}
                onRollback={() => setConfirmRollback(version.version)}
                onTag={(name) => handleTag(version.version, name)}
                onDelete={() => handleDelete(version.version)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && versions.length === 0 && (
          <div className="py-8 text-center">
            <GitBranch className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No versions yet</p>
            <p className="text-[11px] text-slate-600">
              Create a version to save the current state
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default VersionHistoryPanel
