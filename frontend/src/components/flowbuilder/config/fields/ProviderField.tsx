/**
 * Provider Field Component
 *
 * Wrapper around ProviderSelectorField for FieldRenderer compatibility.
 */

import React from 'react'
import type { BaseFieldProps } from './types'
import { ProviderSelectorField } from '../../ProviderSelectorField'
import { cn } from '@/lib/utils'

interface ProviderFieldProps extends BaseFieldProps<string> {
  /** Include auto-select option */
  includeAutoSelect?: boolean
  /** Include task routing option for tier-based provider selection */
  includeTaskRouting?: boolean
}

export const ProviderField: React.FC<ProviderFieldProps> = ({
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
  includeAutoSelect = true,
  includeTaskRouting = true,
}) => {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium text-gray-300 flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>

      <ProviderSelectorField
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        includeAutoSelect={includeAutoSelect}
        includeTaskRouting={includeTaskRouting}
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
