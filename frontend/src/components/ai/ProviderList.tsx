import React, { useState, useCallback } from 'react';
import {
  Cloud,
  Server,
  Cpu,
  Globe,
  Plus,
  Settings,
  PlayCircle,
  Trash2,
  Star,
  Check,
  X,
  AlertCircle,
  MoreVertical,
  Terminal,
  Monitor,
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { ConfirmDialog } from '../common';
import { useAIStore } from '../../stores/aiStore';
import { AIProvider, AIProviderType } from '../../types';
import { cn } from '../../lib/utils';
import { AddProviderModal } from './AddProviderModal';

/**
 * Provider icon mapping based on provider type
 */
const ProviderIcon: React.FC<{ type: AIProviderType; className?: string }> = ({
  type,
  className = 'w-5 h-5',
}) => {
  const icons: Record<AIProviderType, React.ReactNode> = {
    openrouter: <Globe className={cn(className, 'text-purple-400')} />,
    ollama: <Server className={cn(className, 'text-green-400')} />,
    anthropic: <Cpu className={cn(className, 'text-orange-400')} />,
    google: <Cloud className={cn(className, 'text-blue-400')} />,
    'openai-compatible': <Cloud className={cn(className, 'text-sky-400')} />,
    'cli-claude': <Terminal className={cn(className, 'text-orange-400')} />,
    'cli-gemini': <Terminal className={cn(className, 'text-blue-400')} />,
    'cli-opencode': <Terminal className={cn(className, 'text-emerald-400')} />,
    'local-agent': <Monitor className={cn(className, 'text-cyan-400')} />,
    groq: <Cpu className={cn(className, 'text-green-400')} />,
    'openai-whisper': <Cloud className={cn(className, 'text-teal-400')} />,
  };

  return <>{icons[type] || <Cloud className={className} />}</>;
};

/**
 * Status indicator dot
 */
const StatusDot: React.FC<{ connected: boolean; className?: string }> = ({
  connected,
  className,
}) => (
  <span
    className={cn(
      'w-2.5 h-2.5 rounded-full',
      connected ? 'bg-emerald-400' : 'bg-red-400',
      className
    )}
    title={connected ? 'Connected' : 'Disconnected'}
  />
);

/**
 * Provider type display names
 */
const providerTypeNames: Record<AIProviderType, string> = {
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
  anthropic: 'Anthropic',
  google: 'Google AI',
  'openai-compatible': 'OpenAI Compatible',
  'cli-claude': 'Claude CLI',
  'cli-gemini': 'Gemini CLI',
  'cli-opencode': 'OpenCode CLI',
  'local-agent': 'Local Agent',
  groq: 'Groq',
  'openai-whisper': 'OpenAI Whisper',
};

/**
 * Individual provider card component
 */
interface ProviderCardProps {
  provider: AIProvider;
  onEdit: () => void;
  onTest: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  isLoading?: boolean;
  testResult?: 'success' | 'error' | null;
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  onEdit,
  onTest,
  onSetDefault,
  onDelete,
  isLoading,
  testResult,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <Card variant="pressed-glow" glowColor="purple">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
              <ProviderIcon type={provider.type} className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-white truncate">{provider.name}</h3>
                {provider.isDefault && (
                  <Badge variant="success" size="sm">
                    <Star className="w-3 h-3 mr-1" />
                    Default
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-400 truncate">
                {providerTypeNames[provider.type]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot connected={provider.isActive} />
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-40 bg-slate-700 border border-slate-600 rounded-lg shadow-lg z-20 py-1">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onEdit();
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-slate-600 flex items-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      Edit
                    </button>
                    {!provider.isDefault && (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          onSetDefault();
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-slate-600 flex items-center gap-2"
                      >
                        <Star className="w-4 h-4" />
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onDelete();
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-600 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Provider details */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm">
            <span className="text-gray-500 w-20">Base URL:</span>
            <span className="text-gray-300 truncate flex-1">{provider.baseUrl}</span>
          </div>
          <div className="flex items-center text-sm">
            <span className="text-gray-500 w-20">Models:</span>
            <span className="text-gray-300">
              {provider.models.length} available
            </span>
          </div>
          {provider.budgetLimit && (
            <div className="flex items-center text-sm">
              <span className="text-gray-500 w-20">Budget:</span>
              <span className="text-gray-300">
                ${provider.budgetUsed.toFixed(2)} / ${provider.budgetLimit.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Test result indicator */}
        {testResult && (
          <div
            className={cn(
              'flex items-center gap-2 mb-3 p-2 rounded-lg text-sm',
              testResult === 'success'
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            )}
          >
            {testResult === 'success' ? (
              <>
                <Check className="w-4 h-4" />
                Connection successful
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4" />
                Connection failed
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onTest}
            loading={isLoading}
            icon={<PlayCircle className="w-4 h-4" />}
          >
            Test
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            icon={<Settings className="w-4 h-4" />}
          >
            Edit
          </Button>
          {!provider.isDefault && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="text-red-400 hover:text-red-300"
              icon={<Trash2 className="w-4 h-4" />}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

/**
 * ProviderList Component
 *
 * Displays a list of configured AI providers with actions to edit, test, and manage them.
 */
export const ProviderList: React.FC = () => {
  const { providers, loading, testProvider, setDefaultProvider, deleteProvider } =
    useAIStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error'>>({});
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * Handle test provider connection
   */
  const handleTest = useCallback(
    async (id: string) => {
      setTestingId(id);
      try {
        const success = await testProvider(id);
        setTestResults((prev) => ({
          ...prev,
          [id]: success ? 'success' : 'error',
        }));
        // Clear result after 5 seconds
        setTimeout(() => {
          setTestResults((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }, 5000);
      } finally {
        setTestingId(null);
      }
    },
    [testProvider]
  );

  /**
   * Handle set default provider
   */
  const handleSetDefault = useCallback(
    async (id: string) => {
      await setDefaultProvider(id);
    },
    [setDefaultProvider]
  );

  /**
   * Handle delete provider click - opens confirm dialog
   */
  const handleDeleteClick = useCallback((id: string) => {
    setDeleteDialog({ open: true, id });
  }, []);

  /**
   * Handle delete provider confirm
   */
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteDialog.id) return;
    setIsDeleting(true);
    try {
      await deleteProvider(deleteDialog.id);
      setDeleteDialog({ open: false, id: null });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteDialog.id, deleteProvider]);

  /**
   * Handle edit provider
   */
  const handleEdit = useCallback((provider: AIProvider) => {
    setEditingProvider(provider);
    setShowAddModal(true);
  }, []);

  /**
   * Handle close modal
   */
  const handleCloseModal = useCallback(() => {
    setShowAddModal(false);
    setEditingProvider(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header with add button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">AI Providers</h2>
          <p className="text-sm text-gray-400">
            Configure and manage your AI provider connections
          </p>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          Add Provider
        </Button>
      </div>

      {/* Provider list */}
      {loading && providers.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span>Loading providers...</span>
          </div>
        </div>
      ) : providers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onEdit={() => handleEdit(provider)}
              onTest={() => handleTest(provider.id)}
              onSetDefault={() => handleSetDefault(provider.id)}
              onDelete={() => handleDeleteClick(provider.id)}
              isLoading={testingId === provider.id}
              testResult={testResults[provider.id] || null}
            />
          ))}
        </div>
      ) : (
        /* Empty state */
        <Card variant="pressed" className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center mb-4">
              <Cloud className="w-8 h-8 text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              No providers configured
            </h3>
            <p className="text-gray-400 max-w-md mb-6">
              Add an AI provider to start using AI capabilities in your agents.
              You can connect to OpenRouter, Ollama, Anthropic, Google AI, or any
              OpenAI-compatible API.
            </p>
            <Button
              onClick={() => setShowAddModal(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              Add Your First Provider
            </Button>
          </div>
        </Card>
      )}

      {/* Add/Edit Provider Modal */}
      <AddProviderModal
        open={showAddModal}
        onClose={handleCloseModal}
        editProvider={editingProvider}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, id: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete Provider"
        message="Are you sure you want to delete this provider? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  );
};

export default ProviderList;
