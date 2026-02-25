import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronDown, Loader2, X, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import api from '../../services/api';

export interface ModelOption {
  id: string;
  name: string;
  provider?: string;
  contextLength?: number;
  isFree?: boolean;
}

export interface SearchableModelSelectProps {
  /** Currently selected model ID */
  value: string;
  /** Callback when model is selected */
  onChange: (modelId: string, model?: ModelOption) => void;
  /** Provider type for filtering (optional) */
  provider?: 'openrouter' | 'ollama' | 'anthropic' | 'google';
  /** Placeholder text */
  placeholder?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Additional className */
  className?: string;
  /** Label for the select */
  label?: string;
  /** Error message */
  error?: string;
}

/**
 * SearchableModelSelect - A searchable dropdown for selecting AI models
 *
 * Features:
 * - Debounced search API calls
 * - Keyboard navigation
 * - Loading states
 * - Provider grouping
 */
export const SearchableModelSelect: React.FC<SearchableModelSelectProps> = ({
  value,
  onChange,
  provider = 'openrouter',
  placeholder = 'Search models...',
  disabled = false,
  loading: externalLoading = false,
  className,
  label,
  error,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch models based on search query
  const fetchModels = useCallback(async (query: string) => {
    if (provider !== 'openrouter') {
      return; // Only OpenRouter supports API search
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) {
        params.append('search', query.trim());
      }

      const response = await api.get(`/ai/models?${params.toString()}`);

      // Handle both response formats: { models: [...] } or { success: true, data: [...] }
      const modelsData = response.data?.models || response.data?.data || response.data || [];
      if (Array.isArray(modelsData) && modelsData.length > 0) {
        const fetchedModels: ModelOption[] = modelsData.map((m: {
          id: string;
          name: string;
          provider?: string;
          contextLength?: number;
          context_length?: number;
          isFree?: boolean;
          is_free?: boolean | number;
        }) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          contextLength: m.contextLength || m.context_length,
          isFree: m.isFree ?? !!m.is_free,
        }));
        setModels(fetchedModels);

        // If we have a value but no selectedModel, find it in results
        if (value && !selectedModel) {
          const found = fetchedModels.find(m => m.id === value);
          if (found) {
            setSelectedModel(found);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
      setModels([]);
    } finally {
      setIsLoading(false);
    }
  }, [provider, value, selectedModel]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchModels(searchQuery);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, isOpen, fetchModels]);

  // Initial fetch when opened
  useEffect(() => {
    if (isOpen && models.length === 0) {
      fetchModels('');
    }
  }, [isOpen, fetchModels, models.length]);

  // Load selected model info on mount if value exists
  useEffect(() => {
    if (value && !selectedModel && provider === 'openrouter') {
      // Try to fetch the specific model
      api.get(`/ai/models/${encodeURIComponent(value)}`).then(response => {
        // Handle both response formats
        const m = response.data?.data || response.data?.model || response.data;
        if (m && m.id) {
          setSelectedModel({
            id: m.id,
            name: m.name,
            provider: m.provider,
            contextLength: m.contextLength || m.context_length,
            isFree: m.isFree ?? !!m.is_free,
          });
        }
      }).catch(() => {
        // Model not found, just show the ID
        setSelectedModel({ id: value, name: value });
      });
    }
  }, [value, selectedModel, provider]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => Math.min(prev + 1, models.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (models[highlightedIndex]) {
          handleSelect(models[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedItem = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (model: ModelOption) => {
    setSelectedModel(model);
    onChange(model.id, model);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedModel(null);
    onChange('');
    setSearchQuery('');
  };

  const displayValue = selectedModel?.name || value || placeholder;
  const showLoading = isLoading || externalLoading;

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      {label && (
        <label className="block text-xs font-medium text-gray-300 mb-1">
          {label}
          {showLoading && !isOpen && (
            <Loader2 className="inline w-3 h-3 ml-2 animate-spin text-sky-400" />
          )}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors',
          'bg-slate-800/50 text-left',
          isOpen
            ? 'border-sky-500 ring-2 ring-sky-500/20'
            : 'border-slate-600 hover:border-slate-500',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-red-500'
        )}
      >
        <span className={cn(
          'flex-1 truncate',
          selectedModel ? 'text-white' : 'text-gray-500'
        )}>
          {displayValue}
        </span>

        <div className="flex items-center gap-1">
          {selectedModel && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:bg-slate-700 rounded"
            >
              <X className="w-3 h-3 text-gray-400 hover:text-white" />
            </button>
          )}
          <ChevronDown className={cn(
            'w-4 h-4 text-gray-400 transition-transform',
            isOpen && 'rotate-180'
          )} />
        </div>
      </button>

      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search models..."
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
              />
              {isLoading && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-400 animate-spin" />
              )}
            </div>
          </div>

          {/* Model list */}
          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto"
          >
            {models.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">
                {isLoading ? 'Loading models...' : 'No models found'}
              </div>
            ) : (
              models.map((model, index) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleSelect(model)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    'w-full flex items-start gap-2 px-3 py-2 text-left transition-colors',
                    index === highlightedIndex && 'bg-slate-700/50',
                    model.id === value && 'bg-sky-500/10'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white truncate">
                        {model.name}
                      </span>
                      {model.isFree && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-400 rounded">
                          Free
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-500 truncate">
                        {model.id}
                      </span>
                      {model.contextLength && (
                        <span className="text-[10px] text-gray-600">
                          {Math.round(model.contextLength / 1000)}K ctx
                        </span>
                      )}
                    </div>
                  </div>
                  {model.id === value && (
                    <Check className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer with count */}
          {models.length > 0 && (
            <div className="px-3 py-1.5 border-t border-slate-700 text-[10px] text-gray-500">
              {models.length} models {searchQuery && `matching "${searchQuery}"`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

SearchableModelSelect.displayName = 'SearchableModelSelect';

export default SearchableModelSelect;
