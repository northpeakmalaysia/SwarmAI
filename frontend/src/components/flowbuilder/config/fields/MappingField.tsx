/**
 * Mapping Field Component
 *
 * Maps source fields to target fields with transformation options.
 */

import React, { useState, useCallback, useMemo } from 'react'
import {
  Info,
  AlertCircle,
  Plus,
  Trash2,
  ArrowRight,
  Variable,
  Wand2,
  ChevronDown,
  GripVertical,
  ChevronUp,
} from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface FieldOption {
  value: string
  label: string
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
}

interface TransformOption {
  value: string
  label: string
  description?: string
}

interface MappingEntry {
  id: string
  source: string
  target: string
  transform?: string
  defaultValue?: string
}

interface MappingFieldProps extends BaseFieldProps<MappingEntry[]> {
  sourceFields?: FieldOption[]
  targetFields?: FieldOption[]
  transforms?: TransformOption[]
  allowCustomSource?: boolean
  allowCustomTarget?: boolean
  allowReorder?: boolean
  showDefaults?: boolean
  maxMappings?: number
}

const defaultTransforms: TransformOption[] = [
  { value: 'none', label: 'None', description: 'Pass value as-is' },
  { value: 'toString', label: 'To String', description: 'Convert to string' },
  { value: 'toNumber', label: 'To Number', description: 'Parse as number' },
  { value: 'toBoolean', label: 'To Boolean', description: 'Convert to boolean' },
  { value: 'toJson', label: 'To JSON', description: 'Parse JSON string' },
  { value: 'stringify', label: 'Stringify', description: 'Convert to JSON string' },
  { value: 'trim', label: 'Trim', description: 'Remove whitespace' },
  { value: 'lowercase', label: 'Lowercase', description: 'Convert to lowercase' },
  { value: 'uppercase', label: 'Uppercase', description: 'Convert to uppercase' },
  { value: 'first', label: 'First Item', description: 'Get first array element' },
  { value: 'last', label: 'Last Item', description: 'Get last array element' },
  { value: 'length', label: 'Length', description: 'Get string/array length' },
  { value: 'keys', label: 'Object Keys', description: 'Get object keys' },
  { value: 'values', label: 'Object Values', description: 'Get object values' },
]

