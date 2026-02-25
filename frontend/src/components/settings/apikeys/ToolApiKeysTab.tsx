/**
 * Tool API Keys Tab
 *
 * Manage API keys for system tools like searchWeb.
 * Supports multiple providers with priority-based fallback.
 */

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Check,
  X,
  AlertCircle,
  Loader2,
  ExternalLink,
  Search,
  GripVertical,
  TestTube,
  Key,
} from 'lucide-react';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { Badge } from '../../common/Badge';
import { Modal } from '../../common/Modal';
import { useToolApiKeyStore, ToolApiKey, ToolProvider } from '@/stores/toolApiKeyStore';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { formatDate } from '@/utils/dateFormat';

// Tool display info
const TOOL_INFO: Record<string, { name: string; description: string; icon: React.ReactNode }> = {
  searchWeb: {
    name: 'Web Search',
    description: 'Search the web for current information. Configure providers for better results.',
    icon: <Search className="w-5 h-5 text-blue-400" />,
  },
};

export const ToolApiKeysTab: React.FC = () => {
  const {
    keys,
    providers,
    loading,
    testing,
    error,
    fetchKeys,
    fetchProviders,
    addKey,
    updateKey,
    deleteKey,
    testKey,
    clearError,
  } = useToolApiKeyStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  // Fetch data on mount
  useEffect(() => {
    fetchKeys();
    fetchProviders();
  }, [fetchKeys, fetchProviders]);

  // Show error toast
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleAddKey = (toolId: string) => {
    setSelectedTool(toolId);
    setShowAddModal(true);
  };

  const handleTestKey = async (keyId: string) => {
    const result = await testKey(keyId);
    if (result.success) {
      toast.success(result.message || 'API key is valid');
    } else {
      toast.error(result.error || 'API key test failed');
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (confirm('Are you sure you want to delete this API key?')) {
      try {
        await deleteKey(keyId);
        toast.success('API key deleted');
      } catch (e) {
        // Error handled by store
      }
    }
  };

  const handleToggleActive = async (key: ToolApiKey) => {
    try {
      await updateKey(key.id, { isActive: !key.isActive });
      toast.success(key.isActive ? 'Provider disabled' : 'Provider enabled');
    } catch (e) {
      // Error handled by store
    }
  };

  const toggleShowApiKey = (keyId: string) => {
    setShowApiKey(prev => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  // Get all tools that have providers
  const toolIds = Object.keys(providers);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Tool API Keys</h3>
          <p className="text-sm text-gray-400 mt-1">
            Configure API keys for tools that connect to external services.
            Keys are tried in priority order with automatic fallback.
          </p>
        </div>
      </div>

      {/* Loading state */}
      {loading && toolIds.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="ml-2 text-gray-400">Loading...</span>
        </div>
      )}

      {/* Tool sections */}
      {toolIds.map(toolId => (
        <ToolSection
          key={toolId}
          toolId={toolId}
          toolInfo={TOOL_INFO[toolId] || { name: toolId, description: '', icon: <Key className="w-5 h-5" /> }}
          keys={keys[toolId] || []}
          providers={providers[toolId] || []}
          testing={testing}
          showApiKey={showApiKey}
          onAddKey={() => handleAddKey(toolId)}
          onTestKey={handleTestKey}
          onDeleteKey={handleDeleteKey}
          onToggleActive={handleToggleActive}
          onToggleShowKey={toggleShowApiKey}
        />
      ))}

      {/* Empty state */}
      {toolIds.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-400">
          <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No tools requiring API keys found.</p>
        </div>
      )}

      {/* Add Key Modal */}
      {showAddModal && selectedTool && (
        <AddKeyModal
          toolId={selectedTool}
          providers={providers[selectedTool] || []}
          existingProviders={(keys[selectedTool] || []).map(k => k.provider)}
          onClose={() => {
            setShowAddModal(false);
            setSelectedTool(null);
          }}
          onAdd={async (provider, apiKey) => {
            try {
              await addKey(selectedTool, provider, apiKey);
              toast.success('API key added successfully');
              setShowAddModal(false);
              setSelectedTool(null);
            } catch (e) {
              // Error handled by store
            }
          }}
        />
      )}
    </div>
  );
};

// Tool Section Component
interface ToolSectionProps {
  toolId: string;
  toolInfo: { name: string; description: string; icon: React.ReactNode };
  keys: ToolApiKey[];
  providers: ToolProvider[];
  testing: string | null;
  showApiKey: Record<string, boolean>;
  onAddKey: () => void;
  onTestKey: (keyId: string) => void;
  onDeleteKey: (keyId: string) => void;
  onToggleActive: (key: ToolApiKey) => void;
  onToggleShowKey: (keyId: string) => void;
}

