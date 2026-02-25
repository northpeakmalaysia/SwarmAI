/**
 * MCP Tool Field Component
 *
 * Wrapper around MCPToolConfig for FieldRenderer compatibility.
 */

import React from 'react'
import type { BaseFieldProps } from './types'
import MCPToolConfig, { MCPToolConfigValue } from '../../MCPToolConfig'
import { cn } from '@/lib/utils'

interface MCPToolFieldProps extends BaseFieldProps<MCPToolConfigValue> {}

export const MCPToolField: React.FC<MCPToolFieldProps> = ({
  name,
  label,
  value,
  onChange,
  helpText,
  error,
  disabled,
  required,
  className,
}) => {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium text-gray-300 flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>

      <MCPToolConfig
        value={value || { serverId: '', toolName: '' }}
        onChange={onChange}
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
