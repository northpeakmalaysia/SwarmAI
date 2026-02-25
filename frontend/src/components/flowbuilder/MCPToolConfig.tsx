/**
 * MCP Tool Configuration Component
 *
 * Configures MCP tool selection and input mapping for FlowBuilder nodes.
 * Features:
 * - Server selection dropdown
 * - Tool selection with auto-loaded options
 * - Dynamic input form based on tool's JSON schema
 * - Variable mapping with {{variable}} syntax
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Server,
  Wrench,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Info,
  Database,
  Globe,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button, Input } from '../common'
import { useMCPStore, MCPTool } from '../../stores/mcpStore'

export interface MCPToolConfigValue {
  serverId: string
  toolName: string
  defaultArgs?: Record<string, unknown>
}

interface MCPToolConfigProps {
  value: MCPToolConfigValue
  onChange: (value: MCPToolConfigValue) => void
  showVariableHints?: boolean
  className?: string
  disabled?: boolean
}

// Variable suggestions for input mapping
const variableSuggestions = [
  '{{input.message}}',
  '{{input.data}}',
  '{{node.previous.output}}',
  '{{var.connectionId}}',
  '{{var.query}}',
]

const MCPToolConfig: React.FC<MCPToolConfigProps> = ({
  value,
  onChange,
  showVariableHints = true,
  className,
}) => {
  const {
    servers,
    tools,
    isLoading,
    error,
    fetchServers,
    fetchTools,
  } = useMCPStore()

  const [isArgsExpanded, setIsArgsExpanded] = useState(true)
  const [localArgs, setLocalArgs] = useState<Record<string, unknown>>(value.defaultArgs || {})

  // Fetch servers and tools on mount
  useEffect(() => {
    fetchServers()
    fetchTools()
  }, [fetchServers, fetchTools])

  // Update local args when value changes
  useEffect(() => {
    setLocalArgs(value.defaultArgs || {})
  }, [value.defaultArgs])

  // Get active (connected) servers
  const activeServers = useMemo(() => {
    return servers.filter(s => s.isActive && s.isConnected)
  }, [servers])

  // Get tools for selected server
  const serverTools = useMemo(() => {
    if (!value.serverId) return []
    return tools.filter(t => t.serverId === value.serverId)
  }, [tools, value.serverId])

  // Get selected tool
  const selectedTool = useMemo(() => {
    return tools.find(t => t.name === value.toolName && t.serverId === value.serverId)
  }, [tools, value.toolName, value.serverId])

  // Handle server change
  const handleServerChange = useCallback((serverId: string) => {
    onChange({
      serverId,
      toolName: '',
      defaultArgs: {},
    })
    setLocalArgs({})
  }, [onChange])

  // Handle tool change
  const handleToolChange = useCallback((toolName: string) => {
    onChange({
      ...value,
      toolName,
      defaultArgs: {},
    })
    setLocalArgs({})
  }, [onChange, value])

  // Handle argument change
  const handleArgChange = useCallback((argName: string, argValue: unknown) => {
    const newArgs = { ...localArgs, [argName]: argValue }
    setLocalArgs(newArgs)
    onChange({
      ...value,
      defaultArgs: newArgs,
    })
  }, [localArgs, onChange, value])

  // Get server icon based on name/type
  const getServerIcon = (server: { name: string }) => {
    const name = server.name.toLowerCase()
    if (name.includes('database') || name.includes('db')) {
      return <Database className="w-4 h-4 text-emerald-400" />
    }
    if (name.includes('api') || name.includes('http')) {
      return <Globe className="w-4 h-4 text-blue-400" />
    }
    return <Server className="w-4 h-4 text-gray-400" />
  }

  // Render input field based on schema type
  const renderInputField = (
    name: string,
    schema: {
      type: string
      description?: string
      enum?: string[]
      default?: unknown
    },
    isRequired: boolean
  ) => {
    const currentValue = localArgs[name] ?? schema.default ?? ''

    // Enum/select type
    if (schema.enum && schema.enum.length > 0) {
      return (
        <select
          value={String(currentValue)}
          onChange={(e) => handleArgChange(name, e.target.value)}
          className={cn(
            'w-full rounded-lg border bg-slate-800/50 text-white',
            'border-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50',
            'p-2.5 text-sm'
          )}
        >
          <option value="">Select...</option>
          {schema.enum.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )
    }

    // Boolean type
    if (schema.type === 'boolean') {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={(e) => handleArgChange(name, e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/50"
          />
          <span className="text-sm text-gray-300">Enable</span>
        </label>
      )
    }

    // Number type
    if (schema.type === 'number' || schema.type === 'integer') {
      return (
        <Input
          type="number"
          value={String(currentValue)}
          onChange={(e) => handleArgChange(name, Number(e.target.value))}
          placeholder={schema.description || `Enter ${name}...`}
          size="sm"
        />
      )
    }

    // Object or array type - use JSON editor
    if (schema.type === 'object' || schema.type === 'array') {
      return (
        <textarea
          value={typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value)
              handleArgChange(name, parsed)
            } catch {
              handleArgChange(name, e.target.value)
            }
          }}
          placeholder={schema.description || `Enter ${name} as JSON...`}
          className={cn(
            'w-full rounded-lg border bg-slate-900 text-white placeholder-gray-500 font-mono',
            'border-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50',
            'p-3 text-xs min-h-[60px] resize-y'
          )}
        />
      )
    }

    // Default: string/text type with variable support
    return (
      <div className="space-y-1">
        <Input
          value={String(currentValue)}
          onChange={(e) => handleArgChange(name, e.target.value)}
          placeholder={schema.description || `Enter ${name}...`}
          size="sm"
        />
        {showVariableHints && (
          <div className="flex flex-wrap gap-1">
            {variableSuggestions.slice(0, 3).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => handleArgChange(name, v)}
                className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-gray-400 rounded hover:bg-slate-600 hover:text-white transition-colors"
              >
                {v.replace('{{', '').replace('}}', '')}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const handleRefresh = async () => {
    await fetchServers()
    await fetchTools()
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Server Selection */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-300 flex items-center gap-1">
            <Server className="w-4 h-4" />
            MCP Server
          </label>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh servers and tools"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>

        <select
          value={value.serverId}
          onChange={(e) => handleServerChange(e.target.value)}
          disabled={isLoading}
          className={cn(
            'w-full rounded-lg border bg-slate-800/50 text-white',
            'border-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50',
            'p-2.5 text-sm disabled:opacity-50'
          )}
        >
          <option value="">Select MCP server...</option>
          {activeServers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.name}
            </option>
          ))}
        </select>

        {activeServers.length === 0 && !isLoading && (
          <p className="text-xs text-amber-400 mt-1">
            No active MCP servers. Configure servers in Settings → MCP Servers.
          </p>
        )}
      </div>

      {/* Tool Selection */}
      {value.serverId && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-300 flex items-center gap-1">
            <Wrench className="w-4 h-4" />
            Tool
          </label>

          <select
            value={value.toolName}
            onChange={(e) => handleToolChange(e.target.value)}
            disabled={isLoading || serverTools.length === 0}
            className={cn(
              'w-full rounded-lg border bg-slate-800/50 text-white',
              'border-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50',
              'p-2.5 text-sm disabled:opacity-50'
            )}
          >
            <option value="">Select tool...</option>
            {serverTools.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.name}
              </option>
            ))}
          </select>

          {serverTools.length === 0 && !isLoading && (
            <p className="text-xs text-amber-400 mt-1">
              No tools available from this server.
            </p>
          )}
        </div>
      )}

      {/* Tool Description */}
      {selectedTool?.description && (
        <div className="flex items-start gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
          <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-gray-400">
            <span className="text-gray-300 font-medium">{selectedTool.name}</span>
            <p className="mt-0.5">{selectedTool.description}</p>
          </div>
        </div>
      )}

      {/* Tool Arguments */}
      {selectedTool?.inputSchema?.properties && Object.keys(selectedTool.inputSchema.properties).length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setIsArgsExpanded(!isArgsExpanded)}
            className="w-full flex items-center gap-2 text-sm font-medium text-gray-300"
          >
            {isArgsExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Default Arguments
          </button>

          {isArgsExpanded && (
            <div className="space-y-3 pl-2 border-l-2 border-slate-700">
              {Object.entries(selectedTool.inputSchema.properties).map(([name, schema]) => {
                const isRequired = selectedTool.inputSchema.required?.includes(name) || false
                const propSchema = schema as {
                  type: string
                  description?: string
                  enum?: string[]
                  default?: unknown
                }

                return (
                  <div key={name} className="space-y-1">
                    <label className="text-sm font-medium text-gray-300 flex items-center gap-1">
                      {name}
                      {isRequired && <span className="text-red-400">*</span>}
                    </label>
                    {renderInputField(name, propSchema, isRequired)}
                    {propSchema.description && (
                      <p className="text-xs text-gray-500">{propSchema.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Quick Tips */}
      {showVariableHints && value.toolName && (
        <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700">
          <p className="text-xs text-gray-400">
            <strong className="text-gray-300">Tip:</strong> Use{' '}
            <code className="bg-slate-900 px-1 py-0.5 rounded text-sky-400">{'{{variable}}'}</code>{' '}
            syntax to map flow variables to tool inputs. E.g.,{' '}
            <code className="bg-slate-900 px-1 py-0.5 rounded text-sky-400">{'{{input.query}}'}</code>
          </p>
        </div>
      )}
    </div>
  )
}

export default MCPToolConfig
