/**
 * DateTime Field Component
 *
 * Supports date, time, and datetime inputs.
 */

import React from 'react'
import { Info, AlertCircle, Calendar, Clock } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface DateTimeFieldProps extends BaseFieldProps<string> {
  variant?: 'date' | 'time' | 'datetime'
  min?: string
  max?: string
}

export const DateTimeField: React.FC<DateTimeFieldProps> = ({
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
  variant = 'datetime',
  min,
  max,
}) => {
  const inputType = variant === 'datetime' ? 'datetime-local' : variant

  const Icon = variant === 'time' ? Clock : Calendar

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={name} className="block text-xs font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          <Icon className="w-4 h-4" />
        </div>

        <input
          id={name}
          type={inputType}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          min={min}
          max={max}
          className={cn(
            'w-full pl-10 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg',
            'text-sm text-slate-100',
            'placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
            'transition-colors',
            '[&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-red-500'
          )}
        />
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
