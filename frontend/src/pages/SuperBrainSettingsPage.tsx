import React, { useEffect, useState } from 'react';
import {
  Brain,
  Languages,
  MessageSquare,
  Settings,
  Zap,
  RotateCcw,
  Save,
  ChevronDown,
  ChevronRight,
  Info,
  Wrench,
  Shield,
  AlertTriangle,
  Check,
  X,
  FileText,
  Eye,
  ScanText,
} from 'lucide-react';
import { Tabs } from '../components/common/Tabs';
import { useSuperBrainStore, SystemTool } from '../stores/superbrainStore';

/**
 * SuperBrainSettingsPage Component
 *
 * User-configurable AI settings for:
 * - Translation (language, model, auto-translate)
 * - Rephrasing (model, style)
 * - Task Routing (provider preferences per tier)
 * - Advanced (failover chain, model preferences)
 */
export default function SuperBrainSettingsPage() {
  const {
    settings,
    rephraseStyles,
    supportedLanguages,
    providerTiers,
    availableModels,
    freeModels,
    // Tool Access
    tools,
    toolsByCategory,
    toolCategories,
    messagingToolIds,
    aiRouterModes,
    loading,
    error,
    fetchSettings,
    updateSettings,
    resetSettings,
    fetchAvailableModels,
    fetchTools,
    updateToolSettings,
    clearError,
  } = useSuperBrainStore();

  const [localSettings, setLocalSettings] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Tool Access local state
  const [localEnabledTools, setLocalEnabledTools] = useState<string[] | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);

  useEffect(() => {
    fetchSettings();
    fetchAvailableModels();
    fetchTools();
  }, [fetchSettings, fetchAvailableModels, fetchTools]);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
      setLocalEnabledTools(settings.enabledTools);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!localSettings) return;
    setSaving(true);
    try {
      // Save general settings
      await updateSettings(localSettings);

      // Save tool access settings if changed
      if (localEnabledTools !== settings?.enabledTools) {
        await updateToolSettings({
          enabledTools: localEnabledTools,
          autoSendMode: localSettings.autoSendMode,
          toolConfidenceThreshold: localSettings.toolConfidenceThreshold,
          aiRouterMode: localSettings.aiRouterMode,
        });
      }
    } catch {
      // Error handled in store
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all SuperBrain settings to defaults?')) return;
    setSaving(true);
    try {
      await resetSettings();
    } catch {
      // Error handled in store
    } finally {
      setSaving(false);
    }
  };

  const updateLocal = (key: string, value: unknown) => {
    if (!localSettings) return;
    setLocalSettings({ ...localSettings, [key]: value });
  };

  if (loading && !settings) {
    return (
      <div className="page-container-narrow">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container-narrow">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Brain className="w-8 h-8 text-primary-500" />
          <div>
            <h1 className="page-title">SuperBrain Settings</h1>
            <p className="page-subtitle">
              Configure AI translation, rephrasing, and task routing
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
          <button onClick={clearError} className="text-sm text-red-300 hover:text-red-200 mt-2">
            Dismiss
          </button>
        </div>
      )}

      <Tabs defaultValue="translation">
        <Tabs.List>
          <Tabs.Trigger value="translation" icon={<Languages className="w-4 h-4" />}>
            Translation
          </Tabs.Trigger>
          <Tabs.Trigger value="rephrase" icon={<MessageSquare className="w-4 h-4" />}>
            Rephrase
          </Tabs.Trigger>
          <Tabs.Trigger value="routing" icon={<Zap className="w-4 h-4" />}>
            Task Routing
          </Tabs.Trigger>
          <Tabs.Trigger value="advanced" icon={<Settings className="w-4 h-4" />}>
            Advanced
          </Tabs.Trigger>
          <Tabs.Trigger value="tools" icon={<Wrench className="w-4 h-4" />}>
            Tool Access
          </Tabs.Trigger>
        </Tabs.List>

        <div className="mt-6">
          {/* Translation Settings */}
          <Tabs.Content value="translation">
            <div className="card">
              <h3 className="text-lg font-medium text-white mb-4">Translation Settings</h3>
              <p className="text-dark-400 text-sm mb-6">
                Configure how messages are translated in conversations.
              </p>

              <div className="space-y-6">
                {/* Default Language */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Default Translation Language
                  </label>
                  <select
                    value={localSettings?.translationLanguage || 'en'}
                    onChange={(e) => updateLocal('translationLanguage', e.target.value)}
                    className="input-field w-full max-w-xs"
                  >
                    {supportedLanguages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name} ({lang.code})
                      </option>
                    ))}
                  </select>
                  <p className="text-dark-500 text-xs mt-1">
                    Messages will be translated to this language by default
                  </p>
                </div>

                {/* Translation Model */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Translation Model
                  </label>
                  <select
                    value={localSettings?.translationModel || ''}
                    onChange={(e) => updateLocal('translationModel', e.target.value || null)}
                    className="input-field w-full max-w-md"
                  >
                    <option value="">Use system default</option>
                    <optgroup label="Free Models">
                      {freeModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} ({model.provider})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="All Models">
                      {availableModels.filter(m => !m.isFree).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} ({model.provider})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <p className="text-dark-500 text-xs mt-1">
                    AI model used for translation tasks
                  </p>
                </div>

                {/* Auto Translate */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-dark-200">
                      Auto-translate incoming messages
                    </label>
                    <p className="text-dark-500 text-xs mt-1">
                      Automatically translate incoming messages to your default language
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localSettings?.autoTranslate || false}
                      onChange={(e) => updateLocal('autoTranslate', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500" />
                  </label>
                </div>

                {/* Show Original */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-dark-200">
                      Show original with translation
                    </label>
                    <p className="text-dark-500 text-xs mt-1">
                      Display original message alongside translated version
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localSettings?.showOriginalWithTranslation !== false}
                      onChange={(e) => updateLocal('showOriginalWithTranslation', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500" />
                  </label>
                </div>
              </div>
            </div>
          </Tabs.Content>

          {/* Rephrase Settings */}
          <Tabs.Content value="rephrase">
            <div className="card">
              <h3 className="text-lg font-medium text-white mb-4">Rephrase Settings</h3>
              <p className="text-dark-400 text-sm mb-6">
                Configure how messages are rephrased for different contexts.
              </p>

              <div className="space-y-6">
                {/* Rephrase Model */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Rephrase Model
                  </label>
                  <select
                    value={localSettings?.rephraseModel || ''}
                    onChange={(e) => updateLocal('rephraseModel', e.target.value || null)}
                    className="input-field w-full max-w-md"
                  >
                    <option value="">Use system default</option>
                    <optgroup label="Free Models">
                      {freeModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} ({model.provider})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="All Models">
                      {availableModels.filter(m => !m.isFree).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} ({model.provider})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Default Rephrase Style */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Default Rephrase Style
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(rephraseStyles).map(([key, description]) => (
                      <button
                        key={key}
                        onClick={() => updateLocal('rephraseStyle', key)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          localSettings?.rephraseStyle === key
                            ? 'border-primary-500 bg-primary-500/10 text-white'
                            : 'border-dark-600 bg-dark-800 text-dark-300 hover:border-dark-500'
                        }`}
                      >
                        <span className="block font-medium capitalize">{key}</span>
                        <span className="block text-xs mt-1 text-dark-400">{description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Tabs.Content>

          {/* Task Routing */}
          <Tabs.Content value="routing">
            <div className="card">
              <h3 className="text-lg font-medium text-white mb-4">Task Routing</h3>
              <p className="text-dark-400 text-sm mb-6">
                Configure which AI providers and models handle different types of tasks.
              </p>

              <div className="bg-dark-800/50 rounded-lg p-4 mb-6 flex items-start gap-3">
                <Info className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-dark-300">
                  <p className="font-medium text-white mb-1">How Task Routing Works</p>
                  <p>
                    SuperBrain classifies tasks into 5 tiers based on complexity. For each tier,
                    you can select a provider and optionally a specific model. If no model is
                    selected, the provider's default model will be used.
                  </p>
                </div>
              </div>

              <div className="space-y-8">
                {/* Trivial Tier */}
                <div className="border border-dark-600 rounded-lg p-4">
                  <label className="block text-sm font-medium text-white mb-3">
                    Trivial Tasks
                    <span className="text-dark-400 font-normal ml-2">
                      (greetings, yes/no questions)
                    </span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Provider</label>
                      <select
                        aria-label="Trivial tier provider"
                        value={localSettings?.trivialTierProvider || 'ollama'}
                        onChange={(e) => updateLocal('trivialTierProvider', e.target.value)}
                        className="input-field w-full"
                      >
                        {providerTiers.trivial?.map((provider: string) => (
                          <option key={provider} value={provider}>{provider}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Model (Optional)</label>
                      <select
                        aria-label="Trivial tier model"
                        value={localSettings?.trivialTierModel || ''}
                        onChange={(e) => updateLocal('trivialTierModel', e.target.value || null)}
                        className="input-field w-full"
                      >
                        <option value="">Use provider default</option>
                        <optgroup label="Free Models">
                          {freeModels.map((model) => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Paid Models">
                          {availableModels.filter(m => !m.isFree).map((model) => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Simple Tier */}
                <div className="border border-dark-600 rounded-lg p-4">
                  <label className="block text-sm font-medium text-white mb-3">
                    Simple Tasks
                    <span className="text-dark-400 font-normal ml-2">
                      (quick queries, translation, rephrasing)
                    </span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Provider</label>
                      <select
                        aria-label="Simple tier provider"
                        value={localSettings?.simpleTierProvider || 'openrouter'}
                        onChange={(e) => updateLocal('simpleTierProvider', e.target.value)}
                        className="input-field w-full"
                      >
                        {providerTiers.simple?.map((provider: string) => (
                          <option key={provider} value={provider}>{provider}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Model (Optional)</label>
                      <select
                        aria-label="Simple tier model"
                        value={localSettings?.simpleTierModel || ''}
                        onChange={(e) => updateLocal('simpleTierModel', e.target.value || null)}
                        className="input-field w-full"
                      >
                        <option value="">Use provider default</option>
                        <optgroup label="Free Models">
                          {freeModels.map((model) => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Paid Models">
                          {availableModels.filter(m => !m.isFree).map((model) => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Moderate Tier */}
                <div className="border border-dark-600 rounded-lg p-4">
                  <label className="block text-sm font-medium text-white mb-3">
                    Moderate Tasks
                    <span className="text-dark-400 font-normal ml-2">
                      (standard conversations, analysis)
                    </span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Provider</label>
                      <select
                        aria-label="Moderate tier provider"
                        value={localSettings?.moderateTierProvider || 'openrouter'}
                        onChange={(e) => updateLocal('moderateTierProvider', e.target.value)}
                        className="input-field w-full"
                      >
                        {providerTiers.moderate?.map((provider: string) => (
                          <option key={provider} value={provider}>{provider}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Model (Optional)</label>
                      <select
                        aria-label="Moderate tier model"
                        value={localSettings?.moderateTierModel || ''}
                        onChange={(e) => updateLocal('moderateTierModel', e.target.value || null)}
                        className="input-field w-full"
                      >
                        <option value="">Use provider default</option>
                        <optgroup label="Free Models">
                          {freeModels.map((model) => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Paid Models">
                          {availableModels.filter(m => !m.isFree).map((model) => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Complex Tier */}
                <div className="border border-dark-600 rounded-lg p-4">
                  <label className="block text-sm font-medium text-white mb-3">
                    Complex Tasks
                    <span className="text-dark-400 font-normal ml-2">
                      (code generation, deep reasoning)
                    </span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Provider</label>
                      <select
                        aria-label="Complex tier provider"
                        value={localSettings?.complexTierProvider || 'openrouter'}
                        onChange={(e) => updateLocal('complexTierProvider', e.target.value)}
                        className="input-field w-full"
                      >
                        {providerTiers.complex?.map((provider: string) => (
                          <option key={provider} value={provider}>{provider}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Model (Optional)</label>
                      <select
                        aria-label="Complex tier model"
                        value={localSettings?.complexTierModel || ''}
                        onChange={(e) => updateLocal('complexTierModel', e.target.value || null)}
                        className="input-field w-full"
                      >
                        <option value="">Use provider default</option>
                        <optgroup label="Free Models">
                          {freeModels.map((model) => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Paid Models">
                          {availableModels.filter(m => !m.isFree).map((model) => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Critical Tier */}
                <div className="border border-dark-600 rounded-lg p-4">
                  <label className="block text-sm font-medium text-white mb-3">
                    Critical Tasks
                    <span className="text-dark-400 font-normal ml-2">
                      (agentic tasks, autonomous operations)
                    </span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Provider</label>
                      <select
                        aria-label="Critical tier provider"
                        value={localSettings?.criticalTierProvider || 'cli-claude'}
                        onChange={(e) => updateLocal('criticalTierProvider', e.target.value)}
                        className="input-field w-full"
                      >
                        {providerTiers.critical?.map((provider: string) => (
                          <option key={provider} value={provider}>{provider}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Model (Optional)</label>
                      <select
                        aria-label="Critical tier model"
                        value={localSettings?.criticalTierModel || ''}
                        onChange={(e) => updateLocal('criticalTierModel', e.target.value || null)}
                        className="input-field w-full"
                      >
                        <option value="">Use provider default</option>
                        <optgroup label="Free Models">
                          {freeModels.map((model) => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Paid Models">
                          {availableModels.filter(m => !m.isFree).map((model) => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Tabs.Content>

          {/* Advanced Settings */}
          <Tabs.Content value="advanced">
            <div className="card">
              <h3 className="text-lg font-medium text-white mb-4">Advanced Settings</h3>
              <p className="text-dark-400 text-sm mb-6">
                Fine-tune model preferences and failover behavior.
              </p>

              <div className="space-y-6">
                {/* Custom Failover Chain - Collapsible */}
                <div className="border border-dark-600 rounded-lg">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between p-4 text-left"
                  >
                    <span className="font-medium text-dark-200">Custom Failover Chain</span>
                    {showAdvanced ? (
                      <ChevronDown className="w-5 h-5 text-dark-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-dark-400" />
                    )}
                  </button>
                  {showAdvanced && (
                    <div className="px-4 pb-4 border-t border-dark-600">
                      <p className="text-dark-400 text-sm mt-4 mb-4">
                        Configure custom failover chains for each task tier. Leave empty to use defaults.
                      </p>
                      <div className="bg-dark-800 rounded-lg p-4">
                        <pre className="text-dark-300 text-sm">
                          {JSON.stringify(localSettings?.customFailoverChain || providerTiers, null, 2)}
                        </pre>
                      </div>
                      <p className="text-dark-500 text-xs mt-2">
                        Advanced configuration - contact support for custom setups
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Tabs.Content>

          {/* Tool Access Settings */}
          <Tabs.Content value="tools">
            <div className="card">
              <h3 className="text-lg font-medium text-white mb-4">Tool Access Control</h3>
              <p className="text-dark-400 text-sm mb-6">
                Control which tools SuperBrain can automatically execute and how it handles messaging.
              </p>

              {/* Auto-Send Mode */}
              <div className="bg-dark-800/50 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-white mb-2">Auto-Send Mode</p>
                    <p className="text-dark-400 text-sm mb-4">
                      Controls whether SuperBrain can automatically send messages (WhatsApp, Telegram, Email)
                      without going through FlowBuilder.
                    </p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="autoSendMode"
                          checked={localSettings?.autoSendMode === 'restricted'}
                          onChange={() => updateLocal('autoSendMode', 'restricted')}
                          className="w-4 h-4 text-primary-500"
                        />
                        <span className="text-dark-200">
                          <span className="font-medium">Restricted</span>
                          <span className="text-dark-400 text-sm ml-1">(Recommended)</span>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="autoSendMode"
                          checked={localSettings?.autoSendMode === 'allowed'}
                          onChange={() => updateLocal('autoSendMode', 'allowed')}
                          className="w-4 h-4 text-primary-500"
                        />
                        <span className="text-dark-200">Allowed</span>
                      </label>
                    </div>
                    {localSettings?.autoSendMode === 'restricted' && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-yellow-400">
                        <AlertTriangle className="w-4 h-4" />
                        Messaging tools (sendWhatsApp, sendTelegram, sendEmail) can only be used via FlowBuilder
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Router Mode */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-200 mb-2">
                  AI Router Mode
                </label>
                <select
                  aria-label="AI Router Mode"
                  value={localSettings?.aiRouterMode || 'full'}
                  onChange={(e) => updateLocal('aiRouterMode', e.target.value)}
                  className="input-field w-full max-w-md"
                >
                  <option value="full">Full - Classify and execute tools automatically</option>
                  <option value="classify_only">Classify Only - Classify but don't execute (for logging)</option>
                  <option value="disabled">Disabled - No AI Router, only FlowBuilder</option>
                </select>
                <p className="text-dark-500 text-xs mt-1">
                  Controls how the AI Router processes incoming messages
                </p>
              </div>

              {/* Confidence Threshold */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-200 mb-2">
                  Tool Confidence Threshold: {((localSettings?.toolConfidenceThreshold || 0.7) * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  aria-label="Tool confidence threshold"
                  min="0"
                  max="100"
                  value={(localSettings?.toolConfidenceThreshold || 0.7) * 100}
                  onChange={(e) => updateLocal('toolConfidenceThreshold', parseInt(e.target.value) / 100)}
                  className="w-full max-w-md"
                />
                <p className="text-dark-500 text-xs mt-1">
                  Minimum AI confidence required to auto-execute a tool. Lower values = more actions, higher = safer.
                </p>
              </div>

              {/* Content Analysis Settings */}
              <div className="border-t border-dark-600 pt-6 mb-6">
                <h4 className="font-medium text-white mb-1">Content Analysis</h4>
                <p className="text-dark-400 text-sm mb-4">
                  Control automatic content extraction and analysis for incoming messages.
                </p>

                <div className="space-y-4">
                  {/* OCR - Extract text from images */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <ScanText className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <label className="block text-sm font-medium text-dark-200">
                          Image OCR (Text Extraction)
                        </label>
                        <p className="text-dark-500 text-xs mt-0.5">
                          Automatically extract text from images using Tesseract OCR
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label="Toggle Image OCR"
                        checked={localSettings?.ocrAutoExtract !== false}
                        onChange={(e) => updateLocal('ocrAutoExtract', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500" />
                    </label>
                  </div>

                  {/* Vision AI - Analyze/describe images */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <Eye className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <label className="block text-sm font-medium text-dark-200">
                          Image Analysis (Vision AI)
                        </label>
                        <p className="text-dark-500 text-xs mt-0.5">
                          Use Vision AI to describe images when no text is found
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label="Toggle Vision AI"
                        checked={localSettings?.visionEnabled !== false}
                        onChange={(e) => updateLocal('visionEnabled', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500" />
                    </label>
                  </div>

                  {/* Document Extraction */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <FileText className="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <label className="block text-sm font-medium text-dark-200">
                          Document Text Extraction
                        </label>
                        <p className="text-dark-500 text-xs mt-0.5">
                          Auto-extract text from PDF, Excel, Word, and text files
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label="Toggle Document Extraction"
                        checked={localSettings?.docAutoExtract !== false}
                        onChange={(e) => updateLocal('docAutoExtract', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500" />
                    </label>
                  </div>

                  {/* Document Summarization */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <Brain className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <label className="block text-sm font-medium text-dark-200">
                          AI Document Summary
                        </label>
                        <p className="text-dark-500 text-xs mt-0.5">
                          Use AI to summarize extracted document content (uses AI credits)
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label="Toggle AI Document Summary"
                        checked={localSettings?.docAutoSummarize || false}
                        onChange={(e) => updateLocal('docAutoSummarize', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500" />
                    </label>
                  </div>
                </div>
              </div>

              {/* Enabled Tools */}
              <div className="border-t border-dark-600 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-medium text-white">Enabled Tools</h4>
                    <p className="text-dark-400 text-sm">
                      Select which tools SuperBrain can access. Unselected tools will be blocked.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setLocalEnabledTools(null)}
                      className="btn-secondary text-sm"
                    >
                      Enable All
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocalEnabledTools([])}
                      className="btn-secondary text-sm"
                    >
                      Disable All
                    </button>
                  </div>
                </div>

                {localEnabledTools === null ? (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-green-400">
                      <Check className="w-5 h-5" />
                      <span>All tools are enabled</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-yellow-400">
                      <AlertTriangle className="w-5 h-5" />
                      <span>
                        {localEnabledTools.length} of {tools.length} tools enabled
                      </span>
                    </div>
                  </div>
                )}

                {/* Tool Categories */}
                <div className="space-y-4">
                  {toolCategories.map((category) => {
                    const categoryTools = toolsByCategory[category] || [];
                    const isExpanded = expandedCategories.includes(category);
                    const enabledCount = localEnabledTools === null
                      ? categoryTools.length
                      : categoryTools.filter((t: SystemTool) => localEnabledTools.includes(t.id)).length;

                    return (
                      <div key={category} className="border border-dark-600 rounded-lg">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedCategories(prev =>
                              prev.includes(category)
                                ? prev.filter(c => c !== category)
                                : [...prev, category]
                            );
                          }}
                          className="w-full flex items-center justify-between p-4 text-left"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-white capitalize">{category}</span>
                            <span className="text-dark-400 text-sm">
                              ({enabledCount}/{categoryTools.length} enabled)
                            </span>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-dark-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-dark-400" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-dark-600">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
                              {categoryTools.map((tool: SystemTool) => {
                                const isEnabled = localEnabledTools === null || localEnabledTools.includes(tool.id);
                                const isMessaging = messagingToolIds.includes(tool.id);
                                const isRestricted = isMessaging && localSettings?.autoSendMode === 'restricted';

                                return (
                                  <label
                                    key={tool.id}
                                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                      isEnabled
                                        ? 'border-primary-500/30 bg-primary-500/5'
                                        : 'border-dark-600 bg-dark-800'
                                    } ${isRestricted ? 'opacity-50' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isEnabled}
                                      onChange={(e) => {
                                        if (localEnabledTools === null) {
                                          // Was "all enabled", now switch to explicit list minus this one
                                          setLocalEnabledTools(
                                            e.target.checked
                                              ? tools.map((t: SystemTool) => t.id)
                                              : tools.filter((t: SystemTool) => t.id !== tool.id).map((t: SystemTool) => t.id)
                                          );
                                        } else {
                                          setLocalEnabledTools(
                                            e.target.checked
                                              ? [...localEnabledTools, tool.id]
                                              : localEnabledTools.filter((id: string) => id !== tool.id)
                                          );
                                        }
                                      }}
                                      className="mt-1 w-4 h-4 text-primary-500"
                                    />
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-dark-200">{tool.name}</span>
                                        {isMessaging && (
                                          <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
                                            Messaging
                                          </span>
                                        )}
                                        {isRestricted && (
                                          <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                                            Restricted
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-dark-400 text-xs mt-1">{tool.description}</p>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Tabs.Content>
        </div>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center justify-between mt-6 pt-6 border-t border-dark-700">
        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className="btn-secondary flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
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
