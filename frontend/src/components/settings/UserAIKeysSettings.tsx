import React, { useState, useEffect } from 'react';
import {
  Key,
  Cloud,
  Globe,
  Server,
  Cpu,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Badge } from '../common/Badge';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDate } from '../../utils/dateFormat';

/**
 * User AI key interface
 */
interface UserAIKey {
  id: string;
  providerType: string;
  providerName: string;
  hasKey: boolean;
  lastUsed?: string;
}

/**
 * Provider metadata
 */
const providerMeta: Record<string, { name: string; icon: React.FC<{ className?: string }>; color: string }> = {
  openrouter: { name: 'OpenRouter', icon: Globe, color: 'text-purple-400' },
  ollama: { name: 'Ollama', icon: Server, color: 'text-green-400' },
  anthropic: { name: 'Anthropic', icon: Cpu, color: 'text-orange-400' },
  google: { name: 'Google AI', icon: Cloud, color: 'text-blue-400' },
  'openai-compatible': { name: 'OpenAI Compatible', icon: Cloud, color: 'text-sky-400' },
};

/**
 * UserAIKeysSettings Component
 *
 * Allows users to manage their personal AI API keys.
 * These keys override system defaults when set.
 */
export const UserAIKeysSettings: React.FC = () => {
  const [userKeys, setUserKeys] = useState<UserAIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUserKeys();
  }, []);

  const fetchUserKeys = async () => {
    setLoading(true);
    try {
      const response = await api.get('/users/ai-keys');
      setUserKeys(response.data.keys || []);
    } catch (error) {
      console.error('Failed to fetch user AI keys:', error);
      // Set default providers if fetch fails
      setUserKeys(
        Object.entries(providerMeta).map(([type, meta]) => ({
          id: type,
          providerType: type,
          providerName: meta.name,
          hasKey: false,
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = async (providerType: string) => {
    if (!apiKeyInput.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    setSaving(true);
    try {
      await api.post('/users/ai-keys', {
        providerType,
        apiKey: apiKeyInput,
      });
      toast.success('API key saved');
      setEditingProvider(null);
      setApiKeyInput('');
      fetchUserKeys();
    } catch (error) {
      console.error('Failed to save API key:', error);
      toast.error('Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (providerType: string) => {
    try {
      await api.delete(`/users/ai-keys/${providerType}`);
      toast.success('API key removed');
      fetchUserKeys();
    } catch (error) {
      console.error('Failed to delete API key:', error);
      toast.error('Failed to delete API key');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <Card variant="bordered" className="border-sky-500/50 bg-sky-500/10">
        <CardBody className="py-3">
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-sky-400 flex-shrink-0" />
            <div className="text-sm text-sky-200">
              <strong>Personal API Keys:</strong> Add your own API keys to use instead of the system defaults.
              Your keys are encrypted and only used for your requests.
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Provider Keys */}
      <Card variant="pressed">
        <CardHeader
          title="Your AI Provider Keys"
          subtitle="Manage personal API keys for AI providers"
        />
        <CardBody>
          <div className="space-y-4">
            {Object.entries(providerMeta).map(([type, meta]) => {
              const userKey = userKeys.find((k) => k.providerType === type);
              const Icon = meta.icon;
              const hasKey = userKey?.hasKey || false;

              // Skip Ollama since it doesn't need API keys
              if (type === 'ollama') return null;

              return (
                <div
                  key={type}
                  className={cn(
                    'p-4 rounded-lg border transition-colors',
                    hasKey
                      ? 'bg-slate-800/50 border-emerald-500/30'
                      : 'bg-slate-900/50 border-slate-700'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-700">
                        <Icon className={cn('w-5 h-5', meta.color)} />
                      </div>
                      <div>
                        <h4 className="font-medium text-white">{meta.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          {hasKey ? (
                            <span className="flex items-center gap-1 text-sm text-emerald-400">
                              <CheckCircle className="w-3 h-3" />
                              Personal key set
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-sm text-gray-400">
                              <AlertCircle className="w-3 h-3" />
                              Using system default
                            </span>
                          )}
                          {userKey?.lastUsed && (
                            <span className="text-xs text-gray-500">
                              Last used: {formatDate(userKey.lastUsed)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {hasKey && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 className="w-4 h-4" />}
                          onClick={() => handleDeleteKey(type)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Remove
                        </Button>
                      )}
                      <Button
                        variant={hasKey ? 'secondary' : 'primary'}
                        size="sm"
                        icon={<Key className="w-4 h-4" />}
                        onClick={() => {
                          setEditingProvider(type);
                          setApiKeyInput('');
                          setShowKey(false);
                        }}
                      >
                        {hasKey ? 'Update Key' : 'Add Key'}
                      </Button>
                    </div>
                  </div>

                  {/* API Key Input */}
                  {editingProvider === type && (
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <Input
                            type={showKey ? 'text' : 'password'}
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder={`Enter your ${meta.name} API key...`}
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                          >
                            {showKey ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Save className="w-4 h-4" />}
                          onClick={() => handleSaveKey(type)}
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
                        Your key will be encrypted and stored securely. It will override the system default for your requests only.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Security Note */}
      <Card variant="pressed">
        <CardBody className="py-4">
          <h4 className="font-medium text-white mb-2">Security Notes</h4>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              API keys are encrypted at rest using AES-256 encryption
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              Keys are only decrypted when making API calls to the respective provider
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              Personal keys are never shared or accessible to other users
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              You can remove your keys at any time to revert to system defaults
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
};

export default UserAIKeysSettings;
