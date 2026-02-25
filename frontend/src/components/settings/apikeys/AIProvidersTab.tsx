import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Star,
  StarOff,
  Check,
  X,
  AlertCircle,
  Loader2,
  Globe,
  Server,
  Cpu,
  Cloud,
  ExternalLink,
  Terminal,
  Monitor,
  Power,
} from 'lucide-react'
import { Button } from '../../common/Button'
import { Input } from '../../common/Input'
import { Badge } from '../../common/Badge'
import { Modal } from '../../common/Modal'
import { useAIStore } from '@/stores/aiStore'
import { AddProviderModal } from '@/components/ai/AddProviderModal'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import type { AIProvider as StoreAIProvider, AIProviderType } from '@/types'
import type {
  AIProvider as LocalAIProvider,
  AIProviderStatus,
  AIModel,
  ModelCapability,
  CAPABILITY_ICONS,
} from './types'
import toast from 'react-hot-toast'
import { formatDateTime } from '@/utils/dateFormat'

/**
 * Capability icon mapping
 */
const capabilityIcons: Record<ModelCapability, string> = {
  chat: '\uD83D\uDCAC',      // speech bubble
  vision: '\uD83D\uDC41',    // eye
  tool_use: '\uD83D\uDD27',  // wrench
  code: '\uD83D\uDCDD',      // memo/paper
}

/**
 * Provider type icons
 */
const providerTypeIcons: Record<AIProviderType, React.ReactNode> = {
  openrouter: <Globe className="w-4 h-4 text-purple-400" />,
  anthropic: <Cpu className="w-4 h-4 text-orange-400" />,
  google: <Cloud className="w-4 h-4 text-blue-400" />,
  ollama: <Server className="w-4 h-4 text-green-400" />,
  'openai-compatible': <Cloud className="w-4 h-4 text-sky-400" />,
  'cli-claude': <Terminal className="w-4 h-4 text-orange-400" />,
  'cli-gemini': <Terminal className="w-4 h-4 text-blue-400" />,
  'cli-opencode': <Terminal className="w-4 h-4 text-emerald-400" />,
  'local-agent': <Monitor className="w-4 h-4 text-cyan-400" />,
  'groq': <Cpu className="w-4 h-4 text-green-400" />,
  'openai-whisper': <Cloud className="w-4 h-4 text-teal-400" />,
}

/**
 * Provider type display names
 */
const providerTypeNames: Record<AIProviderType, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  google: 'Google AI',
  ollama: 'Ollama',
  'openai-compatible': 'OpenAI Compatible',
  'cli-claude': 'Claude CLI',
  'cli-gemini': 'Gemini CLI',
  'cli-opencode': 'OpenCode CLI',
  'local-agent': 'Local Agent',
  'groq': 'Groq',
  'openai-whisper': 'OpenAI Whisper',
}

/**
 * Transform store provider to local provider format
 */
function transformProvider(provider: StoreAIProvider): LocalAIProvider {
  const lastTested = provider.lastTested || null;
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    hasApiKey: !!provider.apiKey,
    budgetLimit: provider.budgetLimit ?? null,
    budgetUsed: provider.budgetUsed,
    isDefault: provider.isDefault,
    isActive: provider.isActive !== false,
    lastTested,
    status: lastTested ? 'connected' as AIProviderStatus : 'not_tested' as AIProviderStatus,
    modelCount: provider.models?.length ?? 0,
  }
}

/**
 * Check if provider type is a CLI type
 */
function isCLIProvider(type: AIProviderType): boolean {
  return type === 'cli-claude' || type === 'cli-gemini' || type === 'cli-opencode';
}

/**
 * Fallback models for providers that don't support model listing
 * Used when API fetch fails or for non-OpenRouter providers
 */
