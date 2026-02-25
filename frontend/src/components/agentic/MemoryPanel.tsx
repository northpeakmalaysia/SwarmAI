import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Plus,
  Trash2,
  Edit3,
  Search,
  Star,
  MessageSquare,
  Lightbulb,
  Heart,
  Users,
  Calendar,
  Tag,
  Eye,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDateTime } from '@/utils/dateFormat';

// Types
interface Memory {
  id: string;
  agenticId: string;
  memoryType: string;
  title?: string;
  content: string;
  summary?: string;
  contactId?: string;
  conversationId?: string;
  taskId?: string;
  relatedMemoryIds: string[];
  importanceScore: number;
  emotionContext?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  occurredAt: string;
  expiresAt?: string;
  accessCount: number;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryPanelProps {
  /** Agentic profile ID */
  agenticId: string;
  /** Additional className */
  className?: string;
}

// Memory type configurations
const memoryTypeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  conversation: { icon: MessageSquare, color: 'text-blue-400', label: 'Conversation' },
  transaction: { icon: Calendar, color: 'text-green-400', label: 'Transaction' },
  decision: { icon: Lightbulb, color: 'text-yellow-400', label: 'Decision' },
  learning: { icon: Brain, color: 'text-purple-400', label: 'Learning' },
  context: { icon: Eye, color: 'text-cyan-400', label: 'Context' },
  preference: { icon: Star, color: 'text-orange-400', label: 'Preference' },
  relationship: { icon: Users, color: 'text-pink-400', label: 'Relationship' },
  event: { icon: Calendar, color: 'text-indigo-400', label: 'Event' },
  reflection: { icon: Brain, color: 'text-teal-400', label: 'Reflection' },
};

/**
 * MemoryPanel - Displays and manages memories for an agentic profile
 */
