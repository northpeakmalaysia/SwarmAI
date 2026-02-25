import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  User,
  Crown,
  GitBranch,
  Loader2,
  RefreshCw,
  AlertCircle,
  Pause,
  Play,
  ExternalLink,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Badge } from '../common/Badge';
import toast from 'react-hot-toast';
import api from '../../services/api';

export interface HierarchyNode {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  profileType: 'master' | 'sub';
  hierarchyLevel: number;
  status: 'active' | 'inactive' | 'paused' | 'terminated';
  autonomyLevel: string;
  childCount?: number;
  children?: HierarchyNode[];
}

export interface HierarchyData {
  current: HierarchyNode;
  parent: HierarchyNode | null;
  children: HierarchyNode[];
}

export interface HierarchyTreeViewProps {
  /** Current agentic profile ID */
  agenticId: string;
  /** Callback when a node is selected */
  onSelectNode?: (node: HierarchyNode) => void;
  /** Callback when sub-agent is created */
  onSubAgentCreated?: (subAgent: HierarchyNode) => void;
  /** Whether actions are enabled (create, delete) */
  actionsEnabled?: boolean;
  /** Max hierarchy depth allowed */
  maxDepth?: number;
  /** Additional className */
  className?: string;
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success',
  inactive: 'default',
  paused: 'warning',
  terminated: 'error',
};

/**
 * HierarchyTreeView - Visual tree showing Master/Sub-Agent relationships
 *
 * Features:
 * - Collapsible tree nodes
 * - Create sub-agent modal
 * - Terminate/detach sub-agent
 * - Status indicators
 * - Navigate to sub-agent details
 */
