import React, { useState, useCallback, useEffect } from 'react';
import {
  Cloud,
  Server,
  Cpu,
  Globe,
  Link,
  Key,
  AlertCircle,
  Check,
  RefreshCw,
  Download,
  Loader2,
  HardDrive,
  Trash2,
  Terminal,
  Zap,
  Mic,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useAIStore } from '../../stores/aiStore';
import { AIProvider, AIProviderType } from '../../types';
import { cn } from '../../lib/utils';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { CLIAuthTerminal } from './CLIAuthTerminal';

/**
 * Provider type option for selection
 */
interface ProviderTypeOption {
  type: AIProviderType;
  name: string;
  description: string;
  icon: React.ReactNode;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
}

/**
 * Check if provider type is a CLI type
 */
const isCLIProvider = (type: AIProviderType): type is 'cli-claude' | 'cli-gemini' | 'cli-opencode' => {
  return type === 'cli-claude' || type === 'cli-gemini' || type === 'cli-opencode';
};

/**
 * Available provider types configuration
 */
const providerTypes: ProviderTypeOption[] = [
  {
    type: 'openrouter',
    name: 'OpenRouter',
    description: 'Access multiple AI models through a single API',
    icon: <Globe className="w-5 h-5 text-purple-400" />,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
  },
  {
    type: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models directly from Anthropic',
    icon: <Cpu className="w-5 h-5 text-orange-400" />,
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresApiKey: true,
  },
  {
    type: 'google',
    name: 'Google AI',
    description: 'Gemini and other Google AI models',
    icon: <Cloud className="w-5 h-5 text-blue-400" />,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresApiKey: true,
  },
  {
    type: 'ollama',
    name: 'Ollama',
    description: 'Run open-source models locally',
    icon: <Server className="w-5 h-5 text-green-400" />,
    defaultBaseUrl: 'http://localhost:11434',
    requiresApiKey: false,
  },
  {
    type: 'openai-compatible',
    name: 'OpenAI Compatible',
    description: 'Any OpenAI-compatible API endpoint',
    icon: <Cloud className="w-5 h-5 text-sky-400" />,
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
  },
  // CLI Providers - require terminal authentication
  {
    type: 'cli-claude',
    name: 'Claude CLI',
    description: 'Authenticate Claude CLI for agentic tasks',
    icon: <Terminal className="w-5 h-5 text-orange-400" />,
    defaultBaseUrl: '',
    requiresApiKey: false,
  },
  {
    type: 'cli-gemini',
    name: 'Gemini CLI',
    description: 'Authenticate Gemini CLI for multimodal AI',
    icon: <Terminal className="w-5 h-5 text-blue-400" />,
    defaultBaseUrl: '',
    requiresApiKey: false,
  },
  {
    type: 'cli-opencode',
    name: 'OpenCode CLI',
    description: 'Multi-provider CLI with free models',
    icon: <Terminal className="w-5 h-5 text-emerald-400" />,
    defaultBaseUrl: '',
    requiresApiKey: false,
  },
  // Transcription providers
  {
    type: 'groq',
    name: 'Groq',
    description: 'Fast AI inference & Whisper transcription',
    icon: <Zap className="w-5 h-5 text-green-400" />,
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
  },
  {
    type: 'openai-whisper',
    name: 'OpenAI Whisper',
    description: 'Voice transcription via OpenAI API',
    icon: <Mic className="w-5 h-5 text-teal-400" />,
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
  },
];

/**
 * Discovered model interface
 */
interface DiscoveredModel {
  id: string;
  name: string;
  size?: number;
  modified?: string;
  details?: Record<string, unknown>;
}

/**
 * Ollama library model interface
 */
interface OllamaLibraryModel {
  name: string;
  description: string;
  sizes: string[];
}

/**
 * Form state interface
 */
interface FormState {
  name: string;
  type: AIProviderType;
  baseUrl: string;
  apiKey: string;
  budgetLimit: string;
}

/**
 * Initial form state
 */
const initialFormState: FormState = {
  name: '',
  type: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  budgetLimit: '',
};

/**
 * AddProviderModal Props
 */
interface AddProviderModalProps {
  open: boolean;
  onClose: () => void;
  editProvider?: AIProvider | null;
}

/**
 * Format file size to human readable
 */
