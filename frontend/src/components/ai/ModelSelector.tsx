import React, { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Wrench,
  Zap,
  MessageSquare,
  DollarSign,
  Layers,
} from 'lucide-react';
import { Input } from '../common/Input';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import { useAIStore } from '../../stores/aiStore';
import { AIModel, AIProvider } from '../../types';
import { cn } from '../../lib/utils';

/**
 * Model capability indicators
 */
interface ModelCapability {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const capabilities: ModelCapability[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: <MessageSquare className="w-3 h-3" />,
    color: 'text-sky-400',
  },
  {
    id: 'vision',
    label: 'Vision',
    icon: <Eye className="w-3 h-3" />,
    color: 'text-purple-400',
  },
  {
    id: 'functions',
    label: 'Functions',
    icon: <Wrench className="w-3 h-3" />,
    color: 'text-amber-400',
  },
  {
    id: 'streaming',
    label: 'Streaming',
    icon: <Zap className="w-3 h-3" />,
    color: 'text-emerald-400',
  },
];

/**
 * Extended model data for display
 */
interface ModelDisplayData {
  id: string;
  modelId: string;
  displayName: string;
  providerId: string;
  providerName: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputPricePer1k?: number;
  outputPricePer1k?: number;
  supportsVision: boolean;
  supportsFunctions: boolean;
  supportsStreaming: boolean;
  isActive: boolean;
}

/**
 * Mock model data for demonstration
 * In production, this would come from the API
 */
const mockModels: ModelDisplayData[] = [
  {
    id: '1',
    modelId: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    providerId: 'openai',
    providerName: 'OpenAI',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    inputPricePer1k: 0.01,
    outputPricePer1k: 0.03,
    supportsVision: true,
    supportsFunctions: true,
    supportsStreaming: true,
    isActive: true,
  },
  {
    id: '2',
    modelId: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    providerId: 'openai',
    providerName: 'OpenAI',
    contextWindow: 16384,
    maxOutputTokens: 4096,
    inputPricePer1k: 0.0005,
    outputPricePer1k: 0.0015,
    supportsVision: false,
    supportsFunctions: true,
    supportsStreaming: true,
    isActive: true,
  },
  {
    id: '3',
    modelId: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    providerId: 'anthropic',
    providerName: 'Anthropic',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    inputPricePer1k: 0.015,
    outputPricePer1k: 0.075,
    supportsVision: true,
    supportsFunctions: true,
    supportsStreaming: true,
    isActive: true,
  },
  {
    id: '4',
    modelId: 'claude-3-sonnet-20240229',
    displayName: 'Claude 3 Sonnet',
    providerId: 'anthropic',
    providerName: 'Anthropic',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    inputPricePer1k: 0.003,
    outputPricePer1k: 0.015,
    supportsVision: true,
    supportsFunctions: true,
    supportsStreaming: true,
    isActive: true,
  },
  {
    id: '5',
    modelId: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    providerId: 'google',
    providerName: 'Google AI',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    inputPricePer1k: 0.0035,
    outputPricePer1k: 0.0105,
    supportsVision: true,
    supportsFunctions: true,
    supportsStreaming: true,
    isActive: true,
  },
  {
    id: '6',
    modelId: 'llama2:70b',
    displayName: 'Llama 2 70B',
    providerId: 'ollama',
    providerName: 'Ollama (Local)',
    contextWindow: 4096,
    maxOutputTokens: 2048,
    inputPricePer1k: 0,
    outputPricePer1k: 0,
    supportsVision: false,
    supportsFunctions: false,
    supportsStreaming: true,
    isActive: true,
  },
  {
    id: '7',
    modelId: 'mixtral-8x7b',
    displayName: 'Mixtral 8x7B',
    providerId: 'ollama',
    providerName: 'Ollama (Local)',
    contextWindow: 32768,
    maxOutputTokens: 4096,
    inputPricePer1k: 0,
    outputPricePer1k: 0,
    supportsVision: false,
    supportsFunctions: false,
    supportsStreaming: true,
    isActive: true,
  },
];

/**
 * Format number with K/M suffix
 */
