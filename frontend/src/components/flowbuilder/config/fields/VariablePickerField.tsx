/**
 * Variable Picker Field Component
 *
 * Allows selecting variables from available context with autocomplete and categorization.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Info, AlertCircle, Variable, Search, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface VariableCategory {
  label: string
  icon?: React.ReactNode
  variables: VariableOption[]
}

interface VariableOption {
  name: string
  path: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
  description?: string
  example?: string
}

interface VariablePickerFieldProps extends BaseFieldProps<string> {
  categories?: VariableCategory[]
  allowCustom?: boolean
  showTypeHints?: boolean
  insertMode?: 'replace' | 'append'
  wrapWithBraces?: boolean
}

const defaultCategories: VariableCategory[] = [
  {
    label: 'Input',
    variables: [
      { name: 'message', path: 'input.message', type: 'string', description: 'Incoming message text' },
      { name: 'sender', path: 'input.sender', type: 'string', description: 'Sender identifier' },
      { name: 'platform', path: 'input.platform', type: 'string', description: 'Message platform' },
      { name: 'timestamp', path: 'input.timestamp', type: 'string', description: 'Message timestamp' },
      { name: 'metadata', path: 'input.metadata', type: 'object', description: 'Additional metadata' },
    ],
  },
  {
    label: 'Context',
    variables: [
      { name: 'userId', path: 'context.userId', type: 'string', description: 'Current user ID' },
      { name: 'agentId', path: 'context.agentId', type: 'string', description: 'Current agent ID' },
      { name: 'flowId', path: 'context.flowId', type: 'string', description: 'Current flow ID' },
      { name: 'executionId', path: 'context.executionId', type: 'string', description: 'Current execution ID' },
    ],
  },
  {
    label: 'Environment',
    variables: [
      { name: 'NODE_ENV', path: 'env.NODE_ENV', type: 'string', description: 'Node environment' },
      { name: 'API_URL', path: 'env.API_URL', type: 'string', description: 'API base URL' },
    ],
  },
]

const typeColors: Record<string, string> = {
  string: 'text-green-400',
  number: 'text-blue-400',
  boolean: 'text-amber-400',
  object: 'text-purple-400',
  array: 'text-cyan-400',
  any: 'text-slate-400',
}

export const VariablePickerField: React.FC<VariablePickerFieldProps> = ({
  name,
  label,
  value,
  onChange,
  placeholder = 'Select or type a variable...',
  helpText,
  error,
  disabled,
  required,
  className,
  categories = defaultCategories,
  allowCustom = true,
  showTypeHints = true,
  insertMode = 'replace',
  wrapWithBraces = true,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<string[]>(categories.map((c) => c.label))
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter variables by search
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories

    const term = search.toLowerCase()
    return categories
      .map((cat) => ({
        ...cat,
        variables: cat.variables.filter(
          (v) =>
            v.name.toLowerCase().includes(term) ||
            v.path.toLowerCase().includes(term) ||
            v.description?.toLowerCase().includes(term)
        ),
      }))
      .filter((cat) => cat.variables.length > 0)
  }, [categories, search])

  const toggleCategory = (label: string) => {
    setExpandedCategories((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  const selectVariable = (variable: VariableOption) => {
    const formatted = wrapWithBraces ? `{{${variable.path}}}` : variable.path

    if (insertMode === 'append' && value) {
      onChange(`${value} ${formatted}`)
    } else {
      onChange(formatted)
    }

    setIsOpen(false)
    setSearch('')
  }

  const copyValue = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Find current variable info for display
  const currentVariable = useMemo(() => {
    if (!value) return null
    const path = value.replace(/^\{\{|\}\}$/g, '')
    for (const cat of categories) {
      const found = cat.variables.find((v) => v.path === path)
      if (found) return found
    }
    return null
  }, [value, categories])

  return (
    <div ref={containerRef} className={cn('space-y-1.5 relative', className)}>
      <label htmlFor={name} className="block text-xs font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      {/* Input with dropdown trigger */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          <Variable className="w-4 h-4" />
        </div>

        <input
          ref={inputRef}
          id={name}
          type="text"
          value={value || ''}
          onChange={(e) => allowCustom && onChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={!allowCustom}
          className={cn(
            'w-full pl-10 pr-20 py-2 bg-slate-700/50 border border-slate-600 rounded-lg',
            'text-sm text-slate-100 font-mono',
            'placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
            'transition-colors',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-red-500',
            !allowCustom && 'cursor-pointer'
          )}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={copyValue}
              className="p-1 text-slate-500 hover:text-white transition-colors"
              title="Copy"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            disabled={disabled}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Current variable info */}
      {currentVariable && showTypeHints && (
        <div className="px-2 py-1 bg-slate-800/50 rounded text-[10px]">
          <span className={typeColors[currentVariable.type]}>{currentVariable.type}</span>
          {currentVariable.description && (
            <span className="text-slate-500 ml-2">{currentVariable.description}</span>
          )}
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search variables..."
                className={cn(
                  'w-full pl-7 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                  'text-sm text-slate-100 placeholder-slate-500',
                  'focus:outline-none focus:border-indigo-500'
                )}
                autoFocus
              />
            </div>
          </div>

          {/* Categories */}
          <div className="max-h-64 overflow-y-auto">
            {filteredCategories.length === 0 ? (
              <div className="p-3 text-center text-sm text-slate-500">No variables found</div>
            ) : (
              filteredCategories.map((category) => (
                <div key={category.label}>
                  {/* Category header */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.label)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2',
                      'text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700/50',
                      'transition-colors'
                    )}
                  >
                    {expandedCategories.includes(category.label) ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    {category.label}
                    <span className="text-[10px] text-slate-500 ml-auto">
                      {category.variables.length}
                    </span>
                  </button>

                  {/* Variables */}
                  {expandedCategories.includes(category.label) && (
                    <div className="pb-1">
                      {category.variables.map((variable) => (
                        <button
                          key={variable.path}
                          type="button"
                          onClick={() => selectVariable(variable)}
                          className={cn(
                            'w-full flex items-start gap-2 px-4 py-2',
                            'hover:bg-indigo-500/10 transition-colors',
                            'text-left'
                          )}
                        >
                          <Variable className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-100 font-mono">
                                {variable.name}
                              </span>
                              {showTypeHints && (
                                <span className={cn('text-[10px]', typeColors[variable.type])}>
                                  {variable.type}
                                </span>
                              )}
                            </div>
                            {variable.description && (
                              <p className="text-[10px] text-slate-500 truncate">
                                {variable.description}
                              </p>
                            )}
                            <code className="text-[10px] text-slate-600">
                              {wrapWithBraces ? `{{${variable.path}}}` : variable.path}
                            </code>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {(helpText || error) && (
        <div className="text-xs">
          {error ? (
            <p className="flex items-start text-red-400">
              <AlertCircle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
              {error}
            </p>
          ) : (
            <p className="flex items-start text-slate-500">
              <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
              {helpText}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
