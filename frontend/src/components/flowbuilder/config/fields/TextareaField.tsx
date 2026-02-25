/**
 * Textarea Field Component
 */

import React from 'react'
import { Info, AlertCircle, Variable, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface TextareaFieldProps extends BaseFieldProps<string> {
  rows?: number
  maxLength?: number
  showVariablePicker?: boolean
  resizable?: boolean
  monospace?: boolean
}

export const TextareaField: React.FC<TextareaFieldProps> = ({
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
  rows = 3,
  maxLength,
  showVariablePicker,
  resizable = true,
  monospace,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false)

  const insertVariable = () => {
    const textarea = document.getElementById(name) as HTMLTextAreaElement
    const cursorPos = textarea?.selectionStart || value?.length || 0
    const before = (value || '').substring(0, cursorPos)
    const after = (value || '').substring(cursorPos)
    onChange(`${before}{{}}${after}`)
    // Move cursor inside the braces
    setTimeout(() => {
      textarea?.focus()
      textarea?.setSelectionRange(cursorPos + 2, cursorPos + 2)
    }, 0)
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={name} className="block text-xs font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>

        <div className="flex items-center gap-1">
          {showVariablePicker && (
            <button
              type="button"
              onClick={insertVariable}
              className="p-1 text-slate-400 hover:text-indigo-400 transition-colors rounded"
              title="Insert variable"
            >
              <Variable className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-white transition-colors rounded"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      <textarea
        id={name}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={isExpanded ? rows * 3 : rows}
        maxLength={maxLength}
        className={cn(
          'w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-100',
          'placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
          'transition-all duration-200',
          monospace && 'font-mono text-xs',
          resizable ? 'resize-y' : 'resize-none',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500/30'
        )}
      />

      {(helpText || error || maxLength) && (
        <div className="flex items-start justify-between text-xs">
          {error ? (
            <p className="flex items-start text-red-400">
              <AlertCircle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
              {error}
            </p>
          ) : helpText ? (
            <p className="flex items-start text-slate-500">
              <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
              {helpText}
            </p>
          ) : (
            <span />
          )}
          {maxLength && (
            <span className={cn('text-slate-500', (value?.length || 0) >= maxLength && 'text-amber-400')}>
              {value?.length || 0}/{maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
