/**
 * Model Field Component
 *
 * Wrapper around ModelSelectorField for FieldRenderer compatibility.
 */

import React from 'react'
import type { BaseFieldProps } from './types'
import { ModelSelectorField } from '../../ModelSelectorField'
import { cn } from '@/lib/utils'

interface ModelFieldProps extends BaseFieldProps<string> {
  /** Provider to filter models by */
  providerId?: string
}

export const ModelField: React.FC<ModelFieldProps> = ({
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
  providerId,
}) => {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium text-gray-300 flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>

      <ModelSelectorField
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />

      {helpText && !error && (
        <p className="text-xs text-gray-500">{helpText}</p>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}
