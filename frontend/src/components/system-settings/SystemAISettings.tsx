import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cloud,
  Key,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Plus,
  Settings,
  Globe,
  Server,
  Cpu,
  Terminal,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { useAIStore } from '../../stores/aiStore';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * Provider icon mapping
 */
const ProviderIcon: React.FC<{ type: string; className?: string }> = ({
  type,
  className = 'w-5 h-5',
}) => {
  const iconMap: Record<string, React.ReactNode> = {
    openrouter: <Globe className={cn(className, 'text-purple-400')} />,
    ollama: <Server className={cn(className, 'text-green-400')} />,
    anthropic: <Cpu className={cn(className, 'text-orange-400')} />,
    google: <Cloud className={cn(className, 'text-blue-400')} />,
    'openai-compatible': <Cloud className={cn(className, 'text-sky-400')} />,
  };
  return <>{iconMap[type] || <Cloud className={className} />}</>;
};

/**
 * System-wide AI provider settings
 */
interface SystemProviderConfig {
  id: string;
  name: string;
  type: string;
  apiKeySet: boolean;
  isActive: boolean;
  modelsCount: number;
  lastSync?: string;
}

/**
 * SystemAISettings Component
 *
 * Manages system-wide AI provider configuration:
 * - API keys that all users share
 * - Provider activation/deactivation
 * - Model synchronization
 */
export const SystemAISettings: React.FC = () => {
  const navigate = useNavigate();
  const { providers, fetchProviders, loading } = useAIStore();
  const [systemProviders, setSystemProviders] = useState<SystemProviderConfig[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    if (providers) {
      setSystemProviders(
        providers.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          apiKeySet: !!p.apiKey || p.type === 'ollama',
          isActive: p.isActive,
          modelsCount: p.models?.length || 0,
          lastSync: (p as any).lastSync,
        }))
      );
    }
  }, [providers]);

  const handleSaveApiKey = async (providerId: string) => {
    if (!apiKeyInput.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/ai/providers/${providerId}`, {
        apiKey: apiKeyInput,
      });
      toast.success('API key updated successfully');
      setEditingProvider(null);
      setApiKeyInput('');
      fetchProviders();
    } catch (error) {
      console.error('Failed to save API key:', error);
      toast.error('Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProvider = async (providerId: string, isActive: boolean) => {
    try {
      await api.patch(`/ai/providers/${providerId}`, {
        isActive: !isActive,
      });
      toast.success(`Provider ${isActive ? 'disabled' : 'enabled'}`);
      fetchProviders();
    } catch (error) {
      console.error('Failed to toggle provider:', error);
      toast.error('Failed to update provider');
    }
  };

  const handleSyncModels = async (providerId: string) => {
    try {
      await api.post(`/ai/providers/${providerId}/sync`);
      toast.success('Models synchronized');
      fetchProviders();
    } catch (error) {
      console.error('Failed to sync models:', error);
      toast.error('Failed to sync models');
    }
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <Card variant="bordered" className="border-sky-500/50 bg-sky-500/10">
        <CardBody className="py-3">
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-sky-400 flex-shrink-0" />
            <div className="text-sm text-sky-200">
              <strong>System-wide API Keys:</strong> These keys are used as defaults for all users.
              Users can override with their own keys in User Settings.
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Provider List */}
      <Card variant="pressed">
        <CardHeader
          title="AI Providers"
          subtitle="Configure system-wide AI provider connections"
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={() => fetchProviders()}
              loading={loading}
            >
              Refresh
            </Button>
          }
        />
        <CardBody>
          <div className="space-y-4">
            {systemProviders.map((provider) => (
              <div
                key={provider.id}
                className={cn(
                  'p-4 rounded-lg border transition-colors',
                  provider.isActive
                    ? 'bg-slate-800/50 border-slate-600'
                    : 'bg-slate-900/50 border-slate-700 opacity-60'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-700">
                      <ProviderIcon type={provider.type} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-white">{provider.name}</h4>
                        <Badge variant={provider.isActive ? 'success' : 'default'}>
                          {provider.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                        <span className="capitalize">{provider.type}</span>
                        <span>|</span>
                        <span>{provider.modelsCount} models</span>
                        {provider.apiKeySet ? (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle className="w-3 h-3" />
                            API Key Set
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-400">
                            <AlertCircle className="w-3 h-3" />
                            No API Key
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {provider.type !== 'ollama' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Key className="w-4 h-4" />}
                        onClick={() => {
                          setEditingProvider(provider.id);
                          setApiKeyInput('');
                        }}
                      >
                        Set Key
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<RefreshCw className="w-4 h-4" />}
                      onClick={() => handleSyncModels(provider.id)}
                    >
                      Sync
                    </Button>
                    <Button
                      variant={provider.isActive ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => handleToggleProvider(provider.id, provider.isActive)}
                    >
                      {provider.isActive ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>

                {/* API Key Input */}
                {editingProvider === provider.id && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="flex items-center gap-3">
                      <Input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="Enter API key..."
                        className="flex-1"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSaveApiKey(provider.id)}
                        loading={saving}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingProvider(null);
                          setApiKeyInput('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      This key will be used as the system default for all users.
                    </p>
                  </div>
                )}
              </div>
            ))}

            {systemProviders.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <Cloud className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No AI providers configured</p>
                <p className="text-sm mt-1">Add a provider to get started</p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* CLI Authentication Status */}
      <Card variant="pressed">
        <CardHeader
          title="CLI AI Authentication"
          subtitle="Status of CLI-based AI tools (Claude, Gemini, OpenCode)"
        />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['claude', 'gemini', 'opencode'].map((cli) => (
              <div
                key={cli}
                className="p-4 rounded-lg bg-slate-800/50 border border-slate-700"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white capitalize">{cli} CLI</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Terminal className="w-4 h-4" />}
                    onClick={() => navigate('/terminal')}
                  >
                    Check Terminal
                  </Button>
                </div>
                <p className="text-sm text-gray-400">
                  Authenticate via Terminal page
                </p>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-4">
            CLI authentication is managed through the Terminal page.
            Superadmins can authenticate CLI tools there.
          </p>
        </CardBody>
      </Card>
    </div>
  );
};

export default SystemAISettings;
