/**
 * Agent Selector Field Component
 *
 * Dropdown field for selecting an agent in FlowBuilder.
 * Loads available agents with their connected platforms from the API.
 *
 * Features:
 * - Shows agent avatar and name
 * - Displays connected platform status
 * - Filters by platform if needed
 * - Searchable with real-time filtering
 */

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Info, AlertCircle, ChevronDown, Check, Search, Bot, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BaseFieldProps } from './types'

interface AgentPlatform {
  accountId: string
  platform: string
  status: string
  isConnected: boolean
}

interface Agent {
  id: string
  name: string
  avatar?: string
  type?: string
  platforms: AgentPlatform[]
}

interface AgentSelectorFieldProps extends BaseFieldProps<string> {
  /** Filter agents by platform (only show agents with this platform connected) */
  filterByPlatform?: string
  /** Show only connected agents */
  connectedOnly?: boolean
  /** Callback when agent is selected (provides full agent object) */
  onAgentSelect?: (agent: Agent | null) => void
}

export const AgentSelectorField: React.FC<AgentSelectorFieldProps> = ({
  name,
  label,
  value,
  onChange,
  placeholder = 'Select an agent...',
  helpText,
  error,
  disabled,
  required,
  className,
  filterByPlatform,
  connectedOnly,
  onAgentSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch available agents
  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true)
      setFetchError(null)

      try {
        const response = await fetch('/api/agents/messaging/available', {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        })

        if (!response.ok) {
          throw new Error('Failed to load agents')
        }

        const data = await response.json()
        setAgents(data.agents || [])
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Failed to load agents')
      } finally {
        setLoading(false)
      }
    }

    fetchAgents()
  }, [])

  // Find currently selected agent
  const selectedAgent = useMemo(() => {
    return agents.find((a) => a.id === value) || null
  }, [agents, value])

  // Filter agents based on search and platform
  const filteredAgents = useMemo(() => {
    let result = agents

    // Filter by platform if specified
    if (filterByPlatform) {
      result = result.filter((agent) =>
        agent.platforms.some((p) => p.platform === filterByPlatform)
      )
    }

    // Filter by connection status
    if (connectedOnly) {
      result = result.filter((agent) =>
        agent.platforms.some((p) => p.isConnected)
      )
    }

    // Filter by search term
    if (search) {
      const searchLower = search.toLowerCase()
      result = result.filter(
        (agent) =>
          agent.name.toLowerCase().includes(searchLower) ||
          agent.type?.toLowerCase().includes(searchLower)
      )
    }

    return result
  }, [agents, filterByPlatform, connectedOnly, search])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSelect = (agent: Agent) => {
    onChange(agent.id)
    onAgentSelect?.(agent)
    setIsOpen(false)
    setSearch('')
  }

  const handleClear = () => {
    onChange('')
    onAgentSelect?.(null)
    setIsOpen(false)
  }

  // Get platform icon color
  const getPlatformColor = (platform: string, isConnected: boolean) => {
    if (!isConnected) return 'text-slate-500'
    switch (platform) {
      case 'whatsapp':
        return 'text-green-400'
      case 'telegram-bot':
        return 'text-blue-400'
      case 'email':
        return 'text-purple-400'
      default:
        return 'text-indigo-400'
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={name} className="block text-xs font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          id={name}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled || loading}
          className={cn(
            'w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-left',
            'flex items-center justify-between gap-2',
            'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
            'transition-colors',
            (disabled || loading) && 'opacity-50 cursor-not-allowed',
            error && 'border-red-500',
            !value && 'text-slate-500',
            value && 'text-slate-100'
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
            ) : selectedAgent ? (
              <>
                {selectedAgent.avatar ? (
                  <img
                    src={selectedAgent.avatar}
                    alt=""
                    className="w-5 h-5 rounded-full"
                  />
                ) : (
                  <Bot className="w-5 h-5 text-indigo-400" />
                )}
                <span className="truncate">{selectedAgent.name}</span>
                <div className="flex items-center gap-1 ml-auto">
                  {selectedAgent.platforms.map((p) => (
                    <span
                      key={p.accountId}
                      className={cn('text-xs', getPlatformColor(p.platform, p.isConnected))}
                      title={`${p.platform}: ${p.isConnected ? 'connected' : 'disconnected'}`}
                    >
                      {p.isConnected ? (
                        <Wifi className="w-3 h-3" />
                      ) : (
                        <WifiOff className="w-3 h-3" />
                      )}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <span>{placeholder}</span>
            )}
          </div>
          <ChevronDown
            className={cn('w-4 h-4 text-slate-400 transition-transform flex-shrink-0', isOpen && 'rotate-180')}
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
            {/* Search input */}
            <div className="p-2 border-b border-slate-700">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search agents..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto">
              {/* Clear selection option */}
              {value && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-700 transition-colors border-b border-slate-700"
                >
                  Clear selection
                </button>
              )}

              {/* Error state */}
              {fetchError && (
                <div className="px-3 py-4 text-center">
                  <AlertCircle className="w-5 h-5 text-red-400 mx-auto mb-2" />
                  <p className="text-sm text-red-400">{fetchError}</p>
                </div>
              )}

              {/* Agent list */}
              {filteredAgents.map((agent) => {
                const hasConnectedPlatform = agent.platforms.some((p) => p.isConnected)
                const relevantPlatform = filterByPlatform
                  ? agent.platforms.find((p) => p.platform === filterByPlatform)
                  : null

                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => handleSelect(agent)}
                    disabled={connectedOnly && !hasConnectedPlatform}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm flex items-center gap-2',
                      'hover:bg-slate-700 transition-colors',
                      agent.id === value && 'bg-indigo-500/20',
                      connectedOnly && !hasConnectedPlatform && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {agent.avatar ? (
                      <img src={agent.avatar} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <Bot className="w-6 h-6 text-indigo-400" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-100 truncate">{agent.name}</span>
                        {agent.type && (
                          <span className="text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">
                            {agent.type}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {agent.platforms.map((p) => (
                          <span
                            key={p.accountId}
                            className={cn(
                              'text-xs flex items-center gap-1',
                              getPlatformColor(p.platform, p.isConnected)
                            )}
                          >
                            {p.isConnected ? (
                              <Wifi className="w-3 h-3" />
                            ) : (
                              <WifiOff className="w-3 h-3" />
                            )}
                            {p.platform}
                          </span>
                        ))}
                      </div>
                    </div>

                    {agent.id === value && <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
                  </button>
                )
              })}

              {/* Empty state */}
              {!loading && !fetchError && filteredAgents.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-slate-500">
                  {search ? 'No agents found' : 'No agents available'}
                </div>
              )}
            </div>
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
