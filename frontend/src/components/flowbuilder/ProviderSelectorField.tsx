import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  Check,
  ChevronDown,
  X,
  Loader2,
  Server,
  Cloud,
  Zap,
  Terminal,
  Sparkles,
} from 'lucide-react';
import { useAIStore } from '../../stores/aiStore';
import { cn } from '../../lib/utils';

/**
 * Props for ProviderSelectorField
 */
interface ProviderSelectorFieldProps {
  value?: string;
  onChange?: (providerId: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  includeAutoSelect?: boolean;
  includeTaskRouting?: boolean; // NEW: Include Task Routing option
}

// Provider type icons
const getProviderIcon = (type?: string, isTaskRouting?: boolean) => {
  if (isTaskRouting) {
    return <Sparkles className="w-4 h-4 text-amber-400" />;
  }
  switch (type) {
    case 'ollama':
      return <Server className="w-4 h-4 text-green-400" />;
    case 'cli-claude':
    case 'cli-gemini':
    case 'cli-opencode':
      return <Terminal className="w-4 h-4 text-purple-400" />;
    case 'openrouter':
    default:
      return <Cloud className="w-4 h-4 text-sky-400" />;
  }
};

/**
 * Provider option for display
 */
interface UserProviderOption {
  id: string;
  name: string;
  type: string;
  models: string[];
  isDefault?: boolean;
}

/**
 * Enhanced Provider Selector Field for FlowBuilder nodes
 *
 * Shows:
 * - Task Routing (auto-select based on task tier)
 * - Auto-select (recommended)
 * - User's configured providers from ai_providers table
 */
export const ProviderSelectorField: React.FC<ProviderSelectorFieldProps> = ({
  value,
  onChange,
  placeholder = 'Select a provider...',
  required = false,
  disabled = false,
  includeAutoSelect = true,
  includeTaskRouting = true,
}) => {
  const { providers, loading: providersLoading, fetchProviders } = useAIStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch user's configured providers on mount
  useEffect(() => {
    if (providers.length === 0 && !providersLoading) {
      fetchProviders();
    }
  }, [providers.length, providersLoading, fetchProviders]);

  // Transform to display format
  const userProviders: UserProviderOption[] = useMemo(() => {
    return (providers || []).map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      models: Array.isArray(p.models) ? p.models : [],
      isDefault: p.isDefault,
    }));
  }, [providers]);

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

  // Filter providers based on search
  const filteredProviders = useMemo(() => {
    if (!searchQuery) return userProviders;

    const searchLower = searchQuery.toLowerCase();
    return userProviders.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.type.toLowerCase().includes(searchLower)
    );
  }, [userProviders, searchQuery]);

  // Get selected provider display info
  const selectedProvider = useMemo(() => {
    if (!value) return null;
    if (value === 'task-routing') {
      return { id: 'task-routing', name: 'Task Routing', type: 'task-routing', models: [], isDefault: false };
    }
    return userProviders.find((p) => p.id === value || p.name === value) || null;
  }, [userProviders, value]);

  const handleSelect = useCallback(
    (providerId: string) => {
      onChange?.(providerId);
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

  // Get display text for selected value
  const getDisplayText = () => {
    if (value === 'task-routing') {
      return (
        <>
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-white">Task Routing</span>
          <span className="text-xs text-gray-500">(auto tier-based)</span>
        </>
      );
    }
    if (selectedProvider) {
      return (
        <>
          {getProviderIcon(selectedProvider.type)}
          <span className="text-white truncate">{selectedProvider.name}</span>
          {selectedProvider.models.length > 0 && (
            <span className="text-xs text-gray-500">({selectedProvider.models.length} models)</span>
          )}
          {selectedProvider.isDefault && (
            <span className="text-xs text-green-400">(default)</span>
          )}
        </>
      );
    }
    if (value === '' && includeAutoSelect) {
      return <span className="text-gray-300">Auto-select (recommended)</span>;
    }
    return <span>{placeholder}</span>;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2',
          'rounded-lg border bg-slate-800/50 text-left',
          'border-slate-600 hover:border-slate-500',
          'focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50',
          'transition-colors text-sm',
          !selectedProvider && !value && 'text-gray-500',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {providersLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              <span className="text-gray-400">Loading providers...</span>
            </>
          ) : (
            getDisplayText()
          )}
        </div>
        <div className="flex items-center gap-1">
          {selectedProvider && value && value !== '' && (
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
        <div className="absolute z-50 w-full mt-1 rounded-lg border border-slate-600 bg-slate-800 shadow-xl max-h-[350px] overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search providers..."
                className="w-full pl-8 pr-3 py-1.5 rounded border border-slate-600 bg-slate-900 text-sm text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none"
                autoFocus
              />
            </div>
          </div>

          {/* Provider List */}
          <div className="overflow-y-auto max-h-[280px]">
            {/* Task Routing Option (uses SuperBrain tier-based selection) */}
            {includeTaskRouting && !searchQuery && (
              <button
                type="button"
                onClick={() => handleSelect('task-routing')}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-amber-500/10 transition-colors border-b border-slate-700',
                  value === 'task-routing' && 'bg-amber-500/10'
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center',
                    value === 'task-routing' ? 'border-amber-500 bg-amber-500' : 'border-slate-600'
                  )}
                >
                  {value === 'task-routing' && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <Sparkles className="w-4 h-4 text-amber-400" />
                <div className="flex-1">
                  <div className="text-sm text-amber-300 font-medium">Task Routing</div>
                  <div className="text-xs text-gray-500">Auto-select provider based on task complexity tier</div>
                </div>
                <Zap className="w-4 h-4 text-amber-400" />
              </button>
            )}

            {/* Auto-select option */}
            {includeAutoSelect && !searchQuery && (
              <button
                type="button"
                onClick={() => handleSelect('')}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-700/50 transition-colors border-b border-slate-700',
                  value === '' && 'bg-sky-500/10'
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center',
                    value === '' ? 'border-sky-500 bg-sky-500' : 'border-slate-600'
                  )}
                >
                  {value === '' && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <div className="flex-1">
                  <div className="text-sm text-white">Auto-select (recommended)</div>
                  <div className="text-xs text-gray-500">System chooses best available provider</div>
                </div>
              </button>
            )}

            {/* Section Header for User Providers */}
            {!searchQuery && userProviders.length > 0 && (
              <div className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-slate-900/50 sticky top-0">
                Your Configured Providers
              </div>
            )}

            {providersLoading ? (
              <div className="p-4 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading providers...
              </div>
            ) : filteredProviders.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                {searchQuery ? 'No providers found' : 'No providers configured. Add providers in Settings > AI Providers.'}
              </div>
            ) : (
              filteredProviders.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => handleSelect(provider.name)} // Use name for SuperBrain lookup
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-700/50 transition-colors',
                    (value === provider.id || value === provider.name) && 'bg-sky-500/10'
                  )}
                >
                  {/* Selection indicator */}
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center',
                      (value === provider.id || value === provider.name)
                        ? 'border-sky-500 bg-sky-500'
                        : 'border-slate-600'
                    )}
                  >
                    {(value === provider.id || value === provider.name) && (
                      <Check className="w-2.5 h-2.5 text-white" />
                    )}
                  </div>

                  {/* Provider icon */}
                  {getProviderIcon(provider.type)}

                  {/* Provider info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate flex items-center gap-2">
                      {provider.name}
                      {provider.isDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">default</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{provider.type}</div>
                  </div>

                  {/* Model count */}
                  {provider.models.length > 0 && (
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {provider.models.length} models
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProviderSelectorField;