function formatSize(bytes?: number): string {
  if (!bytes) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

/**
 * AddProviderModal Component
 *
 * Modal for adding or editing AI provider configurations.
 * Supports multiple provider types with real connection testing.
 */
export const AddProviderModal: React.FC<AddProviderModalProps> = ({
  open,
  onClose,
  editProvider,
}) => {
  const { addProvider, updateProvider } = useAIStore();

  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState<string>('');
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Ollama model download state
  const [ollamaLibrary, setOllamaLibrary] = useState<OllamaLibraryModel[]>([]);
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [customModelName, setCustomModelName] = useState('');

  // CLI authentication state
  const [cliAuthStatus, setCLIAuthStatus] = useState<'idle' | 'authenticating' | 'success' | 'error'>('idle');

  const isEditMode = !!editProvider;
  const isCLIType = isCLIProvider(formState.type);

  /**
   * Initialize form when editing
   */
  useEffect(() => {
    if (editProvider) {
      setFormState({
        name: editProvider.name,
        type: editProvider.type,
        baseUrl: editProvider.baseUrl,
        apiKey: editProvider.apiKey || '',
        budgetLimit: editProvider.budgetLimit?.toString() || '',
      });
      // Convert string array to DiscoveredModel array
      setDiscoveredModels(editProvider.models.map(m => ({ id: m, name: m })));
    } else {
      setFormState(initialFormState);
      setDiscoveredModels([]);
    }
    setErrors({});
    setTestResult(null);
    setTestMessage('');
    setShowDownloadPanel(false);
  }, [editProvider, open]);

  /**
   * Load Ollama library when type is ollama
   */
  useEffect(() => {
    if (formState.type === 'ollama' && open) {
      loadOllamaLibrary();
    }
  }, [formState.type, open]);

  /**
   * Load popular Ollama models
   */
  const loadOllamaLibrary = async () => {
    try {
      const response = await api.get('/ai/providers/ollama/library');
      setOllamaLibrary(response.data.models || []);
    } catch (error) {
      console.error('Failed to load Ollama library:', error);
    }
  };

  /**
   * Get current provider type configuration
   */
  const currentProviderType = providerTypes.find((p) => p.type === formState.type);

  /**
   * Handle field change
   */
  const handleChange = useCallback(
    (field: keyof FormState, value: string) => {
      setFormState((prev) => ({
        ...prev,
        [field]: value,
      }));

      // Clear error when field changes
      if (errors[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }

      // Clear test result when config changes
      setTestResult(null);
      setTestMessage('');
    },
    [errors]
  );

  /**
   * Handle provider type change
   */
  const handleTypeChange = useCallback((type: AIProviderType) => {
    const providerConfig = providerTypes.find((p) => p.type === type);
    setFormState((prev) => ({
      ...prev,
      type,
      baseUrl: providerConfig?.defaultBaseUrl || prev.baseUrl,
    }));
    setTestResult(null);
    setTestMessage('');
    setDiscoveredModels([]);
    setShowDownloadPanel(false);
  }, []);

  /**
   * Validate form
   */
  const validateForm = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};

    if (!formState.name.trim()) {
      newErrors.name = 'Provider name is required';
    }

    // CLI providers don't need baseUrl or apiKey
    if (!isCLIType) {
      if (!formState.baseUrl.trim()) {
        newErrors.baseUrl = 'Base URL is required';
      } else {
        try {
          new URL(formState.baseUrl);
        } catch {
          newErrors.baseUrl = 'Invalid URL format';
        }
      }

      if (currentProviderType?.requiresApiKey && !formState.apiKey.trim() && !isEditMode) {
        newErrors.apiKey = 'API key is required for this provider';
      }
    }

    if (formState.budgetLimit && isNaN(Number(formState.budgetLimit))) {
      newErrors.budgetLimit = 'Budget must be a valid number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formState, currentProviderType, isEditMode, isCLIType]);

  /**
   * Handle test connection - REAL API CALL
   */
  const handleTestConnection = useCallback(async () => {
    if (!validateForm()) return;

    setIsTesting(true);
    setTestResult(null);
    setTestMessage('');

    try {
      const response = await api.post('/ai/providers/test-config', {
        type: formState.type,
        baseUrl: formState.baseUrl,
        apiKey: formState.apiKey || undefined,
      });

      if (response.data.success) {
        setTestResult('success');
        setTestMessage(response.data.message || 'Connection successful!');

        // If Ollama returned models, update discovered models
        if (formState.type === 'ollama' && response.data.models) {
          setDiscoveredModels(response.data.models.map((m: { name: string; size?: number; modified_at?: string }) => ({
            id: m.name,
            name: m.name.split(':')[0],
            size: m.size,
            modified: m.modified_at,
          })));
        }
      } else {
        setTestResult('error');
        setTestMessage(response.data.message || 'Connection failed');
      }
    } catch (error: unknown) {
      setTestResult('error');
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      setTestMessage(err.response?.data?.error || err.message || 'Connection test failed');
    } finally {
      setIsTesting(false);
    }
  }, [validateForm, formState]);

  /**
   * Handle model discovery - REAL API CALL
   */
  const handleDiscoverModels = useCallback(async () => {
    setIsDiscovering(true);
    try {
      const response = await api.post('/ai/providers/discover-models', {
        type: formState.type,
        baseUrl: formState.baseUrl,
        apiKey: formState.apiKey || undefined,
      });

      if (response.data.success) {
        setDiscoveredModels(response.data.models || []);
        if (response.data.models?.length === 0) {
          toast.error('No models found. Make sure Ollama is running and has models installed.');
        } else {
          toast.success(`Found ${response.data.models.length} models`);
        }
      } else {
        toast.error(response.data.message || 'Failed to discover models');
        setDiscoveredModels([]);
      }
    } catch (error: unknown) {
      console.error('Failed to discover models:', error);
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || 'Failed to discover models');
    } finally {
      setIsDiscovering(false);
    }
  }, [formState]);

  /**
   * Handle pull/download Ollama model
   */
  const handlePullModel = useCallback(async (modelName: string) => {
    setPullingModel(modelName);
    toast.loading(`Downloading ${modelName}... This may take several minutes for large models.`, { id: 'pull-model' });

    try {
      // Use longer timeout for model downloads (10 minutes)
      const response = await api.post('/ai/providers/ollama/pull', {
        baseUrl: formState.baseUrl,
        modelName,
      }, { timeout: 600000 });

      if (response.data.success) {
        toast.success(`Model ${modelName} downloaded successfully!`, { id: 'pull-model' });
        // Refresh models list
        await handleDiscoverModels();
      } else {
        toast.error(response.data.message || 'Failed to download model', { id: 'pull-model' });
      }
    } catch (error: unknown) {
      console.error('Failed to pull model:', error);
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || 'Failed to download model', { id: 'pull-model' });
    } finally {
      setPullingModel(null);
    }
  }, [formState.baseUrl, handleDiscoverModels]);

  /**
   * Handle custom model download
   */
  const handlePullCustomModel = useCallback(() => {
    if (customModelName.trim()) {
      handlePullModel(customModelName.trim());
      setCustomModelName('');
    }
  }, [customModelName, handlePullModel]);

  /**
   * Handle CLI authentication complete
   */
  const handleCLIAuthComplete = useCallback((success: boolean) => {
    if (success) {
      setCLIAuthStatus('success');
      toast.success(`${currentProviderType?.name} authenticated! Click "Add Provider" to save.`);
    } else {
      setCLIAuthStatus('error');
    }
  }, [currentProviderType?.name]);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validateForm()) return;

      // For CLI providers, check if authenticated
      if (isCLIType && cliAuthStatus !== 'success') {
        toast.error('Please complete CLI authentication first');
        return;
      }

      setIsSubmitting(true);
      try {
        const providerData = {
          name: formState.name.trim(),
          type: formState.type,
          baseUrl: isCLIType ? '' : formState.baseUrl.trim(),
          apiKey: isCLIType ? undefined : (formState.apiKey.trim() || undefined),
          isActive: true,
          isDefault: false,
          models: discoveredModels.length > 0 ? discoveredModels.map(m => m.id) : [],
          budgetLimit: formState.budgetLimit
            ? Number(formState.budgetLimit)
            : undefined,
        };

        if (isEditMode && editProvider) {
          await updateProvider(editProvider.id, providerData);
        } else {
          await addProvider(providerData);
        }

        onClose();
      } catch (error) {
        console.error('Failed to save provider:', error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      validateForm,
      formState,
      discoveredModels,
      isEditMode,
      editProvider,
      addProvider,
      updateProvider,
      onClose,
      isCLIType,
      cliAuthStatus,
    ]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditMode ? 'Edit AI Provider' : 'Add AI Provider'}
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {/* Test Connection button - only for non-CLI providers */}
          {!isCLIType && (
            <Button
              variant="outline"
              onClick={handleTestConnection}
              loading={isTesting}
              disabled={isSubmitting}
              icon={testResult === 'success' ? <Check className="w-4 h-4" /> : undefined}
            >
              Test Connection
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={isTesting || (isCLIType && cliAuthStatus !== 'success')}
          >
            {isEditMode ? 'Update Provider' : 'Add Provider'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Provider Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Provider Type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {providerTypes.map((provider) => (
              <button
                key={provider.type}
                type="button"
                onClick={() => handleTypeChange(provider.type)}
                className={cn(
                  'p-3 rounded-lg border text-left transition-all',
                  formState.type === provider.type
                    ? 'border-sky-500 bg-sky-500/10'
                    : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {provider.icon}
                  <span className="font-medium text-white text-sm">
                    {provider.name}
                  </span>
                </div>
                <p className="text-xs text-gray-400 line-clamp-2">
                  {provider.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Provider Name */}
        <Input
          label="Provider Name"
          placeholder={isCLIType ? `e.g., My ${currentProviderType?.name}` : 'e.g., My OpenRouter Account'}
          value={formState.name}
          onChange={(e) => handleChange('name', e.target.value)}
          error={errors.name}
          iconLeft={isCLIType ? <Terminal className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
        />

        {/* CLI Authentication Terminal */}
        {isCLIType && (
          <CLIAuthTerminal
            cliType={formState.type as 'cli-claude' | 'cli-gemini' | 'cli-opencode'}
            onAuthComplete={handleCLIAuthComplete}
            onStatusChange={setCLIAuthStatus}
          />
        )}

        {/* Non-CLI Provider Fields */}
        {!isCLIType && (
          <>
            {/* Base URL */}
            <Input
              label="Base URL"
              placeholder={currentProviderType?.defaultBaseUrl || 'https://api.example.com/v1'}
              value={formState.baseUrl}
              onChange={(e) => handleChange('baseUrl', e.target.value)}
              error={errors.baseUrl}
              iconLeft={<Link className="w-4 h-4" />}
              helperText={
                formState.type === 'ollama'
                  ? 'Default: http://localhost:11434 for local Ollama'
                  : 'The API endpoint for this provider'
              }
            />

            {/* API Key */}
            {currentProviderType?.requiresApiKey && (
              <Input
                label="API Key"
                type="password"
                placeholder={isEditMode ? '(unchanged)' : 'Enter your API key'}
                value={formState.apiKey}
                onChange={(e) => handleChange('apiKey', e.target.value)}
                error={errors.apiKey}
                iconLeft={<Key className="w-4 h-4" />}
                helperText={
                  isEditMode
                    ? 'Leave blank to keep existing API key'
                    : 'Your API key will be stored securely'
                }
              />
            )}

            {/* Budget Limit */}
            <Input
              label="Monthly Budget Limit (Optional)"
              type="number"
              placeholder="e.g., 50.00"
              value={formState.budgetLimit}
              onChange={(e) => handleChange('budgetLimit', e.target.value)}
              error={errors.budgetLimit}
              helperText="Set a spending limit in USD. Leave blank for unlimited."
            />
          </>
        )}

        {/* Model Discovery for Ollama */}
        {formState.type === 'ollama' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">
                Installed Models
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowDownloadPanel(!showDownloadPanel)}
                  icon={<Download className="w-4 h-4" />}
                >
                  {showDownloadPanel ? 'Hide Downloads' : 'Download Models'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleDiscoverModels}
                  loading={isDiscovering}
                  icon={<RefreshCw className="w-4 h-4" />}
                >
                  Refresh
                </Button>
              </div>
            </div>

            {/* Discovered Models List */}
            {discoveredModels.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {discoveredModels.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between p-2 bg-slate-800/50 border border-slate-700 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-white font-medium">{model.id}</span>
                      {model.size && (
                        <span className="text-xs text-gray-500">({formatSize(model.size)})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg text-center text-gray-400 text-sm">
                {isDiscovering ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Discovering models...</span>
                  </div>
                ) : (
                  'Click "Refresh" to fetch installed models from Ollama'
                )}
              </div>
            )}

            {/* Download Panel */}
            {showDownloadPanel && (
              <div className="p-4 bg-slate-900/50 border border-slate-600 rounded-lg space-y-4">
                <h4 className="text-sm font-medium text-white flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Download New Models
                </h4>

                {/* Custom Model Input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter model name (e.g., llama3.2, mistral:7b)"
                    value={customModelName}
                    onChange={(e) => setCustomModelName(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handlePullCustomModel}
                    disabled={!customModelName.trim() || !!pullingModel}
                    loading={pullingModel === customModelName}
                  >
                    Pull
                  </Button>
                </div>

                {/* Popular Models */}
                <div>
                  <p className="text-xs text-gray-400 mb-2">Popular models:</p>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {ollamaLibrary.map((model) => (
                      <div
                        key={model.name}
                        className="p-2 bg-slate-800/50 border border-slate-700 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-white font-medium">{model.name}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePullModel(model.name)}
                            disabled={!!pullingModel}
                            loading={pullingModel === model.name}
                            className="!p-1"
                          >
                            {pullingModel === model.name ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-1">{model.description}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {model.sizes.map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => handlePullModel(`${model.name}:${size}`)}
                              disabled={!!pullingModel}
                              className="text-xs px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-gray-300 rounded transition-colors"
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div
            className={cn(
              'flex items-center gap-2 p-3 rounded-lg',
              testResult === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            )}
          >
            {testResult === 'success' ? (
              <>
                <Check className="w-5 h-5 flex-shrink-0" />
                <span>{testMessage || 'Connection test successful! Provider is reachable.'}</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{testMessage || 'Connection test failed. Please check your settings and try again.'}</span>
              </>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
};

export default AddProviderModal;
