import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Play,
  Pause,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Settings,
  Zap,
  History,
  Target,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Tabs } from '../common/Tabs';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDateTime } from '@/utils/dateFormat';

export interface SelfPromptingPanelProps {
  agenticId: string;
  className?: string;
}

interface SelfPrompt {
  id: string;
  agenticId: string;
  promptType: string;
  content: string;
  reasoning: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'approved' | 'executed' | 'rejected' | 'expired';
  goalId?: string;
  taskId?: string;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
  expiresAt?: string;
}

interface SelfPromptConfig {
  enabled: boolean;
  checkIntervalMinutes: number;
  maxPromptsPerHour: number;
  autoApproveTypes: string[];
  requireApprovalTypes: string[];
  goalCheckEnabled: boolean;
  messageCheckEnabled: boolean;
  taskCheckEnabled: boolean;
  learningEnabled: boolean;
}

const priorityConfig = {
  low: { color: 'text-gray-400', bg: 'bg-gray-500/10', label: 'Low' },
  medium: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Medium' },
  high: { color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'High' },
  critical: { color: 'text-red-400', bg: 'bg-red-500/10', label: 'Critical' },
};

const statusConfig = {
  pending: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Pending' },
  approved: { icon: CheckCircle2, color: 'text-sky-400', bg: 'bg-sky-500/10', label: 'Approved' },
  executed: { icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Executed' },
  rejected: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Rejected' },
  expired: { icon: AlertTriangle, color: 'text-gray-400', bg: 'bg-gray-500/10', label: 'Expired' },
};

const promptTypeLabels: Record<string, string> = {
  goal_check: 'Goal Progress Check',
  message_response: 'Message Response',
  task_creation: 'Task Creation',
  task_assignment: 'Task Assignment',
  learning: 'Knowledge Learning',
  schedule_action: 'Scheduled Action',
  escalation: 'Escalation',
  report: 'Report Generation',
};

export const SelfPromptingPanel: React.FC<SelfPromptingPanelProps> = ({
  agenticId,
  className,
}) => {
  const [activeTab, setActiveTab] = useState('pending');
  const [prompts, setPrompts] = useState<SelfPrompt[]>([]);
  const [pendingPrompts, setPendingPrompts] = useState<SelfPrompt[]>([]);
  const [config, setConfig] = useState<SelfPromptConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch pending prompts
  const fetchPendingPrompts = useCallback(async () => {
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/self-prompts/pending`);
      setPendingPrompts(response.data.prompts || []);
    } catch (error) {
      console.error('Failed to fetch pending prompts:', error);
    }
  }, [agenticId]);

  // Fetch prompt history
  const fetchPromptHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/agentic/profiles/${agenticId}/self-prompts?pageSize=50`);
      setPrompts(response.data.prompts || []);
    } catch (error) {
      console.error('Failed to fetch prompt history:', error);
      toast.error('Failed to load prompt history');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId]);

  // Fetch config
  const fetchConfig = useCallback(async () => {
    try {
      setIsLoadingConfig(true);
      const response = await api.get(`/agentic/profiles/${agenticId}/self-prompts/config`);
      setConfig(response.data);
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setIsLoadingConfig(false);
    }
  }, [agenticId]);

  useEffect(() => {
    fetchPendingPrompts();
    fetchPromptHistory();
    fetchConfig();
  }, [fetchPendingPrompts, fetchPromptHistory, fetchConfig]);

  // Approve prompt
  const handleApprove = async (promptId: string) => {
    setProcessingId(promptId);
    try {
      await api.post(`/agentic/profiles/${agenticId}/self-prompts/${promptId}/approve`);
      toast.success('Prompt approved');
      fetchPendingPrompts();
      fetchPromptHistory();
    } catch (error) {
      console.error('Failed to approve prompt:', error);
      toast.error('Failed to approve prompt');
    } finally {
      setProcessingId(null);
    }
  };

  // Reject prompt
  const handleReject = async (promptId: string) => {
    setProcessingId(promptId);
    try {
      await api.post(`/agentic/profiles/${agenticId}/self-prompts/${promptId}/reject`);
      toast.success('Prompt rejected');
      fetchPendingPrompts();
      fetchPromptHistory();
    } catch (error) {
      console.error('Failed to reject prompt:', error);
      toast.error('Failed to reject prompt');
    } finally {
      setProcessingId(null);
    }
  };

  // Execute prompt
  const handleExecute = async (promptId: string) => {
    setProcessingId(promptId);
    try {
      await api.post(`/agentic/profiles/${agenticId}/self-prompts/${promptId}/execute`);
      toast.success('Prompt executed successfully');
      fetchPendingPrompts();
      fetchPromptHistory();
    } catch (error) {
      console.error('Failed to execute prompt:', error);
      toast.error('Failed to execute prompt');
    } finally {
      setProcessingId(null);
    }
  };

  // Save config
  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      await api.put(`/agentic/profiles/${agenticId}/self-prompts/config`, config);
      toast.success('Configuration saved');
      setShowConfigModal(false);
    } catch (error) {
      console.error('Failed to save config:', error);
      toast.error('Failed to save configuration');
    }
  };

  // Render prompt card
  const renderPromptCard = (prompt: SelfPrompt, showActions: boolean = false) => {
    const status = statusConfig[prompt.status];
    const priority = priorityConfig[prompt.priority];
    const StatusIcon = status.icon;
    const isExpanded = expandedPrompt === prompt.id;
    const isProcessing = processingId === prompt.id;

    return (
      <div
        key={prompt.id}
        className="p-4 bg-swarm-darker rounded-xl border border-swarm-border/20 hover:border-swarm-border/40 transition-colors"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <StatusIcon className={cn('w-4 h-4', status.color)} />
            <span className="text-sm font-medium text-white">
              {promptTypeLabels[prompt.promptType] || prompt.promptType}
            </span>
            <Badge variant="default" size="sm" className={priority.bg}>
              <span className={priority.color}>{priority.label}</span>
            </Badge>
          </div>
          <Badge variant="default" size="sm" className={status.bg}>
            <span className={status.color}>{status.label}</span>
          </Badge>
        </div>

        {/* Content Preview */}
        <p className={cn('text-sm text-gray-300 mb-2', !isExpanded && 'line-clamp-2')}>
          {prompt.content}
        </p>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="space-y-3 mt-3 pt-3 border-t border-swarm-border/20">
            {prompt.reasoning && (
              <div>
                <span className="text-xs text-gray-500">Reasoning:</span>
                <p className="text-sm text-gray-400 mt-1">{prompt.reasoning}</p>
              </div>
            )}
            {prompt.result && (
              <div>
                <span className="text-xs text-gray-500">Result:</span>
                <p className="text-sm text-emerald-400 mt-1">{prompt.result}</p>
              </div>
            )}
            {prompt.error && (
              <div>
                <span className="text-xs text-gray-500">Error:</span>
                <p className="text-sm text-red-400 mt-1">{prompt.error}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-swarm-border/10">
          <span className="text-xs text-gray-500">{formatDateTime(prompt.createdAt)}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpandedPrompt(isExpanded ? null : prompt.id)}
              className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
            >
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {isExpanded ? 'Less' : 'More'}
            </button>
            {showActions && prompt.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleReject(prompt.id)}
                  disabled={isProcessing}
                  className="text-red-400 hover:text-red-300"
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleApprove(prompt.id)}
                  disabled={isProcessing}
                  loading={isProcessing}
                >
                  Approve
                </Button>
              </>
            )}
            {prompt.status === 'approved' && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleExecute(prompt.id)}
                disabled={isProcessing}
                loading={isProcessing}
                icon={<Zap className="w-3 h-3" />}
              >
                Execute
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-400" />
          <h4 className="text-sm font-medium text-gray-400">Self-Prompting Engine</h4>
          {config && (
            <Badge
              variant={config.enabled ? 'success' : 'default'}
              size="sm"
              dot
              pulse={config.enabled}
            >
              {config.enabled ? 'Active' : 'Disabled'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              fetchPendingPrompts();
              fetchPromptHistory();
            }}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowConfigModal(true)}
            icon={<Settings className="w-4 h-4" />}
          >
            Configure
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      {config && (
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-500">Check Interval</span>
            </div>
            <span className="text-lg font-semibold text-white">{config.checkIntervalMinutes}m</span>
          </div>
          <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-gray-500">Pending</span>
            </div>
            <span className="text-lg font-semibold text-amber-400">{pendingPrompts.length}</span>
          </div>
          <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-sky-400" />
              <span className="text-xs text-gray-500">Goal Check</span>
            </div>
            <span className="text-lg font-semibold text-sky-400">
              {config.goalCheckEnabled ? 'On' : 'Off'}
            </span>
          </div>
          <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-gray-500">Learning</span>
            </div>
            <span className="text-lg font-semibold text-purple-400">
              {config.learningEnabled ? 'On' : 'Off'}
            </span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Trigger value="pending" icon={<Clock className="w-4 h-4" />}>
            Pending ({pendingPrompts.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="history" icon={<History className="w-4 h-4" />}>
            History
          </Tabs.Trigger>
        </Tabs.List>

        {/* Pending Tab */}
        <Tabs.Content value="pending" className="mt-4">
          {pendingPrompts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No pending self-prompts</p>
              <p className="text-xs mt-1">The AI will generate prompts based on goals and events</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingPrompts.map((prompt) => renderPromptCard(prompt, true))}
            </div>
          )}
        </Tabs.Content>

        {/* History Tab */}
        <Tabs.Content value="history" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
            </div>
          ) : prompts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No prompt history yet</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {prompts.map((prompt) => renderPromptCard(prompt))}
            </div>
          )}
        </Tabs.Content>
      </Tabs>

      {/* Config Modal */}
      <Modal
        open={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title="Self-Prompting Configuration"
        size="md"
      >
        {config && (
          <div className="space-y-6 p-4">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-3 bg-swarm-darker rounded-lg">
              <div>
                <span className="font-medium text-white">Enable Self-Prompting</span>
                <p className="text-xs text-gray-500 mt-1">
                  Allow the AI to generate action prompts autonomously
                </p>
              </div>
              <button
                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                className={cn(
                  'w-12 h-6 rounded-full transition-colors relative',
                  config.enabled ? 'bg-emerald-500' : 'bg-gray-600'
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all',
                    config.enabled ? 'left-6' : 'left-0.5'
                  )}
                />
              </button>
            </div>

            {/* Check Interval */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Check Interval (minutes)
              </label>
              <Input
                type="number"
                value={config.checkIntervalMinutes}
                onChange={(e) =>
                  setConfig({ ...config, checkIntervalMinutes: parseInt(e.target.value) || 5 })
                }
                min={1}
                max={60}
              />
              <p className="text-xs text-gray-500 mt-1">
                How often the AI checks for actions to take
              </p>
            </div>

            {/* Max Prompts Per Hour */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Max Prompts Per Hour
              </label>
              <Input
                type="number"
                value={config.maxPromptsPerHour}
                onChange={(e) =>
                  setConfig({ ...config, maxPromptsPerHour: parseInt(e.target.value) || 10 })
                }
                min={1}
                max={100}
              />
            </div>

            {/* Feature Toggles */}
            <div className="space-y-3">
              <span className="text-sm font-medium text-gray-300">Features</span>
              {[
                { key: 'goalCheckEnabled', label: 'Goal Progress Checks', icon: Target },
                { key: 'messageCheckEnabled', label: 'Message Monitoring', icon: Brain },
                { key: 'taskCheckEnabled', label: 'Task Management', icon: CheckCircle2 },
                { key: 'learningEnabled', label: 'Auto-Learning', icon: Zap },
              ].map(({ key, label, icon: Icon }) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-2 bg-swarm-dark rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-300">{label}</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!config[key as keyof SelfPromptConfig]}
                    onClick={() =>
                      setConfig({ ...config, [key]: !config[key as keyof SelfPromptConfig] })
                    }
                    className={cn(
                      'w-9 h-5 relative inline-flex flex-shrink-0 rounded-full p-0.5 transition-colors duration-200',
                      config[key as keyof SelfPromptConfig] ? 'bg-sky-500' : 'bg-slate-600'
                    )}
                  >
                    <span
                      className={cn(
                        'w-3.5 h-3.5 inline-block rounded-full bg-white shadow-sm transform transition-transform duration-200',
                        config[key as keyof SelfPromptConfig] ? 'translate-x-4' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t border-swarm-border/20">
              <Button variant="ghost" onClick={() => setShowConfigModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveConfig}>
                Save Configuration
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SelfPromptingPanel;
