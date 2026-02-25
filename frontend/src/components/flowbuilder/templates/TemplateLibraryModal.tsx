/**
 * Template Library Modal
 *
 * Browse, search, and use flow templates from the library.
 * Supports importing templates from files and rating community templates.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  X,
  Search,
  Filter,
  Download,
  Upload,
  Star,
  StarHalf,
  Layers,
  Clock,
  User,
  ChevronDown,
  Loader2,
  Package,
  AlertTriangle,
  Check,
  ExternalLink,
  FileJson,
  Grid,
  List,
  Tag,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import toast from 'react-hot-toast'
import { formatDate as formatDateUtil } from '@/utils/dateFormat'

// Types
interface FlowTemplate {
  id: string
  name: string
  description?: string
  category: string
  tags?: string[]
  nodesCount: number
  edgesCount: number
  rating?: number
  ratingCount?: number
  downloads?: number
  authorId?: string
  authorName?: string
  isPublic: boolean
  createdAt: string
  updatedAt: string
  flow?: {
    nodes: any[]
    edges: any[]
    settings?: any
  }
  variables?: {
    name: string
    description?: string
    defaultValue?: any
    type: string
  }[]
}

interface TemplateCategory {
  id: string
  name: string
  description?: string
  icon?: string
}

interface TemplateLibraryModalProps {
  open: boolean
  onClose: () => void
  onUseTemplate: (flowId: string, flowName: string) => void
  currentFlowId?: string
}

// Category icons map
const categoryIcons: Record<string, string> = {
  marketing: '📣',
  sales: '💼',
  support: '🎧',
  integration: '🔌',
  ai: '🤖',
  automation: '⚙️',
  communication: '💬',
  data: '📊',
  utility: '🔧',
  other: '📦',
}

// API Base
const API_BASE = '/api/flows'

// API Functions
async function fetchTemplates(options: {
  category?: string
  search?: string
  publicOnly?: boolean
}): Promise<{ templates: FlowTemplate[]; categories: TemplateCategory[] }> {
  const params = new URLSearchParams()
  if (options.category) params.set('category', options.category)
  if (options.search) params.set('search', options.search)
  if (options.publicOnly) params.set('publicOnly', 'true')

  const response = await fetch(`${API_BASE}/templates?${params}`, {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new Error('Failed to fetch templates')
  return response.json()
}

async function useTemplate(
  templateId: string,
  options: { name?: string; description?: string; variables?: Record<string, any> }
): Promise<{ flowId: string; name: string }> {
  const response = await fetch(`${API_BASE}/templates/${templateId}/use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!response.ok) throw new Error('Failed to use template')
  return response.json()
}

async function importFromFile(
  template: any,
  options: { name?: string; description?: string }
): Promise<{ flowId: string; name: string }> {
  const response = await fetch(`${API_BASE}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template, ...options }),
  })
  if (!response.ok) throw new Error('Failed to import template')
  return response.json()
}

async function rateTemplate(templateId: string, rating: number): Promise<void> {
  const response = await fetch(`${API_BASE}/templates/${templateId}/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  })
  if (!response.ok) throw new Error('Failed to rate template')
}

// Template Card Component
interface TemplateCardProps {
  template: FlowTemplate
  onUse: () => void
  onRate: (rating: number) => void
  isCompact?: boolean
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onUse, onRate, isCompact }) => {
  const [isHovered, setIsHovered] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const [hoverRating, setHoverRating] = useState(0)

  const formatDate = (dateStr: string) => {
    return formatDateUtil(dateStr)
  }

  const renderStars = (rating: number = 0, interactive = false) => {
    const stars = []
    for (let i = 1; i <= 5; i++) {
      const filled = interactive ? i <= hoverRating : i <= Math.floor(rating)
      const half = !interactive && i > rating && i - 0.5 <= rating
      stars.push(
        <button
          type="button"
          key={i}
          onClick={() => interactive && onRate(i)}
          onMouseEnter={() => interactive && setHoverRating(i)}
          onMouseLeave={() => interactive && setHoverRating(0)}
          className={cn(
            'transition-colors',
            interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'
          )}
        >
          {half ? (
            <StarHalf className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          ) : (
            <Star
              className={cn(
                'w-3.5 h-3.5',
                filled ? 'text-amber-400 fill-amber-400' : 'text-slate-600'
              )}
            />
          )}
        </button>
      )
    }
    return stars
  }

  if (isCompact) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-lg',
          'hover:border-slate-600 transition-all cursor-pointer'
        )}
        onClick={onUse}
      >
        <div className="text-2xl">{categoryIcons[template.category] || '📦'}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-200 truncate">{template.name}</div>
          <div className="text-[10px] text-slate-500 truncate">{template.description}</div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="flex items-center gap-0.5">
            <Layers className="w-3 h-3" />
            {template.nodesCount}
          </span>
          {template.rating && (
            <span className="flex items-center gap-0.5">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              {template.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden',
        'hover:border-slate-600 transition-all'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        setShowRating(false)
      }}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="text-3xl">{categoryIcons[template.category] || '📦'}</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-slate-200 line-clamp-1">{template.name}</h3>
            <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
              {template.description || 'No description'}
            </p>
          </div>
        </div>

        {/* Tags */}
        {template.tags && template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {template.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[9px] bg-slate-700/50 text-slate-400 rounded"
              >
                {tag}
              </span>
            ))}
            {template.tags.length > 3 && (
              <span className="text-[9px] text-slate-500">+{template.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {template.nodesCount} nodes
          </span>
          {template.downloads !== undefined && (
            <span className="flex items-center gap-1">
              <Download className="w-3 h-3" />
              {template.downloads}
            </span>
          )}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-2 mt-2">
          {showRating ? (
            <div className="flex items-center gap-0.5">{renderStars(0, true)}</div>
          ) : (
            <>
              <div className="flex items-center gap-0.5">{renderStars(template.rating)}</div>
              {template.ratingCount !== undefined && (
                <span className="text-[10px] text-slate-500">({template.ratingCount})</span>
              )}
            </>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setShowRating(!showRating)
            }}
            className="text-[10px] text-slate-500 hover:text-slate-300"
          >
            {showRating ? 'Cancel' : 'Rate'}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-slate-900/50 border-t border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <Clock className="w-3 h-3" />
          {formatDate(template.createdAt)}
        </div>
        <button
          type="button"
          onClick={onUse}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-all',
            'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
          )}
        >
          <Download className="w-3 h-3" />
          Use Template
        </button>
      </div>

      {/* Public badge */}
      {template.isPublic && (
        <div className="absolute top-2 right-2">
          <span className="px-1.5 py-0.5 text-[9px] bg-green-500/20 text-green-400 rounded">
            Public
          </span>
        </div>
      )}
    </div>
  )
}

