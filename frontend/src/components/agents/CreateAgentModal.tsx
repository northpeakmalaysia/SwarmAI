import React, { useState, useCallback, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Mail,
  ChevronRight,
  CheckCircle,
  ArrowLeft,
  Bot,
  X,
  Loader2,
  Webhook,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { SearchableModelSelect } from '../common/SearchableModelSelect';
import { PlatformSetupWizard, Platform, PlatformConfig, platformMeta } from './PlatformSetupWizard';
import api from '../../services/api';

/**
 * Steps in the create agent flow
 */
type CreateAgentStep = 'select-platform' | 'platform-setup' | 'agent-config' | 'complete';

/**
 * Agent configuration
 */
export interface AgentConfiguration {
  name: string;
  description: string;
  platform: Platform;
  platformConfig: PlatformConfig;
  systemPrompt: string;
  model: string;
  provider: 'openrouter' | 'ollama' | 'anthropic' | 'google';
  skills: string[];
  temperature: number;
  maxTokens: number;
}

export interface CreateAgentModalProps {
  /** Whether modal is open */
  open: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Callback when agent is created */
  onCreate: (config: AgentConfiguration) => Promise<void>;
  /** Callback when agent creation is complete (including temp agent updates) - use to refresh list */
  onAgentCreated?: () => void;
  /** Temporary agent ID for WhatsApp QR setup */
  tempAgentId?: string;
  /** Additional className */
  className?: string;
}

/**
 * Platform card for selection
 */
const PlatformCard: React.FC<{
  platform: Platform;
  selected: boolean;
  onClick: () => void;
}> = ({ platform, selected, onClick }) => {
  const meta = platformMeta[platform];
  const Icon = meta.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full p-3 rounded-xl border-2 transition-all duration-200 text-left',
        'hover:border-slate-500 hover:bg-slate-700/30',
        selected
          ? 'border-sky-500 bg-sky-500/10'
          : 'border-slate-700 bg-slate-800/50'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(meta.bgColor, 'p-2.5 rounded-lg')}>
          <Icon className={cn('w-5 h-5', meta.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white">{meta.name}</h3>
          <p className="text-xs text-gray-400 truncate">
            {platform === 'whatsapp' && 'Connect via QR code scan'}
            {platform === 'whatsapp-business' && 'Official Meta Business API'}
            {platform === 'telegram-bot' && 'Use a Telegram Bot token'}
            {platform === 'telegram-user' && 'Connect your Telegram account'}
            {platform === 'email' && 'IMAP/SMTP email connection'}
            {platform === 'http-api' && 'Receive messages via webhook'}
          </p>
        </div>
        <ChevronRight
          className={cn(
            'w-5 h-5 transition-colors',
            selected ? 'text-sky-400' : 'text-gray-600'
          )}
        />
      </div>
    </button>
  );
};

/**
 * Model option type
 */
interface ModelOption {
  value: string;
  label: string;
}

/**
 * Provider type for models
 */
type ProviderType = 'openrouter' | 'ollama' | 'anthropic' | 'google';

/**
 * Default models per provider (fallback when API is unavailable)
 * These are accurate model IDs for each provider
 */
const defaultModels: Record<ProviderType, ModelOption[]> = {
  openrouter: [], // Will be fetched from API
  ollama: [], // Will be fetched from Ollama API
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
 * CreateAgentModal - Multi-step modal for creating new agents
 *
 * @example
 * ```tsx
 * <CreateAgentModal
 *   open={showCreateModal}
 *   onClose={() => setShowCreateModal(false)}
 *   onCreate={handleCreateAgent}
 * />
 * ```
 */
export const CreateAgentModal: React.FC<CreateAgentModalProps> = ({
  open,
  onClose,
  onCreate,
  onAgentCreated,
  tempAgentId,
  className,
}) => {
  // Step state
  const [step, setStep] = useState<CreateAgentStep>('select-platform');

  // Form state
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null);
  const [agentConfig, setAgentConfig] = useState({
    name: '',
    description: '',
    systemPrompt: 'You are a helpful AI assistant.',
    model: '',
    provider: 'openrouter' as ProviderType,
    skills: [] as string[],
    temperature: 0.7,
    maxTokens: 4096,
  });
  const [skillInput, setSkillInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Temporary agent ID created during platform setup (for platforms that need an agent ID)
  const [createdTempAgentId, setCreatedTempAgentId] = useState<string | null>(null);
  const [isCreatingTempAgent, setIsCreatingTempAgent] = useState(false);

  // Dynamic model fetching state
  const [availableModels, setAvailableModels] = useState<Record<ProviderType, ModelOption[]>>(defaultModels);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  /**
   * Fetch models from API based on provider
   */
  useEffect(() => {
    const fetchModels = async () => {
      setIsLoadingModels(true);
      try {
        if (agentConfig.provider === 'openrouter') {
          // Fetch models from API - same endpoint used in settings
          const response = await api.get('/ai/models');
          // Handle both response formats: { models: [...] } or { data: [...] }
          const modelsData = response.data?.models || response.data?.data || response.data || [];
          if (Array.isArray(modelsData) && modelsData.length > 0) {
            const models = modelsData.slice(0, 50).map((m: { id: string; name: string }) => ({
              value: m.id,
              label: m.name,
            }));
            setAvailableModels(prev => ({ ...prev, openrouter: models }));
            // Set default model if not set
            if (!agentConfig.model && models.length > 0) {
              setAgentConfig(prev => ({ ...prev, model: models[0].value }));
            }
          }
        } else if (agentConfig.provider === 'ollama') {
          // Fetch Ollama models from backend (which proxies to local Ollama)
          try {
            const response = await api.get('/ai/ollama/models');
            // Handle both response formats
            const modelsData = response.data?.data || response.data?.models || [];
            if (Array.isArray(modelsData) && modelsData.length > 0) {
              const models = modelsData.map((m: { name: string }) => ({
                value: m.name,
                label: m.name,
              }));
              setAvailableModels(prev => ({ ...prev, ollama: models }));
              if (!agentConfig.model && models.length > 0) {
                setAgentConfig(prev => ({ ...prev, model: models[0].value }));
              }
            }
          } catch {
            // Ollama endpoint might not exist, keep empty
            setAvailableModels(prev => ({ ...prev, ollama: [] }));
          }
        } else {
          // For Anthropic and Google, use default models
          const models = defaultModels[agentConfig.provider];
          if (!agentConfig.model && models.length > 0) {
            setAgentConfig(prev => ({ ...prev, model: models[0].value }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
        // Fall back to defaults on error
      } finally {
        setIsLoadingModels(false);
      }
    };

    if (open && step === 'agent-config') {
      fetchModels();
    }
  }, [agentConfig.provider, open, step]);

  /**
   * Reset form state without cleanup (used after successful creation)
   */
  const resetFormState = useCallback(() => {
    setStep('select-platform');
    setSelectedPlatform(null);
    setPlatformConfig(null);
    setCreatedTempAgentId(null);
    setAgentConfig({
      name: '',
      description: '',
      systemPrompt: 'You are a helpful AI assistant.',
      model: '',
      provider: 'openrouter',
      skills: [],
      temperature: 0.7,
      maxTokens: 4096,
    });
    setSkillInput('');
    setError(null);
  }, []);

  /**
   * Reset form state with cleanup (used when user cancels)
   */
  const resetForm = useCallback(async () => {
    // Clean up temporary agent if one was created and user cancels
    if (createdTempAgentId) {
      try {
        await api.delete(`/agents/${createdTempAgentId}`);
        console.log('Cleaned up temporary agent:', createdTempAgentId);
      } catch (err) {
        console.error('Failed to clean up temporary agent:', err);
      }
    }

    resetFormState();
  }, [createdTempAgentId, resetFormState]);

  /**
   * Create a temporary agent for platform setup
   * This is needed for platforms like WhatsApp that need an agent ID to request QR code
   */
  const createTempAgent = useCallback(async (platform: Platform): Promise<string | null> => {
    setIsCreatingTempAgent(true);
    setError(null);

    try {
      // Minimal agent data - backend will apply AI defaults (WhatsBots pattern)
      const tempAgentData = {
        name: `Draft Agent (${platformMeta[platform].name})`,
        description: 'Temporary agent for platform setup',
      };

      const response = await api.post('/agents', tempAgentData);

      // Handle response format: { agent: { id, ... } }
      const agentId = response.data?.agent?.id || response.data?.id || response.data?.data?.id;
      if (agentId) {
        console.log('Created temporary agent:', agentId);
        setCreatedTempAgentId(agentId);

        // Notify parent to refresh agent list immediately so draft appears
        onAgentCreated?.();

        return agentId;
      }

      throw new Error('Failed to create temporary agent');
    } catch (err) {
      console.error('Failed to create temp agent:', err);
      const message = err instanceof Error ? err.message : 'Failed to create agent for platform setup';
      setError(message);
      return null;
    } finally {
      setIsCreatingTempAgent(false);
    }
  }, [onAgentCreated]);

  /**
   * Handle clicking Continue to move to platform-setup
   * Creates a temporary agent first if needed
   */
  const handleContinueToPlatformSetup = useCallback(async () => {
    if (!selectedPlatform) return;

    // If we already have a temp agent ID from props, use that
    if (tempAgentId) {
      setStep('platform-setup');
      return;
    }

    // If we already created a temp agent, use that
    if (createdTempAgentId) {
      setStep('platform-setup');
      return;
    }

    // Platforms that need an agent ID for setup
    const platformsNeedingAgentId: Platform[] = ['whatsapp', 'telegram-user', 'telegram-bot', 'email'];

    if (platformsNeedingAgentId.includes(selectedPlatform)) {
      // Create a temporary agent first
      const newAgentId = await createTempAgent(selectedPlatform);
      if (newAgentId) {
        setStep('platform-setup');
      }
      // If creation failed, error is already set
    } else {
      // For platforms that don't need an agent ID (http-api, agentic-ai, whatsapp-business)
      setStep('platform-setup');
    }
  }, [selectedPlatform, tempAgentId, createdTempAgentId, createTempAgent]);

  /**
   * Handle close
   */
  const handleClose = async () => {
    await resetForm();
    onClose();
  };

  /**
   * Handle platform selection
   */
  const handlePlatformSelect = (platform: Platform) => {
    setSelectedPlatform(platform);
  };

  /**
   * Handle platform setup complete
   * Note: Agentic AI agents are now created exclusively in the Agentic module
   */
  const handlePlatformSetupComplete = (config: PlatformConfig) => {
    setPlatformConfig(config);
    setStep('agent-config');
  };

  /**
   * Add skill
   */
  const addSkill = () => {
    if (skillInput.trim() && !agentConfig.skills.includes(skillInput.trim())) {
      setAgentConfig({
        ...agentConfig,
        skills: [...agentConfig.skills, skillInput.trim()],
      });
      setSkillInput('');
    }
  };

  /**
   * Remove skill
   */
  const removeSkill = (skill: string) => {
    setAgentConfig({
      ...agentConfig,
      skills: agentConfig.skills.filter((s) => s !== skill),
    });
  };

  /**
   * Handle create agent
   * If a temporary agent was created during platform setup, update it instead of creating new
   */
  const handleCreate = async () => {
    if (!selectedPlatform || !platformConfig) {
      setError('Platform configuration is missing');
      return;
    }

    if (!agentConfig.name.trim()) {
      setError('Agent name is required');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const fullConfig: AgentConfiguration = {
        ...agentConfig,
        platform: selectedPlatform,
        platformConfig,
      };

      // If we created a temp agent, update it instead of creating a new one
      if (createdTempAgentId) {
        // Update the existing temp agent with full configuration
        await api.put(`/agents/${createdTempAgentId}`, {
          name: fullConfig.name,
          description: fullConfig.description,
          systemPrompt: fullConfig.systemPrompt,
          model: fullConfig.model,
          provider: fullConfig.provider,
          temperature: fullConfig.temperature,
          maxTokens: fullConfig.maxTokens,
          skills: fullConfig.skills,
          platform: fullConfig.platform,
          platformConfig: fullConfig.platformConfig,
          status: 'idle', // Activate the agent now
        });

        // Clear the temp agent ID so it's not deleted on close
        setCreatedTempAgentId(null);
      } else {
        // No temp agent, use the parent's onCreate callback
        await onCreate(fullConfig);
      }

      setStep('complete');

      // Notify parent to refresh agent list
      onAgentCreated?.();

      // Auto-close after success
      setTimeout(() => {
        // Reset form without cleanup (agent is permanent now)
        resetFormState();
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create agent';
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * Render step content
   */
  const renderStepContent = () => {
    switch (step) {
      case 'select-platform':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-white mb-1.5">Select Platform</h3>
              <p className="text-xs text-gray-400">
                Choose the messaging platform for your agent
              </p>
            </div>

            <div className="grid gap-3">
              {/* Note: Agentic AI agents are now created in the Agentic module, not here */}
              <PlatformCard
                platform="whatsapp"
                selected={selectedPlatform === 'whatsapp'}
                onClick={() => handlePlatformSelect('whatsapp')}
              />
              <PlatformCard
                platform="whatsapp-business"
                selected={selectedPlatform === 'whatsapp-business'}
                onClick={() => handlePlatformSelect('whatsapp-business')}
              />
              <PlatformCard
                platform="telegram-bot"
                selected={selectedPlatform === 'telegram-bot'}
                onClick={() => handlePlatformSelect('telegram-bot')}
              />
              <PlatformCard
                platform="telegram-user"
                selected={selectedPlatform === 'telegram-user'}
                onClick={() => handlePlatformSelect('telegram-user')}
              />
              <PlatformCard
                platform="email"
                selected={selectedPlatform === 'email'}
                onClick={() => handlePlatformSelect('email')}
              />
              <PlatformCard
                platform="http-api"
                selected={selectedPlatform === 'http-api'}
                onClick={() => handlePlatformSelect('http-api')}
              />
            </div>

            {error && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg mb-3">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <Button
              onClick={handleContinueToPlatformSetup}
              disabled={!selectedPlatform || isCreatingTempAgent}
              loading={isCreatingTempAgent}
              fullWidth
              size="sm"
              icon={<ChevronRight className="w-4 h-4" />}
              iconRight
            >
              {isCreatingTempAgent ? 'Preparing...' : 'Continue'}
            </Button>
          </div>
        );

      case 'platform-setup':
        return selectedPlatform ? (
          <PlatformSetupWizard
            platform={selectedPlatform}
            agentId={createdTempAgentId || tempAgentId}
            onComplete={handlePlatformSetupComplete}
            onBack={() => setStep('select-platform')}
          />
        ) : null;

      case 'agent-config':
        return (
          <div className="space-y-3">
            <button
              onClick={() => setStep('platform-setup')}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to platform setup
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-sky-500/20 to-violet-500/20">
                <Bot className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Configure Agent</h3>
                <p className="text-xs text-gray-400">Set up your agent&apos;s personality and behavior</p>
              </div>
            </div>

            {error && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <Input
              label="Agent Name"
              value={agentConfig.name}
              onChange={(e) => setAgentConfig({ ...agentConfig, name: e.target.value })}
              placeholder="My AI Assistant"
            />

            <Input
              label="Description"
              value={agentConfig.description}
              onChange={(e) => setAgentConfig({ ...agentConfig, description: e.target.value })}
              placeholder="Brief description of what this agent does"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Provider
                </label>
                <select
                  value={agentConfig.provider}
                  onChange={(e) => {
                    const newProvider = e.target.value as ProviderType;
                    const models = availableModels[newProvider];
                    setAgentConfig({
                      ...agentConfig,
                      provider: newProvider,
                      model: models.length > 0 ? models[0].value : '',
                    });
                  }}
                  title="Select AI provider"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-600 bg-slate-800/50 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="ollama">Ollama</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                </select>
              </div>

              <div>
                {/* Use SearchableModelSelect for OpenRouter, standard select for others */}
                {agentConfig.provider === 'openrouter' ? (
                  <SearchableModelSelect
                    label="Model"
                    value={agentConfig.model}
                    onChange={(modelId) => setAgentConfig({ ...agentConfig, model: modelId })}
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
                      value={agentConfig.model}
                      onChange={(e) => setAgentConfig({ ...agentConfig, model: e.target.value })}
                      disabled={isLoadingModels}
                      title="Select a model"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-600 bg-slate-800/50 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 disabled:opacity-50"
                    >
                      {availableModels[agentConfig.provider].length === 0 ? (
                        <option value="">
                          {isLoadingModels ? 'Loading models...' : 'No models available'}
                        </option>
                      ) : (
                        availableModels[agentConfig.provider].map((model) => (
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

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                System Prompt
              </label>
              <textarea
                value={agentConfig.systemPrompt}
                onChange={(e) => setAgentConfig({ ...agentConfig, systemPrompt: e.target.value })}
                placeholder="You are a helpful AI assistant..."
                rows={3}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-600 bg-slate-800/50 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Temperature: {agentConfig.temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={agentConfig.temperature}
                  onChange={(e) =>
                    setAgentConfig({ ...agentConfig, temperature: parseFloat(e.target.value) })
                  }
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
              </div>
              <Input
                label="Max Tokens"
                type="number"
                value={agentConfig.maxTokens.toString()}
                onChange={(e) =>
                  setAgentConfig({ ...agentConfig, maxTokens: parseInt(e.target.value, 10) || 4096 })
                }
                className="text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Skills
                <span className="ml-1 text-gray-500 font-normal">(used for swarm task routing)</span>
              </label>
              <p className="text-[11px] text-gray-500 mb-2">
                Add skills this agent specializes in. The swarm system uses these to route tasks to the best agent.
              </p>
              <div className="flex gap-2 mb-2">
                <Input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                  placeholder="e.g., customer-support, sales, coding, translation..."
                  containerClassName="flex-1"
                  className="text-xs"
                />
                <Button variant="secondary" size="sm" onClick={addSkill}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {agentConfig.skills.map((skill) => (
                  <span
                    key={skill}
                    className="flex items-center gap-1 px-2 py-0.5 bg-slate-700 text-gray-300 rounded text-xs"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="text-gray-500 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <Button
              onClick={handleCreate}
              loading={isCreating}
              fullWidth
              size="sm"
              icon={<CheckCircle className="w-4 h-4" />}
            >
              Create Agent
            </Button>
          </div>
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
              <CheckCircle className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1.5">Agent Created!</h3>
            <p className="text-sm text-gray-400 text-center">
              Your new agent has been created and is ready to use.
            </p>
          </div>
        );
    }
  };

  /**
   * Get modal title based on step
   */
  const getModalTitle = () => {
    switch (step) {
      case 'select-platform':
        return 'Create New Agent';
      case 'platform-setup':
        return selectedPlatform ? `Connect ${platformMeta[selectedPlatform].name}` : 'Platform Setup';
      case 'agent-config':
        return 'Configure Agent';
      case 'complete':
        return 'Success';
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={getModalTitle()}
      size="lg"
      className={className}
    >
      {renderStepContent()}
    </Modal>
  );
};

CreateAgentModal.displayName = 'CreateAgentModal';

export default CreateAgentModal;
