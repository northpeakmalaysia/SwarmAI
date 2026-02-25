/**
 * Node Palette Component
 *
 * Displays available nodes organized by category for drag-and-drop
 * onto the FlowBuilder canvas.
 */

import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Zap,
  Play,
  Clock,
  Webhook,
  Mail,
  MessageSquare,
  Calendar,
  Send,
  Globe,
  Variable,
  Timer,
  GitBranch,
  Shuffle,
  Sparkles,
  MessageCircle,
  FileSearch,
  Lightbulb,
  Tags,
  FileText,
  Brain,
  Users,
  Radio,
  ArrowRightLeft,
  Vote,
  ListTodo,
  Activity,
  Network,
  GripVertical,
  Repeat,
  Split,
  Workflow,
  Terminal,
  Languages,
  Route,
  FileInput,
  FileOutput,
  FolderOpen,
  FileX,
  Code,
  CheckCircle,
  CalendarPlus,
  CalendarDays,
  CalendarCog,
  CalendarX,
  CalendarClock,
  Wrench,
  FileJson,
  Plug,
  Bot,
  Cpu,
  Cog,
  Package,
  Wand2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Input } from '../common';
import { nodeDefinitions, categoryInfo, NodeDefinition } from './nodes';

// Comprehensive icon mapping
const iconMap: Record<string, React.ElementType> = {
  // Basic
  Play,
  Clock,
  Webhook,
  Mail,
  MessageSquare,
  Calendar,
  Send,
  Globe,
  Variable,
  Timer,
  GitBranch,
  Shuffle,
  Search,

  // AI
  Sparkles,
  MessageCircle,
  FileSearch,
  Lightbulb,
  Tags,
  FileText,
  Brain,
  Route,
  Languages,
  Terminal,
  Wand2,

  // Swarm
  Users,
  Radio,
  ArrowRightLeft,
  Vote,
  ListTodo,
  Activity,
  Network,
  Bot,

  // Control Flow
  Repeat,
  Split,
  Workflow,

  // File Operations
  FileInput,
  FileOutput,
  FolderOpen,
  FileX,
  FileJson,

  // Web
  Code,
  CheckCircle,

  // Scheduler
  CalendarPlus,
  CalendarDays,
  CalendarCog,
  CalendarX,
  CalendarClock,

  // MCP / Tools
  Wrench,
  Plug,
  Cpu,
  Cog,
  Package,
};

// Color classes for categories
const categoryColorClasses: Record<string, { bg: string; border: string; text: string; bgHover: string }> = {
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    bgHover: 'hover:bg-amber-500/20',
  },
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    bgHover: 'hover:bg-blue-500/20',
  },
  violet: {
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    text: 'text-violet-400',
    bgHover: 'hover:bg-violet-500/20',
  },
  cyan: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    text: 'text-cyan-400',
    bgHover: 'hover:bg-cyan-500/20',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    bgHover: 'hover:bg-emerald-500/20',
  },
  rose: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    text: 'text-rose-400',
    bgHover: 'hover:bg-rose-500/20',
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    text: 'text-purple-400',
    bgHover: 'hover:bg-purple-500/20',
  },
  yellow: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    bgHover: 'hover:bg-yellow-500/20',
  },
  orange: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    bgHover: 'hover:bg-orange-500/20',
  },
  pink: {
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/30',
    text: 'text-pink-400',
    bgHover: 'hover:bg-pink-500/20',
  },
  indigo: {
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    text: 'text-indigo-400',
    bgHover: 'hover:bg-indigo-500/20',
  },
  teal: {
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    text: 'text-teal-400',
    bgHover: 'hover:bg-teal-500/20',
  },
  red: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    bgHover: 'hover:bg-red-500/20',
  },
  green: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    text: 'text-green-400',
    bgHover: 'hover:bg-green-500/20',
  },
};

interface NodePaletteProps {
  onDragStart?: (event: React.DragEvent, nodeType: string, nodeData: Record<string, unknown>) => void;
}

interface PaletteItemProps {
  node: NodeDefinition;
  onDragStart?: (event: React.DragEvent, nodeType: string, nodeData: Record<string, unknown>) => void;
}

