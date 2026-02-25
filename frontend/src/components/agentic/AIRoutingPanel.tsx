import React, { useState, useEffect, useCallback } from 'react';
import {
  Route,
  Save,
  RotateCcw,
  Zap,
  Mail,
  MessageSquare,
  Brain,
  Users,
  AlertTriangle,
  Database,
  ChevronDown,
  ChevronRight,
  Settings2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import toast from 'react-hot-toast';
import api from '../../services/api';

// Types
interface RoutingRule {
  id?: string;
  taskType: string;
  providerChain: Array<{ provider: string; model: string }>;
  temperature: number;
  maxTokens: number;
  systemPromptOverride?: string;
  maxRetries: number;
  retryDelayMs: number;
  timeoutSeconds: number;
  priority: string;
  isActive: boolean;
}

interface RoutingConfig {
  preset: string;
  rules: RoutingRule[];
}

export interface AIRoutingPanelProps {
  /** Agentic profile ID */
  agenticId: string;
  /** Additional className */
  className?: string;
}

// Task type configurations
const taskTypeConfig: Record<string, { icon: React.ElementType; color: string; label: string; category: string }> = {
  // Email tasks
  email_draft: { icon: Mail, color: 'text-blue-400', label: 'Draft Email', category: 'Email' },
  email_send: { icon: Mail, color: 'text-blue-400', label: 'Send Email', category: 'Email' },
  // Messaging tasks
  message_respond: { icon: MessageSquare, color: 'text-green-400', label: 'Respond to Message', category: 'Messaging' },
  message_classify: { icon: MessageSquare, color: 'text-green-400', label: 'Classify Message', category: 'Messaging' },
  // Task management
  task_analyze: { icon: Zap, color: 'text-yellow-400', label: 'Analyze Task', category: 'Tasks' },
  task_assign: { icon: Zap, color: 'text-yellow-400', label: 'Assign Task', category: 'Tasks' },
  task_summarize: { icon: Zap, color: 'text-yellow-400', label: 'Summarize Task', category: 'Tasks' },
  task_prioritize: { icon: Zap, color: 'text-yellow-400', label: 'Prioritize Tasks', category: 'Tasks' },
  // Knowledge
  rag_query: { icon: Database, color: 'text-purple-400', label: 'RAG Query', category: 'Knowledge' },
  knowledge_extract: { icon: Database, color: 'text-purple-400', label: 'Extract Knowledge', category: 'Knowledge' },
  knowledge_summarize: { icon: Database, color: 'text-purple-400', label: 'Summarize Knowledge', category: 'Knowledge' },
  // Self-management
  self_prompt: { icon: Brain, color: 'text-teal-400', label: 'Self Prompt', category: 'Self-Management' },
  self_schedule: { icon: Brain, color: 'text-teal-400', label: 'Self Schedule', category: 'Self-Management' },
  self_reflect: { icon: Brain, color: 'text-teal-400', label: 'Self Reflect', category: 'Self-Management' },
  // Multi-agent
  agent_create: { icon: Users, color: 'text-pink-400', label: 'Create Agent', category: 'Multi-Agent' },
  agent_communicate: { icon: Users, color: 'text-pink-400', label: 'Agent Communication', category: 'Multi-Agent' },
  agent_delegate: { icon: Users, color: 'text-pink-400', label: 'Delegate Task', category: 'Multi-Agent' },
  // Decision
  decision_simple: { icon: Route, color: 'text-orange-400', label: 'Simple Decision', category: 'Decision' },
  decision_complex: { icon: Route, color: 'text-orange-400', label: 'Complex Decision', category: 'Decision' },
  escalation_check: { icon: AlertTriangle, color: 'text-red-400', label: 'Escalation Check', category: 'Decision' },
  // Memory
  memory_store: { icon: Database, color: 'text-cyan-400', label: 'Store Memory', category: 'Memory' },
  memory_recall: { icon: Database, color: 'text-cyan-400', label: 'Recall Memory', category: 'Memory' },
  // Default
  default: { icon: Settings2, color: 'text-gray-400', label: 'Default', category: 'Other' },
};

// Group task types by category
const taskTypesByCategory = Object.entries(taskTypeConfig).reduce((acc, [type, config]) => {
  if (!acc[config.category]) acc[config.category] = [];
  acc[config.category].push({ type, ...config });
  return acc;
}, {} as Record<string, Array<{ type: string; icon: React.ElementType; color: string; label: string }>>);

// Routing presets
const routingPresets = [
  { value: 'auto', label: 'Auto (Balanced)', description: 'Automatically selects best model based on task complexity' },
  { value: 'speed', label: 'Speed', description: 'Prioritizes fast response times with lighter models' },
  { value: 'quality', label: 'Quality', description: 'Uses most capable models for best results' },
  { value: 'cost', label: 'Cost-Effective', description: 'Minimizes cost using free/cheap models first' },
  { value: 'custom', label: 'Custom', description: 'Manually configure routing for each task type' },
];

// Default rule template
const defaultRule: Omit<RoutingRule, 'taskType'> = {
  providerChain: [{ provider: '', model: '' }],
  temperature: 0.7,
  maxTokens: 4096,
  maxRetries: 2,
  retryDelayMs: 1000,
  timeoutSeconds: 60,
  priority: 'normal',
  isActive: true,
};

/**
 * AIRoutingPanel - Configure AI routing rules per task type
 */
export const AIRoutingPanel: React.FC<AIRoutingPanelProps> = ({
  agenticId,
  className,
}) => {
  const [config, setConfig] = useState<RoutingConfig>({ preset: 'auto', rules: [] });
  const [providers, setProviders] = useState<Array<{ id: string; name: string; models: string[] }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Email', 'Messaging']));
  const [editingRule, setEditingRule] = useState<string | null>(null);

  // Fetch routing config
  const fetchRouting = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/agentic/profiles/${agenticId}/routing`);
      setConfig(response.data.routing || { preset: 'auto', rules: [] });
    } catch (error) {
      console.error('Failed to fetch routing config:', error);
      toast.error('Failed to load routing configuration');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId]);

  // Fetch available providers
  const fetchProviders = useCallback(async () => {
    try {
      const response = await api.get('/superbrain/providers/available');
      setProviders(response.data.providers || []);
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    }
  }, []);

  useEffect(() => {
    fetchRouting();
    fetchProviders();
  }, [fetchRouting, fetchProviders]);

  // Save routing config
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put(`/agentic/profiles/${agenticId}/routing`, {
        preset: config.preset,
        rules: config.rules,
      });
      toast.success('Routing configuration saved');
    } catch (error) {
      console.error('Failed to save routing:', error);
      toast.error('Failed to save routing configuration');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to defaults
  const handleReset = async () => {
    if (!confirm('Reset routing configuration to defaults?')) return;
    setConfig({ preset: 'auto', rules: [] });
    toast.success('Reset to defaults. Click Save to apply.');
  };

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Get rule for task type
  const getRuleForTask = (taskType: string): RoutingRule => {
    return config.rules.find((r) => r.taskType === taskType) || {
      taskType,
      ...defaultRule,
    };
  };

  // Update rule
  const updateRule = (taskType: string, updates: Partial<RoutingRule>) => {
    const existingIndex = config.rules.findIndex((r) => r.taskType === taskType);
    const newRules = [...config.rules];

    if (existingIndex >= 0) {
      newRules[existingIndex] = { ...newRules[existingIndex], ...updates };
    } else {
      newRules.push({ taskType, ...defaultRule, ...updates });
    }

    setConfig({ ...config, rules: newRules });
  };

  // Remove custom rule (revert to default)
  const removeRule = (taskType: string) => {
    setConfig({
      ...config,
      rules: config.rules.filter((r) => r.taskType !== taskType),
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-400">AI Task Routing</h4>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            icon={<RotateCcw className="w-4 h-4" />}
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            loading={isSaving}
            icon={<Save className="w-4 h-4" />}
          >
            Save
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
        </div>
      ) : (
        <>
          {/* Preset Selector */}
          <div className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Routing Preset
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {routingPresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setConfig({ ...config, preset: preset.value })}
                  className={cn(
                    'p-2 rounded-lg border text-sm transition-colors text-left',
                    config.preset === preset.value
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-swarm-border/20 bg-swarm-dark hover:border-swarm-border/40 text-gray-300'
                  )}
                >
                  <div className="font-medium">{preset.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Rules Section */}
          {config.preset === 'custom' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Configure AI provider and model for each task type. Tasks without custom rules use the default configuration.
              </p>

              {/* Task Categories */}
              {Object.entries(taskTypesByCategory).map(([category, tasks]) => (
                <div
                  key={category}
                  className="bg-swarm-darker rounded-lg border border-swarm-border/20 overflow-hidden"
                >
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between p-3 hover:bg-swarm-dark/50 transition-colors"
                  >
                    <span className="font-medium text-gray-300">{category}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="default" size="sm">
                        {tasks.length} tasks
                      </Badge>
                      {expandedCategories.has(category) ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Task List */}
                  {expandedCategories.has(category) && (
                    <div className="border-t border-swarm-border/10">
                      {tasks.map((task) => {
                        const rule = getRuleForTask(task.type);
                        const hasCustomRule = config.rules.some((r) => r.taskType === task.type);
                        const TaskIcon = task.icon;
                        const isExpanded = editingRule === task.type;

                        return (
                          <div
                            key={task.type}
                            className="border-b border-swarm-border/10 last:border-b-0"
                          >
                            {/* Task Row */}
                            <div
                              className={cn(
                                'flex items-center justify-between p-3 cursor-pointer hover:bg-swarm-dark/30 transition-colors',
                                hasCustomRule && 'bg-sky-500/5'
                              )}
                              onClick={() => setEditingRule(isExpanded ? null : task.type)}
                            >
                              <div className="flex items-center gap-2">
                                <TaskIcon className={cn('w-4 h-4', task.color)} />
                                <span className="text-sm text-gray-300">{task.label}</span>
                                {hasCustomRule && (
                                  <Badge variant="info" size="sm">Custom</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {rule.providerChain[0]?.provider && (
                                  <span className="text-xs text-gray-500">
                                    {rule.providerChain[0].provider} / {rule.providerChain[0].model?.split('/').pop() || 'default'}
                                  </span>
                                )}
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-400" />
                                )}
                              </div>
                            </div>

                            {/* Expanded Config */}
                            {isExpanded && (
                              <div className="p-4 bg-swarm-dark/50 space-y-4">
                                {/* Provider and Model */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">
                                      AI Provider
                                    </label>
                                    <select
                                      value={rule.providerChain[0]?.provider || ''}
                                      onChange={(e) => updateRule(task.type, {
                                        providerChain: [{ provider: e.target.value, model: '' }],
                                      })}
                                      className="w-full px-2 py-1.5 text-sm bg-swarm-dark border border-swarm-border/30 rounded text-gray-300"
                                      title="Select AI provider"
                                      aria-label="AI Provider"
                                    >
                                      <option value="">Default</option>
                                      {providers.map((p) => (
                                        <option key={p.id} value={p.name}>{p.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">
                                      Model
                                    </label>
                                    <select
                                      value={rule.providerChain[0]?.model || ''}
                                      onChange={(e) => updateRule(task.type, {
                                        providerChain: [{ provider: rule.providerChain[0]?.provider || '', model: e.target.value }],
                                      })}
                                      className="w-full px-2 py-1.5 text-sm bg-swarm-dark border border-swarm-border/30 rounded text-gray-300"
                                      title="Select AI model"
                                      aria-label="AI Model"
                                    >
                                      <option value="">Default</option>
                                      {providers
                                        .find((p) => p.name === rule.providerChain[0]?.provider)
                                        ?.models?.map((m) => (
                                          <option key={m} value={m}>{m.split('/').pop()}</option>
                                        ))}
                                    </select>
                                  </div>
                                </div>

                                {/* Temperature and Max Tokens */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">
                                      Temperature: {rule.temperature}
                                    </label>
                                    <input
                                      type="range"
                                      min="0"
                                      max="2"
                                      step="0.1"
                                      value={rule.temperature}
                                      onChange={(e) => updateRule(task.type, { temperature: parseFloat(e.target.value) })}
                                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                      title="Adjust temperature"
                                      aria-label="Temperature"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">
                                      Max Tokens
                                    </label>
                                    <Input
                                      type="number"
                                      min="256"
                                      max="32000"
                                      step="256"
                                      value={rule.maxTokens}
                                      onChange={(e) => updateRule(task.type, { maxTokens: parseInt(e.target.value) || 4096 })}
                                      className="!py-1.5 text-sm"
                                    />
                                  </div>
                                </div>

                                {/* Retry Settings */}
                                <div className="grid grid-cols-3 gap-4">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">
                                      Max Retries
                                    </label>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="5"
                                      value={rule.maxRetries}
                                      onChange={(e) => updateRule(task.type, { maxRetries: parseInt(e.target.value) || 0 })}
                                      className="!py-1.5 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">
                                      Retry Delay (ms)
                                    </label>
                                    <Input
                                      type="number"
                                      min="100"
                                      max="10000"
                                      step="100"
                                      value={rule.retryDelayMs}
                                      onChange={(e) => updateRule(task.type, { retryDelayMs: parseInt(e.target.value) || 1000 })}
                                      className="!py-1.5 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">
                                      Timeout (sec)
                                    </label>
                                    <Input
                                      type="number"
                                      min="10"
                                      max="300"
                                      value={rule.timeoutSeconds}
                                      onChange={(e) => updateRule(task.type, { timeoutSeconds: parseInt(e.target.value) || 60 })}
                                      className="!py-1.5 text-sm"
                                    />
                                  </div>
                                </div>

                                {/* System Prompt Override */}
                                <div>
                                  <label className="block text-xs font-medium text-gray-400 mb-1">
                                    System Prompt Override (optional)
                                  </label>
                                  <textarea
                                    value={rule.systemPromptOverride || ''}
                                    onChange={(e) => updateRule(task.type, { systemPromptOverride: e.target.value || undefined })}
                                    placeholder="Custom system prompt for this task type..."
                                    className="w-full px-2 py-1.5 text-sm bg-swarm-dark border border-swarm-border/30 rounded text-gray-300 placeholder-gray-500"
                                    rows={2}
                                  />
                                </div>

                                {/* Actions */}
                                <div className="flex justify-end gap-2 pt-2">
                                  {hasCustomRule && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        removeRule(task.type);
                                        setEditingRule(null);
                                      }}
                                    >
                                      Reset to Default
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => setEditingRule(null)}
                                  >
                                    Done
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Info for non-custom presets */}
          {config.preset !== 'custom' && (
            <div className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20">
              <p className="text-sm text-gray-400">
                Using <span className="text-sky-400 font-medium">{routingPresets.find(p => p.value === config.preset)?.label}</span> preset.
                AI tasks will be routed automatically based on this strategy.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Select "Custom" preset to configure routing for individual task types.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AIRoutingPanel;
