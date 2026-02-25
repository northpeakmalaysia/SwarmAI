/**
 * Number Field Component
 */

import React from 'react'
import { Info, AlertCircle, Minus, Plus } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface NumberFieldProps extends BaseFieldProps<number> {
  min?: number
  max?: number
  step?: number
  suffix?: string
  showControls?: boolean
}

export const NumberField: React.FC<NumberFieldProps> = ({
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
  min,
  max,
  step = 1,
  suffix,
  showControls = true,
}) => {
  const increment = () => {
    const newValue = (value || 0) + step
    if (max === undefined || newValue <= max) {
      onChange(newValue)
    }
  }

  const decrement = () => {
    const newValue = (value || 0) - step
    if (min === undefined || newValue >= min) {
      onChange(newValue)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val === '') {
      onChange(0)
      return
    }
    const num = parseFloat(val)
    if (!isNaN(num)) {
      if (min !== undefined && num < min) {
        onChange(min)
      } else if (max !== undefined && num > max) {
        onChange(max)
      } else {
        onChange(num)
      }
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={name} className="block text-xs font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      <div className="flex items-center">
        {showControls && (
          <button
            type="button"
            onClick={decrement}
            disabled={disabled || (min !== undefined && (value || 0) <= min)}
            className={cn(
              'p-2 border border-r-0 border-slate-600 bg-slate-700 rounded-l-lg',
              'text-slate-400 hover:text-white hover:bg-slate-600 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-700'
            )}
          >
            <Minus className="w-4 h-4" />
          </button>
        )}

        <input
          id={name}
          type="number"
          value={value ?? ''}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          className={cn(
            'w-full px-3 py-2 bg-slate-700/50 border border-slate-600 text-sm text-slate-100 text-center',
            'placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
            'transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
            !showControls && 'rounded-lg text-left',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-red-500'
          )}
        />

        {suffix && !showControls && (
          <span className="px-3 py-2 border border-l-0 border-slate-600 bg-slate-700 rounded-r-lg text-slate-400 text-sm">
            {suffix}
          </span>
        )}

        {showControls && (
          <button
            type="button"
            onClick={increment}
            disabled={disabled || (max !== undefined && (value || 0) >= max)}
            className={cn(
              'p-2 border border-l-0 border-slate-600 bg-slate-700 rounded-r-lg',
              'text-slate-400 hover:text-white hover:bg-slate-600 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-700'
            )}
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {min !== undefined && max !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Min: {min}</span>
          <span>Max: {max}</span>
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
