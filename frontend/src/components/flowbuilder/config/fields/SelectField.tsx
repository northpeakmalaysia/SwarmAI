/**
 * Select Field Component
 */

import React, { useState, useRef, useEffect } from 'react'
import { Info, AlertCircle, ChevronDown, Check, Search } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps, FieldOption } from './types'

interface SelectFieldProps extends BaseFieldProps<string> {
  options: FieldOption[]
  searchable?: boolean
  clearable?: boolean
  groupBy?: boolean
}

export const SelectField: React.FC<SelectFieldProps> = ({
  name,
  label,
  value,
  onChange,
  placeholder = 'Select...',
  helpText,
  error,
  disabled,
  required,
  className,
  options,
  searchable,
  clearable,
  groupBy,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  // Filter options based on search
  const filteredOptions = search
    ? options.filter(
        (opt) =>
          opt.label.toLowerCase().includes(search.toLowerCase()) ||
          opt.value.toLowerCase().includes(search.toLowerCase())
      )
    : options

  // Group options if needed
  const groupedOptions = groupBy
    ? filteredOptions.reduce(
        (acc, opt) => {
          const group = opt.group || 'Other'
          if (!acc[group]) acc[group] = []
          acc[group].push(opt)
          return acc
        },
        {} as Record<string, FieldOption[]>
      )
    : { '': filteredOptions }

  // Close dropdown on outside click
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

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen, searchable])

  const handleSelect = (optValue: string) => {
    onChange(optValue)
    setIsOpen(false)
    setSearch('')
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={name} className="block text-xs font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          id={name}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            'w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-left',
            'flex items-center justify-between',
            'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
            'transition-colors',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-red-500',
            !value && 'text-slate-500',
            value && 'text-slate-100'
          )}
        >
          <span className="truncate">{selectedOption?.label || placeholder}</span>
          <ChevronDown
            className={cn('w-4 h-4 text-slate-400 transition-transform', isOpen && 'rotate-180')}
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
            {searchable && (
              <div className="p-2 border-b border-slate-700">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    ref={inputRef}
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
              {clearable && value && (
                <button
                  type="button"
                  onClick={() => handleSelect('')}
                  className="w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-700 transition-colors"
                >
                  Clear selection
                </button>
              )}

              {Object.entries(groupedOptions).map(([group, opts]) => (
                <div key={group}>
                  {group && groupBy && (
                    <div className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-750">
                      {group}
                    </div>
                  )}
                  {opts.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      disabled={opt.disabled}
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm flex items-center justify-between',
                        'hover:bg-slate-700 transition-colors',
                        opt.value === value && 'bg-indigo-500/20 text-indigo-300',
                        opt.disabled && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <div>
                        <div className="text-slate-100">{opt.label}</div>
                        {opt.description && (
                          <div className="text-xs text-slate-500">{opt.description}</div>
                        )}
                      </div>
                      {opt.value === value && <Check className="w-4 h-4 text-indigo-400" />}
                    </button>
                  ))}
                </div>
              ))}

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