const ToolSection: React.FC<ToolSectionProps> = ({
  toolId,
  toolInfo,
  keys,
  providers,
  testing,
  showApiKey,
  onAddKey,
  onTestKey,
  onDeleteKey,
  onToggleActive,
  onToggleShowKey,
}) => {
  // Get available providers (not yet configured)
  const configuredProviderIds = keys.map(k => k.provider);
  const availableProviders = providers.filter(
    p => p.keyRequired && !configuredProviderIds.includes(p.id)
  );

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
      {/* Tool Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {toolInfo.icon}
            <div>
              <h4 className="font-semibold text-white">{toolInfo.name}</h4>
              <p className="text-sm text-gray-400">{toolInfo.description}</p>
            </div>
          </div>
          {availableProviders.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAddKey}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Provider
            </Button>
          )}
        </div>
      </div>

      {/* Configured Keys */}
      <div className="divide-y divide-slate-700/50">
        {keys.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            <p className="mb-2">No API keys configured</p>
            <p className="text-sm">
              Add a provider like Brave Search for better results.
              DuckDuckGo (free, limited) will be used as fallback.
            </p>
          </div>
        ) : (
          keys.map((key, index) => (
            <KeyRow
              key={key.id}
              keyData={key}
              provider={providers.find(p => p.id === key.provider)}
              priority={index + 1}
              isTesting={testing === key.id}
              showKey={showApiKey[key.id] || false}
              onTest={() => onTestKey(key.id)}
              onDelete={() => onDeleteKey(key.id)}
              onToggleActive={() => onToggleActive(key)}
              onToggleShowKey={() => onToggleShowKey(key.id)}
            />
          ))
        )}
      </div>

      {/* Free fallback info */}
      <div className="p-3 bg-slate-900/50 border-t border-slate-700/50">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>
            DuckDuckGo Instant Answers (free, limited results) is always available as fallback
          </span>
        </div>
      </div>
    </div>
  );
};

// Key Row Component
interface KeyRowProps {
  keyData: ToolApiKey;
  provider: ToolProvider | undefined;
  priority: number;
  isTesting: boolean;
  showKey: boolean;
  onTest: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onToggleShowKey: () => void;
}

const KeyRow: React.FC<KeyRowProps> = ({
  keyData,
  provider,
  priority,
  isTesting,
  showKey,
  onTest,
  onDelete,
  onToggleActive,
  onToggleShowKey,
}) => {
  return (
    <div
      className={cn(
        'p-4 flex items-center gap-4 transition-colors',
        !keyData.isActive && 'opacity-50 bg-slate-900/30'
      )}
    >
      {/* Priority indicator */}
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-gray-600 cursor-grab" />
        <span className="text-sm font-mono text-gray-500 w-4">#{priority}</span>
      </div>

      {/* Provider info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{provider?.name || keyData.provider}</span>
          {keyData.lastError && (
            <Badge variant="error" size="sm">
              Error
            </Badge>
          )}
          {!keyData.isActive && (
            <Badge variant="default" size="sm">
              Disabled
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
          <span className="font-mono text-xs">
            {showKey ? keyData.apiKeyMasked : '••••••••••••'}
          </span>
          {keyData.lastUsedAt && (
            <span>Last used: {formatDate(keyData.lastUsedAt)}</span>
          )}
          {keyData.lastError && (
            <span className="text-red-400 truncate max-w-xs" title={keyData.lastError}>
              {keyData.lastError}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleShowKey}
          title={showKey ? 'Hide key' : 'Show key'}
        >
          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onTest}
          disabled={isTesting}
          title="Test API key"
        >
          {isTesting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <TestTube className="w-4 h-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleActive}
          title={keyData.isActive ? 'Disable' : 'Enable'}
        >
          {keyData.isActive ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <X className="w-4 h-4 text-gray-400" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-red-400 hover:text-red-300"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

// Add Key Modal Component
interface AddKeyModalProps {
  toolId: string;
  providers: ToolProvider[];
  existingProviders: string[];
  onClose: () => void;
  onAdd: (provider: string, apiKey: string) => Promise<void>;
}

const AddKeyModal: React.FC<AddKeyModalProps> = ({
  toolId,
  providers,
  existingProviders,
  onClose,
  onAdd,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Filter to providers that require keys and aren't already configured
  const availableProviders = providers.filter(
    p => p.keyRequired && !existingProviders.includes(p.id)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider || !apiKey) return;

    setLoading(true);
    try {
      await onAdd(selectedProvider, apiKey);
    } finally {
      setLoading(false);
    }
  };

  const selectedProviderInfo = providers.find(p => p.id === selectedProvider);

  return (
    <Modal open onClose={onClose} title="Add API Key" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Provider selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Select Provider
          </label>
          <div className="grid gap-2">
            {availableProviders.map(provider => (
              <button
                key={provider.id}
                type="button"
                onClick={() => setSelectedProvider(provider.id)}
                className={cn(
                  'p-3 rounded-lg border text-left transition-all',
                  selectedProvider === provider.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{provider.name}</span>
                  {provider.docsUrl && (
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
                <p className="text-sm text-gray-400 mt-1">{provider.description}</p>
              </button>
            ))}
          </div>
          {availableProviders.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              All available providers are already configured.
            </p>
          )}
        </div>

        {/* API Key input */}
        {selectedProvider && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              API Key
            </label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={`Enter your ${selectedProviderInfo?.name} API key`}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {selectedProviderInfo?.docsUrl && (
              <p className="text-xs text-gray-400 mt-2">
                Get your API key from{' '}
                <a
                  href={selectedProviderInfo.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  {selectedProviderInfo.name}
                </a>
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!selectedProvider || !apiKey || loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Adding...
              </>
            ) : (
              'Add API Key'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ToolApiKeysTab;
