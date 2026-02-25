import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import {
  Search,
  Check,
  ChevronDown,
  Eye,
  Wrench,
  X,
  Loader2,
} from 'lucide-react';
import { useAIStore, AIModel } from '../../stores/aiStore';
import { cn } from '../../lib/utils';

/**
 * Model display data for the selector
 */
interface ModelOption {
  modelId: string;
  displayName: string;
  providerId: string;
  providerName: string;
  contextWindow?: number;
  supportsVision: boolean;
  supportsFunctions: boolean;
  supportsStreaming: boolean;
}

/**
 * Props for ModelSelectorField
 */
interface ModelSelectorFieldProps {
  value?: string;
  onChange?: (modelId: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * Compact Model Selector Field for FlowBuilder nodes
 *
 * A searchable dropdown for selecting AI models, designed to fit
 * within the NodeConfigPanel form layout.
 */
export const ModelSelectorField: React.FC<ModelSelectorFieldProps> = ({
  value,
  onChange,
  placeholder = 'Select a model...',
  required = false,
}) => {
  const { models, modelsLoading, modelsLoaded, fetchModels } = useAIStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch models on mount (uses shared store - only fetches once)
  useEffect(() => {
    if (!modelsLoaded && !modelsLoading) {
      fetchModels();
    }
  }, [modelsLoaded, modelsLoading, fetchModels]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Transform API models to display format
  const modelOptions: ModelOption[] = useMemo(() => {
    if (!Array.isArray(models)) return [];

    return models.map((model: AIModel) => {
      // Check modality for vision support (e.g., "text+image")
      const hasVision = model.modality?.includes('image') || false;

      return {
        modelId: model.id,
        displayName: model.name || model.id,
        providerId: model.provider || '',
        providerName: model.provider || '',
        contextWindow: model.contextLength,
        supportsVision: hasVision,
        supportsFunctions: false, // Not available in openrouter_models table
        supportsStreaming: true,
      };
    });
  }, [models]);

  // Filter models based on search
  const filteredModels = useMemo(() => {
    if (!searchQuery) return modelOptions;

    const searchLower = searchQuery.toLowerCase();
    return modelOptions.filter(
      (model) =>
        model.displayName.toLowerCase().includes(searchLower) ||
        model.modelId.toLowerCase().includes(searchLower) ||
        model.providerName.toLowerCase().includes(searchLower)
    );
  }, [modelOptions, searchQuery]);

  // Group filtered models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {};
    filteredModels.forEach((model) => {
      if (!groups[model.providerId]) {
        groups[model.providerId] = [];
      }
      groups[model.providerId].push(model);
    });
    return groups;
  }, [filteredModels]);

  // Get selected model display info
  const selectedModel = useMemo(() => {
    return modelOptions.find((m) => m.modelId === value);
  }, [modelOptions, value]);

  const handleSelect = useCallback(
    (modelId: string) => {
      onChange?.(modelId);
      setIsOpen(false);
      setSearchQuery('');
    },
    [onChange]
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.('');
    },
    [onChange]
  );

  const formatContextWindow = (ctx?: number): string => {
    if (!ctx) return '';
    if (ctx >= 1000000) return `${(ctx / 1000000).toFixed(1)}M`;
    if (ctx >= 1000) return `${(ctx / 1000).toFixed(0)}K`;
    return ctx.toString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2',
          'rounded-lg border bg-slate-800/50 text-left',
          'border-slate-600 hover:border-slate-500',
          'focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50',
          'transition-colors text-sm',
          !selectedModel && 'text-gray-500'
        )}
      >
        <div className="flex-1 min-w-0">
          {selectedModel ? (
            <div className="flex items-center gap-2">
              <span className="text-white truncate">{selectedModel.displayName}</span>
              <span className="text-xs text-gray-500 truncate">({selectedModel.providerName})</span>
            </div>
          ) : (
            <span>{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {selectedModel && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:bg-slate-600 rounded"
              aria-label="Clear selection"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
          <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 rounded-lg border border-slate-600 bg-slate-800 shadow-xl max-h-[300px] overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className="w-full pl-8 pr-3 py-1.5 rounded border border-slate-600 bg-slate-900 text-sm text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none"
                autoFocus
              />
            </div>
          </div>

          {/* Model List */}
          <div className="overflow-y-auto max-h-[240px]">
            {Object.entries(groupedModels).length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                {searchQuery ? 'No models found' : 'No models available. Configure AI providers in Settings.'}
              </div>
            ) : (
              Object.entries(groupedModels).map(([providerId, providerModels]) => (
                <div key={providerId}>
                  {/* Provider Header */}
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-slate-900/50 sticky top-0">
                    {providerModels[0]?.providerName || providerId}
                  </div>

                  {/* Provider Models */}
                  {providerModels.map((model) => (
                    <button
                      key={model.modelId}
                      type="button"
                      onClick={() => handleSelect(model.modelId)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-700/50 transition-colors',
                        value === model.modelId && 'bg-sky-500/10'
                      )}
                    >
                      {/* Selection indicator */}
                      <div
                        className={cn(
                          'w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center',
                          value === model.modelId
                            ? 'border-sky-500 bg-sky-500'
                            : 'border-slate-600'
                        )}
                      >
                        {value === model.modelId && (
                          <Check className="w-2.5 h-2.5 text-white" />
                        )}
                      </div>

                      {/* Model info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{model.displayName}</div>
                        <div className="text-xs text-gray-500 truncate">{model.modelId}</div>
                      </div>

                      {/* Capabilities */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {model.supportsVision && (
                          <span className="p-0.5 bg-purple-500/20 rounded" title="Vision">
                            <Eye className="w-3 h-3 text-purple-400" />
                          </span>
                        )}
                        {model.supportsFunctions && (
                          <span className="p-0.5 bg-amber-500/20 rounded" title="Functions">
                            <Wrench className="w-3 h-3 text-amber-400" />
                          </span>
                        )}
                        {model.contextWindow && (
                          <span className="text-[10px] text-gray-500 ml-1">
                            {formatContextWindow(model.contextWindow)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Manual Input Option */}
          <div className="p-2 border-t border-slate-700">
            <div className="text-xs text-gray-500 mb-1">Or enter model ID manually:</div>
            <input
              type="text"
              value={value || ''}
              onChange={(e) => onChange?.(e.target.value)}
              placeholder="e.g., anthropic/claude-3.5-sonnet"
              className="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-sm text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelectorField;
