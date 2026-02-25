/**
 * Slider Field Component
 */

import React from 'react'
import { Info, AlertCircle } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface SliderFieldProps extends BaseFieldProps<number> {
  min: number
  max: number
  step?: number
  showValue?: boolean
  valueSuffix?: string
  marks?: { value: number; label: string }[]
  showMinMax?: boolean
}

export const SliderField: React.FC<SliderFieldProps> = ({
  name,
  label,
  value,
  onChange,
  helpText,
  error,
  disabled,
  required,
  className,
  min,
  max,
  step = 1,
  showValue = true,
  valueSuffix = '',
  marks,
  showMinMax = true,
}) => {
  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={name} className="block text-xs font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        {showValue && (
          <span className="text-xs font-medium text-indigo-400">
            {value}
            {valueSuffix}
          </span>
        )}
      </div>

      <div className="relative pt-1">
        <input
          id={name}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          className={cn(
            'w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer',
            'accent-indigo-500',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4',
            '[&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-300',
            '[&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:transition-all',
            '[&::-webkit-slider-thumb]:hover:scale-110',
            '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4',
            '[&::-moz-range-thumb]:bg-indigo-500 [&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-indigo-300',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          style={{
            background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${percentage}%, #334155 ${percentage}%, #334155 100%)`,
          }}
        />

        {marks && marks.length > 0 && (
          <div className="relative w-full h-4 mt-1">
            {marks.map((mark) => {
              const pos = ((mark.value - min) / (max - min)) * 100
              return (
                <div
                  key={mark.value}
                  className="absolute transform -translate-x-1/2"
                  style={{ left: `${pos}%` }}
                >
                  <div className="w-1 h-1 bg-slate-500 rounded-full mx-auto mb-0.5" />
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">{mark.label}</span>
                </div>
              )
            })}
          </div>
        )}

        {showMinMax && !marks && (
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>
              {min}
              {valueSuffix}
            </span>
            <span>
              {max}
              {valueSuffix}
            </span>
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
