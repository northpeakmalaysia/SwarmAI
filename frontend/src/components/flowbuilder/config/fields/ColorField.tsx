/**
 * Color Field Component
 */

import React, { useState } from 'react'
import { Info, AlertCircle, Pipette } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface ColorFieldProps extends BaseFieldProps<string> {
  presets?: string[]
  showAlpha?: boolean
}

const defaultPresets = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#64748b', // slate
]

export const ColorField: React.FC<ColorFieldProps> = ({
  name,
  label,
  value,
  onChange,
  helpText,
  error,
  disabled,
  required,
  className,
  presets = defaultPresets,
}) => {
  const [showPicker, setShowPicker] = useState(false)

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={name} className="block text-xs font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      <div className="flex items-center gap-2">
        {/* Color preview and picker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            disabled={disabled}
            className={cn(
              'w-10 h-10 rounded-lg border-2 border-slate-600',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800',
              'transition-all hover:scale-105',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            style={{ backgroundColor: value || '#6366f1' }}
          />

          {showPicker && !disabled && (
            <div className="absolute z-50 top-12 left-0 p-3 bg-slate-800 border border-slate-600 rounded-lg shadow-xl">
              {/* Native color picker */}
              <input
                type="color"
                value={value || '#6366f1'}
                onChange={(e) => onChange(e.target.value)}
                className="w-full h-8 rounded cursor-pointer"
              />

              {/* Preset colors */}
              <div className="grid grid-cols-6 gap-1.5 mt-2">
                {presets.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      onChange(color)
                      setShowPicker(false)
                    }}
                    className={cn(
                      'w-6 h-6 rounded-md border-2 transition-transform hover:scale-110',
                      value === color ? 'border-white scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              {/* Close button */}
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="w-full mt-2 px-3 py-1 text-xs text-slate-400 hover:text-white bg-slate-700 rounded transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Hex input */}
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">#</span>
          <input
            id={name}
            type="text"
            value={(value || '').replace('#', '')}
            onChange={(e) => {
              const hex = e.target.value.replace(/[^0-9a-fA-F]/g, '').substring(0, 6)
              onChange(`#${hex}`)
            }}
            disabled={disabled}
            maxLength={6}
            placeholder="6366f1"
            className={cn(
              'w-full pl-7 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg',
              'text-sm text-slate-100 font-mono uppercase',
              'placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
              'transition-colors',
              disabled && 'opacity-50 cursor-not-allowed',
              error && 'border-red-500'
            )}
          />
        </div>
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
