/**
 * Template Field Component
 *
 * Text input with variable picker and template syntax highlighting.
 * Supports {{variable}} syntax for dynamic values.
 */

import React, { useState, useRef, useEffect } from 'react'
import { Info, AlertCircle, Variable, ChevronDown } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface TemplateFieldProps extends BaseFieldProps<string> {
  variables?: Array<{ name: string; description: string; example?: string }>
  multiline?: boolean
  rows?: number
}

const defaultVariables = [
  { name: 'input.message', description: 'The input message', example: 'Hello world' },
  { name: 'input.userId', description: 'User ID from trigger' },
  { name: 'input.conversationId', description: 'Conversation ID' },
  { name: 'node.previous.output', description: 'Output from previous node' },
  { name: 'var.myVariable', description: 'Custom flow variable' },
  { name: 'env.NODE_ENV', description: 'Environment variable' },
  { name: 'time.now', description: 'Current timestamp' },
  { name: 'time.date', description: 'Current date (YYYY-MM-DD)' },
]

export const TemplateField: React.FC<TemplateFieldProps> = ({
  name,
  label,
  value,
  onChange,
  placeholder,
  helpText,
  error,
  disabled,
  required,
  className,
  variables = defaultVariables,
  multiline = false,
  rows = 3,
}) => {
  const [showVariables, setShowVariables] = useState(false)
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filteredVariables = variables.filter(
    (v) =>
      v.name.toLowerCase().includes(filter.toLowerCase()) ||
      v.description.toLowerCase().includes(filter.toLowerCase())
  )

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowVariables(false)
        setFilter('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const insertVariable = (varName: string) => {
    const input = inputRef.current
    if (!input) return

    const start = input.selectionStart || 0
    const end = input.selectionEnd || 0
    const before = (value || '').substring(0, start)
    const after = (value || '').substring(end)
    const newValue = `${before}{{${varName}}}${after}`

    onChange(newValue)
    setShowVariables(false)
    setFilter('')

    // Restore focus and cursor position
    setTimeout(() => {
      input.focus()
      const newPos = start + varName.length + 4
      input.setSelectionRange(newPos, newPos)
    }, 0)
  }

  // Highlight template variables in the display
  const highlightedValue = (value || '').replace(
    /\{\{([^}]+)\}\}/g,
    '<span class="text-indigo-400 font-medium">{{$1}}</span>'
  )

  const InputComponent = multiline ? 'textarea' : 'input'

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={name} className="block text-xs font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <InputComponent
            ref={inputRef as any}
            id={name}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'Enter value or use {{variable}}'}
            disabled={disabled}
            rows={multiline ? rows : undefined}
            className={cn(
              'w-full px-3 py-2 pr-10 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-100',
              'placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
              'transition-colors',
              multiline && 'resize-y',
              disabled && 'opacity-50 cursor-not-allowed',
              error && 'border-red-500'
            )}
          />
          <button
            type="button"
            onClick={() => setShowVariables(!showVariables)}
            disabled={disabled}
            className={cn(
              'absolute right-2 top-2 p-1 rounded',
              'text-slate-400 hover:text-indigo-400 hover:bg-slate-600/50',
              'transition-colors',
              showVariables && 'text-indigo-400 bg-slate-600/50'
            )}
            title="Insert variable"
          >
            <Variable className="w-4 h-4" />
          </button>
        </div>

        {showVariables && (
          <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
            <div className="p-2 border-b border-slate-700">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter variables..."
                className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
            </div>

            <div className="max-h-48 overflow-y-auto">
              {filteredVariables.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => insertVariable(v.name)}
                  className="w-full px-3 py-2 text-left hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <code className="text-xs text-indigo-400">{`{{${v.name}}}`}</code>
                    {v.example && (
                      <span className="text-[10px] text-slate-500 ml-2 truncate max-w-[100px]">
                        e.g., {v.example}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{v.description}</div>
                </button>
              ))}

              {filteredVariables.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-slate-500">
                  No variables found
                </div>
              )}
            </div>

            <div className="p-2 border-t border-slate-700 bg-slate-750">
              <p className="text-[10px] text-slate-500">
                Tip: Type <code className="text-indigo-400">{'{{'}</code> to start a variable
              </p>
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