export const HierarchyTreeView: React.FC<HierarchyTreeViewProps> = ({
  agenticId,
  onSelectNode,
  onSubAgentCreated,
  actionsEnabled = true,
  maxDepth = 3,
  className,
}) => {
  const [hierarchy, setHierarchy] = useState<HierarchyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Create sub-agent modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newSubAgent, setNewSubAgent] = useState({
    name: '',
    role: '',
    description: '',
    autonomyLevel: 'supervised',
  });

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HierarchyNode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch hierarchy data
  const fetchHierarchy = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/hierarchy`);
      const data = response.data?.hierarchy || response.data;

      setHierarchy(data);

      // Auto-expand current node
      setExpandedNodes(prev => new Set([...prev, agenticId]));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load hierarchy';
      setError(message);
      console.error('Failed to fetch hierarchy:', err);
    } finally {
      setIsLoading(false);
    }
  }, [agenticId]);

  useEffect(() => {
    fetchHierarchy();
  }, [fetchHierarchy]);

  // Toggle node expansion
  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Open create sub-agent modal
  const openCreateModal = (parentId: string) => {
    setCreateParentId(parentId);
    setNewSubAgent({
      name: '',
      role: '',
      description: '',
      autonomyLevel: 'supervised',
    });
    setShowCreateModal(true);
  };

  // Create sub-agent
  const handleCreateSubAgent = async () => {
    if (!createParentId || !newSubAgent.name.trim() || !newSubAgent.role.trim()) {
      toast.error('Name and role are required');
      return;
    }

    setIsCreating(true);
    try {
      const response = await api.post(`/agentic/profiles/${createParentId}/children`, {
        name: newSubAgent.name.trim(),
        role: newSubAgent.role.trim(),
        description: newSubAgent.description.trim() || undefined,
        autonomyLevel: newSubAgent.autonomyLevel,
      });

      const createdSubAgent = response.data?.profile || response.data;

      toast.success(`Sub-agent "${newSubAgent.name}" created successfully`);
      setShowCreateModal(false);

      // Refresh hierarchy
      await fetchHierarchy();

      // Expand parent to show new child
      setExpandedNodes(prev => new Set([...prev, createParentId]));

      onSubAgentCreated?.(createdSubAgent);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create sub-agent';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  // Open delete confirmation
  const openDeleteModal = (node: HierarchyNode) => {
    setDeleteTarget(node);
    setShowDeleteModal(true);
  };

  // Delete/terminate sub-agent (actual delete, not just detach)
  const handleDelete = async () => {
    if (!deleteTarget || !hierarchy) return;

    setIsDeleting(true);
    try {
      // Actually delete the sub-agent profile (soft delete: sets status to 'terminated')
      await api.delete(`/agentic/profiles/${deleteTarget.id}`);

      toast.success(`Sub-agent "${deleteTarget.name}" deleted`);
      setShowDeleteModal(false);

      // Refresh hierarchy
      await fetchHierarchy();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete sub-agent';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Render a single tree node
  const renderNode = (node: HierarchyNode, isRoot = false, parentId?: string) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = (node.children?.length || 0) > 0 || (node.childCount || 0) > 0;
    const isCurrent = node.id === agenticId;
    const canCreateChild = actionsEnabled && node.hierarchyLevel < maxDepth;
    const canDelete = actionsEnabled && !isRoot && parentId === agenticId;

    return (
      <div key={node.id} className="select-none">
        {/* Node row */}
        <div
          className={cn(
            'flex items-center gap-2 py-2 px-2 rounded-lg transition-colors group',
            isCurrent ? 'bg-sky-500/10 border border-sky-500/30' : 'hover:bg-slate-800/50',
            onSelectNode && 'cursor-pointer'
          )}
          onClick={() => onSelectNode?.(node)}
        >
          {/* Expand/collapse button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleNode(node.id);
            }}
            className={cn(
              'w-6 h-6 flex items-center justify-center rounded hover:bg-slate-700',
              !hasChildren && 'invisible'
            )}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {/* Avatar */}
          {node.avatar ? (
            <img
              src={node.avatar}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center',
              node.profileType === 'master' ? 'bg-amber-500/20' : 'bg-slate-700'
            )}>
              {node.profileType === 'master' ? (
                <Crown className="w-4 h-4 text-amber-400" />
              ) : (
                <User className="w-4 h-4 text-gray-400" />
              )}
            </div>
          )}

          {/* Node info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white truncate">
                {node.name}
              </span>
              {node.profileType === 'master' && (
                <Badge variant="warning" size="sm">Master</Badge>
              )}
              <Badge variant={STATUS_COLORS[node.status] || 'default'} size="sm">
                {node.status}
              </Badge>
            </div>
            <span className="text-xs text-gray-500 truncate block">
              {node.role} • Level {node.hierarchyLevel}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canCreateChild && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateModal(node.id);
                }}
                title="Create sub-agent"
                className="text-emerald-400 hover:bg-emerald-500/10"
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  openDeleteModal(node);
                }}
                title="Terminate sub-agent"
                className="text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            {!isCurrent && onSelectNode && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(node);
                }}
                title="View details"
                className="text-sky-400 hover:bg-sky-500/10"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="ml-8 pl-4 border-l border-slate-700">
            {node.children?.map(child => renderNode(child, false, node.id))}
          </div>
        )}
      </div>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('text-center py-12', className)}>
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-400 mb-4">{error}</p>
        <Button variant="ghost" onClick={fetchHierarchy}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!hierarchy) {
    return (
      <div className={cn('text-center py-12 text-gray-500', className)}>
        No hierarchy data available
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sky-500/20 rounded-lg">
            <GitBranch className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Agent Hierarchy</h3>
            <p className="text-sm text-gray-400">
              Master and sub-agent relationships
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={fetchHierarchy}
          icon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh
        </Button>
      </div>

      {/* Tree view */}
      <div className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20">
        {/* Parent (if exists) */}
        {hierarchy.parent && (
          <div className="mb-4 pb-4 border-b border-slate-700">
            <span className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
              Parent Agent
            </span>
            {renderNode(hierarchy.parent, true)}
          </div>
        )}

        {/* Current node */}
        <div className="mb-4">
          <span className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
            Current Agent
          </span>
          {renderNode(
            {
              ...hierarchy.current,
              children: hierarchy.children,
              childCount: hierarchy.children.length,
            },
            !hierarchy.parent
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 pt-4 border-t border-slate-700 flex items-center gap-4 text-xs text-gray-500">
          <span>
            Level: {hierarchy.current.hierarchyLevel} / {maxDepth}
          </span>
          <span>
            Children: {hierarchy.children.length}
          </span>
          <span>
            Type: {hierarchy.current.profileType}
          </span>
        </div>
      </div>

      {/* Create Sub-Agent Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Sub-Agent"
        size="md"
        footer={
          <div className="flex gap-3 w-full justify-end">
            <Button
              variant="ghost"
              onClick={() => setShowCreateModal(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateSubAgent}
              loading={isCreating}
              disabled={!newSubAgent.name.trim() || !newSubAgent.role.trim()}
            >
              Create Sub-Agent
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={newSubAgent.name}
            onChange={(e) => setNewSubAgent(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Email Handler"
            required
          />

          <Input
            label="Role"
            value={newSubAgent.role}
            onChange={(e) => setNewSubAgent(prev => ({ ...prev, role: e.target.value }))}
            placeholder="e.g., Handles urgent client emails"
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Description (Optional)
            </label>
            <textarea
              value={newSubAgent.description}
              onChange={(e) => setNewSubAgent(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe what this sub-agent does..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Autonomy Level
            </label>
            <select
              value={newSubAgent.autonomyLevel}
              onChange={(e) => setNewSubAgent(prev => ({ ...prev, autonomyLevel: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
            >
              <option value="supervised">Supervised (requires approval for most actions)</option>
              <option value="semi-autonomous">Semi-Autonomous (approval for high-risk only)</option>
              <option value="autonomous">Autonomous (minimal approval needed)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Cannot exceed parent's autonomy cap
            </p>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400">
            <AlertCircle className="inline w-4 h-4 mr-2" />
            Sub-agents inherit team access, knowledge, and AI routing from their parent.
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Sub-Agent"
        size="sm"
        footer={
          <div className="flex gap-3 w-full justify-end">
            <Button
              variant="ghost"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={isDeleting}
            >
              Delete
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-gray-300">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-white">"{deleteTarget?.name}"</span>?
          </p>
          <p className="text-sm text-gray-500">
            This will permanently remove this sub-agent. Any children will also be affected.
            This action cannot be undone.
          </p>
        </div>
      </Modal>
    </div>
  );
};

HierarchyTreeView.displayName = 'HierarchyTreeView';

export default HierarchyTreeView;
