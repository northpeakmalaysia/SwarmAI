/**
 * Key-Value Field Component
 *
 * Manages a dictionary/object of key-value pairs with add/remove/edit capabilities.
 */

import React, { useState, useCallback } from 'react'
import { Info, AlertCircle, Plus, Trash2, Key, Type, Copy, Check } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface KeyValueFieldProps extends BaseFieldProps<Record<string, string>> {
  keyPlaceholder?: string
  valuePlaceholder?: string
  allowDuplicateKeys?: boolean
  maxPairs?: number
  keyPattern?: RegExp
  valueType?: 'text' | 'password' | 'number'
  predefinedKeys?: string[]
}

interface KeyValuePair {
  id: string
  key: string
  value: string
}

export const KeyValueField: React.FC<KeyValueFieldProps> = ({
  name,
  label,
  value = {},
  onChange,
  helpText,
  error,
  disabled,
  required,
  className,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  allowDuplicateKeys = false,
  maxPairs,
  keyPattern,
  valueType = 'text',
  predefinedKeys = [],
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Convert object to array of pairs for easier manipulation
  const pairs: KeyValuePair[] = Object.entries(value).map(([k, v], index) => ({
    id: `pair-${index}-${k}`,
    key: k,
    value: v,
  }))

  const canAdd = !maxPairs || pairs.length < maxPairs

  const updatePairs = useCallback(
    (newPairs: KeyValuePair[]) => {
      const newValue: Record<string, string> = {}
      for (const pair of newPairs) {
        if (pair.key.trim()) {
          newValue[pair.key] = pair.value
        }
      }
      onChange(newValue)
    },
    [onChange]
  )

  const addPair = () => {
    if (!canAdd) return
    const newPairs = [...pairs, { id: `pair-${Date.now()}`, key: '', value: '' }]
    updatePairs(newPairs)
  }

  const removePair = (id: string) => {
    const newPairs = pairs.filter((p) => p.id !== id)
    updatePairs(newPairs)
  }

  const updateKey = (id: string, newKey: string) => {
    // Validate key pattern if provided
    if (keyPattern && newKey && !keyPattern.test(newKey)) {
      return
    }

    const newPairs = pairs.map((p) => (p.id === id ? { ...p, key: newKey } : p))
    updatePairs(newPairs)
  }

  const updateValue = (id: string, newValue: string) => {
    const newPairs = pairs.map((p) => (p.id === id ? { ...p, value: newValue } : p))
    updatePairs(newPairs)
  }

  const copyPair = async (key: string, pairValue: string) => {
    try {
      await navigator.clipboard.writeText(`${key}: ${pairValue}`)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const hasKeyError = (key: string, id: string): string | null => {
    if (!key.trim()) return null
    if (!allowDuplicateKeys) {
      const duplicates = pairs.filter((p) => p.key === key && p.id !== id)
      if (duplicates.length > 0) {
        return 'Duplicate key'
      }
    }
    return null
  }

  const unusedPredefinedKeys = predefinedKeys.filter(
    (k) => !pairs.some((p) => p.key === k)
  )

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <span className="text-[10px] text-slate-500">
          {pairs.length} pair{pairs.length !== 1 ? 's' : ''}
          {maxPairs && ` / ${maxPairs} max`}
        </span>
      </div>

      {/* Predefined keys suggestions */}
      {unusedPredefinedKeys.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unusedPredefinedKeys.slice(0, 5).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                const newPairs = [...pairs, { id: `pair-${Date.now()}`, key, value: '' }]
                updatePairs(newPairs)
              }}
              disabled={disabled || !canAdd}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded border transition-colors',
                'bg-slate-700/50 border-slate-600 text-slate-400',
                'hover:text-indigo-300 hover:border-indigo-500/50',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              + {key}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {pairs.map((pair) => {
          const keyError = hasKeyError(pair.key, pair.id)
          return (
            <div
              key={pair.id}
              className={cn(
                'flex items-center gap-2 p-2 bg-slate-800/50 border border-slate-700 rounded-lg',
                'group'
              )}
            >
              {/* Key input */}
              <div className="relative flex-1">
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500">
                  <Key className="w-3 h-3" />
                </div>
                <input
                  type="text"
                  value={pair.key}
                  onChange={(e) => updateKey(pair.id, e.target.value)}
                  disabled={disabled}
                  placeholder={keyPlaceholder}
                  list={`${name}-keys-${pair.id}`}
                  className={cn(
                    'w-full pl-7 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                    'text-sm text-slate-100 placeholder-slate-500',
                    'focus:outline-none focus:border-indigo-500',
                    disabled && 'opacity-50 cursor-not-allowed',
                    keyError && 'border-amber-500'
                  )}
                />
                {unusedPredefinedKeys.length > 0 && (
                  <datalist id={`${name}-keys-${pair.id}`}>
                    {unusedPredefinedKeys.map((key) => (
                      <option key={key} value={key} />
                    ))}
                  </datalist>
                )}
                {keyError && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-amber-400">
                    {keyError}
                  </span>
                )}
              </div>

              {/* Separator */}
              <span className="text-slate-500 text-sm">=</span>

              {/* Value input */}
              <div className="relative flex-1">
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500">
                  <Type className="w-3 h-3" />
                </div>
                <input
                  type={valueType}
                  value={pair.value}
                  onChange={(e) => updateValue(pair.id, e.target.value)}
                  disabled={disabled}
                  placeholder={valuePlaceholder}
                  className={cn(
                    'w-full pl-7 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                    'text-sm text-slate-100 placeholder-slate-500',
                    'focus:outline-none focus:border-indigo-500',
                    disabled && 'opacity-50 cursor-not-allowed'
                  )}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => copyPair(pair.key, pair.value)}
                  disabled={disabled || !pair.key}
                  className={cn(
                    'p-1 text-slate-500 hover:text-white rounded transition-colors',
                    disabled && 'opacity-0'
                  )}
                  title="Copy"
                >
                  {copiedKey === pair.key ? (
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removePair(pair.id)}
                  disabled={disabled}
                  className={cn(
                    'p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors',
                    disabled && 'opacity-0'
                  )}
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })}

        {pairs.length === 0 && (
          <div className="py-4 text-center text-sm text-slate-500 border border-dashed border-slate-600 rounded-lg">
            No key-value pairs defined
          </div>
        )}
      </div>

      {/* Add button */}
      {canAdd && (
        <button
          type="button"
          onClick={addPair}
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
          Add Pair
        </button>
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