function getFallbackModels(providerId: string, providerType: AIProviderType): AIModel[] {
  const fallbackModelsByType: Record<AIProviderType, Partial<AIModel>[]> = {
    openrouter: [], // Will be fetched from API
    anthropic: [
      { modelId: 'claude-3-opus-20240229', name: 'Claude 3 Opus', capabilities: ['chat', 'vision', 'tool_use', 'code'], inputPrice: 15, outputPrice: 75 },
      { modelId: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', capabilities: ['chat', 'vision', 'tool_use', 'code'], inputPrice: 3, outputPrice: 15 },
      { modelId: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', capabilities: ['chat', 'vision', 'tool_use', 'code'], inputPrice: 0.25, outputPrice: 1.25 },
    ],
    google: [
      { modelId: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', capabilities: ['chat', 'vision', 'tool_use', 'code'], inputPrice: 3.5, outputPrice: 10.5 },
      { modelId: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', capabilities: ['chat', 'vision'], inputPrice: 0.35, outputPrice: 1.05 },
      { modelId: 'gemini-pro', name: 'Gemini Pro', capabilities: ['chat'], inputPrice: 0.5, outputPrice: 1.5 },
    ],
    ollama: [
      { modelId: 'llama3', name: 'Llama 3', capabilities: ['chat', 'code'], inputPrice: null, outputPrice: null },
      { modelId: 'codellama', name: 'Code Llama', capabilities: ['chat', 'code'], inputPrice: null, outputPrice: null },
      { modelId: 'mistral', name: 'Mistral', capabilities: ['chat'], inputPrice: null, outputPrice: null },
    ],
    'openai-compatible': [
      { modelId: 'gpt-4', name: 'GPT-4', capabilities: ['chat', 'vision', 'tool_use', 'code'], inputPrice: 30, outputPrice: 60 },
      { modelId: 'gpt-4-turbo', name: 'GPT-4 Turbo', capabilities: ['chat', 'vision', 'tool_use', 'code'], inputPrice: 10, outputPrice: 30 },
      { modelId: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', capabilities: ['chat', 'tool_use'], inputPrice: 0.5, outputPrice: 1.5 },
    ],
    // CLI providers - models are determined by CLI authentication
    'cli-claude': [
      { modelId: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', capabilities: ['chat', 'vision', 'tool_use', 'code'], inputPrice: null, outputPrice: null },
    ],
    'cli-gemini': [
      { modelId: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', capabilities: ['chat', 'vision', 'tool_use', 'code'], inputPrice: null, outputPrice: null },
    ],
    'cli-opencode': [
      { modelId: 'deepseek-coder', name: 'DeepSeek Coder', capabilities: ['chat', 'code'], inputPrice: null, outputPrice: null },
    ],
    // Local Agent providers - models are auto-discovered from Ollama/LM Studio on user's device
    'local-agent': [],
    groq: [
      { modelId: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', capabilities: ['chat', 'tool_use', 'code'], inputPrice: 0.59, outputPrice: 0.79 },
      { modelId: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', capabilities: ['chat', 'code'], inputPrice: 0.24, outputPrice: 0.24 },
    ],
    'openai-whisper': [],
  }

  return (fallbackModelsByType[providerType] || []).map((m, idx) => ({
    id: `${providerId}-model-${idx}`,
    providerId,
    modelId: m.modelId!,
    name: m.name!,
    capabilities: (m.capabilities || ['chat']) as ModelCapability[],
    inputPrice: m.inputPrice ?? null,
    outputPrice: m.outputPrice ?? null,
    contextLength: null,
    isDefault: idx === 0,
    isFree: m.inputPrice == null || (m.inputPrice === 0 && m.outputPrice === 0),
  }))
}

/**
 * Determine model capabilities based on modality string
 */
function getCapabilitiesFromModality(modality: string): ModelCapability[] {
  const caps: ModelCapability[] = ['chat']
  if (modality?.includes('image') || modality?.includes('vision')) {
    caps.push('vision')
  }
  // Most modern models support tool use
  caps.push('tool_use')
  caps.push('code')
  return caps
}

/**
 * Format currency for display
 */
function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return `$${value.toFixed(2)}`
}

/**
 * Format price per 1M tokens
 */
function formatPrice(price: number | null): string {
  if (price == null) return 'Free'
  return `$${price.toFixed(2)}`
}

/**
 * AIProvidersTab Component
 *
 * Manages AI provider configurations with a table and side panel layout.
 */
export const AIProvidersTab: React.FC = () => {
  const { providers: storeProviders, loading, fetchProviders, testProvider, syncCLIProvider, deleteProvider, setDefaultProvider, updateProvider } = useAIStore()

  // Local state
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<StoreAIProvider | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(null)
  const [modelSearch, setModelSearch] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'failed'>>({})
  const [settingDefaultModel, setSettingDefaultModel] = useState<string | null>(null)
  const [togglingProviderId, setTogglingProviderId] = useState<string | null>(null)

  // Models state (fetched from API for OpenRouter)
  const [fetchedModels, setFetchedModels] = useState<AIModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsFetched, setModelsFetched] = useState(false)
  const [modelFilter, setModelFilter] = useState<'all' | 'free'>('all')

  // Transform providers
  const providers = useMemo(() => storeProviders.map(transformProvider), [storeProviders])

  // Find selected provider
  const selectedProvider = useMemo(() => {
    if (!selectedProviderId) return null
    return providers.find(p => p.id === selectedProviderId) ?? null
  }, [selectedProviderId, providers])

  // Get store provider for editing
  const selectedStoreProvider = useMemo(() => {
    if (!selectedProviderId) return null
    return storeProviders.find(p => p.id === selectedProviderId) ?? null
  }, [selectedProviderId, storeProviders])

  // Get models for selected provider
  const selectedProviderModels = useMemo(() => {
    if (!selectedProvider) return []

    // For OpenRouter, use fetched models if available
    if (selectedProvider.type === 'openrouter' && fetchedModels.length > 0) {
      return fetchedModels
    }

    // Check if provider has saved models from discovery (e.g., Ollama, Local Agent)
    if (selectedStoreProvider?.models && selectedStoreProvider.models.length > 0) {
      return selectedStoreProvider.models.map((model: unknown, idx: number) => {
        // Models can be strings ("llama3:8b") or objects ({ id, name, size, ... })
        const m = model as string | { id?: string; name?: string }
        const modelStr = typeof m === 'string' ? m : (m.id || m.name || String(m))
        const modelName = typeof m === 'object' && m.name ? m.name : modelStr.split(':')[0]
        const nameLower = modelStr.toLowerCase()
        const caps: ModelCapability[] = ['chat']
        if (/vision|vl|llava|moondream|bakllava/.test(nameLower)) caps.push('vision')
        if (/code|coder|starcoder|codellama|deepseek-coder|qwen.*coder/.test(nameLower)) caps.push('code')
        if (/tool|function|hermes|firefunction/.test(nameLower)) caps.push('tool_use')
        return {
          id: `${selectedProvider.id}-model-${idx}`,
          providerId: selectedProvider.id,
          modelId: modelStr,
          name: modelName,
          capabilities: caps,
          inputPrice: null,
          outputPrice: null,
          contextLength: null,
          isDefault: idx === 0,
          isFree: true,
        }
      })
    }

    // For other providers, use fallback models
    return getFallbackModels(selectedProvider.id, selectedProvider.type)
  }, [selectedProvider, selectedStoreProvider, fetchedModels])

  // Filter models by search and free filter
  const filteredModels = useMemo(() => {
    let models = selectedProviderModels

    // Filter by free/all
    if (modelFilter === 'free') {
      models = models.filter(m => m.isFree || (m.inputPrice === null && m.outputPrice === null))
    }

    // Filter by search
    if (modelSearch.trim()) {
      const search = modelSearch.toLowerCase()
      models = models.filter(
        m => m.name.toLowerCase().includes(search) || m.modelId.toLowerCase().includes(search)
      )
    }

    return models
  }, [selectedProviderModels, modelSearch, modelFilter])

  /**
   * Fetch models from API for OpenRouter providers
   */
  const fetchModelsFromApi = useCallback(async () => {
    setModelsLoading(true)
    try {
      const response = await api.get('/ai/models')
      // Backend returns { models: [...], pagination: {...} }
      const modelsData = response.data?.models || response.data?.data || response.data || []

      if (Array.isArray(modelsData) && modelsData.length > 0) {
        // Transform API response to AIModel format
        // Backend returns: pricingPrompt, pricingCompletion, contextLength, isFree
        // Also has snake_case fallbacks: pricing_prompt, pricing_completion, context_length, is_free
        const transformedModels: AIModel[] = modelsData.map((m: {
          id: string
          name: string
          provider?: string
          contextLength?: number
          context_length?: number
          pricingPrompt?: number
          pricing_prompt?: number
          pricingCompletion?: number
          pricing_completion?: number
          modality?: string
          isFree?: boolean
          is_free?: boolean
        }, idx: number) => {
          // Get pricing (backend returns per-token cost, we show per 1M tokens)
          const promptPrice = m.pricingPrompt ?? m.pricing_prompt ?? 0
          const completionPrice = m.pricingCompletion ?? m.pricing_completion ?? 0
          const contextLen = m.contextLength ?? m.context_length ?? null
          const isFreeModel = m.isFree ?? m.is_free ?? (promptPrice === 0 && completionPrice === 0)

          return {
            id: `api-model-${idx}`,
            providerId: m.provider || 'openrouter',
            modelId: m.id,
            name: m.name || m.id.split('/').pop() || m.id,
            capabilities: getCapabilitiesFromModality(m.modality || 'text'),
            // Convert per-token to per 1M tokens for display
            inputPrice: isFreeModel ? null : (promptPrice * 1000000),
            outputPrice: isFreeModel ? null : (completionPrice * 1000000),
            contextLength: contextLen,
            isDefault: idx === 0,
            isFree: isFreeModel,
          }
        })

        setFetchedModels(transformedModels)
      }
    } catch (error) {
      console.error('Failed to fetch models from API:', error)
      // Will fall back to empty array, which triggers fallback models
    } finally {
      setModelsLoading(false)
      setModelsFetched(true) // Always mark as fetched to prevent infinite retries
    }
  }, [])

  /**
   * Refresh models from OpenRouter API
   */
  const handleRefreshModels = useCallback(async () => {
    if (modelsLoading) return

    setModelsLoading(true)
    try {
      // First trigger a sync on the backend
      await api.post('/ai/models/refresh')
      // Reset flag so the useEffect will trigger a fresh fetch
      setModelsFetched(false)
      toast.success('Models refreshed - reloading list')
    } catch (error) {
      console.error('Failed to refresh models:', error)
      toast.error('Failed to refresh models from OpenRouter')
      setModelsLoading(false)
    }
  }, [modelsLoading])

  // Fetch providers on mount
  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  // Fetch models when selecting an OpenRouter provider (only once)
  useEffect(() => {
    if (selectedProvider?.type === 'openrouter' && !modelsFetched) {
      fetchModelsFromApi()
    }
  }, [selectedProvider?.type, modelsFetched, fetchModelsFromApi])

  // Auto-select first provider if none selected
  useEffect(() => {
    if (!selectedProviderId && providers.length > 0) {
      setSelectedProviderId(providers[0].id)
    }
  }, [selectedProviderId, providers])

  /**
   * Handle test connection
   * For CLI providers, this syncs models and shows auth status
   * For API providers, this tests the connection
   */
  const handleTestConnection = useCallback(async (providerId: string) => {
    // Find the provider to check its type
    const provider = storeProviders.find(p => p.id === providerId)
    const providerType = provider?.type

    setTestingProviderId(providerId)
    try {
      // For CLI providers, use sync which returns detailed info
      if (providerType && isCLIProvider(providerType)) {
        const result = await syncCLIProvider(providerId)
        setTestResults(prev => ({ ...prev, [providerId]: result.success ? 'success' : 'failed' }))

        if (result.success) {
          if (result.authenticated) {
            toast.success(`${result.message}`)
          } else {
            toast('CLI available but not authenticated. Click "Edit" to authenticate.', {
              icon: '⚠️',
              duration: 5000,
            })
          }
        } else {
          toast.error(result.message || 'CLI sync failed')
        }
      } else {
        // For API providers, use standard test
        const success = await testProvider(providerId)
        setTestResults(prev => ({ ...prev, [providerId]: success ? 'success' : 'failed' }))
        toast[success ? 'success' : 'error'](
          success ? 'Connection successful!' : 'Connection failed. Check your settings.'
        )
      }
    } catch (err) {
      setTestResults(prev => ({ ...prev, [providerId]: 'failed' }))
      toast.error('Connection test failed')
    } finally {
      setTestingProviderId(null)
    }
  }, [testProvider, syncCLIProvider, storeProviders])

  /**
   * Handle delete provider
   */
  const handleDeleteProvider = useCallback(async () => {
    if (!deletingProviderId) return
    try {
      await deleteProvider(deletingProviderId)
      if (selectedProviderId === deletingProviderId) {
        setSelectedProviderId(null)
      }
      toast.success('Provider deleted successfully')
    } catch (err) {
      toast.error('Failed to delete provider')
    } finally {
      setShowDeleteConfirm(false)
      setDeletingProviderId(null)
    }
  }, [deletingProviderId, selectedProviderId, deleteProvider])

  /**
   * Handle edit provider
   */
  const handleEditProvider = useCallback(() => {
    if (selectedStoreProvider) {
      setEditingProvider(selectedStoreProvider)
      setShowAddModal(true)
    }
  }, [selectedStoreProvider])

  /**
   * Handle set default provider
   */
  const handleSetDefaultProvider = useCallback(async (providerId: string) => {
    try {
      await setDefaultProvider(providerId)
      toast.success('Default provider updated')
    } catch (err) {
      toast.error('Failed to set default provider')
    }
  }, [setDefaultProvider])

  /**
   * Handle toggle provider enabled/disabled
   */
  const handleToggleActive = useCallback(async (providerId: string, currentlyActive: boolean) => {
    setTogglingProviderId(providerId)
    try {
      await updateProvider(providerId, { isActive: !currentlyActive } as any)
      toast.success(currentlyActive ? 'Provider disabled' : 'Provider enabled')
    } catch (err) {
      toast.error('Failed to toggle provider')
    } finally {
      setTogglingProviderId(null)
    }
  }, [updateProvider])

  /**
   * Handle set default model - calls backend API
   */
  const handleSetDefaultModel = useCallback(async (modelId: string) => {
    if (!selectedProviderId) return

    setSettingDefaultModel(modelId)
    try {
      await api.post(`/ai/providers/${selectedProviderId}/set-default-model`, { modelId })
      // Update local state to show the new default
      setFetchedModels(prev => prev.map(m => ({
        ...m,
        isDefault: m.modelId === modelId
      })))
      toast.success('Default model updated')
    } catch (err) {
      console.error('Failed to set default model:', err)
      toast.error('Failed to set default model')
    } finally {
      setSettingDefaultModel(null)
    }
  }, [selectedProviderId])

  /**
   * Get status indicator
   */
  const getStatusIndicator = (providerId: string, hasApiKey: boolean, type: AIProviderType) => {
    // Local Agent providers show online/offline based on isActive
    if (type === 'local-agent') {
      const provider = storeProviders.find(p => p.id === providerId)
      const isActive = provider?.isActive !== false
      return isActive ? (
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Online
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="w-2 h-2 rounded-full bg-gray-500" />
          Offline
        </span>
      )
    }

    const result = testResults[providerId]
    // CLI providers and Ollama don't require API keys
    const requiresKey = type !== 'ollama' && !isCLIProvider(type)
    // Check if provider was previously tested (persisted in DB)
    const provider = providers.find(p => p.id === providerId)
    const wasTested = !!provider?.lastTested

    if (!requiresKey || hasApiKey) {
      if (result === 'success' || (!result && wasTested)) {
        return (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {isCLIProvider(type) ? 'Authenticated' : 'Connected'}
          </span>
        )
      }
      if (result === 'failed') {
        return (
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            Failed
          </span>
        )
      }
    }

    return (
      <span className="flex items-center gap-1.5 text-amber-400">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        Not tested
      </span>
    )
  }

  /**
   * Get key status
   */
  const getKeyStatus = (hasApiKey: boolean, type: AIProviderType) => {
    // CLI providers, Ollama, and Local Agent don't use API keys
    if (type === 'ollama' || type === 'local-agent') {
      return <span className="text-gray-500">-</span>
    }
    if (isCLIProvider(type)) {
      return (
        <span className="text-cyan-400 flex items-center gap-1" title="CLI Authentication">
          <Terminal className="w-4 h-4" />
        </span>
      )
    }
    return hasApiKey ? (
      <span className="text-emerald-400 flex items-center gap-1">
        <Check className="w-4 h-4" />
      </span>
    ) : (
      <span className="text-red-400 flex items-center gap-1">
        <X className="w-4 h-4" />
      </span>
    )
  }

  /**
   * Mask API key for display
   */
  const maskApiKey = (key: string | undefined): string => {
    if (!key) return 'Not configured'
    if (key.length <= 8) return '****'
    return `${key.slice(0, 4)}${'*'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`
  }

  return (
    <div className="flex gap-6 h-full min-h-[500px]">
      {/* Left: Provider Table */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-medium text-white">Configured Providers</h3>
            <p className="text-sm text-gray-400">{providers.length} provider(s) configured</p>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setEditingProvider(null)
              setShowAddModal(true)
            }}
          >
            Add Provider
          </Button>
        </div>

        {/* Table */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          {loading && providers.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
            </div>
          ) : providers.length === 0 ? (
            <div className="text-center py-12">
              <Cloud className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No providers configured</p>
              <p className="text-sm text-gray-500 mt-1">Add a provider to get started</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/80">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Key</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Models</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Enabled</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Default</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {providers.map(provider => (
                  <tr
                    key={provider.id}
                    onClick={() => setSelectedProviderId(provider.id)}
                    className={cn(
                      'cursor-pointer transition-colors',
                      selectedProviderId === provider.id
                        ? 'bg-sky-500/10'
                        : 'hover:bg-slate-700/50',
                      !provider.isActive && 'opacity-50'
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">{provider.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-gray-300">
                        {providerTypeIcons[provider.type]}
                        {providerTypeNames[provider.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getKeyStatus(provider.hasApiKey, provider.type)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getStatusIndicator(provider.id, provider.hasApiKey, provider.type)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="default" size="sm">
                        {provider.type === 'openrouter' && fetchedModels.length > 0
                          ? fetchedModels.length
                          : provider.modelCount > 0
                            ? provider.modelCount
                            : getFallbackModels(provider.id, provider.type).length || '?'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleActive(provider.id, provider.isActive)
                        }}
                        disabled={togglingProviderId === provider.id}
                        className={cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900',
                          provider.isActive ? 'bg-emerald-500' : 'bg-slate-600'
                        )}
                        title={provider.isActive ? 'Disable provider' : 'Enable provider'}
                      >
                        <span
                          className={cn(
                            'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                            provider.isActive ? 'translate-x-[18px]' : 'translate-x-[3px]'
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {provider.isDefault ? (
                        <Star className="w-4 h-4 text-amber-400 mx-auto fill-amber-400" />
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: Side Panel */}
      {selectedProvider && (
        <div className="w-96 flex-shrink-0 bg-slate-800/50 border border-slate-700 rounded-xl p-4 overflow-y-auto">
          {/* Provider Info Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {providerTypeIcons[selectedProvider.type]}
                <h3 className="text-lg font-semibold text-white">{selectedProvider.name}</h3>
              </div>
              {selectedProvider.isDefault && (
                <Badge variant="warning" size="sm">Default</Badge>
              )}
            </div>

            {/* Info Grid */}
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Type</span>
                <span className="text-white">{providerTypeNames[selectedProvider.type]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Base URL</span>
                <span className="text-white text-right max-w-[200px] truncate" title={selectedStoreProvider?.baseUrl}>
                  {selectedStoreProvider?.baseUrl}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">API Key</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-xs">
                    {showApiKey
                      ? selectedStoreProvider?.apiKey || 'Not configured'
                      : maskApiKey(selectedStoreProvider?.apiKey)}
                  </span>
                  {selectedProvider.hasApiKey && (
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-gray-400 hover:text-white"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Budget</span>
                <span className="text-white">
                  {formatCurrency(selectedProvider.budgetUsed)} / {selectedProvider.budgetLimit ? formatCurrency(selectedProvider.budgetLimit) : 'Unlimited'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Last Tested</span>
                <span className="text-white">
                  {selectedProvider.lastTested
                    ? formatDateTime(selectedProvider.lastTested)
                    : testResults[selectedProvider.id] ? 'Just now' : 'Never'}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          {selectedProvider.type === 'local-agent' ? (
            <div className="mb-6 space-y-2">
              <div className="px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-sm text-cyan-300">
                <Monitor className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                Auto-managed by Local Agent. Models update when agent connects.
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => {
                  setDeletingProviderId(selectedProvider.id)
                  setShowDeleteConfirm(true)
                }}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                Remove Provider
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 mb-6">
              <Button
                variant="outline"
                size="sm"
                icon={testingProviderId === selectedProvider.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                onClick={() => handleTestConnection(selectedProvider.id)}
                disabled={testingProviderId === selectedProvider.id}
                className="flex-1"
              >
                {isCLIProvider(selectedProvider.type) ? 'Sync' : 'Test'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Pencil className="w-4 h-4" />}
                onClick={handleEditProvider}
                className="flex-1"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => {
                  setDeletingProviderId(selectedProvider.id)
                  setShowDeleteConfirm(true)
                }}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                Delete
              </Button>
            </div>
          )}

          {/* Set as Default */}
          {!selectedProvider.isDefault && (
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              icon={<Star className="w-4 h-4" />}
              onClick={() => handleSetDefaultProvider(selectedProvider.id)}
              className="mb-6 border border-slate-600"
            >
              Set as Default Provider
            </Button>
          )}

          {/* Models Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-white">Available Models</h4>
              <div className="flex items-center gap-2">
                {modelsLoading && (
                  <Loader2 className="w-3 h-3 text-sky-400 animate-spin" />
                )}
                <span className="text-xs text-gray-400">{filteredModels.length} models</span>
                {selectedProvider?.type === 'openrouter' && (
                  <button
                    onClick={handleRefreshModels}
                    disabled={modelsLoading}
                    className="text-gray-400 hover:text-sky-400 transition-colors disabled:opacity-50"
                    title="Refresh models from OpenRouter"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", modelsLoading && "animate-spin")} />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Badges */}
            {selectedProvider?.type === 'openrouter' && (
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setModelFilter('all')}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                    modelFilter === 'all'
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  )}
                >
                  All ({selectedProviderModels.length})
                </button>
                <button
                  type="button"
                  onClick={() => setModelFilter('free')}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                    modelFilter === 'free'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  )}
                >
                  Free ({selectedProviderModels.filter(m => m.isFree || (m.inputPrice === null && m.outputPrice === null)).length})
                </button>
              </div>
            )}

            {/* Model Search */}
            <div className="mb-3">
              <Input
                size="sm"
                placeholder="Search models..."
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                iconLeft={<Search className="w-4 h-4" />}
              />
            </div>

            {/* Models Table */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg overflow-auto max-h-[400px]">
              <table className="w-full text-xs min-w-[320px]">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="border-b border-slate-700">
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">Model</th>
                    <th className="text-center px-2 py-2 text-gray-400 font-medium">Caps</th>
                    <th className="text-right px-2 py-2 text-gray-400 font-medium">In</th>
                    <th className="text-right px-2 py-2 text-gray-400 font-medium">Out</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filteredModels.map(model => (
                    <tr key={model.id} className="hover:bg-slate-800/50">
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            {model.isDefault && (
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                            )}
                            <span className="text-white truncate max-w-[180px]" title={model.modelId}>
                              {model.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-500 truncate max-w-[180px]" title={model.modelId}>
                            {model.modelId}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className="flex items-center justify-center gap-0.5">
                          {model.capabilities.map(cap => (
                            <span key={cap} title={cap} className="text-xs">
                              {capabilityIcons[cap]}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-gray-400">
                        {formatPrice(model.inputPrice)}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-400">
                        {formatPrice(model.outputPrice)}
                      </td>
                      <td className="px-2 py-2">
                        {!model.isDefault && (
                          <button
                            onClick={() => handleSetDefaultModel(model.modelId)}
                            disabled={settingDefaultModel === model.modelId}
                            className="text-gray-400 hover:text-sky-400 transition-colors"
                            title="Set as default"
                          >
                            {settingDefaultModel === model.modelId ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <StarOff className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredModels.length === 0 && (
                <div className="text-center py-6 text-gray-500 text-sm">
                  No models found
                </div>
              )}
            </div>

            {/* Price note */}
            <p className="text-xs text-gray-500 mt-2">
              Prices shown per 1M tokens
            </p>
          </div>
        </div>
      )}

      {/* No provider selected message */}
      {!selectedProvider && providers.length > 0 && (
        <div className="w-96 flex-shrink-0 bg-slate-800/50 border border-slate-700 rounded-xl flex items-center justify-center">
          <div className="text-center">
            <Cloud className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Select a provider</p>
            <p className="text-sm text-gray-500 mt-1">to view details and models</p>
          </div>
        </div>
      )}

      {/* Add/Edit Provider Modal */}
      <AddProviderModal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false)
          setEditingProvider(null)
        }}
        editProvider={editingProvider}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setDeletingProviderId(null)
        }}
        title="Delete Provider"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowDeleteConfirm(false)
                setDeletingProviderId(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteProvider}
            >
              Delete Provider
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-white">
              Are you sure you want to delete this provider?
            </p>
            <p className="text-sm text-gray-400 mt-1">
              This action cannot be undone. All associated settings will be removed.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default AIProvidersTab
