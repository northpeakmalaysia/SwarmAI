import React, { useState, useCallback, useEffect } from 'react';
import {
  Bot,
  X,
  Loader2,
  Save,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { SearchableModelSelect } from '../common/SearchableModelSelect';
import api from '../../services/api';
import type { Agent } from '../../stores/agentStore';

/**
 * AI Provider type for agent configuration (subset of all provider types)
 * Note: CLI providers are system-level and not used for individual agent configs
 */
type AgentProviderType = 'openrouter' | 'ollama' | 'anthropic' | 'google';

/**
 * Model option type
 */
interface ModelOption {
  value: string;
  label: string;
}

/**
 * Default models per provider (fallback when API is unavailable)
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

export interface EditAgentModalProps {
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
 * EditAgentModal - Modal for editing existing agent configuration
 */
export const EditAgentModal: React.FC<EditAgentModalProps> = ({
  open,
  agent,
  onClose,
  onUpdate,
  className,
}) => {
  // Form state (matches store's Agent type)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    systemPrompt: '',
    model: '',
    provider: 'openrouter' as AgentProviderType,
    skills: [] as string[],
    temperature: 0.7,
    maxTokens: 4096,
  });
  const [skillInput, setSkillInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic model fetching state
  const [availableModels, setAvailableModels] = useState<Record<AgentProviderType, ModelOption[]>>(defaultModels);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

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
      });
      setError(null);
    }
  }, [agent]);

  /**
   * Fetch models from API based on provider
   */
  useEffect(() => {
    const fetchModels = async () => {
      if (!open) return;

      setIsLoadingModels(true);
      try {
        if (formData.provider === 'openrouter') {
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
          }
        } else if (formData.provider === 'ollama') {
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
  }, [formData.provider, open]);

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
      await onUpdate(agent.id, {
        name: formData.name,
        description: formData.description,
        systemPrompt: formData.systemPrompt,
        model: formData.model,
        provider: formData.provider,
        skills: formData.skills,
        temperature: formData.temperature,
        maxTokens: formData.maxTokens,
      });

      handleClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update agent';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Check if this is an Agentic AI agent (model/provider not applicable)
  const isAgenticAI = agent?.platform === 'agentic-ai';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Configure Agent"
      size="lg"
      className={className}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-sky-500/20 to-violet-500/20">
            <Bot className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Agent Configuration</h3>
            <p className="text-xs text-gray-400">
              {agent?.platform ? `Platform: ${agent.platform}` : 'Update agent settings'}
            </p>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Basic Info */}
        <Input
          label="Agent Name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="My AI Assistant"
        />

        <Input
          label="Description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Brief description of what this agent does"
        />

        {/* AI Configuration (hidden for Agentic AI) */}
        {!isAgenticAI && (
          <>
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
                  title="Select AI provider"
                  aria-label="Select AI provider"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-600 bg-slate-800/50 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
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
                      title="Select a model"
                      aria-label="Select a model"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-600 bg-slate-800/50 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 disabled:opacity-50"
                    >
                      {availableModels[formData.provider].length === 0 ? (
                        <option value="">
                          {isLoadingModels ? 'Loading models...' : 'No models available'}
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

            {/* System Prompt */}
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                System Prompt
              </label>
              <textarea
                value={formData.systemPrompt}
                onChange={(e) => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                placeholder="You are a helpful AI assistant..."
                rows={4}
                aria-label="System prompt"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-600 bg-slate-800/50 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 resize-none"
              />
            </div>

            {/* Temperature and Max Tokens */}
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
                  aria-label="Temperature slider"
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
          </>
        )}

        {/* Skills */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Skills
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
                className="flex items-center gap-1 px-2 py-0.5 bg-slate-700 text-gray-300 rounded text-xs"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  className="text-gray-500 hover:text-red-400"
                  title={`Remove ${skill}`}
                  aria-label={`Remove skill: ${skill}`}
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

        {/* Save Button */}
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
    </Modal>
  );
};

EditAgentModal.displayName = 'EditAgentModal';

export default EditAgentModal;
