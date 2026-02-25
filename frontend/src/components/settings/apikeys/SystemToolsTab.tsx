/**
 * System Tools Tab
 *
 * Displays all available system tools with descriptions,
 * parameters, examples, and API key configuration.
 */

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Globe,
  Brain,
  FileText,
  Eye,
  Calendar,
  Database,
  GitBranch,
  BookOpen,
  Users,
  ChevronRight,
  ChevronDown,
  Key,
  ExternalLink,
  AlertCircle,
  Check,
  Loader2,
  Search,
  Info,
  Zap,
  Settings,
} from 'lucide-react';
import { Button } from '../../common/Button';
import { Badge } from '../../common/Badge';
import { Input } from '../../common/Input';
import { useSystemToolsStore, SystemTool, ToolCategory } from '@/stores/systemToolsStore';
import { useToolApiKeyStore } from '@/stores/toolApiKeyStore';
import { cn } from '@/lib/utils';

// Category icons mapping
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  messaging: <MessageSquare className="w-5 h-5" />,
  web: <Globe className="w-5 h-5" />,
  ai: <Brain className="w-5 h-5" />,
  file: <FileText className="w-5 h-5" />,
  vision: <Eye className="w-5 h-5" />,
  scheduling: <Calendar className="w-5 h-5" />,
  data: <Database className="w-5 h-5" />,
  flow: <GitBranch className="w-5 h-5" />,
  rag: <BookOpen className="w-5 h-5" />,
  swarm: <Users className="w-5 h-5" />,
};

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  messaging: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  web: 'text-green-400 bg-green-400/10 border-green-400/20',
  ai: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  file: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  vision: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  scheduling: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  data: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
  flow: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  rag: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  swarm: 'text-red-400 bg-red-400/10 border-red-400/20',
};

export const SystemToolsTab: React.FC = () => {
  const {
    categories,
    providers,
    loading,
    error,
    fetchTools,
    fetchProviders,
    clearError,
  } = useSystemToolsStore();

  const { keys: apiKeys, fetchKeys } = useToolApiKeyStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedTool, setSelectedTool] = useState<SystemTool | null>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchTools();
    fetchProviders();
    fetchKeys();
  }, [fetchTools, fetchProviders, fetchKeys]);

  // Toggle category expansion
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Expand all categories
  const expandAll = () => {
    setExpandedCategories(new Set(categories.map((c) => c.id)));
  };

  // Collapse all categories
  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  // Filter tools based on search
  const filteredCategories = categories.map((cat) => ({
    ...cat,
    tools: cat.tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.id.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((cat) => cat.tools.length > 0);

  // Count total tools
  const totalTools = categories.reduce((sum, cat) => sum + cat.tools.length, 0);

  // Check if a tool needs API key
  const toolNeedsApiKey = (toolId: string): boolean => {
    const toolProviders = providers[toolId];
    return toolProviders && toolProviders.some((p) => p.keyRequired);
  };

  // Check if API key is configured for a tool
  const hasApiKeyConfigured = (toolId: string): boolean => {
    const toolKeys = apiKeys[toolId];
    return toolKeys && toolKeys.length > 0;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">System Tools</h3>
          <p className="text-sm text-gray-400 mt-1">
            {totalTools} tools available across {categories.length} categories.
            These tools can be used by AI Router and FlowBuilder.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search tools by name or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Loading state */}
      {loading && categories.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="ml-2 text-gray-400">Loading tools...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Categories */}
      <div className="space-y-4">
        {filteredCategories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            isExpanded={expandedCategories.has(category.id)}
            onToggle={() => toggleCategory(category.id)}
            onSelectTool={setSelectedTool}
            providers={providers}
            apiKeys={apiKeys}
            toolNeedsApiKey={toolNeedsApiKey}
            hasApiKeyConfigured={hasApiKeyConfigured}
          />
        ))}
      </div>

      {/* Empty search state */}
      {filteredCategories.length === 0 && !loading && searchQuery && (
        <div className="text-center py-12 text-gray-400">
          <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No tools found matching "{searchQuery}"</p>
        </div>
      )}

      {/* Tool Detail Modal */}
      {selectedTool && (
        <ToolDetailModal
          tool={selectedTool}
          providers={providers[selectedTool.id] || []}
          apiKeys={apiKeys[selectedTool.id] || []}
          onClose={() => setSelectedTool(null)}
        />
      )}
    </div>
  );
};