const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}K`;
  }
  return num.toString();
};

/**
 * Format price
 */
const formatPrice = (price?: number): string => {
  if (price === undefined || price === null) return '-';
  if (price === 0) return 'Free';
  return `$${price.toFixed(4)}`;
};

/**
 * ModelSelector Props
 */
interface ModelSelectorProps {
  value?: string;
  onChange?: (modelId: string) => void;
  showAllModels?: boolean;
}

/**
 * ModelSelector Component
 *
 * A searchable dropdown/list for selecting AI models.
 * Groups models by provider and shows capabilities, context length, and pricing.
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  showAllModels = true,
}) => {
  const { providers } = useAIStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set(providers.map((p) => p.id))
  );
  const [capabilityFilter, setCapabilityFilter] = useState<Set<string>>(new Set());

  // Use mock models for demonstration - in production, this would come from API
  const models = mockModels;

  /**
   * Group models by provider
   */
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelDisplayData[]> = {};

    models.forEach((model) => {
      // Apply search filter
      const searchLower = searchQuery.toLowerCase();
      if (
        searchQuery &&
        !model.displayName.toLowerCase().includes(searchLower) &&
        !model.modelId.toLowerCase().includes(searchLower) &&
        !model.providerName.toLowerCase().includes(searchLower)
      ) {
        return;
      }

      // Apply capability filter
      if (capabilityFilter.size > 0) {
        const modelCapabilities = new Set<string>();
        modelCapabilities.add('chat'); // All models support chat
        if (model.supportsVision) modelCapabilities.add('vision');
        if (model.supportsFunctions) modelCapabilities.add('functions');
        if (model.supportsStreaming) modelCapabilities.add('streaming');

        const hasAllCapabilities = Array.from(capabilityFilter).every((cap) =>
          modelCapabilities.has(cap)
        );
        if (!hasAllCapabilities) return;
      }

      if (!groups[model.providerId]) {
        groups[model.providerId] = [];
      }
      groups[model.providerId].push(model);
    });

    return groups;
  }, [models, searchQuery, capabilityFilter]);

  /**
   * Toggle provider expansion
   */
  const toggleProvider = useCallback((providerId: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  }, []);

  /**
   * Toggle capability filter
   */
  const toggleCapabilityFilter = useCallback((capId: string) => {
    setCapabilityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(capId)) {
        next.delete(capId);
      } else {
        next.add(capId);
      }
      return next;
    });
  }, []);

  /**
   * Handle model selection
   */
  const handleSelectModel = useCallback(
    (modelId: string) => {
      onChange?.(modelId);
    },
    [onChange]
  );

  /**
   * Get unique providers from models
   */
  const uniqueProviders = useMemo(() => {
    const providerMap = new Map<string, { id: string; name: string }>();
    models.forEach((model) => {
      if (!providerMap.has(model.providerId)) {
        providerMap.set(model.providerId, {
          id: model.providerId,
          name: model.providerName,
        });
      }
    });
    return Array.from(providerMap.values());
  }, [models]);

  /**
   * Count total filtered models
   */
  const totalModels = useMemo(() => {
    return Object.values(groupedModels).reduce(
      (sum, models) => sum + models.length,
      0
    );
  }, [groupedModels]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Available Models</h2>
          <p className="text-sm text-gray-400">
            {totalModels} models available across {Object.keys(groupedModels).length}{' '}
            providers
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search models by name or provider..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            iconLeft={<Search className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* Capability Filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-gray-400 py-1">Filter by capability:</span>
        {capabilities.map((cap) => (
          <button
            key={cap.id}
            onClick={() => toggleCapabilityFilter(cap.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-sm transition-colors',
              capabilityFilter.has(cap.id)
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/50'
                : 'bg-slate-700/50 text-gray-400 border border-slate-600 hover:border-slate-500'
            )}
          >
            <span className={cap.color}>{cap.icon}</span>
            {cap.label}
          </button>
        ))}
      </div>

      {/* Model List */}
      <div className="space-y-3">
        {uniqueProviders.map((provider) => {
          const providerModels = groupedModels[provider.id];
          if (!providerModels || providerModels.length === 0) return null;

          const isExpanded = expandedProviders.has(provider.id);

          return (
            <Card key={provider.id} variant="bordered" noPadding>
              {/* Provider Header */}
              <button
                onClick={() => toggleProvider(provider.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-medium text-white">{provider.name}</h3>
                    <p className="text-sm text-gray-400">
                      {providerModels.length} model{providerModels.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* Models List */}
              {isExpanded && (
                <div className="border-t border-slate-700">
                  {providerModels.map((model, index) => (
                    <div
                      key={model.id}
                      onClick={() => handleSelectModel(model.modelId)}
                      className={cn(
                        'flex items-center justify-between p-4 cursor-pointer hover:bg-slate-700/30 transition-colors',
                        index !== providerModels.length - 1 &&
                          'border-b border-slate-700/50',
                        value === model.modelId && 'bg-sky-500/10'
                      )}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Selection indicator */}
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                            value === model.modelId
                              ? 'border-sky-500 bg-sky-500'
                              : 'border-slate-600'
                          )}
                        >
                          {value === model.modelId && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>

                        {/* Model info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white truncate">
                              {model.displayName}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 truncate">
                            {model.modelId}
                          </p>
                        </div>

                        {/* Capabilities */}
                        <div className="hidden sm:flex items-center gap-1.5">
                          {model.supportsVision && (
                            <span
                              className="p-1 bg-purple-500/20 rounded"
                              title="Vision"
                            >
                              <Eye className="w-3.5 h-3.5 text-purple-400" />
                            </span>
                          )}
                          {model.supportsFunctions && (
                            <span
                              className="p-1 bg-amber-500/20 rounded"
                              title="Functions"
                            >
                              <Wrench className="w-3.5 h-3.5 text-amber-400" />
                            </span>
                          )}
                          {model.supportsStreaming && (
                            <span
                              className="p-1 bg-emerald-500/20 rounded"
                              title="Streaming"
                            >
                              <Zap className="w-3.5 h-3.5 text-emerald-400" />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="hidden md:flex items-center gap-6 text-sm">
                        {/* Context Window */}
                        <div className="text-right w-20">
                          <p className="text-gray-300">
                            {model.contextWindow
                              ? formatNumber(model.contextWindow)
                              : '-'}
                          </p>
                          <p className="text-xs text-gray-500">context</p>
                        </div>

                        {/* Price */}
                        <div className="text-right w-24">
                          <p className="text-gray-300">
                            {formatPrice(model.inputPricePer1k)}
                          </p>
                          <p className="text-xs text-gray-500">per 1K tokens</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}

        {/* Empty state */}
        {totalModels === 0 && (
          <Card variant="bordered" className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                No models found
              </h3>
              <p className="text-gray-400 max-w-md">
                {searchQuery || capabilityFilter.size > 0
                  ? 'Try adjusting your search or filters to find models.'
                  : 'Add an AI provider to see available models.'}
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ModelSelector;