const PaletteItem: React.FC<PaletteItemProps> = ({ node, onDragStart }) => {
  const Icon = iconMap[node.icon] || Zap;
  const colors = categoryColorClasses[node.color] || categoryColorClasses.blue;

  const handleDragStart = (event: React.DragEvent) => {
    const nodeData = {
      label: node.label,
      subtype: node.subtype,
      config: {},
    };

    event.dataTransfer.setData('application/reactflow', JSON.stringify({
      type: node.type,
      data: nodeData,
    }));
    event.dataTransfer.effectAllowed = 'move';

    onDragStart?.(event, node.type, nodeData);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg cursor-grab active:cursor-grabbing',
        'border border-transparent transition-all duration-200',
        'hover:border-slate-600 hover:bg-slate-700/50',
        'group select-none'
      )}
    >
      <div className={cn('w-8 h-8 rounded flex items-center justify-center flex-shrink-0', colors.bg)}>
        <Icon className={cn('w-4 h-4', colors.text)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white font-medium truncate">{node.label}</div>
        <div className="text-xs text-gray-500 truncate">{node.description}</div>
      </div>
      <GripVertical className="w-4 h-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
};

interface CategorySectionProps {
  category: string;
  nodes: NodeDefinition[];
  isExpanded: boolean;
  onToggle: () => void;
  onDragStart?: (event: React.DragEvent, nodeType: string, nodeData: Record<string, unknown>) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  nodes,
  isExpanded,
  onToggle,
  onDragStart,
}) => {
  const info = categoryInfo[category];
  const colors = categoryColorClasses[info?.color || 'blue'];

  // Category icons
  const categoryIcons: Record<string, React.ElementType> = {
    trigger: Zap,
    action: Send,
    ai: Sparkles,
    swarm: Network,
    logic: GitBranch,
    mcp: Plug,
    agentic: Bot,
  };

  const CategoryIcon = categoryIcons[category] || Zap;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg',
          'hover:bg-slate-700/50 transition-colors',
          'text-left'
        )}
        aria-expanded={isExpanded ? 'true' : 'false'}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${info?.label || category} category`}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
        <div className={cn('w-6 h-6 rounded flex items-center justify-center', colors.bg)}>
          <CategoryIcon className={cn('w-3.5 h-3.5', colors.text)} />
        </div>
        <span className="text-sm font-medium text-white flex-1">{info?.label || category}</span>
        <span className="text-xs text-gray-500 bg-slate-700 px-2 py-0.5 rounded-full">
          {nodes.length}
        </span>
      </button>

      {isExpanded && (
        <div className="ml-2 mt-1 space-y-0.5">
          {nodes.map((node) => (
            <PaletteItem
              key={`${node.type}-${node.subtype}`}
              node={node}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const NodePalette: React.FC<NodePaletteProps> = ({ onDragStart }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    trigger: true,
    action: true,
    ai: true,
    swarm: true,
    logic: false,
    mcp: false,
    agentic: false,
  });

  // Filter nodes based on search
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) {
      return nodeDefinitions;
    }

    const query = searchQuery.toLowerCase();
    return nodeDefinitions.filter(
      (node) =>
        node.label.toLowerCase().includes(query) ||
        node.description.toLowerCase().includes(query) ||
        node.subtype.toLowerCase().includes(query) ||
        node.category.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group filtered nodes by category
  const groupedNodes = useMemo(() => {
    return filteredNodes.reduce((acc, node) => {
      if (!acc[node.category]) {
        acc[node.category] = [];
      }
      acc[node.category].push(node);
      return acc;
    }, {} as Record<string, NodeDefinition[]>);
  }, [filteredNodes]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  // All possible categories in display order
  const categories = ['trigger', 'action', 'ai', 'swarm', 'logic', 'mcp', 'agentic'];

  // When searching, expand all categories with matches
  const getIsExpanded = (category: string) => {
    if (searchQuery.trim()) {
      return (groupedNodes[category]?.length || 0) > 0;
    }
    return expandedCategories[category] || false;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <h3 className="text-lg font-semibold text-white mb-1">Nodes</h3>
        <p className="text-xs text-gray-400">Drag nodes to the canvas</p>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 mb-4">
        <Input
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          iconLeft={<Search className="w-4 h-4" />}
          size="sm"
        />
      </div>

      {/* Node Categories */}
      <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2">
        {categories.map((category) => {
          const nodes = groupedNodes[category];
          if (!nodes || nodes.length === 0) return null;

          return (
            <CategorySection
              key={category}
              category={category}
              nodes={nodes}
              isExpanded={getIsExpanded(category)}
              onToggle={() => toggleCategory(category)}
              onDragStart={onDragStart}
            />
          );
        })}

        {filteredNodes.length === 0 && (
          <div className="text-center py-8">
            <Search className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No nodes found</p>
            <p className="text-xs text-gray-600">Try a different search term</p>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="flex-shrink-0 pt-3 mt-3 border-t border-slate-700">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{nodeDefinitions.length} nodes available</span>
          <span>{Object.keys(categoryInfo).length} categories</span>
        </div>
      </div>
    </div>
  );
};

export default NodePalette;