// Category Section Component
interface CategorySectionProps {
  category: ToolCategory;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectTool: (tool: SystemTool) => void;
  providers: Record<string, any[]>;
  apiKeys: Record<string, any[]>;
  toolNeedsApiKey: (toolId: string) => boolean;
  hasApiKeyConfigured: (toolId: string) => boolean;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  isExpanded,
  onToggle,
  onSelectTool,
  toolNeedsApiKey,
  hasApiKeyConfigured,
}) => {
  const colorClass = CATEGORY_COLORS[category.id] || 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  const icon = CATEGORY_ICONS[category.id] || <Settings className="w-5 h-5" />;

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
      {/* Category Header */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg border', colorClass)}>
            {icon}
          </div>
          <div className="text-left">
            <h4 className="font-semibold text-white capitalize">{category.name}</h4>
            <p className="text-sm text-gray-400">
              {category.description || `${category.tools.length} tools`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="default" size="sm">
            {category.tools.length} tools
          </Badge>
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Tools List */}
      {isExpanded && (
        <div className="border-t border-slate-700/50 divide-y divide-slate-700/30">
          {category.tools.map((tool) => (
            <ToolRow
              key={tool.id}
              tool={tool}
              needsApiKey={toolNeedsApiKey(tool.id)}
              hasApiKey={hasApiKeyConfigured(tool.id)}
              onSelect={() => onSelectTool(tool)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Tool Row Component
interface ToolRowProps {
  tool: SystemTool;
  needsApiKey: boolean;
  hasApiKey: boolean;
  onSelect: () => void;
}

const ToolRow: React.FC<ToolRowProps> = ({ tool, needsApiKey, hasApiKey, onSelect }) => {
  return (
    <div
      className="p-4 flex items-start gap-4 hover:bg-slate-700/30 transition-colors cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{tool.name}</span>
          <code className="text-xs text-gray-500 bg-slate-700/50 px-1.5 py-0.5 rounded">
            {tool.id}
          </code>
          {tool.requiresAuth && (
            <Badge variant="warning" size="sm">
              Auth Required
            </Badge>
          )}
          {needsApiKey && (
            <Badge variant={hasApiKey ? 'success' : 'error'} size="sm">
              {hasApiKey ? (
                <>
                  <Check className="w-3 h-3 mr-1" />
                  API Key
                </>
              ) : (
                <>
                  <Key className="w-3 h-3 mr-1" />
                  Needs Key
                </>
              )}
            </Badge>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-1">{tool.description}</p>
        {tool.requiredParams && tool.requiredParams.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500">Parameters:</span>
            {tool.requiredParams.map((param) => (
              <code key={param} className="text-xs text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">
                {param}
              </code>
            ))}
          </div>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
    </div>
  );
};

// Tool Detail Modal Component
interface ToolDetailModalProps {
  tool: SystemTool;
  providers: any[];
  apiKeys: any[];
  onClose: () => void;
}

const ToolDetailModal: React.FC<ToolDetailModalProps> = ({
  tool,
  providers,
  apiKeys,
  onClose,
}) => {
  const colorClass = CATEGORY_COLORS[tool.category] || 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  const icon = CATEGORY_ICONS[tool.category] || <Settings className="w-5 h-5" />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className={cn('p-3 rounded-lg border', colorClass)}>
                {icon}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">{tool.name}</h3>
                <code className="text-sm text-gray-400">{tool.id}</code>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Description */}
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Description
            </h4>
            <p className="text-gray-400">{tool.description}</p>
          </div>

          {/* Category & Auth */}
          <div className="flex items-center gap-4">
            <Badge className={cn('capitalize', colorClass)}>{tool.category}</Badge>
            {tool.requiresAuth && (
              <Badge variant="warning">
                <Key className="w-3 h-3 mr-1" />
                Authentication Required
              </Badge>
            )}
          </div>

          {/* Parameters */}
          {tool.parameters && Object.keys(tool.parameters).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Parameters
              </h4>
              <div className="space-y-2">
                {Object.entries(tool.parameters).map(([name, param]) => (
                  <div
                    key={name}
                    className="p-3 bg-slate-700/50 rounded-lg border border-slate-600/50"
                  >
                    <div className="flex items-center gap-2">
                      <code className="text-blue-400 font-medium">{name}</code>
                      <span className="text-xs text-gray-500">({param.type})</span>
                      {tool.requiredParams?.includes(name) ? (
                        <Badge variant="error" size="sm">required</Badge>
                      ) : (
                        <Badge variant="default" size="sm">optional</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{param.description}</p>
                    {param.default !== undefined && (
                      <p className="text-xs text-gray-500 mt-1">
                        Default: <code className="text-gray-400">{JSON.stringify(param.default)}</code>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Examples */}
          {tool.examples && tool.examples.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Examples
              </h4>
              <ul className="space-y-2">
                {tool.examples.map((example, index) => (
                  <li key={index} className="flex items-start gap-2 text-gray-400">
                    <span className="text-green-400">•</span>
                    {example}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* API Key Configuration (if needed) */}
          {providers.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Key className="w-4 h-4" />
                API Key Configuration
              </h4>
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-amber-200 font-medium">This tool requires API key configuration</p>
                    <p className="text-amber-200/70 mt-1">
                      Configure API keys in the "Tool API Keys" tab to enable full functionality.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="p-3 bg-slate-700/50 rounded-lg border border-slate-600/50 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{provider.name}</span>
                        {!provider.keyRequired && (
                          <Badge variant="success" size="sm">Free</Badge>
                        )}
                        {apiKeys.some((k) => k.provider === provider.id) && (
                          <Badge variant="success" size="sm">
                            <Check className="w-3 h-3 mr-1" />
                            Configured
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{provider.description}</p>
                    </div>
                    {provider.docsUrl && (
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Usage Hint */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <h5 className="text-sm font-semibold text-blue-300 mb-2">How to Use</h5>
            <ul className="text-sm text-blue-200/80 space-y-1">
              <li>• <strong>AI Router:</strong> Ask the AI naturally and it will automatically select this tool</li>
              <li>• <strong>FlowBuilder:</strong> Add this tool as a node in your automation flows</li>
              <li>• <strong>API:</strong> Call directly via <code className="bg-blue-500/20 px-1 rounded">/api/ai/router/execute-tool</code></li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};

export default SystemToolsTab;
