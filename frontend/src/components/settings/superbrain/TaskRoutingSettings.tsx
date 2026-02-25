import React, { useEffect, useState, useCallback } from 'react';
import { Save, Info, RefreshCw, AlertCircle, Plus, Trash2, ChevronUp, ChevronDown, Star, RotateCcw, Brain, Cpu, Sparkles } from 'lucide-react';
import { useSuperBrainStore, SuperBrainSettings, ProviderModel, AvailableProvider, FailoverEntry, TierName, ClassifierEntry } from '../../../stores/superbrainStore';

/**
 * Tier configuration type
 */
interface TierConfig {
  id: TierName;
  label: string;
  description: string;
  defaultProvider: string;
}

/**
 * Task Routing Settings Component
 * Configure which AI providers and models handle different types of tasks.
 * Supports primary provider+model and multiple ordered fallbacks per tier.
 */
export default function TaskRoutingSettings() {
  const {
    settings,
    availableProviders,
    loadingProviders,
    loading,
    error,
    fetchSettings,
    fetchAvailableProviders,
    fetchProviderModels,
    updateSettings,
    clearError,
  } = useSuperBrainStore();

  const [localSettings, setLocalSettings] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [budgetExpanded, setBudgetExpanded] = useState(false);
  const [classifierExpanded, setClassifierExpanded] = useState(false);

  // Per-classifier-entry models cache
  const [classifierModelsCache, setClassifierModelsCache] = useState<Record<string, ProviderModel[]>>({});
  const [loadingClassifierModels, setLoadingClassifierModels] = useState<Record<string, boolean>>({});

  // Per-provider models cache: { providerId: ProviderModel[] }
  const [providerModels, setProviderModels] = useState<Record<string, ProviderModel[]>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});

  // Tier configurations
  // NOTE: Users configure their model preferences (free vs paid) via the model dropdown
  const tierConfigs: TierConfig[] = [
    {
      id: 'trivial',
      label: 'Trivial Tasks',
      description: 'greetings, yes/no questions',
      defaultProvider: 'ollama',
    },
    {
      id: 'simple',
      label: 'Simple Tasks',
      description: 'quick queries, translation, rephrasing',
      defaultProvider: 'openrouter',
    },
    {
      id: 'moderate',
      label: 'Moderate Tasks',
      description: 'standard conversations, analysis',
      defaultProvider: 'openrouter',
    },
    {
      id: 'complex',
      label: 'Complex Tasks',
      description: 'code generation, deep reasoning',
      defaultProvider: 'openrouter',
    },
    {
      id: 'critical',
      label: 'Critical Tasks',
      description: 'agentic tasks, autonomous operations',
      defaultProvider: 'cli-claude',
    },
  ];

  // Default reasoning budgets (matches hardcoded values in AgentReasoningLoop.cjs)
  const defaultBudgets: Record<string, { maxIterations: number; maxToolCalls: number }> = {
    trivial:  { maxIterations: 1,  maxToolCalls: 1 },
    simple:   { maxIterations: 3,  maxToolCalls: 3 },
    moderate: { maxIterations: 8,  maxToolCalls: 6 },
    complex:  { maxIterations: 12, maxToolCalls: 8 },
    critical: { maxIterations: 15, maxToolCalls: 10 },
  };

  // Get the current budget for a tier (user override or default)
  const getBudget = (tierId: string) => {
    return localSettings?.reasoningBudgets?.[tierId] || defaultBudgets[tierId];
  };

  // Update a single tier's budget
  const updateBudget = (tierId: string, field: 'maxIterations' | 'maxToolCalls', value: number) => {
    if (!localSettings) return;
    const current = localSettings.reasoningBudgets || { ...defaultBudgets };
    setLocalSettings({
      ...localSettings,
      reasoningBudgets: {
        ...current,
        [tierId]: {
          ...getBudget(tierId),
          [field]: value,
        },
      },
    });
  };

  // Reset budgets to defaults (set to null)
  const resetBudgets = () => {
    if (!localSettings) return;
    setLocalSettings({
      ...localSettings,
      reasoningBudgets: null,
    });
  };

  // Fetch models for a classifier provider (by name)
  const fetchClassifierModelsFor = useCallback(async (providerName: string) => {
    if (!providerName || providerName === 'local' || classifierModelsCache[providerName] || loadingClassifierModels[providerName]) return;
    const provider = availableProviders.find(p => p.name === providerName || p.id === providerName);
    if (!provider) return;

    setLoadingClassifierModels(prev => ({ ...prev, [providerName]: true }));
    try {
      const models = await fetchProviderModels(provider.id);
      setClassifierModelsCache(prev => ({ ...prev, [providerName]: models }));
    } catch {
      setClassifierModelsCache(prev => ({ ...prev, [providerName]: [] }));
    } finally {
      setLoadingClassifierModels(prev => ({ ...prev, [providerName]: false }));
    }
  }, [availableProviders, fetchProviderModels, classifierModelsCache, loadingClassifierModels]);

  // Fetch models for all providers in the classifier chain
  useEffect(() => {
    if (!localSettings?.classifierChain) return;
    for (const entry of localSettings.classifierChain) {
      if (entry.provider && entry.provider !== 'local') {
        fetchClassifierModelsFor(entry.provider);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSettings?.classifierChain, availableProviders.length]);

  // Classifier chain helpers
  const getClassifierChain = useCallback((): ClassifierEntry[] => {
    return localSettings?.classifierChain || [];
  }, [localSettings]);

  const updateClassifierChain = useCallback((newChain: ClassifierEntry[]) => {
    if (!localSettings) return;
    setLocalSettings({ ...localSettings, classifierChain: newChain.length > 0 ? newChain : null });
  }, [localSettings]);

  const addClassifierEntry = useCallback(() => {
    const chain = getClassifierChain();
    const newEntry: ClassifierEntry = {
      provider: availableProviders[0]?.name || 'local',
      model: null,
    };
    updateClassifierChain([...chain, newEntry]);
  }, [getClassifierChain, updateClassifierChain, availableProviders]);

  const removeClassifierEntry = useCallback((index: number) => {
    const chain = getClassifierChain();
    if (chain.length <= 1) return; // Must have at least 1 entry
    updateClassifierChain(chain.filter((_, idx) => idx !== index));
  }, [getClassifierChain, updateClassifierChain]);

  const moveClassifierEntry = useCallback((index: number, direction: 'up' | 'down') => {
    const chain = getClassifierChain();
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= chain.length) return;
    const newChain = [...chain];
    [newChain[index], newChain[newIndex]] = [newChain[newIndex], newChain[index]];
    updateClassifierChain(newChain);
  }, [getClassifierChain, updateClassifierChain]);

  const updateClassifierEntry = useCallback((index: number, updates: Partial<ClassifierEntry>) => {
    const chain = getClassifierChain();
    const newChain = chain.map((entry, idx) =>
      idx === index ? { ...entry, ...updates } : entry
    );
    updateClassifierChain(newChain);
    if (updates.provider && updates.provider !== 'local') {
      fetchClassifierModelsFor(updates.provider);
    }
  }, [getClassifierChain, updateClassifierChain, fetchClassifierModelsFor]);

  // Fetch settings and providers on mount
  useEffect(() => {
    fetchSettings();
    fetchAvailableProviders();
  }, [fetchSettings, fetchAvailableProviders]);

  // Sync local settings when settings change
  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  // Fetch models for a provider
  const fetchModelsForProvider = useCallback(async (providerId: string) => {
    if (!providerId || providerModels[providerId] || loadingModels[providerId]) return;

    setLoadingModels(prev => ({ ...prev, [providerId]: true }));
    try {
      const models = await fetchProviderModels(providerId);
      setProviderModels(prev => ({ ...prev, [providerId]: models }));
    } catch (error) {
      console.error(`Failed to fetch models for provider ${providerId}:`, error);
      setProviderModels(prev => ({ ...prev, [providerId]: [] }));
    } finally {
      setLoadingModels(prev => ({ ...prev, [providerId]: false }));
    }
  }, [fetchProviderModels, providerModels, loadingModels]);

  // Get the failover chain for a tier (from customFailoverChain or build from legacy settings)
  const getFailoverChain = useCallback((tierId: TierName): FailoverEntry[] => {
    if (!localSettings) return [];

    // Check for custom failover chain first
    if (localSettings.customFailoverChain?.[tierId]?.length) {
      return localSettings.customFailoverChain[tierId];
    }

    // Build from legacy individual tier settings
    const providerKey = `${tierId}TierProvider` as keyof SuperBrainSettings;
    const modelKey = `${tierId}TierModel` as keyof SuperBrainSettings;
    const provider = (localSettings[providerKey] as string) || tierConfigs.find(t => t.id === tierId)?.defaultProvider || 'ollama';
    const model = (localSettings[modelKey] as string | null) || null;

    return [{ provider, model, isPrimary: true }];
  }, [localSettings, tierConfigs]);

  // Update failover chain for a tier
  const updateFailoverChain = useCallback((tierId: TierName, newChain: FailoverEntry[]) => {
    if (!localSettings) return;

    // Ensure first entry is marked as primary
    if (newChain.length > 0) {
      newChain = newChain.map((entry, idx) => ({
        ...entry,
        isPrimary: idx === 0,
      }));
    }

    const updatedCustomChain = {
      ...(localSettings.customFailoverChain || {}),
      [tierId]: newChain,
    };

    setLocalSettings({
      ...localSettings,
      customFailoverChain: updatedCustomChain,
    });
  }, [localSettings]);

  // Add a fallback entry to a tier
  const addFallback = useCallback((tierId: TierName) => {
    const chain = getFailoverChain(tierId);
    const newEntry: FailoverEntry = {
      provider: availableProviders[0]?.id || 'ollama',
      model: null,
      isPrimary: false,
    };
    updateFailoverChain(tierId, [...chain, newEntry]);
  }, [getFailoverChain, updateFailoverChain, availableProviders]);

  // Remove a fallback entry from a tier
  const removeFallback = useCallback((tierId: TierName, index: number) => {
    const chain = getFailoverChain(tierId);
    if (index === 0 || chain.length <= 1) return; // Cannot remove primary
    const newChain = chain.filter((_, idx) => idx !== index);
    updateFailoverChain(tierId, newChain);
  }, [getFailoverChain, updateFailoverChain]);

  // Move a fallback entry up/down
  const moveFallback = useCallback((tierId: TierName, index: number, direction: 'up' | 'down') => {
    const chain = getFailoverChain(tierId);
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    // Don't move primary (index 0) or out of bounds
    if (index === 0 || newIndex < 0 || newIndex >= chain.length) return;
    // Don't move to primary position
    if (newIndex === 0) return;

    const newChain = [...chain];
    [newChain[index], newChain[newIndex]] = [newChain[newIndex], newChain[index]];
    updateFailoverChain(tierId, newChain);
  }, [getFailoverChain, updateFailoverChain]);

  // Update an entry in the chain
  const updateEntry = useCallback((tierId: TierName, index: number, updates: Partial<FailoverEntry>) => {
    const chain = getFailoverChain(tierId);
    const newChain = chain.map((entry, idx) =>
      idx === index ? { ...entry, ...updates } : entry
    );
    updateFailoverChain(tierId, newChain);

    // Fetch models for new provider if changed
    if (updates.provider) {
      fetchModelsForProvider(updates.provider);
    }
  }, [getFailoverChain, updateFailoverChain, fetchModelsForProvider]);

  const handleSave = async () => {
    if (!localSettings) return;
    setSaving(true);
    try {
      await updateSettings(localSettings);
    } catch {
      // Error handled in store
    } finally {
      setSaving(false);
    }
  };

  // Get display name for a provider
  const getProviderDisplayName = (provider: AvailableProvider): string => {
    let name = provider.name;
    if (provider.type === 'cli' && !provider.isAuthenticated) {
      name += ' (Not authenticated)';
    }
    return name;
  };

  // Get provider by ID
  const getProviderById = (providerId: string): AvailableProvider | undefined => {
    return availableProviders.find(p => p.id === providerId);
  };

  // Group providers by type for the dropdown
  const apiProviders = availableProviders.filter(p => p.type === 'api');
  const localAgentProviders = availableProviders.filter(p => p.type === 'local-agent');
  const cliProviders = availableProviders.filter(p => p.type === 'cli');

  // Fetch models for all providers in all chains
  // NOTE: This useEffect must be before any conditional returns to maintain hooks order
  useEffect(() => {
    if (!localSettings) return;

    // Collect all unique providers from all tiers
    const providersToFetch = new Set<string>();
    tierConfigs.forEach(tier => {
      const chain = getFailoverChain(tier.id);
      chain.forEach(entry => {
        if (entry.provider && !providerModels[entry.provider] && !loadingModels[entry.provider]) {
          providersToFetch.add(entry.provider);
        }
      });
    });

    // Fetch models for each provider
    providersToFetch.forEach(providerId => {
      fetchModelsForProvider(providerId);
    });
  }, [localSettings?.customFailoverChain, tierConfigs, getFailoverChain, providerModels, loadingModels, fetchModelsForProvider]);

  // Loading state - placed after all hooks
  if ((loading || loadingProviders) && !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  // Render a provider+model row
  const renderEntryRow = (
    tierId: TierName,
    entry: FailoverEntry,
    index: number,
    totalEntries: number
  ) => {
    const models = providerModels[entry.provider] || [];
    const isLoadingEntryModels = loadingModels[entry.provider];
    const freeModels = models.filter(m => m.isFree);
    const paidModels = models.filter(m => !m.isFree);

    return (
      <div
        key={index}
        className={`flex items-center gap-3 p-3 rounded-lg ${
          entry.isPrimary
            ? 'bg-primary-500/10 border border-primary-500/30'
            : 'bg-dark-700/50 border border-dark-600'
        }`}
      >
        {/* Primary indicator or index */}
        <div className="w-8 flex-shrink-0 text-center">
          {entry.isPrimary ? (
            <Star className="w-5 h-5 text-amber-400 fill-amber-400 mx-auto" />
          ) : (
            <span className="text-dark-400 text-sm font-medium">{index}.</span>
          )}
        </div>

        {/* Provider Dropdown */}
        <div className="flex-1 min-w-0">
          <select
            aria-label="Provider"
            value={entry.provider}
            onChange={(e) => updateEntry(tierId, index, { provider: e.target.value, model: null })}
            className="input-field w-full text-sm"
          >
            {apiProviders.length > 0 && (
              <optgroup label="API Providers">
                {apiProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {getProviderDisplayName(p)}
                  </option>
                ))}
              </optgroup>
            )}
            {localAgentProviders.length > 0 && (
              <optgroup label="Local Agent">
                {localAgentProviders.map((p) => (
                  <option key={p.dbId || p.id} value={p.name} disabled={!p.isAuthenticated}>
                    {p.name}{!p.isAuthenticated ? ' (Offline)' : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {cliProviders.length > 0 && (
              <optgroup label="CLI Providers">
                {cliProviders.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.isAuthenticated}>
                    {getProviderDisplayName(p)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* Model Dropdown */}
        <div className="flex-1 min-w-0">
          <div className="relative">
            <select
              aria-label="Model"
              value={entry.model || ''}
              onChange={(e) => updateEntry(tierId, index, { model: e.target.value || null })}
              className="input-field w-full text-sm"
              disabled={isLoadingEntryModels || models.length === 0}
            >
              <option value="">Auto (default)</option>
              {isLoadingEntryModels ? (
                <option disabled>Loading...</option>
              ) : (
                <>
                  {freeModels.length > 0 && (
                    <optgroup label="Free">
                      {freeModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {paidModels.length > 0 && (
                    <optgroup label="Paid">
                      {paidModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </select>
            {isLoadingEntryModels && (
              <RefreshCw className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-dark-400 animate-spin" />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!entry.isPrimary && (
            <>
              <button
                type="button"
                onClick={() => moveFallback(tierId, index, 'up')}
                disabled={index <= 1}
                className="p-1.5 text-dark-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move up"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => moveFallback(tierId, index, 'down')}
                disabled={index >= totalEntries - 1}
                className="p-1.5 text-dark-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => removeFallback(tierId, index)}
                className="p-1.5 text-dark-400 hover:text-red-400"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          {entry.isPrimary && (
            <span className="text-xs text-primary-400 font-medium px-2">Primary</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
          <button type="button" onClick={clearError} className="text-sm text-red-300 hover:text-red-200 mt-2">
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-dark-800/50 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-dark-300">
          <p className="font-medium text-white mb-1">How Task Routing Works</p>
          <p>
            SuperBrain classifies tasks into 5 tiers based on complexity. For each tier,
            configure a <strong>primary</strong> provider+model and optional <strong>fallbacks</strong>.
            If the primary fails, fallbacks are tried in order.
          </p>
        </div>
      </div>

      {availableProviders.length === 0 && !loadingProviders && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-200">
            <p className="font-medium mb-1">No Providers Configured</p>
            <p>
              Configure AI providers in <strong>Settings → Integrations → AI Providers</strong> to enable task routing.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {tierConfigs.map((tier) => {
          const chain = getFailoverChain(tier.id);

          return (
            <div key={tier.id} className="border border-dark-600 rounded-lg overflow-hidden">
              {/* Tier Header */}
              <div className="bg-dark-700/50 px-4 py-3 border-b border-dark-600">
                <h3 className="text-sm font-medium text-white">
                  {tier.label}
                  <span className="text-dark-400 font-normal ml-2">
                    ({tier.description})
                  </span>
                </h3>
              </div>

              {/* Provider Chain */}
              <div className="p-4 space-y-2">
                {chain.map((entry, index) => renderEntryRow(tier.id, entry, index, chain.length))}

                {/* Add Fallback Button */}
                <button
                  type="button"
                  onClick={() => addFallback(tier.id)}
                  className="w-full flex items-center justify-center gap-2 p-2 border border-dashed border-dark-500 rounded-lg text-dark-400 hover:text-white hover:border-dark-400 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm">Add Fallback</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Task Classifier Section */}
      <div className="mt-6 border border-dark-600 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setClassifierExpanded(!classifierExpanded)}
          className="w-full bg-dark-700/50 px-4 py-3 flex items-center justify-between hover:bg-dark-700/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-medium text-white">Task Classifier</h3>
            {localSettings?.classifierMode === 'ai' && (
              <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">AI</span>
            )}
            {localSettings?.classifierMode !== 'ai' && (
              <span className="text-xs bg-dark-600 text-dark-400 px-2 py-0.5 rounded-full">Local</span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${classifierExpanded ? 'rotate-180' : ''}`} />
        </button>

        {classifierExpanded && (
          <div className="p-4 space-y-4">
            <div className="flex items-start gap-3 text-sm text-dark-300 mb-4">
              <Info className="w-4 h-4 text-dark-400 flex-shrink-0 mt-0.5" />
              <p>
                Controls how incoming messages are classified into complexity tiers.
                <strong> Local</strong> uses fast keyword-based scoring (zero latency).
                <strong> AI</strong> uses an AI model for more accurate classification (adds ~1-3s latency per message).
              </p>
            </div>

            {/* Mode Toggle */}
            <div className="flex items-center gap-4 p-3 bg-dark-700/30 rounded-lg">
              <span className="text-sm font-medium text-white w-24">Mode</span>
              <div className="flex items-center gap-1 bg-dark-800 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => localSettings && setLocalSettings({ ...localSettings, classifierMode: 'local' })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    localSettings?.classifierMode !== 'ai'
                      ? 'bg-dark-600 text-white'
                      : 'text-dark-400 hover:text-white'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  Local
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!localSettings) return;
                    // Auto-seed the chain with one entry when switching to AI mode for the first time
                    const chain = localSettings.classifierChain;
                    setLocalSettings({
                      ...localSettings,
                      classifierMode: 'ai',
                      classifierChain: chain && chain.length > 0 ? chain : [{ provider: availableProviders[0]?.name || 'local', model: null }],
                    });
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    localSettings?.classifierMode === 'ai'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-dark-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI
                </button>
              </div>
            </div>

            {/* AI Classifier Chain */}
            {localSettings?.classifierMode === 'ai' && (
              <div className="space-y-2">
                {getClassifierChain().map((entry, index) => {
                  const isLocal = entry.provider === 'local';
                  const models = isLocal ? [] : (classifierModelsCache[entry.provider] || []);
                  const isLoadingEntryModels = !isLocal && loadingClassifierModels[entry.provider];
                  const freeModels = models.filter(m => m.isFree);
                  const paidModels = models.filter(m => !m.isFree);
                  const totalEntries = getClassifierChain().length;

                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        index === 0
                          ? 'bg-primary-500/10 border border-primary-500/30'
                          : 'bg-dark-700/50 border border-dark-600'
                      }`}
                    >
                      {/* Position indicator */}
                      <div className="w-8 flex-shrink-0 text-center">
                        {index === 0 ? (
                          <Star className="w-5 h-5 text-amber-400 fill-amber-400 mx-auto" />
                        ) : (
                          <span className="text-dark-400 text-sm font-medium">{index + 1}.</span>
                        )}
                      </div>

                      {/* Provider Dropdown */}
                      <div className="flex-1 min-w-0">
                        <select
                          aria-label="Classifier Provider"
                          value={entry.provider}
                          onChange={(e) => updateClassifierEntry(index, { provider: e.target.value, model: null })}
                          className="input-field w-full text-sm"
                        >
                          {/* Local (Keyword) option */}
                          <option value="local">Local (Keyword-based)</option>
                          {apiProviders.length > 0 && (
                            <optgroup label="API Providers">
                              {apiProviders.map((p) => (
                                <option key={p.id} value={p.name}>{getProviderDisplayName(p)}</option>
                              ))}
                            </optgroup>
                          )}
                          {localAgentProviders.length > 0 && (
                            <optgroup label="Local Agent">
                              {localAgentProviders.map((p) => (
                                <option key={p.dbId || p.id} value={p.name} disabled={!p.isAuthenticated}>
                                  {p.name}{!p.isAuthenticated ? ' (Offline)' : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {cliProviders.length > 0 && (
                            <optgroup label="CLI Providers">
                              {cliProviders.map((p) => (
                                <option key={p.id} value={p.name} disabled={!p.isAuthenticated}>
                                  {getProviderDisplayName(p)}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      {/* Model Dropdown (hidden for 'local') */}
                      <div className="flex-1 min-w-0">
                        {isLocal ? (
                          <div className="input-field w-full text-sm text-dark-500 cursor-not-allowed bg-dark-800/50">
                            N/A
                          </div>
                        ) : (
                          <div className="relative">
                            <select
                              aria-label="Classifier Model"
                              value={entry.model || ''}
                              onChange={(e) => updateClassifierEntry(index, { model: e.target.value || null })}
                              className="input-field w-full text-sm"
                              disabled={isLoadingEntryModels || models.length === 0}
                            >
                              <option value="">Auto (default)</option>
                              {isLoadingEntryModels ? (
                                <option disabled>Loading...</option>
                              ) : (
                                <>
                                  {freeModels.length > 0 && (
                                    <optgroup label="Free">
                                      {freeModels.map((m) => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {paidModels.length > 0 && (
                                    <optgroup label="Paid">
                                      {paidModels.map((m) => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                </>
                              )}
                            </select>
                            {isLoadingEntryModels && (
                              <RefreshCw className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-dark-400 animate-spin" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {totalEntries > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() => moveClassifierEntry(index, 'up')}
                              disabled={index === 0}
                              className="p-1.5 text-dark-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveClassifierEntry(index, 'down')}
                              disabled={index >= totalEntries - 1}
                              className="p-1.5 text-dark-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move down"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeClassifierEntry(index)}
                              className="p-1.5 text-dark-400 hover:text-red-400"
                              title="Remove"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {index === 0 && totalEntries <= 1 && (
                          <span className="text-xs text-primary-400 font-medium px-2">Primary</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Add Fallback Button */}
                <button
                  type="button"
                  onClick={addClassifierEntry}
                  className="w-full flex items-center justify-center gap-2 p-2 border border-dashed border-dark-500 rounded-lg text-dark-400 hover:text-white hover:border-dark-400 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm">Add Fallback</span>
                </button>

                <div className="flex items-start gap-2 text-xs text-dark-500">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <p>
                    Each AI provider has a 15-second timeout. If it fails, the next entry in the chain is tried.
                    Add <strong>Local (Keyword-based)</strong> as the last fallback for guaranteed zero-latency classification.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reasoning Budget Section */}
      <div className="mt-6 border border-dark-600 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setBudgetExpanded(!budgetExpanded)}
          className="w-full bg-dark-700/50 px-4 py-3 flex items-center justify-between hover:bg-dark-700/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-medium text-white">Reasoning Budget</h3>
            {localSettings?.reasoningBudgets && (
              <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded-full">Custom</span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${budgetExpanded ? 'rotate-180' : ''}`} />
        </button>

        {budgetExpanded && (
          <div className="p-4 space-y-4">
            <div className="flex items-start gap-3 text-sm text-dark-300 mb-4">
              <Info className="w-4 h-4 text-dark-400 flex-shrink-0 mt-0.5" />
              <p>
                Controls how many reasoning iterations and tool calls an agent can make per request for each complexity tier.
                Higher values allow deeper reasoning but use more tokens.
              </p>
            </div>

            <div className="grid gap-3">
              {tierConfigs.map((tier) => {
                const budget = getBudget(tier.id);
                const isDefault = !localSettings?.reasoningBudgets?.[tier.id];

                return (
                  <div
                    key={tier.id}
                    className="flex items-center gap-4 p-3 bg-dark-700/30 rounded-lg"
                  >
                    <div className="w-24 flex-shrink-0">
                      <span className="text-sm font-medium text-white capitalize">{tier.id}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-dark-400 w-16">Iterations</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={budget.maxIterations}
                        onChange={(e) => updateBudget(tier.id, 'maxIterations', Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="input-field w-20 text-sm text-center"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-dark-400 w-10">Tools</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={budget.maxToolCalls}
                        onChange={(e) => updateBudget(tier.id, 'maxToolCalls', Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="input-field w-20 text-sm text-center"
                      />
                    </div>

                    {isDefault && (
                      <span className="text-xs text-dark-500 ml-auto">default</span>
                    )}
                  </div>
                );
              })}
            </div>

            {localSettings?.reasoningBudgets && (
              <button
                type="button"
                onClick={resetBudgets}
                className="flex items-center gap-2 text-sm text-dark-400 hover:text-white transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Defaults
              </button>
            )}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end mt-6 pt-6 border-t border-dark-700">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Changes
        </button>
      </div>
    </div>
  );
}
