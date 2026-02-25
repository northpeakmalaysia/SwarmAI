import React, { useState, useEffect } from 'react';
import { Bot, AlertCircle, Brain, Settings, Terminal, MessageSquare, GitBranch } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useAgenticStore, AgenticProfile } from '../../stores/agenticStore';
import toast from 'react-hot-toast';
import api from '../../services/api';

export interface ProfileFormModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Profile to edit (undefined for create mode) */
  profile?: AgenticProfile | null;
  /** Parent profile ID for sub-agent creation */
  parentId?: string | null;
  /** Callback when profile is created/updated successfully */
  onSuccess?: (profile: AgenticProfile) => void;
}

interface FormData {
  // Basic Info
  name: string;
  role: string;
  description: string;
  // System Configuration
  systemPrompt: string;
  // AI Configuration
  aiProvider: string;
  aiModel: string;
  temperature: number | null;
  maxTokens: number | null;
  routingPreset: string;
  // Autonomy Settings
  autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';
  // Workspace Settings (PRD refactor)
  cliType: 'claude' | 'gemini' | 'opencode' | 'bash';
  workspaceAutonomyLevel: 'semi' | 'full';
  // Orchestration Settings
  canCreateChildren: boolean;
  maxChildren: number;
  maxHierarchyDepth: number;
  childrenAutonomyCap: 'supervised' | 'semi-autonomous' | 'autonomous';
}

interface FormErrors {
  name?: string;
  role?: string;
  description?: string;
  systemPrompt?: string;
  autonomyLevel?: string;
}

interface AIProvider {
  id: string;
  name: string;
  type: string;
  models?: string[];
}

interface RoutingPreset {
  id: string;
  name: string;
  description?: string;
}

/**
 * ProfileFormModal - Modal for creating or editing Agentic AI Agents
 *
 * Per PRD: agentic_profiles IS the Agentic AI Agent (not a supporting entity)
 * This modal captures all required configuration: system prompt, AI settings, CLI type
 */
