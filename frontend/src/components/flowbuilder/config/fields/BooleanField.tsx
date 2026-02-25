/**
 * Boolean Field Component (Toggle/Checkbox)
 */

import React from 'react'
import { Info, AlertCircle } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface BooleanFieldProps extends BaseFieldProps<boolean> {
  variant?: 'toggle' | 'checkbox'
  inline?: boolean
}

export const BooleanField: React.FC<BooleanFieldProps> = ({
  name,
  label,
  value,
  onChange,
  helpText,
  error,
  disabled,
  className,
  variant = 'toggle',
  inline,
}) => {
  if (variant === 'checkbox') {
    return (
      <div className={cn('space-y-1.5', className)}>
        <label
          htmlFor={name}
          className={cn(
            'flex items-center gap-2',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          )}
        >
          <input
            id={name}
            type="checkbox"
            checked={value || false}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className={cn(
              'w-4 h-4 rounded border-slate-600 bg-slate-700/50 text-indigo-500',
              'focus:ring-indigo-500 focus:ring-offset-0 focus:ring-offset-slate-800',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />
          <span className={cn('text-sm text-slate-300', disabled && 'opacity-50')}>{label}</span>
        </label>

        {(helpText || error) && (
          <div className="text-xs ml-6">
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

  // Toggle variant
  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className={cn(
          'flex items-center justify-between',
          inline && 'flex-row',
          !inline && 'flex-col items-start gap-2'
        )}
      >
        <label htmlFor={name} className="text-xs font-medium text-slate-300">
          {label}
        </label>

        <button
          id={name}
          type="button"
          role="switch"
          aria-checked={value}
          onClick={() => !disabled && onChange(!value)}
          disabled={disabled}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800',
            value ? 'bg-indigo-600' : 'bg-slate-600',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              value ? 'translate-x-6' : 'translate-x-1'
            )}
          />
        </button>
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
