/**
 * Text Field Component
 */

import React from 'react'
import { Info, AlertCircle, Variable } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface TextFieldProps extends BaseFieldProps<string> {
  type?: 'text' | 'email' | 'url' | 'password'
  maxLength?: number
  showVariablePicker?: boolean
  prefix?: string
  suffix?: string
}

export const TextField: React.FC<TextFieldProps> = ({
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
  type = 'text',
  maxLength,
  showVariablePicker,
  prefix,
  suffix,
}) => {
  const insertVariable = () => {
    const cursorPos = (document.activeElement as HTMLInputElement)?.selectionStart || value?.length || 0
    const before = (value || '').substring(0, cursorPos)
    const after = (value || '').substring(cursorPos)
    onChange(`${before}{{}}${after}`)
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={name} className="block text-xs font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      <div className="relative flex">
        {prefix && (
          <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-600 bg-slate-700 text-slate-400 text-sm">
            {prefix}
          </span>
        )}

        <input
          id={name}
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          className={cn(
            'w-full px-3 py-2 bg-slate-700/50 border border-slate-600 text-sm text-slate-100',
            'placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
            'transition-colors',
            prefix && 'rounded-l-none',
            suffix || showVariablePicker ? 'rounded-r-none' : 'rounded-lg',
            !prefix && !suffix && !showVariablePicker && 'rounded-lg',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/30'
          )}
        />

        {showVariablePicker && (
          <button
            type="button"
            onClick={insertVariable}
            className="inline-flex items-center px-2 border border-l-0 border-slate-600 bg-slate-700 text-slate-400 hover:text-indigo-400 hover:bg-slate-600 transition-colors rounded-r-lg"
            title="Insert variable"
          >
            <Variable className="w-4 h-4" />
          </button>
        )}

        {suffix && !showVariablePicker && (
          <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-slate-600 bg-slate-700 text-slate-400 text-sm">
            {suffix}
          </span>
        )}
      </div>

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