export const ProfileFormModal: React.FC<ProfileFormModalProps> = ({
  open,
  onClose,
  profile,
  parentId,
  onSuccess,
}) => {
  const { createProfile, updateProfile, createSubAgent, profiles, isLoadingProfiles } = useAgenticStore();

  const isEditMode = !!profile;
  const isSubAgentMode = !!parentId;

  // Form state
  const [formData, setFormData] = useState<FormData>({
    name: '',
    role: '',
    description: '',
    systemPrompt: '',
    aiProvider: 'task-routing',
    aiModel: '',
    temperature: 0.7,
    maxTokens: 4096,
    routingPreset: '',
    autonomyLevel: 'semi-autonomous',
    cliType: 'claude',
    workspaceAutonomyLevel: 'semi',
    canCreateChildren: false,
    maxChildren: 5,
    maxHierarchyDepth: 3,
    childrenAutonomyCap: 'semi-autonomous',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'ai' | 'workspace' | 'orchestration'>('basic');

  // AI Configuration options
  const [aiProviders, setAiProviders] = useState<AIProvider[]>([]);
  const [routingPresets, setRoutingPresets] = useState<RoutingPreset[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Get parent profile info if creating sub-agent
  const parentProfile = parentId ? profiles.find(p => p.id === parentId) : null;

  // Fetch AI providers and routing presets
  useEffect(() => {
    if (open) {
      // Fetch available AI providers
      api.get('/superbrain/providers/available')
        .then(res => {
          setAiProviders(res.data.providers || []);
        })
        .catch(() => {
          // Fallback providers
          setAiProviders([
            { id: 'task-routing', name: 'Task Routing (Auto)', type: 'auto' },
          ]);
        });

      // Fetch routing presets
      api.get('/agentic/routing-presets')
        .then(res => {
          setRoutingPresets(res.data.presets || []);
        })
        .catch(() => {
          setRoutingPresets([]);
        });
    }
  }, [open]);

  // Update available models when provider changes
  useEffect(() => {
    if (formData.aiProvider && formData.aiProvider !== 'task-routing') {
      const provider = aiProviders.find(p => p.id === formData.aiProvider || p.name === formData.aiProvider);
      if (provider?.models) {
        setAvailableModels(provider.models);
      } else {
        // Fetch models for this provider
        api.get(`/superbrain/providers/${formData.aiProvider}/models`)
          .then(res => setAvailableModels(res.data.models || []))
          .catch(() => setAvailableModels([]));
      }
    } else {
      setAvailableModels([]);
    }
  }, [formData.aiProvider, aiProviders]);

  // Reset form when modal opens or profile changes
  useEffect(() => {
    if (open) {
      if (profile) {
        // Edit mode - populate with existing data
        setFormData({
          name: profile.name,
          role: profile.role || '',
          description: profile.description || '',
          systemPrompt: profile.systemPrompt || '',
          aiProvider: profile.aiProvider || 'task-routing',
          aiModel: profile.aiModel || '',
          temperature: profile.temperature != null ? profile.temperature : null,
          maxTokens: profile.maxTokens != null ? profile.maxTokens : null,
          routingPreset: profile.routingPreset || '',
          autonomyLevel: profile.autonomyLevel || 'semi-autonomous',
          cliType: profile.cliType || 'claude',
          workspaceAutonomyLevel: profile.workspaceAutonomyLevel || 'semi',
          canCreateChildren: profile.canCreateChildren ?? false,
          maxChildren: profile.maxChildren ?? 5,
          maxHierarchyDepth: profile.maxHierarchyDepth ?? 3,
          childrenAutonomyCap: profile.childrenAutonomyCap || 'semi-autonomous',
        });
      } else {
        // Create mode - reset to defaults
        setFormData({
          name: '',
          role: '',
          description: '',
          systemPrompt: '',
          aiProvider: 'task-routing',
          aiModel: '',
          temperature: null,
          maxTokens: null,
          routingPreset: '',
          autonomyLevel: 'semi-autonomous',
          cliType: 'claude',
          workspaceAutonomyLevel: 'semi',
          canCreateChildren: false,
          maxChildren: 5,
          maxHierarchyDepth: 3,
          childrenAutonomyCap: 'semi-autonomous',
        });
      }
      setErrors({});
      setActiveTab('basic');
    }
  }, [open, profile]);

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Name must be less than 100 characters';
    }

    if (!formData.role.trim()) {
      newErrors.role = 'Role is required';
    } else if (formData.role.trim().length < 2) {
      newErrors.role = 'Role must be at least 2 characters';
    } else if (formData.role.trim().length > 100) {
      newErrors.role = 'Role must be less than 100 characters';
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    if (formData.systemPrompt && formData.systemPrompt.length > 4000) {
      newErrors.systemPrompt = 'System prompt must be less than 4000 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      setActiveTab('basic'); // Switch to basic tab if there are errors
      return;
    }

    setIsSubmitting(true);

    try {
      let resultProfile: AgenticProfile;

      const profileData = {
        name: formData.name.trim(),
        role: formData.role.trim(),
        description: formData.description.trim(),
        systemPrompt: formData.systemPrompt.trim(),
        aiProvider: formData.aiProvider,
        aiModel: formData.aiModel || undefined,
        temperature: formData.temperature,   // null = auto (use provider default)
        maxTokens: formData.maxTokens,       // null = auto (use provider default)
        routingPreset: formData.routingPreset || undefined,
        autonomyLevel: formData.autonomyLevel,
        cliType: formData.cliType,
        workspaceAutonomyLevel: formData.workspaceAutonomyLevel,
        canCreateChildren: formData.canCreateChildren,
        maxChildren: formData.maxChildren,
        maxHierarchyDepth: formData.maxHierarchyDepth,
        childrenAutonomyCap: formData.childrenAutonomyCap,
        autoCreateWorkspace: true, // Always auto-create workspace for new profiles
      };

      if (isEditMode && profile) {
        // Update existing profile
        await updateProfile(profile.id, profileData);
        resultProfile = { ...profile, ...profileData } as AgenticProfile;
        toast.success('Agentic AI Agent updated successfully');
      } else if (isSubAgentMode && parentId) {
        // Create sub-agent
        resultProfile = await createSubAgent(parentId, profileData);
        toast.success('Sub-agent created successfully');
      } else {
        // Create new Agentic AI Agent
        resultProfile = await createProfile(profileData);
        toast.success('Agentic AI Agent created successfully');
      }

      onSuccess?.(resultProfile);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Operation failed';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle input changes
  const handleChange = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const value = (e.target.type === 'number' || e.target.type === 'range') ? parseFloat(e.target.value) : e.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // Modal title
  const getTitle = () => {
    if (isEditMode) return 'Edit Agentic AI Agent';
    if (isSubAgentMode) return 'Create Sub-Agent';
    return 'Create Agentic AI Agent';
  };

  // Tab styling
  const tabClass = (tab: typeof activeTab) => cn(
    'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
    activeTab === tab
      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
      : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={getTitle()}
      size="lg"
      footer={
        <div className="flex gap-3 w-full justify-end">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isSubmitting || isLoadingProfiles}
          >
            {isEditMode ? 'Save Changes' : 'Create Agent'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Sub-agent parent info */}
        {isSubAgentMode && parentProfile && (
          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-3">
            <Bot className="w-5 h-5 text-purple-400" />
            <div>
              <p className="text-sm text-gray-400">Creating sub-agent under:</p>
              <p className="text-white font-medium">{parentProfile.name}</p>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-slate-700 pb-3">
          <button type="button" className={tabClass('basic')} onClick={() => setActiveTab('basic')}>
            <span className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Basic Info
            </span>
          </button>
          <button type="button" className={tabClass('ai')} onClick={() => setActiveTab('ai')}>
            <span className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              AI Config
            </span>
          </button>
          <button type="button" className={tabClass('workspace')} onClick={() => setActiveTab('workspace')}>
            <span className="flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              Workspace
            </span>
          </button>
          <button type="button" className={tabClass('orchestration')} onClick={() => setActiveTab('orchestration')}>
            <span className="flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Orchestration
            </span>
          </button>
        </div>

        {/* Basic Info Tab */}
        {activeTab === 'basic' && (
          <div className="space-y-4">
            {/* Name field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Agent Name <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                value={formData.name}
                onChange={handleChange('name')}
                placeholder="e.g., Customer Support Lead"
                disabled={isSubmitting}
                className={cn(errors.name && 'border-red-500')}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.name}
                </p>
              )}
            </div>

            {/* Role field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Role <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                value={formData.role}
                onChange={handleChange('role')}
                placeholder="e.g., Support Agent, Research Assistant, Task Manager"
                disabled={isSubmitting}
                className={cn(errors.role && 'border-red-500')}
              />
              <p className="mt-1 text-xs text-gray-500">
                The agent's primary function or specialty
              </p>
              {errors.role && (
                <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.role}
                </p>
              )}
            </div>

            {/* Description field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={handleChange('description')}
                placeholder="Describe this agent's role and responsibilities..."
                rows={2}
                disabled={isSubmitting}
                className={cn(
                  'w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg',
                  'text-white placeholder-gray-500',
                  'focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-colors resize-none',
                  errors.description && 'border-red-500'
                )}
              />
              <div className="flex justify-between mt-1">
                <span />
                <span className="text-xs text-gray-500">
                  {formData.description.length}/500
                </span>
              </div>
            </div>

            {/* System Prompt field - KEY PRD REQUIREMENT */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  System Prompt
                </span>
              </label>
              <textarea
                value={formData.systemPrompt}
                onChange={handleChange('systemPrompt')}
                placeholder="Define the agent's personality, behavior guidelines, and instructions...&#10;&#10;Example: You are a helpful customer support agent. Always be polite, professional, and solution-oriented. Escalate complex issues to the human team."
                rows={5}
                disabled={isSubmitting}
                className={cn(
                  'w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg',
                  'text-white placeholder-gray-500 font-mono text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-colors resize-none',
                  errors.systemPrompt && 'border-red-500'
                )}
              />
              <div className="flex justify-between mt-1">
                <p className="text-xs text-gray-500">
                  Base personality and instructions for the AI agent
                </p>
                <span className="text-xs text-gray-500">
                  {formData.systemPrompt.length}/4000
                </span>
              </div>
              {errors.systemPrompt && (
                <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.systemPrompt}
                </p>
              )}
            </div>

            {/* Autonomy Level field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Autonomy Level
              </label>
              <select
                value={formData.autonomyLevel}
                onChange={handleChange('autonomyLevel')}
                disabled={isSubmitting}
                title="Select autonomy level"
                aria-label="Autonomy Level"
                className={cn(
                  'w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg',
                  'text-white',
                  'focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-colors'
                )}
              >
                <option value="supervised">Supervised</option>
                <option value="semi-autonomous">Semi-Autonomous</option>
                <option value="autonomous">Autonomous</option>
              </select>
              <p className="mt-2 text-sm text-gray-500">
                {formData.autonomyLevel === 'supervised' && (
                  <>
                    <span className="text-emerald-400">Supervised:</span>
                    {' Agent requires approval for most actions.'}
                  </>
                )}
                {formData.autonomyLevel === 'semi-autonomous' && (
                  <>
                    <span className="text-amber-400">Semi-Autonomous:</span>
                    {' Agent can handle routine tasks independently.'}
                  </>
                )}
                {formData.autonomyLevel === 'autonomous' && (
                  <>
                    <span className="text-red-400">Autonomous:</span>
                    {' Agent operates with minimal supervision.'}
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* AI Configuration Tab */}
        {activeTab === 'ai' && (
          <div className="space-y-4">
            {/* AI Provider */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                AI Provider
              </label>
              <select
                value={formData.aiProvider}
                onChange={handleChange('aiProvider')}
                disabled={isSubmitting}
                title="Select AI provider"
                aria-label="AI Provider"
                className={cn(
                  'w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg',
                  'text-white',
                  'focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-colors'
                )}
              >
                <option value="task-routing">Task Routing (Auto-select based on task)</option>
                {aiProviders.filter(p => p.id !== 'task-routing').map(provider => (
                  <option key={provider.id} value={provider.name || provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Task Routing automatically selects the best model for each task
              </p>
            </div>

            {/* AI Model (shown only when specific provider selected) */}
            {formData.aiProvider !== 'task-routing' && availableModels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  AI Model
                </label>
                <select
                  value={formData.aiModel}
                  onChange={handleChange('aiModel')}
                  disabled={isSubmitting}
                  title="Select AI model"
                  aria-label="AI Model"
                  className={cn(
                    'w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg',
                    'text-white',
                    'focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'transition-colors'
                  )}
                >
                  <option value="">Select a model</option>
                  {availableModels.map(model => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Temperature */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">
                  Temperature: {formData.temperature != null ? formData.temperature.toFixed(1) : 'Auto'}
                </label>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    temperature: prev.temperature != null ? null : 0.7,
                  }))}
                  disabled={isSubmitting}
                  className={cn(
                    'px-2 py-0.5 text-xs rounded-md border transition-colors',
                    formData.temperature == null
                      ? 'bg-sky-500/20 border-sky-500/40 text-sky-400'
                      : 'bg-slate-700/50 border-slate-600 text-gray-400 hover:text-gray-300'
                  )}
                >
                  {formData.temperature == null ? 'Auto' : 'Custom'}
                </button>
              </div>
              {formData.temperature != null ? (
                <>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={formData.temperature}
                    onChange={handleChange('temperature')}
                    disabled={isSubmitting}
                    title="Adjust temperature"
                    aria-label="Temperature"
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>0 (Precise)</span>
                    <span>1 (Balanced)</span>
                    <span>2 (Creative)</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-500">
                  Using AI provider's default temperature. Click "Custom" to set a specific value.
                </p>
              )}
            </div>

            {/* Max Tokens */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">
                  Max Tokens{formData.maxTokens != null ? `: ${formData.maxTokens.toLocaleString()}` : ': Auto'}
                </label>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    maxTokens: prev.maxTokens != null ? null : 4096,
                  }))}
                  disabled={isSubmitting}
                  className={cn(
                    'px-2 py-0.5 text-xs rounded-md border transition-colors',
                    formData.maxTokens == null
                      ? 'bg-sky-500/20 border-sky-500/40 text-sky-400'
                      : 'bg-slate-700/50 border-slate-600 text-gray-400 hover:text-gray-300'
                  )}
                >
                  {formData.maxTokens == null ? 'Auto' : 'Custom'}
                </button>
              </div>
              {formData.maxTokens != null ? (
                <>
                  <Input
                    type="number"
                    value={formData.maxTokens}
                    onChange={handleChange('maxTokens')}
                    min={256}
                    max={128000}
                    disabled={isSubmitting}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Maximum response length (256 - 128,000)
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-500">
                  Using AI provider's default token limit. Click "Custom" to set a specific value.
                </p>
              )}
            </div>

            {/* Routing Preset */}
            {routingPresets.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Routing Preset
                </label>
                <select
                  value={formData.routingPreset}
                  onChange={handleChange('routingPreset')}
                  disabled={isSubmitting}
                  title="Select routing preset"
                  aria-label="Routing Preset"
                  className={cn(
                    'w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg',
                    'text-white',
                    'focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'transition-colors'
                  )}
                >
                  <option value="">No preset (use defaults)</option>
                  {routingPresets.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Pre-configured AI routing settings for common use cases
                </p>
              </div>
            )}
          </div>
        )}

        {/* Workspace Tab */}
        {activeTab === 'workspace' && (
          <div className="space-y-4">
            {/* CLI Type - KEY PRD REQUIREMENT */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <span className="flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  CLI Type
                </span>
              </label>
              <select
                value={formData.cliType}
                onChange={handleChange('cliType')}
                disabled={isSubmitting}
                title="Select CLI type"
                aria-label="CLI Type"
                className={cn(
                  'w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg',
                  'text-white',
                  'focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-colors'
                )}
              >
                <option value="claude">Claude CLI (Anthropic)</option>
                <option value="gemini">Gemini CLI (Google)</option>
                <option value="opencode">OpenCode CLI (Multi-provider)</option>
                <option value="bash">Bash (Script execution only)</option>
              </select>
              <p className="mt-2 text-sm text-gray-500">
                {formData.cliType === 'claude' && (
                  <>
                    <span className="text-purple-400">Claude CLI:</span>
                    {' Premium AI with advanced reasoning. Requires Anthropic API key.'}
                  </>
                )}
                {formData.cliType === 'gemini' && (
                  <>
                    <span className="text-blue-400">Gemini CLI:</span>
                    {' Free tier available. Good for general tasks.'}
                  </>
                )}
                {formData.cliType === 'opencode' && (
                  <>
                    <span className="text-emerald-400">OpenCode CLI:</span>
                    {' Multi-provider support. Flexible model selection.'}
                  </>
                )}
                {formData.cliType === 'bash' && (
                  <>
                    <span className="text-amber-400">Bash:</span>
                    {' Script execution only. No AI capabilities.'}
                  </>
                )}
              </p>
            </div>

            {/* Workspace Autonomy Level */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Workspace Autonomy
              </label>
              <select
                value={formData.workspaceAutonomyLevel}
                onChange={handleChange('workspaceAutonomyLevel')}
                disabled={isSubmitting}
                title="Select workspace autonomy level"
                aria-label="Workspace Autonomy"
                className={cn(
                  'w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg',
                  'text-white',
                  'focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-colors'
                )}
              >
                <option value="semi">Semi-Autonomous (Safer)</option>
                <option value="full">Full Autonomy (Advanced)</option>
              </select>
              <p className="mt-2 text-sm text-gray-500">
                {formData.workspaceAutonomyLevel === 'semi' && (
                  <>
                    <span className="text-emerald-400">Semi-Autonomous:</span>
                    {' CLI runs with safety checks. Recommended for most use cases.'}
                  </>
                )}
                {formData.workspaceAutonomyLevel === 'full' && (
                  <>
                    <span className="text-red-400">Full Autonomy:</span>
                    {' CLI runs with minimal restrictions. Use with caution.'}
                  </>
                )}
              </p>
            </div>

            {/* Info box about workspace */}
            <div className="p-3 bg-sky-500/10 border border-sky-500/30 rounded-lg">
              <p className="text-sm text-gray-300">
                <span className="text-sky-400 font-medium">Workspace Info:</span>
                {' A dedicated workspace will be automatically created for this agent with the selected CLI type and autonomy settings.'}
              </p>
            </div>
          </div>
        )}

        {/* Orchestration Tab */}
        {activeTab === 'orchestration' && (
          <div className="space-y-4">
            {/* Can Create Children toggle */}
            <div className="flex items-center justify-between p-4 bg-swarm-darker rounded-xl border border-swarm-border/20">
              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Enable Orchestration
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Allow this agent to create and manage specialist sub-agents for complex tasks
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, canCreateChildren: !prev.canCreateChildren }))}
                disabled={isSubmitting}
                title="Toggle orchestration"
                aria-label="Enable orchestration"
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  formData.canCreateChildren ? 'bg-sky-500' : 'bg-slate-600'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    formData.canCreateChildren ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            {/* Conditional settings (shown when orchestration is enabled) */}
            {formData.canCreateChildren && (
              <>
                {/* Max Children */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Sub-Agents: {formData.maxChildren}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={formData.maxChildren}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxChildren: parseInt(e.target.value) }))}
                    disabled={isSubmitting}
                    title="Maximum number of sub-agents"
                    aria-label="Max Sub-Agents"
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>1</span>
                    <span>5</span>
                    <span>10</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Maximum number of specialist sub-agents this agent can create
                  </p>
                </div>

                {/* Max Hierarchy Depth */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Hierarchy Depth: {formData.maxHierarchyDepth}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={formData.maxHierarchyDepth}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxHierarchyDepth: parseInt(e.target.value) }))}
                    disabled={isSubmitting}
                    title="Maximum hierarchy depth"
                    aria-label="Max Hierarchy Depth"
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>1 (Flat)</span>
                    <span>3 (Default)</span>
                    <span>5 (Deep)</span>
                  </div>
                </div>

                {/* Children Autonomy Cap */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sub-Agent Autonomy Cap
                  </label>
                  <select
                    value={formData.childrenAutonomyCap}
                    onChange={(e) => setFormData(prev => ({ ...prev, childrenAutonomyCap: e.target.value as FormData['childrenAutonomyCap'] }))}
                    disabled={isSubmitting}
                    title="Maximum autonomy level for sub-agents"
                    aria-label="Children Autonomy Cap"
                    className={cn(
                      'w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg',
                      'text-white',
                      'focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'transition-colors'
                    )}
                  >
                    <option value="supervised">Supervised (Safest)</option>
                    <option value="semi-autonomous">Semi-Autonomous (Default)</option>
                    <option value="autonomous">Autonomous (Full freedom)</option>
                  </select>
                  <p className="mt-2 text-sm text-gray-500">
                    {formData.childrenAutonomyCap === 'supervised' && (
                      <>
                        <span className="text-emerald-400">Supervised:</span>
                        {' Sub-agents require approval for external actions.'}
                      </>
                    )}
                    {formData.childrenAutonomyCap === 'semi-autonomous' && (
                      <>
                        <span className="text-amber-400">Semi-Autonomous:</span>
                        {' Sub-agents can handle safe operations independently.'}
                      </>
                    )}
                    {formData.childrenAutonomyCap === 'autonomous' && (
                      <>
                        <span className="text-red-400">Autonomous:</span>
                        {' Sub-agents operate with minimal restrictions.'}
                      </>
                    )}
                  </p>
                </div>

                {/* Info box */}
                <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <p className="text-sm text-gray-300">
                    <span className="text-purple-400 font-medium">Orchestration Info:</span>
                    {' When enabled, this agent can decompose complex tasks into subtasks and create specialist sub-agents to handle them in parallel. Sub-agents inherit tools and knowledge from the parent agent.'}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
};

ProfileFormModal.displayName = 'ProfileFormModal';

export default ProfileFormModal;