export const MappingField: React.FC<MappingFieldProps> = ({
  name,
  label,
  value = [],
  onChange,
  helpText,
  error,
  disabled,
  required,
  className,
  sourceFields = [],
  targetFields = [],
  transforms = defaultTransforms,
  allowCustomSource = true,
  allowCustomTarget = true,
  allowReorder = true,
  showDefaults = false,
  maxMappings,
}) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const generateId = () => `mapping-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const canAdd = !maxMappings || value.length < maxMappings

  const addMapping = useCallback(() => {
    if (!canAdd) return
    const newMapping: MappingEntry = {
      id: generateId(),
      source: '',
      target: '',
      transform: 'none',
    }
    onChange([...value, newMapping])
  }, [value, onChange, canAdd])

  const removeMapping = useCallback(
    (id: string) => {
      onChange(value.filter((m) => m.id !== id))
    },
    [value, onChange]
  )

  const updateMapping = useCallback(
    (id: string, updates: Partial<MappingEntry>) => {
      onChange(value.map((m) => (m.id === id ? { ...m, ...updates } : m)))
    },
    [value, onChange]
  )

  const moveMapping = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= value.length) return

      const newValue = [...value]
      const temp = newValue[index]
      newValue[index] = newValue[newIndex]
      newValue[newIndex] = temp
      onChange(newValue)
    },
    [value, onChange]
  )

  // Find unmapped target fields
  const unmappedTargets = useMemo(() => {
    const mappedTargets = new Set(value.map((m) => m.target))
    return targetFields.filter((f) => !mappedTargets.has(f.value))
  }, [value, targetFields])

  // Auto-map suggestion
  const suggestMapping = useCallback(() => {
    if (sourceFields.length === 0 || targetFields.length === 0) return

    const newMappings: MappingEntry[] = []
    for (const target of targetFields) {
      // Try to find matching source by name
      const matchingSource = sourceFields.find(
        (s) =>
          s.value.toLowerCase() === target.value.toLowerCase() ||
          s.label.toLowerCase() === target.label.toLowerCase()
      )
      if (matchingSource && !value.some((m) => m.target === target.value)) {
        newMappings.push({
          id: generateId(),
          source: matchingSource.value,
          target: target.value,
          transform: 'none',
        })
      }
    }

    if (newMappings.length > 0) {
      onChange([...value, ...newMappings])
    }
  }, [sourceFields, targetFields, value, onChange])

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <div className="flex items-center gap-2">
          {sourceFields.length > 0 && targetFields.length > 0 && (
            <button
              type="button"
              onClick={suggestMapping}
              disabled={disabled}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-[10px] rounded',
                'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
                'hover:bg-indigo-500/30 transition-colors',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Wand2 className="w-3 h-3" />
              Auto-map
            </button>
          )}
          <span className="text-[10px] text-slate-500">
            {value.length} mapping{value.length !== 1 ? 's' : ''}
            {maxMappings && ` / ${maxMappings} max`}
          </span>
        </div>
      </div>

      {/* Mappings */}
      <div className="space-y-2">
        {value.map((mapping, index) => {
          const isExpanded = expandedRow === mapping.id

          return (
            <div
              key={mapping.id}
              className={cn(
                'border rounded-lg overflow-hidden transition-colors',
                isExpanded ? 'border-indigo-500/50 bg-slate-800/50' : 'border-slate-700 bg-slate-800/30'
              )}
            >
              {/* Main row */}
              <div className="flex items-center gap-2 p-2">
                {/* Reorder controls */}
                {allowReorder && value.length > 1 && (
                  <div className="flex flex-col items-center text-slate-500">
                    <button
                      type="button"
                      onClick={() => moveMapping(index, 'up')}
                      disabled={disabled || index === 0}
                      className="p-0.5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <GripVertical className="w-3 h-3" />
                    <button
                      type="button"
                      onClick={() => moveMapping(index, 'down')}
                      disabled={disabled || index === value.length - 1}
                      className="p-0.5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Source field */}
                <div className="flex-1 relative">
                  <Variable className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                  {sourceFields.length > 0 && !allowCustomSource ? (
                    <select
                      value={mapping.source}
                      onChange={(e) => updateMapping(mapping.id, { source: e.target.value })}
                      disabled={disabled}
                      className={cn(
                        'w-full pl-7 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                        'text-sm text-slate-100 appearance-none',
                        'focus:outline-none focus:border-indigo-500',
                        disabled && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <option value="">Select source...</option>
                      {sourceFields.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={mapping.source}
                      onChange={(e) => updateMapping(mapping.id, { source: e.target.value })}
                      placeholder="Source field or {{variable}}"
                      disabled={disabled}
                      list={`${name}-sources-${mapping.id}`}
                      className={cn(
                        'w-full pl-7 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                        'text-sm text-slate-100 placeholder-slate-500',
                        'focus:outline-none focus:border-indigo-500',
                        disabled && 'opacity-50 cursor-not-allowed'
                      )}
                    />
                  )}
                  {sourceFields.length > 0 && allowCustomSource && (
                    <datalist id={`${name}-sources-${mapping.id}`}>
                      {sourceFields.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </datalist>
                  )}
                </div>

                {/* Arrow */}
                <ArrowRight className="w-4 h-4 text-indigo-400 flex-shrink-0" />

                {/* Target field */}
                <div className="flex-1 relative">
                  {targetFields.length > 0 && !allowCustomTarget ? (
                    <select
                      value={mapping.target}
                      onChange={(e) => updateMapping(mapping.id, { target: e.target.value })}
                      disabled={disabled}
                      className={cn(
                        'w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                        'text-sm text-slate-100 appearance-none',
                        'focus:outline-none focus:border-indigo-500',
                        disabled && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <option value="">Select target...</option>
                      {targetFields.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={mapping.target}
                      onChange={(e) => updateMapping(mapping.id, { target: e.target.value })}
                      placeholder="Target field"
                      disabled={disabled}
                      list={`${name}-targets-${mapping.id}`}
                      className={cn(
                        'w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                        'text-sm text-slate-100 placeholder-slate-500',
                        'focus:outline-none focus:border-indigo-500',
                        disabled && 'opacity-50 cursor-not-allowed'
                      )}
                    />
                  )}
                  {targetFields.length > 0 && allowCustomTarget && (
                    <datalist id={`${name}-targets-${mapping.id}`}>
                      {targetFields.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </datalist>
                  )}
                </div>

                {/* Expand/Actions */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setExpandedRow(isExpanded ? null : mapping.id)}
                    disabled={disabled}
                    className={cn(
                      'p-1 text-slate-500 hover:text-white rounded transition-colors',
                      isExpanded && 'text-indigo-400'
                    )}
                    title="Transform options"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMapping(mapping.id)}
                    disabled={disabled}
                    className={cn(
                      'p-1 text-slate-500 hover:text-red-400 rounded transition-colors',
                      disabled && 'opacity-50'
                    )}
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Expanded options */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-700 space-y-2">
                  {/* Transform */}
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-500 w-20">Transform:</label>
                    <select
                      value={mapping.transform || 'none'}
                      onChange={(e) => updateMapping(mapping.id, { transform: e.target.value })}
                      disabled={disabled}
                      className={cn(
                        'flex-1 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded',
                        'text-xs text-slate-100 appearance-none',
                        'focus:outline-none focus:border-indigo-500',
                        disabled && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {transforms.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    {mapping.transform && mapping.transform !== 'none' && (
                      <span className="text-[10px] text-slate-500">
                        {transforms.find((t) => t.value === mapping.transform)?.description}
                      </span>
                    )}
                  </div>

                  {/* Default value */}
                  {showDefaults && (
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-slate-500 w-20">Default:</label>
                      <input
                        type="text"
                        value={mapping.defaultValue || ''}
                        onChange={(e) => updateMapping(mapping.id, { defaultValue: e.target.value })}
                        placeholder="Value if source is empty"
                        disabled={disabled}
                        className={cn(
                          'flex-1 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded',
                          'text-xs text-slate-100 placeholder-slate-500',
                          'focus:outline-none focus:border-indigo-500',
                          disabled && 'opacity-50 cursor-not-allowed'
                        )}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {value.length === 0 && (
          <div className="py-6 text-center text-sm text-slate-500 border border-dashed border-slate-600 rounded-lg">
            No field mappings defined
          </div>
        )}
      </div>

      {/* Add mapping button */}
      {canAdd && (
        <button
          type="button"
          onClick={addMapping}
          disabled={disabled}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-3 py-2',
            'border border-dashed border-slate-600 rounded-lg',
            'text-sm text-slate-400 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-indigo-500/5',
            'transition-colors',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Plus className="w-4 h-4" />
          Add Mapping
        </button>
      )}

      {/* Unmapped targets hint */}
      {unmappedTargets.length > 0 && (
        <div className="text-[10px] text-slate-500">
          Unmapped targets: {unmappedTargets.map((f) => f.label).join(', ')}
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
