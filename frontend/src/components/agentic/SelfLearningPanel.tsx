import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Brain,
  RefreshCw,
  Settings,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Clock,
  Database,
  Sparkles,
  FileText,
  Link2,
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

export interface SelfLearningPanelProps {
  agenticId: string;
  className?: string;
}

interface KnowledgeBinding {
  id: string;
  agenticId: string;
  libraryId: string;
  libraryName: string;
  accessType: 'read' | 'write' | 'admin';
  priority: number;
  autoLearn: boolean;
  learnFrom: string[];
  createdAt: string;
  updatedAt: string;
}

interface LearningEvent {
  id: string;
  type: 'auto_ingest' | 'manual_add' | 'pattern_learned' | 'feedback_applied';
  source: string;
  content: string;
  libraryId: string;
  libraryName: string;
  status: 'pending' | 'ingested' | 'rejected' | 'failed';
  confidence: number;
  createdAt: string;
}

interface LearningStats {
  totals: {
    pending: number;
    processed: number;
    ingested: number;
    rejected: number;
    duplicate: number;
    failed: number;
    bySource: {
      conversations: number;
      tasks: number;
      emails: number;
      feedback: number;
      escalations: number;
      patterns: number;
    };
  };
  daily: { date: string; pending: number; ingested: number; rejected: number }[];
}

interface SelfLearningConfig {
  enabled: boolean;
  maxAutoLearnsPerHour: number;
  cooldownMinutes: number;
  chunkSize: number;
  minContentLength: number;
  maxContentLength: number;
  humanReviewThreshold: number;
  autoApproveThreshold: number;
  enabledSources: string[];
  boundLibraryId: string | null;
}

const learnFromOptions = [
  { value: 'conversations', label: 'Conversations', icon: '💬' },
  { value: 'tasks', label: 'Task Completions', icon: '✅' },
  { value: 'emails', label: 'Email Threads', icon: '📧' },
  { value: 'feedback', label: 'User Feedback', icon: '👍' },
  { value: 'escalations', label: 'Escalation Resolutions', icon: '🔺' },
  { value: 'patterns', label: 'Detected Patterns', icon: '🔍' },
];

