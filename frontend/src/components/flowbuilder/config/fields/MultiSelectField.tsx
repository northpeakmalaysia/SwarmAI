/**
 * Multi-Select Field Component
 */

import React, { useState, useRef, useEffect } from 'react'
import { Info, AlertCircle, ChevronDown, Check, Search, X } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps, FieldOption } from './types'

interface MultiSelectFieldProps extends BaseFieldProps<string[]> {
  options: FieldOption[]
  searchable?: boolean
  maxSelections?: number
}

export const MultiSelectField: React.FC<MultiSelectFieldProps> = ({
  name,
  label,
  value = [],
  onChange,
  placeholder = 'Select...',
  helpText,
  error,
  disabled,
  required,
  className,
  options,
  searchable,
  maxSelections,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOptions = options.filter((opt) => value.includes(opt.value))

  const filteredOptions = search
    ? options.filter(
        (opt) =>
          opt.label.toLowerCase().includes(search.toLowerCase()) ||
          opt.value.toLowerCase().includes(search.toLowerCase())
      )
    : options

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleOption = (optValue: string) => {
    if (value.includes(optValue)) {
      onChange(value.filter((v) => v !== optValue))
    } else {
      if (maxSelections && value.length >= maxSelections) return
      onChange([...value, optValue])
    }
  }

  const removeOption = (optValue: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(value.filter((v) => v !== optValue))
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={name} className="block text-xs font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
        {maxSelections && (
          <span className="text-slate-500 ml-1">
            ({value.length}/{maxSelections})
          </span>
        )}
      </label>

      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          id={name}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            'w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-left',
            'flex items-center justify-between gap-2',
            'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
            'transition-colors min-h-[42px]',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-red-500'
          )}
        >
          <div className="flex-1 flex flex-wrap gap-1">
            {selectedOptions.length > 0 ? (
              selectedOptions.map((opt) => (
                <span
                  key={opt.value}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-xs"
                >
                  {opt.label}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => removeOption(opt.value, e)}
                      className="hover:text-indigo-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))
            ) : (
              <span className="text-slate-500">{placeholder}</span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-slate-400 flex-shrink-0 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
            {searchable && (
              <div className="p-2 border-b border-slate-700">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.map((opt) => {
                const isSelected = value.includes(opt.value)
                const isDisabled =
                  !!(opt.disabled || (!isSelected && maxSelections && value.length >= maxSelections))

                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => !isDisabled && toggleOption(opt.value)}
                    disabled={isDisabled}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm flex items-center justify-between',
                      'hover:bg-slate-700 transition-colors',
                      isSelected && 'bg-indigo-500/20',
                      isDisabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div>
                      <div className="text-slate-100">{opt.label}</div>
                      {opt.description && (
                        <div className="text-xs text-slate-500">{opt.description}</div>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-indigo-400" />}
                  </button>
                )
              })}

              {filteredOptions.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-slate-500">No options found</div>
              )}
            </div>
          </div>
        )}
      </div>

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
