import React, { useState, useCallback, useEffect } from 'react';
import {
  Bot,
  X,
  Loader2,
  Save,
  Settings,
  Cpu,
  MessageSquare,
  Mail,
  Send,
  Webhook,
  Zap,
  Clock,
  Users,
  Image as ImageIcon,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { ToggleSwitch } from '../common/ToggleSwitch';
import { SearchableModelSelect } from '../common/SearchableModelSelect';
import { EmailAgentSettings } from './settings/EmailAgentSettings';
import { WhatsAppAgentSettings } from './settings/WhatsAppAgentSettings';
import { TelegramBotSettings } from './settings/TelegramBotSettings';
import api from '../../services/api';
import { cn } from '../../lib/utils';
import type { Agent } from '../../stores/agentStore';

/**
 * AI Provider type for agent configuration
 */
type AgentProviderType = 'openrouter' | 'ollama' | 'anthropic' | 'google';

/**
 * Tab types for settings
 */
type SettingsTab = 'general' | 'ai' | 'platform';

/**
 * Model option type
 */
interface ModelOption {
  value: string;
  label: string;
}

/**
 * Default models per provider
 */
const defaultModels: Record<AgentProviderType, ModelOption[]> = {
  openrouter: [],
  ollama: [],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
  google: [
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
};

/**
 * Platform icons
 */
const platformIcons: Record<string, React.FC<{ className?: string }>> = {
  whatsapp: MessageSquare,
  'whatsapp-business': MessageSquare,
  'telegram-bot': Send,
  'telegram-user': Send,
  email: Mail,
  'http-api': Webhook,
  'agentic-ai': Cpu,
};

/**
 * Platform labels
 */
const platformLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  'whatsapp-business': 'WhatsApp Business',
  'telegram-bot': 'Telegram Bot',
  'telegram-user': 'Telegram User',
  email: 'Email',
  'http-api': 'HTTP API',
  'agentic-ai': 'Agentic AI',
};

export interface AgentSettingsModalProps {
  /** Whether modal is open */
  open: boolean;
  /** The agent to edit */
  agent: Agent | null;
  /** Callback when modal should close */
  onClose: () => void;
  /** Callback when agent is updated */
  onUpdate: (id: string, updates: Partial<Agent>) => Promise<Agent>;
  /** Additional className */
  className?: string;
}

/**
 * AgentSettingsModal - Comprehensive agent settings with tabs
 */
export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  open,
  agent,
  onClose,
  onUpdate,
  className,
}) => {
  // Tab state
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // General settings form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    systemPrompt: '',
    model: '',
    provider: 'openrouter' as AgentProviderType,
    skills: [] as string[],
    temperature: 0.7,
    maxTokens: 4096,
    autoResponse: true,
  });

  // AI settings inheritance
  const [useTaskRouting, setUseTaskRouting] = useState(true);

  // Working hours
  const [workingHoursEnabled, setWorkingHoursEnabled] = useState(false);
  const [workingHours, setWorkingHours] = useState({
    startTime: '09:00',
    endTime: '18:00',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  });

  const [skillInput, setSkillInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic model fetching state
  const [availableModels, setAvailableModels] = useState<Record<AgentProviderType, ModelOption[]>>(defaultModels);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Platform account info
  const [platformAccountId, setPlatformAccountId] = useState<string | undefined>();

  /**
   * Initialize form data when agent changes
   */
  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name || '',
        description: agent.description || '',
        systemPrompt: agent.systemPrompt || '',
        model: agent.model || '',
        provider: agent.provider || 'openrouter',
        skills: agent.skills || [],
        temperature: agent.temperature ?? 0.7,
        maxTokens: agent.maxTokens ?? 4096,
        autoResponse: true, // Default, would come from agent settings
      });

      // Check if agent has custom AI settings (not using task routing)
      setUseTaskRouting(!agent.model);

      // Get platform account ID from agent's platforms array
      if (agent.platforms && agent.platforms.length > 0) {
        setPlatformAccountId(agent.platforms[0].id);
      } else if (agent.platformAccountId) {
        setPlatformAccountId(agent.platformAccountId);
      }

      setError(null);
      setActiveTab('general'); // Reset to general tab
    }
  }, [agent]);

  /**
   * Fetch models from API based on provider
   */
  useEffect(() => {
    const fetchModels = async () => {
      if (!open || useTaskRouting) return;

      setIsLoadingModels(true);
      try {
        if (formData.provider === 'openrouter') {
          const response = await api.get('/ai/models');
          const modelsData = response.data?.models || response.data?.data || response.data || [];
          if (Array.isArray(modelsData) && modelsData.length > 0) {
            const models = modelsData.slice(0, 50).map((m: { id: string; name: string }) => ({
              value: m.id,
              label: m.name,
            }));
            setAvailableModels(prev => ({ ...prev, openrouter: models }));
          }
        } else if (formData.provider === 'ollama') {
          try {
            const response = await api.get('/ai/ollama/models');
            const modelsData = response.data?.data || response.data?.models || [];
            if (Array.isArray(modelsData) && modelsData.length > 0) {
              const models = modelsData.map((m: { name: string }) => ({
                value: m.name,
                label: m.name,
              }));
              setAvailableModels(prev => ({ ...prev, ollama: models }));
            }
          } catch {
            setAvailableModels(prev => ({ ...prev, ollama: [] }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      } finally {
        setIsLoadingModels(false);
      }
    };

    fetchModels();
  }, [formData.provider, open, useTaskRouting]);

  /**
   * Handle close
   */
  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  /**
   * Add skill
   */
  const addSkill = useCallback(() => {
    if (skillInput.trim() && !formData.skills.includes(skillInput.trim())) {
      setFormData(prev => ({
        ...prev,
        skills: [...prev.skills, skillInput.trim()],
      }));
      setSkillInput('');
    }
  }, [skillInput, formData.skills]);

  /**
   * Remove skill
   */
  const removeSkill = useCallback((skill: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skill),
    }));
  }, []);

  /**
   * Toggle working day
   */
  const toggleDay = (day: string) => {
    setWorkingHours(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day],
    }));
  };

  /**
   * Handle save
   */
  const handleSave = async () => {
    if (!agent) return;

    if (!formData.name.trim()) {
      setError('Agent name is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updates: Partial<Agent> = {
        name: formData.name,
        description: formData.description,
        systemPrompt: formData.systemPrompt,
        skills: formData.skills,
      };

      // Only include AI settings if not using task routing
      if (!useTaskRouting) {
        updates.model = formData.model;
        updates.provider = formData.provider;
        updates.temperature = formData.temperature;
        updates.maxTokens = formData.maxTokens;
      } else {
        // Clear custom model settings when using task routing
        // This ensures the agent uses global Task Routing settings
        updates.model = undefined;
        updates.provider = undefined;
        updates.temperature = undefined;
        updates.maxTokens = undefined;
      }

      await onUpdate(agent.id, updates);
      handleClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update agent';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Check if this is an Agentic AI agent
  const isAgenticAI = agent?.platform === 'agentic-ai';
  const platform = agent?.platform || '';
  const PlatformIcon = platformIcons[platform] || Bot;

  /**
   * Render tab content
   */
  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-4">
            {/* Avatar and Name */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-sky-500/20 to-violet-500/20 flex items-center justify-center flex-shrink-0 border-2 border-dashed border-slate-600 hover:border-sky-500 cursor-pointer transition-colors">
                {agent?.avatar ? (
                  <img src={agent.avatar} alt="" className="w-full h-full rounded-xl object-cover" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-gray-500" />
                )}
              </div>
              <div className="flex-1">
                <Input
                  label="Agent Name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My AI Assistant"
                />
              </div>
            </div>

            <Input
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of what this agent does"
            />

            {/* Skills */}
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Skills <span className="text-gray-500 font-normal">(for swarm routing)</span>
              </label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                  placeholder="Add a skill..."
                  containerClassName="flex-1"
                  className="text-xs"
                />
                <Button variant="secondary" size="sm" onClick={addSkill}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {formData.skills.map((skill) => (
                  <span
                    key={skill}
                    className="flex items-center gap-1 px-2 py-0.5 bg-sky-500/20 text-sky-400 rounded text-xs"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="text-sky-300 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {formData.skills.length === 0 && (
                  <span className="text-xs text-gray-500">No skills added</span>
                )}
              </div>
            </div>

            {/* Auto Response */}
            <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <ToggleSwitch
                checked={formData.autoResponse}
                onChange={(v) => setFormData(prev => ({ ...prev, autoResponse: v }))}
                label="Auto Response"
                description="Automatically respond to incoming messages"
                size="sm"
              />
            </div>

            {/* Working Hours */}
            <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <ToggleSwitch
                checked={workingHoursEnabled}
                onChange={setWorkingHoursEnabled}
                label="Working Hours"
                description="Set when the agent is active"
                size="sm"
              />

              {workingHoursEnabled && (
                <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-3">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-400 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={workingHours.startTime}
                        onChange={(e) => setWorkingHours(prev => ({ ...prev, startTime: e.target.value }))}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-600 bg-slate-800/50 text-white"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-400 mb-1">End Time</label>
                      <input
                        type="time"
                        value={workingHours.endTime}
                        onChange={(e) => setWorkingHours(prev => ({ ...prev, endTime: e.target.value }))}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-600 bg-slate-800/50 text-white"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={cn(
                          'px-2.5 py-1 rounded text-xs transition-colors',
                          workingHours.days.includes(day)
                            ? 'bg-sky-500/30 text-sky-400'
                            : 'bg-slate-700 text-gray-400 hover:text-white'
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'ai':
        return (
          <div className="space-y-4">
            {/* System Prompt - always shown */}
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                System Prompt
              </label>
              <textarea
                value={formData.systemPrompt}
                onChange={(e) => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                placeholder="You are a helpful AI assistant..."
                rows={4}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-600 bg-slate-800/50 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Define the agent's personality, tone, and behavior
              </p>
            </div>

            {/* Task Routing Toggle */}
            <div className="p-4 bg-gradient-to-br from-sky-900/20 to-violet-900/20 rounded-xl border border-sky-700/30">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-sky-400" />
                  AI Provider Settings
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-400">
                  {useTaskRouting ? 'Inherited' : 'Custom'}
                </span>
              </div>

              <div className="p-3 bg-slate-800/30 rounded-lg mb-3">
                <ToggleSwitch
                  checked={useTaskRouting}
                  onChange={setUseTaskRouting}
                  label="Use Task Routing Defaults"
                  description="Inherit AI settings from your global Task Routing configuration"
                  size="sm"
                />
              </div>

              {useTaskRouting ? (
                <div className="p-3 bg-slate-800/30 rounded-lg">
                  <p className="text-xs text-gray-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    AI requests will be routed based on your Task Routing settings
                  </p>
                </div>
              ) : (
                <div className="space-y-3 pt-3 border-t border-slate-700/50">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Provider
                      </label>
                      <select
                        value={formData.provider}
                        onChange={(e) => {
                          const newProvider = e.target.value as AgentProviderType;
                          const models = availableModels[newProvider];
                          setFormData(prev => ({
                            ...prev,
                            provider: newProvider,
                            model: models.length > 0 ? models[0].value : prev.model,
                          }));
                        }}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-600 bg-slate-800/50 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      >
                        <option value="openrouter">OpenRouter</option>
                        <option value="ollama">Ollama</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="google">Google</option>
                      </select>
                    </div>

                    <div>
                      {formData.provider === 'openrouter' ? (
                        <SearchableModelSelect
                          label="Model"
                          value={formData.model}
                          onChange={(modelId) => setFormData(prev => ({ ...prev, model: modelId }))}
                          provider="openrouter"
                          placeholder="Search models..."
                          disabled={isLoadingModels}
                          loading={isLoadingModels}
                        />
                      ) : (
                        <>
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            Model
                            {isLoadingModels && (
                              <Loader2 className="inline w-3 h-3 ml-2 animate-spin text-sky-400" />
                            )}
                          </label>
                          <select
                            value={formData.model}
                            onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                            disabled={isLoadingModels}
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-600 bg-slate-800/50 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:opacity-50"
                          >
                            {availableModels[formData.provider].length === 0 ? (
                              <option value="">
                                {isLoadingModels ? 'Loading...' : 'No models'}
                              </option>
                            ) : (
                              availableModels[formData.provider].map((model) => (
                                <option key={model.value} value={model.value}>
                                  {model.label}
                                </option>
                              ))
                            )}
                          </select>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Temperature: {formData.temperature}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={formData.temperature}
                        onChange={(e) =>
                          setFormData(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))
                        }
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                      />
                    </div>
                    <Input
                      label="Max Tokens"
                      type="number"
                      value={formData.maxTokens.toString()}
                      onChange={(e) =>
                        setFormData(prev => ({ ...prev, maxTokens: parseInt(e.target.value, 10) || 4096 }))
                      }
                      className="text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'platform':
        return (
          <div className="space-y-4">
            {/* Platform Header */}
            <div className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className={cn(
                'p-2 rounded-lg',
                platform.includes('whatsapp') ? 'bg-emerald-500/20' :
                platform.includes('telegram') ? 'bg-sky-500/20' :
                platform === 'email' ? 'bg-rose-500/20' :
                'bg-violet-500/20'
              )}>
                <PlatformIcon className={cn(
                  'w-5 h-5',
                  platform.includes('whatsapp') ? 'text-emerald-400' :
                  platform.includes('telegram') ? 'text-sky-400' :
                  platform === 'email' ? 'text-rose-400' :
                  'text-violet-400'
                )} />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  {platformLabels[platform] || 'Unknown Platform'}
                </p>
                <p className="text-[10px] text-gray-400">
                  Platform-specific configuration
                </p>
              </div>
            </div>

            {/* Platform-Specific Settings */}
            {platform === 'whatsapp' || platform === 'whatsapp-business' ? (
              <WhatsAppAgentSettings
                agentId={agent?.id || ''}
                platformAccountId={platformAccountId}
              />
            ) : platform === 'telegram-bot' ? (
              <TelegramBotSettings
                agentId={agent?.id || ''}
                platformAccountId={platformAccountId}
              />
            ) : platform === 'email' ? (
              <EmailAgentSettings
                agentId={agent?.id || ''}
                platformAccountId={platformAccountId}
              />
            ) : platform === 'agentic-ai' ? (
              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                <p className="text-sm text-purple-300">
                  Agentic AI settings are configured separately in the Agentic Dashboard.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => window.location.href = `/agentic/${agent?.id}`}
                >
                  Open Agentic Dashboard
                </Button>
              </div>
            ) : (
              <div className="p-4 bg-slate-800/30 rounded-xl text-center">
                <p className="text-sm text-gray-400">
                  No platform-specific settings available for this agent type.
                </p>
              </div>
            )}
          </div>
        );
    }
  };

  // Available tabs based on agent type
  const availableTabs: { id: SettingsTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'general', label: 'General', icon: Settings },
    ...(!isAgenticAI ? [{ id: 'ai' as SettingsTab, label: 'AI Settings', icon: Cpu }] : []),
    ...(platform ? [{ id: 'platform' as SettingsTab, label: platformLabels[platform] || 'Platform', icon: PlatformIcon }] : []),
  ];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Agent Settings"
      size="lg"
      className={className}
    >
      <div className="flex flex-col h-full max-h-[70vh]">
        {/* Header with Agent Info */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-700/50">
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-sky-500/20 to-violet-500/20">
            <Bot className="w-5 h-5 text-sky-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-white">{agent?.name || 'Agent'}</h3>
            <p className="text-xs text-gray-400">
              {platformLabels[platform] || 'Configure agent settings'}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 py-3 border-b border-slate-700/50">
          {availableTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Error display */}
        {error && (
          <div className="p-2.5 mt-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto py-4 scrollbar-thin">
          {renderTabContent()}
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t border-slate-700/50">
          <Button
            onClick={handleSave}
            loading={isSaving}
            fullWidth
            size="sm"
            icon={<Save className="w-4 h-4" />}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
};

AgentSettingsModal.displayName = 'AgentSettingsModal';

export default AgentSettingsModal;
