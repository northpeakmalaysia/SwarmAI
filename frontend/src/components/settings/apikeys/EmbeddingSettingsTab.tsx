/**
 * Embedding Settings Tab
 *
 * Configure which AI provider and model to use for embeddings (RAG).
 * Embeddings are used for document ingestion and semantic search.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Loader2,
  Check,
  AlertCircle,
  Info,
  Zap,
  DollarSign,
  Server,
} from 'lucide-react';
import { Button } from '../../common/Button';
import { Badge } from '../../common/Badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

interface EmbeddingModel {
  id: string;
  name: string;
  dimensions: number;
  description: string;
}

interface EmbeddingProvider {
  id: string;
  name: string;
  type: string;
  description: string;
  models: EmbeddingModel[];
}

interface EmbeddingSettings {
  embeddingProvider: string;
  embeddingModel: string | null;
}

export const EmbeddingSettingsTab: React.FC = () => {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState<EmbeddingSettings>({
    embeddingProvider: 'auto',
    embeddingModel: null,
  });
  const [availableProviders, setAvailableProviders] = useState<EmbeddingProvider[]>([]);

  // Fetch embedding settings
  const fetchSettings = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/embedding-settings', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch embedding settings');
      }

      const data = await response.json();
      setSettings(data.settings);
      setAvailableProviders(data.availableProviders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Save settings
  const saveSettings = async () => {
    if (!token) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/ai/embedding-settings', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to save embedding settings');
      }

      setSuccess('Embedding settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Get current provider's models
  const currentProviderModels = availableProviders.find(
    (p) => p.id === settings.embeddingProvider || p.type === settings.embeddingProvider
  )?.models || [];

  // Get provider info
  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'ollama':
        return <Server className="w-5 h-5" />;
      case 'openrouter':
      case 'openai':
        return <DollarSign className="w-5 h-5" />;
      case 'auto':
        return <Zap className="w-5 h-5" />;
      default:
        return <Database className="w-5 h-5" />;
    }
  };

  const getProviderColor = (type: string) => {
    switch (type) {
      case 'ollama':
        return 'text-green-400 bg-green-400/10 border-green-400/30';
      case 'openrouter':
      case 'openai':
        return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
      case 'auto':
        return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30';
      default:
        return 'text-gray-400 bg-gray-400/10 border-gray-400/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        <span className="ml-2 text-gray-400">Loading embedding settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-400" />
          Embedding Configuration
        </h3>
        <p className="text-sm text-gray-400 mt-1">
          Configure which AI provider and model to use for document embeddings (RAG).
          Embeddings are used for semantic search and document retrieval.
        </p>
      </div>

      {/* Info Banner */}
      <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-cyan-200 font-medium">Cost-Saving Tip</p>
            <p className="text-cyan-200/70 mt-1">
              Using <strong>Ollama</strong> with <strong>nomic-embed-text</strong> provides
              free local embeddings. The &quot;Auto&quot; mode tries Ollama first and falls
              back to OpenRouter only if Ollama is unavailable.
            </p>
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-200">{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-400" />
          <span className="text-green-200">{success}</span>
        </div>
      )}

      {/* Provider Selection */}
      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-300">
          Embedding Provider
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableProviders.map((provider) => (
            <button
              key={provider.id}
              onClick={() => setSettings({
                embeddingProvider: provider.id,
                embeddingModel: provider.models[0]?.id || null,
              })}
              className={cn(
                'p-4 rounded-lg border transition-all text-left',
                settings.embeddingProvider === provider.id
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-2 rounded-lg border',
                  getProviderColor(provider.type)
                )}>
                  {getProviderIcon(provider.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">{provider.name}</span>
                    {settings.embeddingProvider === provider.id && (
                      <Check className="w-4 h-4 text-cyan-400" />
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{provider.description}</p>
                </div>
              </div>
              {provider.type === 'ollama' && (
                <Badge variant="success" className="mt-2">Free</Badge>
              )}
              {(provider.type === 'openrouter' || provider.type === 'openai') && (
                <Badge variant="warning" className="mt-2">Paid</Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Model Selection (only for non-auto providers) */}
      {settings.embeddingProvider !== 'auto' && currentProviderModels.length > 0 && (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-300">
            Embedding Model
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentProviderModels.map((model) => (
              <button
                key={model.id}
                onClick={() => setSettings({ ...settings, embeddingModel: model.id })}
                className={cn(
                  'p-4 rounded-lg border transition-all text-left',
                  settings.embeddingModel === model.id
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{model.name}</span>
                  {settings.embeddingModel === model.id && (
                    <Check className="w-4 h-4 text-cyan-400" />
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">{model.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="info" size="sm">
                    {model.dimensions} dimensions
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Current Configuration Summary */}
      <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
        <h4 className="text-sm font-medium text-white mb-2">Current Configuration</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Provider:</span>
            <span className="ml-2 text-white">
              {availableProviders.find(p => p.id === settings.embeddingProvider)?.name || settings.embeddingProvider}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Model:</span>
            <span className="ml-2 text-white">
              {settings.embeddingModel || (settings.embeddingProvider === 'auto' ? 'nomic-embed-text (Ollama)' : 'Default')}
            </span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={saveSettings}
          disabled={saving}
          className="min-w-[120px]"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default EmbeddingSettingsTab;