export const MemoryPanel: React.FC<MemoryPanelProps> = ({
  agenticId,
  className,
}) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    memoryType: 'context' as string,
    title: '',
    content: '',
    summary: '',
    importanceScore: 0.5,
    emotionContext: '',
    tags: '',
  });

  // Fetch memories (uses unified /memory endpoint with AgenticMemoryService)
  const fetchMemories = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.append('type', typeFilter);
      params.append('limit', '50');
      const url = `/agentic/profiles/${agenticId}/memory${params.toString() ? '?' + params.toString() : ''}`;
      const response = await api.get(url);
      setMemories(response.data.memories || []);
    } catch (error) {
      console.error('Failed to fetch memories:', error);
      toast.error('Failed to load memories');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId, typeFilter]);

  useEffect(() => {
    if (!searchQuery) {
      fetchMemories();
    }
  }, [fetchMemories, searchQuery]);

  // Search memories (uses unified /memory/search endpoint with semantic search)
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchMemories();
      return;
    }

    try {
      setIsSearching(true);
      // Use POST for semantic search with more options
      const payload: Record<string, unknown> = {
        query: searchQuery.trim(),
        limit: 20,
      };
      if (typeFilter !== 'all') payload.types = [typeFilter];
      const response = await api.post(`/agentic/profiles/${agenticId}/memory/search`, payload);
      setMemories(response.data.memories || []);
    } catch (error) {
      console.error('Failed to search memories:', error);
      toast.error('Failed to search memories');
    } finally {
      setIsSearching(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      memoryType: 'context',
      title: '',
      content: '',
      summary: '',
      importanceScore: 0.5,
      emotionContext: '',
      tags: '',
    });
    setEditingMemory(null);
  };

  // Open modal for new memory
  const handleAddMemory = () => {
    resetForm();
    setShowModal(true);
  };

  // Open modal for editing
  const handleEditMemory = (memory: Memory) => {
    setEditingMemory(memory);
    setFormData({
      memoryType: memory.memoryType,
      title: memory.title || '',
      content: memory.content,
      summary: memory.summary || '',
      importanceScore: memory.importanceScore,
      emotionContext: memory.emotionContext || '',
      tags: memory.tags.join(', '),
    });
    setShowModal(true);
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.content.trim()) {
      toast.error('Content is required');
      return;
    }

    setIsSubmitting(true);
    try {
      // Map frontend field names to /memory endpoint expected format
      const payload = {
        type: formData.memoryType,
        title: formData.title || undefined,
        content: formData.content,
        summary: formData.summary || undefined,
        importance: formData.importanceScore,
        emotionContext: formData.emotionContext || undefined,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      };

      if (editingMemory) {
        // Use PATCH for partial updates on unified /memory endpoint
        await api.patch(`/agentic/profiles/${agenticId}/memory/${editingMemory.id}`, payload);
        toast.success('Memory updated');
      } else {
        // Use POST on unified /memory endpoint (includes vector embedding)
        await api.post(`/agentic/profiles/${agenticId}/memory`, payload);
        toast.success('Memory created');
      }
      setShowModal(false);
      resetForm();
      fetchMemories();
    } catch (error) {
      console.error('Failed to save memory:', error);
      toast.error(editingMemory ? 'Failed to update memory' : 'Failed to create memory');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete memory
  const handleDeleteMemory = async (memoryId: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;

    setDeletingId(memoryId);
    try {
      await api.delete(`/agentic/profiles/${agenticId}/memory/${memoryId}`);
      toast.success('Memory deleted');
      fetchMemories();
    } catch (error) {
      console.error('Failed to delete memory:', error);
      toast.error('Failed to delete memory');
    } finally {
      setDeletingId(null);
    }
  };

  // Get importance color
  const getImportanceColor = (score: number) => {
    if (score >= 0.8) return 'text-red-400';
    if (score >= 0.6) return 'text-orange-400';
    if (score >= 0.4) return 'text-yellow-400';
    return 'text-gray-400';
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-400">Agent Memory</h4>
        <Button
          size="sm"
          variant="primary"
          onClick={handleAddMemory}
          icon={<Plus className="w-4 h-4" />}
        >
          Add Memory
        </Button>
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search memories..."
            className="pr-10"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-sky-400 transition-colors"
          >
            <Search className={cn('w-4 h-4', isSearching && 'animate-pulse')} />
          </button>
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-2 py-2 text-sm bg-swarm-dark border border-swarm-border/30 rounded-lg text-gray-300"
          title="Filter by type"
          aria-label="Filter by type"
        >
          <option value="all">All Types</option>
          {Object.entries(memoryTypeConfig).map(([type, config]) => (
            <option key={type} value={type}>{config.label}</option>
          ))}
        </select>
      </div>

      {/* Memories List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
        </div>
      ) : memories.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No memories stored yet</p>
          <p className="text-xs mt-1">Memories help the agent remember important context</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {memories.map((memory) => {
            const typeConfig = memoryTypeConfig[memory.memoryType] || memoryTypeConfig.context;
            const TypeIcon = typeConfig.icon;
            return (
              <div
                key={memory.id}
                className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20 hover:border-swarm-border/40 transition-colors"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TypeIcon className={cn('w-4 h-4', typeConfig.color)} />
                    <Badge variant="default" size="sm">
                      {typeConfig.label}
                    </Badge>
                    {memory.title && (
                      <span className="font-medium text-white">{memory.title}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={cn('text-xs', getImportanceColor(memory.importanceScore))}>
                      <Star className="w-3 h-3 inline mr-1" />
                      {(memory.importanceScore * 10).toFixed(1)}
                    </span>
                    <button
                      onClick={() => handleEditMemory(memory)}
                      className="p-1 text-gray-400 hover:text-sky-400 transition-colors"
                      title="Edit memory"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteMemory(memory.id)}
                      disabled={deletingId === memory.id}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Delete memory"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <p className="text-sm text-gray-300 mb-2 line-clamp-3">{memory.content}</p>

                {/* Summary */}
                {memory.summary && (
                  <p className="text-xs text-gray-500 italic mb-2">Summary: {memory.summary}</p>
                )}

                {/* Tags */}
                {memory.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {memory.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 text-xs bg-swarm-dark text-gray-400 rounded"
                      >
                        <Tag className="w-3 h-3 inline mr-1" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatDateTime(memory.occurredAt)}</span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    Accessed {memory.accessCount}x
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          resetForm();
        }}
        title={editingMemory ? 'Edit Memory' : 'Add New Memory'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Memory Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Memory Type <span className="text-red-400">*</span>
            </label>
            <select
              value={formData.memoryType}
              onChange={(e) => setFormData({ ...formData, memoryType: e.target.value })}
              className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white"
              title="Select memory type"
              aria-label="Memory Type"
            >
              {Object.entries(memoryTypeConfig).map(([type, config]) => (
                <option key={type} value={type}>{config.label}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Title
            </label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Brief title for this memory"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Content <span className="text-red-400">*</span>
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="What should the agent remember?"
              className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              rows={4}
              required
            />
          </div>

          {/* Summary */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Summary
            </label>
            <Input
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              placeholder="Brief summary of this memory"
            />
          </div>

          {/* Importance Score */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Importance Score: {(formData.importanceScore * 10).toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={formData.importanceScore}
              onChange={(e) => setFormData({ ...formData, importanceScore: parseFloat(e.target.value) })}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              title="Adjust importance score"
              aria-label="Importance Score"
            />
            <div className="flex justify-between mt-1 text-xs text-gray-500">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Tags
            </label>
            <Input
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="Comma-separated tags (e.g., important, customer, project-x)"
            />
          </div>

          {/* Emotion Context */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Emotion Context
            </label>
            <Input
              value={formData.emotionContext}
              onChange={(e) => setFormData({ ...formData, emotionContext: e.target.value })}
              placeholder="e.g., positive, neutral, urgent"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowModal(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              {editingMemory ? 'Update Memory' : 'Create Memory'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default MemoryPanel;
