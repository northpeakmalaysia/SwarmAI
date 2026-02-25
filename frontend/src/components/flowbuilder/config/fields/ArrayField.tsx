/**
 * Array Field Component
 *
 * Manages a list of items with add/remove/reorder capabilities.
 */

import React from 'react'
import { Info, AlertCircle, Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps, FieldDefinition } from './types'

interface ArrayFieldProps extends BaseFieldProps<any[]> {
  itemSchema?: FieldDefinition
  maxItems?: number
  minItems?: number
  addLabel?: string
  allowReorder?: boolean
}

export const ArrayField: React.FC<ArrayFieldProps> = ({
  name,
  label,
  value = [],
  onChange,
  helpText,
  error,
  disabled,
  required,
  className,
  itemSchema,
  maxItems,
  minItems = 0,
  addLabel = 'Add Item',
  allowReorder = true,
}) => {
  const canAdd = !maxItems || value.length < maxItems
  const canRemove = value.length > minItems

  const addItem = () => {
    if (!canAdd) return
    const newItem = itemSchema?.defaultValue ?? ''
    onChange([...value, newItem])
  }

  const removeItem = (index: number) => {
    if (!canRemove) return
    onChange(value.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, newValue: any) => {
    const newArray = [...value]
    newArray[index] = newValue
    onChange(newArray)
  }

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= value.length) return

    const newArray = [...value]
    const temp = newArray[index]
    newArray[index] = newArray[newIndex]
    newArray[newIndex] = temp
    onChange(newArray)
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <span className="text-[10px] text-slate-500">
          {value.length} item{value.length !== 1 ? 's' : ''}
          {maxItems && ` / ${maxItems} max`}
        </span>
      </div>

      <div className="space-y-2">
        {value.map((item, index) => (
          <div
            key={index}
            className={cn(
              'flex items-start gap-2 p-2 bg-slate-800/50 border border-slate-700 rounded-lg',
              'group'
            )}
          >
            {/* Drag handle */}
            {allowReorder && value.length > 1 && (
              <div className="flex flex-col items-center text-slate-500">
                <button
                  type="button"
                  onClick={() => moveItem(index, 'up')}
                  disabled={disabled || index === 0}
                  className="p-0.5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <GripVertical className="w-3 h-3" />
                <button
                  type="button"
                  onClick={() => moveItem(index, 'down')}
                  disabled={disabled || index === value.length - 1}
                  className="p-0.5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Item content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 font-medium">#{index + 1}</span>
              </div>

              {/* Simple text input for items */}
              <input
                type="text"
                value={typeof item === 'string' ? item : JSON.stringify(item)}
                onChange={(e) => updateItem(index, e.target.value)}
                disabled={disabled}
                placeholder={itemSchema?.placeholder || 'Enter value...'}
                className={cn(
                  'w-full mt-1 px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                  'text-sm text-slate-100 placeholder-slate-500',
                  'focus:outline-none focus:border-indigo-500',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              />
            </div>

            {/* Remove button */}
            {canRemove && (
              <button
                type="button"
                onClick={() => removeItem(index)}
                disabled={disabled}
                className={cn(
                  'p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors',
                  'opacity-0 group-hover:opacity-100',
                  disabled && 'opacity-0'
                )}
                title="Remove item"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}

        {value.length === 0 && (
          <div className="py-4 text-center text-sm text-slate-500 border border-dashed border-slate-600 rounded-lg">
            No items added yet
          </div>
        )}
      </div>

      {/* Add button */}
      {canAdd && (
        <button
          type="button"
          onClick={addItem}
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
          {addLabel}
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