// Template Detail Modal
interface TemplateDetailProps {
  template: FlowTemplate
  onClose: () => void
  onUse: (name: string, variables?: Record<string, any>) => void
  isUsing: boolean
}

const TemplateDetail: React.FC<TemplateDetailProps> = ({ template, onClose, onUse, isUsing }) => {
  const [name, setName] = useState(template.name)
  const [variables, setVariables] = useState<Record<string, any>>(() => {
    const vars: Record<string, any> = {}
    template.variables?.forEach((v) => {
      vars[v.name] = v.defaultValue ?? ''
    })
    return vars
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{categoryIcons[template.category] || '📦'}</div>
            <div>
              <h2 className="text-lg font-semibold text-white">{template.name}</h2>
              <p className="text-sm text-slate-400">{template.category}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Description */}
          <div>
            <p className="text-sm text-slate-300">
              {template.description || 'No description provided.'}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 bg-slate-700/50 rounded text-center">
              <div className="text-lg font-bold text-slate-200">{template.nodesCount}</div>
              <div className="text-[10px] text-slate-500">Nodes</div>
            </div>
            <div className="p-2 bg-slate-700/50 rounded text-center">
              <div className="text-lg font-bold text-slate-200">{template.edgesCount}</div>
              <div className="text-[10px] text-slate-500">Edges</div>
            </div>
            <div className="p-2 bg-slate-700/50 rounded text-center">
              <div className="text-lg font-bold text-slate-200">{template.downloads || 0}</div>
              <div className="text-[10px] text-slate-500">Uses</div>
            </div>
          </div>

          {/* Name input */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300">Flow Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name for your new flow..."
              className={cn(
                'w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg',
                'text-sm text-slate-200 placeholder-slate-500',
                'focus:outline-none focus:border-indigo-500'
              )}
            />
          </div>

          {/* Variables */}
          {template.variables && template.variables.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-300">Template Variables</h3>
              {template.variables.map((variable) => (
                <div key={variable.name} className="space-y-1">
                  <label className="text-[11px] text-slate-400 flex items-center gap-1">
                    {variable.name}
                    {variable.description && (
                      <span className="text-slate-600">- {variable.description}</span>
                    )}
                  </label>
                  <input
                    type={variable.type === 'number' ? 'number' : 'text'}
                    value={variables[variable.name] ?? ''}
                    onChange={(e) =>
                      setVariables((prev) => ({ ...prev, [variable.name]: e.target.value }))
                    }
                    placeholder={`Enter ${variable.name}...`}
                    className={cn(
                      'w-full px-3 py-1.5 bg-slate-900/50 border border-slate-600 rounded',
                      'text-sm text-slate-200 placeholder-slate-500',
                      'focus:outline-none focus:border-indigo-500'
                    )}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onUse(name, variables)}
            disabled={isUsing || !name.trim()}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
              'bg-indigo-500 text-white hover:bg-indigo-600',
              (isUsing || !name.trim()) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isUsing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Create Flow
          </button>
        </div>
      </div>
    </div>
  )
}

// Main Component
export const TemplateLibraryModal: React.FC<TemplateLibraryModalProps> = ({
  open,
  onClose,
  onUseTemplate,
  currentFlowId,
}) => {
  const [templates, setTemplates] = useState<FlowTemplate[]>([])
  const [categories, setCategories] = useState<TemplateCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [showPublicOnly, setShowPublicOnly] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedTemplate, setSelectedTemplate] = useState<FlowTemplate | null>(null)
  const [isUsing, setIsUsing] = useState(false)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await fetchTemplates({
        category: category || undefined,
        search: search.trim() || undefined,
        publicOnly: showPublicOnly,
      })
      setTemplates(data.templates)
      setCategories(data.categories)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates')
    } finally {
      setIsLoading(false)
    }
  }, [category, search, showPublicOnly])

  useEffect(() => {
    if (open) {
      loadTemplates()
    }
  }, [open, loadTemplates])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (open) loadTemplates()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Handle use template
  const handleUseTemplate = async (name: string, variables?: Record<string, any>) => {
    if (!selectedTemplate) return

    try {
      setIsUsing(true)
      const result = await useTemplate(selectedTemplate.id, { name, variables })
      toast.success('Flow created from template')
      setSelectedTemplate(null)
      onUseTemplate(result.flowId, result.name)
      onClose()
    } catch (err) {
      toast.error('Failed to create flow from template')
    } finally {
      setIsUsing(false)
    }
  }

  // Handle file import
  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const template = JSON.parse(text)

      // Validate template structure
      if (!template.flow || !template.name) {
        throw new Error('Invalid template file format')
      }

      setIsUsing(true)
      const result = await importFromFile(template, {
        name: template.name,
        description: template.description,
      })
      toast.success('Flow imported successfully')
      onUseTemplate(result.flowId, result.name)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import template')
    } finally {
      setIsUsing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Handle rate
  const handleRate = async (templateId: string, rating: number) => {
    try {
      await rateTemplate(templateId, rating)
      toast.success('Rating submitted')
      loadTemplates()
    } catch (err) {
      toast.error('Failed to submit rating')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Template Library</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-700/50">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className={cn(
                'w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg',
                'text-sm text-slate-200 placeholder-slate-500',
                'focus:outline-none focus:border-indigo-500'
              )}
            />
          </div>

          {/* Category filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg',
                'text-sm text-slate-300 hover:border-slate-600'
              )}
            >
              <Filter className="w-4 h-4" />
              {category || 'All Categories'}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showCategoryDropdown && (
              <div className="absolute right-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10">
                <button
                  type="button"
                  onClick={() => {
                    setCategory(null)
                    setShowCategoryDropdown(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left',
                    'hover:bg-slate-700',
                    !category && 'text-indigo-400'
                  )}
                >
                  All Categories
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setCategory(cat.id)
                      setShowCategoryDropdown(false)
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm text-left',
                      'hover:bg-slate-700',
                      category === cat.id && 'text-indigo-400'
                    )}
                  >
                    <span>{categoryIcons[cat.id] || '📦'}</span>
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center border border-slate-700 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'grid'
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-slate-500 hover:text-white'
              )}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'list'
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-slate-500 hover:text-white'
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Import from file */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
              'bg-slate-700 text-slate-300 hover:bg-slate-600'
            )}
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileImport}
            className="hidden"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Error */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-sm text-red-400 mb-4">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && templates.length === 0 && (
            <div className="py-12 text-center">
              <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-slate-300 mb-1">No templates found</h3>
              <p className="text-sm text-slate-500">
                {search || category ? 'Try adjusting your filters' : 'Create your first template'}
              </p>
            </div>
          )}

          {/* Templates grid */}
          {!isLoading && templates.length > 0 && (
            <div
              className={cn(
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                  : 'space-y-2'
              )}
            >
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onUse={() => setSelectedTemplate(template)}
                  onRate={(rating) => handleRate(template.id, rating)}
                  isCompact={viewMode === 'list'}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between text-sm text-slate-500">
          <span>
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </span>
          <a
            href="#"
            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
            onClick={(e) => {
              e.preventDefault()
              toast('Community templates coming soon!')
            }}
          >
            Browse Community
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Template detail modal */}
      {selectedTemplate && (
        <TemplateDetail
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onUse={handleUseTemplate}
          isUsing={isUsing}
        />
      )}
    </div>
  )
}

export default TemplateLibraryModal