export const SelfLearningPanel: React.FC<SelfLearningPanelProps> = ({
  agenticId,
  className,
}) => {
  const [activeTab, setActiveTab] = useState('bindings');
  const [bindings, setBindings] = useState<KnowledgeBinding[]>([]);
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [config, setConfig] = useState<SelfLearningConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBinding, setEditingBinding] = useState<KnowledgeBinding | null>(null);
  const [libraries, setLibraries] = useState<{ id: string; name: string }[]>([]);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    libraryId: '',
    accessType: 'read' as 'read' | 'write' | 'admin',
    priority: 1,
    autoLearn: false,
    learnFrom: [] as string[],
  });

  // Fetch knowledge bindings
  const fetchBindings = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/agentic/profiles/${agenticId}/knowledge`);
      setBindings(response.data.knowledge || []);
    } catch (error) {
      console.error('Failed to fetch knowledge bindings:', error);
      toast.error('Failed to load knowledge bindings');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId]);

  // Fetch available libraries
  const fetchLibraries = useCallback(async () => {
    try {
      const response = await api.get('/knowledge/libraries');
      setLibraries(response.data.libraries || []);
    } catch (error) {
      console.error('Failed to fetch libraries:', error);
    }
  }, []);

  // Fetch self-learning config
  const fetchConfig = useCallback(async () => {
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/self-learning/config`);
      setConfig(response.data);
    } catch (error) {
      console.error('Failed to fetch self-learning config:', error);
    }
  }, [agenticId]);

  // Fetch self-learning stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/self-learning/stats?days=7`);
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch self-learning stats:', error);
    }
  }, [agenticId]);

  // Fetch pending review count
  const fetchPendingReview = useCallback(async () => {
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/self-learning/pending-review`);
      setPendingReviewCount(response.data.count || 0);
    } catch (error) {
      console.error('Failed to fetch pending review:', error);
    }
  }, [agenticId]);

  useEffect(() => {
    fetchBindings();
    fetchLibraries();
    fetchConfig();
    fetchStats();
    fetchPendingReview();
  }, [fetchBindings, fetchLibraries, fetchConfig, fetchStats, fetchPendingReview]);

  // Open edit modal
  const handleEditBinding = (binding: KnowledgeBinding) => {
    setEditingBinding(binding);
    setFormData({
      libraryId: binding.libraryId,
      accessType: binding.accessType,
      priority: binding.priority,
      autoLearn: binding.autoLearn,
      learnFrom: binding.learnFrom || [],
    });
    setShowEditModal(true);
  };

  // Open add modal
  const handleAddBinding = () => {
    setEditingBinding(null);
    setFormData({
      libraryId: '',
      accessType: 'read',
      priority: 1,
      autoLearn: false,
      learnFrom: [],
    });
    setShowEditModal(true);
  };

  // Save binding
  const handleSaveBinding = async () => {
    try {
      if (editingBinding) {
        await api.put(`/agentic/profiles/${agenticId}/knowledge/${editingBinding.id}`, formData);
        toast.success('Knowledge binding updated');
      } else {
        await api.post(`/agentic/profiles/${agenticId}/knowledge`, formData);
        toast.success('Knowledge binding added');
      }
      setShowEditModal(false);
      fetchBindings();
    } catch (error) {
      console.error('Failed to save binding:', error);
      toast.error('Failed to save knowledge binding');
    }
  };

  // Delete binding
  const handleDeleteBinding = async (id: string) => {
    if (!confirm('Remove this knowledge binding?')) return;
    try {
      await api.delete(`/agentic/profiles/${agenticId}/knowledge/${id}`);
      toast.success('Knowledge binding removed');
      fetchBindings();
    } catch (error) {
      console.error('Failed to delete binding:', error);
      toast.error('Failed to remove knowledge binding');
    }
  };

  // Toggle auto-learn
  const toggleAutoLearn = async (binding: KnowledgeBinding) => {
    try {
      await api.put(`/agentic/profiles/${agenticId}/knowledge/${binding.id}`, {
        autoLearn: !binding.autoLearn,
      });
      toast.success(`Auto-learn ${!binding.autoLearn ? 'enabled' : 'disabled'}`);
      fetchBindings();
    } catch (error) {
      console.error('Failed to toggle auto-learn:', error);
      toast.error('Failed to update setting');
    }
  };

  // Toggle learn source
  const toggleLearnFrom = (source: string) => {
    setFormData((prev) => ({
      ...prev,
      learnFrom: prev.learnFrom.includes(source)
        ? prev.learnFrom.filter((s) => s !== source)
        : [...prev.learnFrom, source],
    }));
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-400" />
          <h4 className="text-sm font-medium text-gray-400">Self-Learning (RAG)</h4>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchBindings}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleAddBinding}
            icon={<Plus className="w-4 h-4" />}
          >
            Add Library
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-sky-400" />
            <span className="text-xs text-gray-500">Total Ingested</span>
          </div>
          <span className="text-lg font-semibold text-white">
            {stats?.totals?.ingested || 0}
          </span>
        </div>
        <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-gray-500">This Week</span>
          </div>
          <span className="text-lg font-semibold text-emerald-400">
            +{stats?.daily?.reduce((sum, d) => sum + d.ingested, 0) || 0}
          </span>
        </div>
        <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-gray-500">Pending</span>
          </div>
          <span className="text-lg font-semibold text-purple-400">
            {stats?.totals?.pending || 0}
          </span>
        </div>
        <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-gray-500">Pending Review</span>
          </div>
          <span className="text-lg font-semibold text-amber-400">{pendingReviewCount}</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Trigger value="bindings" icon={<Link2 className="w-4 h-4" />}>
            Knowledge Libraries ({bindings.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="settings" icon={<Settings className="w-4 h-4" />}>
            Auto-Learn Settings
          </Tabs.Trigger>
        </Tabs.List>

        {/* Bindings Tab */}
        <Tabs.Content value="bindings" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
            </div>
          ) : bindings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No knowledge libraries linked</p>
              <p className="text-xs mt-1">Add a library to enable RAG-based learning</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bindings.map((binding) => (
                <div
                  key={binding.id}
                  className="p-4 bg-swarm-darker rounded-xl border border-swarm-border/20 hover:border-swarm-border/40 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h5 className="font-medium text-white">{binding.libraryName}</h5>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="default" size="sm">
                            {binding.accessType.toUpperCase()}
                          </Badge>
                          <Badge
                            variant={binding.autoLearn ? 'success' : 'default'}
                            size="sm"
                            dot
                            pulse={binding.autoLearn}
                          >
                            {binding.autoLearn ? 'Auto-Learning' : 'Manual Only'}
                          </Badge>
                          <span className="text-xs text-gray-500">Priority: {binding.priority}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={binding.autoLearn}
                        onClick={() => toggleAutoLearn(binding)}
                        className={cn(
                          'w-9 h-5 relative inline-flex flex-shrink-0 rounded-full p-0.5 transition-colors duration-200',
                          binding.autoLearn ? 'bg-emerald-500' : 'bg-slate-600'
                        )}
                        title={binding.autoLearn ? 'Disable auto-learn' : 'Enable auto-learn'}
                      >
                        <span
                          className={cn(
                            'w-3.5 h-3.5 inline-block rounded-full bg-white shadow-sm transform transition-transform duration-200',
                            binding.autoLearn ? 'translate-x-4' : 'translate-x-0'
                          )}
                        />
                      </button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditBinding(binding)}
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteBinding(binding.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Learn From Sources */}
                  {binding.autoLearn && binding.learnFrom && binding.learnFrom.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-swarm-border/10">
                      <span className="text-xs text-gray-500">Learning from:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {binding.learnFrom.map((source) => {
                          const option = learnFromOptions.find((o) => o.value === source);
                          return (
                            <span
                              key={source}
                              className="px-2 py-0.5 text-xs bg-swarm-dark rounded text-gray-400"
                            >
                              {option?.icon} {option?.label || source}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Tabs.Content>

        {/* Settings Tab */}
        <Tabs.Content value="settings" className="mt-4">
          <div className="space-y-4">
            <div className="p-4 bg-swarm-darker rounded-xl border border-swarm-border/20">
              <h5 className="font-medium text-white mb-3">Auto-Learn Configuration</h5>
              <p className="text-sm text-gray-400 mb-4">
                Configure what sources the AI should automatically learn from. Learned content is
                ingested into linked knowledge libraries with write access.
              </p>

              <div className="space-y-3">
                {learnFromOptions.map((option) => {
                  const isEnabled = config?.enabledSources?.includes(option.value);
                  const sourceCount = stats?.totals?.bySource?.[option.value as keyof typeof stats.totals.bySource] || 0;
                  return (
                    <div
                      key={option.value}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        isEnabled
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-swarm-dark border-swarm-border/20"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{option.icon}</span>
                        <span className={cn("text-sm", isEnabled ? "text-emerald-400" : "text-gray-300")}>
                          {option.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {sourceCount > 0 && (
                          <span className="text-xs text-gray-500">{sourceCount} learned</span>
                        )}
                        <Badge variant={isEnabled ? "success" : "default"} size="sm">
                          {isEnabled ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-swarm-darker rounded-xl border border-swarm-border/20">
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-medium text-white">Safety Controls</h5>
                <Badge variant={config?.enabled ? 'success' : 'default'} size="sm" dot pulse={config?.enabled}>
                  {config?.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Max auto-learns per hour</span>
                  <span className="text-white">{config?.maxAutoLearnsPerHour || 10}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Max chunk size</span>
                  <span className="text-white">{config?.chunkSize || 500} chars</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Human review threshold</span>
                  <span className="text-white">
                    Confidence &lt; {Math.round((config?.humanReviewThreshold || 0.7) * 100)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Auto-approve threshold</span>
                  <span className="text-white">
                    Confidence &gt; {Math.round((config?.autoApproveThreshold || 0.9) * 100)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Cooldown between learns</span>
                  <span className="text-white">{config?.cooldownMinutes || 5} min</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Deduplication</span>
                  <Badge variant="success" size="sm">Enabled</Badge>
                </div>
              </div>
            </div>
          </div>
        </Tabs.Content>
      </Tabs>

      {/* Edit Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={editingBinding ? 'Edit Knowledge Binding' : 'Add Knowledge Library'}
        size="md"
      >
        <div className="space-y-4 p-4">
          {/* Library Selection */}
          {!editingBinding && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Knowledge Library
              </label>
              <select
                value={formData.libraryId}
                onChange={(e) => setFormData({ ...formData, libraryId: e.target.value })}
                className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white"
              >
                <option value="">Select a library...</option>
                {libraries.map((lib) => (
                  <option key={lib.id} value={lib.id}>
                    {lib.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Access Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Access Level</label>
            <select
              value={formData.accessType}
              onChange={(e) =>
                setFormData({ ...formData, accessType: e.target.value as 'read' | 'write' | 'admin' })
              }
              className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white"
            >
              <option value="read">Read Only</option>
              <option value="write">Read & Write</option>
              <option value="admin">Admin (Full Access)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Write access is required for auto-learning
            </p>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Priority (1-10)
            </label>
            <Input
              type="number"
              value={formData.priority}
              onChange={(e) =>
                setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })
              }
              min={1}
              max={10}
            />
          </div>

          {/* Auto-Learn Toggle */}
          <div className="flex items-center justify-between p-3 bg-swarm-dark rounded-lg">
            <div>
              <span className="font-medium text-white">Enable Auto-Learning</span>
              <p className="text-xs text-gray-500 mt-1">
                Automatically ingest learnings from interactions
              </p>
            </div>
            <button
              onClick={() => setFormData({ ...formData, autoLearn: !formData.autoLearn })}
              className={cn(
                'w-12 h-6 rounded-full transition-colors relative',
                formData.autoLearn ? 'bg-emerald-500' : 'bg-gray-600'
              )}
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all',
                  formData.autoLearn ? 'left-6' : 'left-0.5'
                )}
              />
            </button>
          </div>

          {/* Learn From Sources */}
          {formData.autoLearn && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Learn From Sources
              </label>
              <div className="grid grid-cols-2 gap-2">
                {learnFromOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => toggleLearnFrom(option.value)}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-lg border transition-colors',
                      formData.learnFrom.includes(option.value)
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-swarm-border/30 bg-swarm-dark text-gray-400 hover:border-swarm-border/50'
                    )}
                  >
                    <span>{option.icon}</span>
                    <span className="text-sm">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-swarm-border/20">
            <Button variant="ghost" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveBinding}
              disabled={!editingBinding && !formData.libraryId}
            >
              {editingBinding ? 'Update' : 'Add Library'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SelfLearningPanel;
