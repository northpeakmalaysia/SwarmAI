import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Brain,
  Lightbulb,
  Wrench,
  CheckCircle,
  XCircle,
  Cpu,
  Sparkles,
  Monitor,
  AlertTriangle,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Pause,
  Play,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import api from '../../services/api';
import { websocket } from '../../services/websocket';
import { useAuthStore } from '../../stores/authStore';
import { formatDateTime } from '../../utils/dateFormat';

export interface AuditLogPanelProps {
  agenticId: string;
  className?: string;
}

interface AuditEntry {
  id: string;
  agenticId: string;
  category: string;
  direction: 'INBOUND' | 'INTERNAL' | 'OUTBOUND';
  description: string;
  metadata: Record<string, unknown>;
  status: string;
  createdAt: string;
}

const CATEGORIES = [
  'incoming',
  'reasoning_start',
  'reasoning_think',
  'tool_call',
  'tool_result',
  'ai_request',
  'ai_response',
  'local_agent_in',
  'local_agent_out',
  'outgoing',
  'error',
] as const;

type Category = (typeof CATEGORIES)[number];

const categoryConfig: Record<Category, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  incoming:         { icon: ArrowDownLeft,  color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Incoming' },
  reasoning_start:  { icon: Brain,          color: 'text-purple-400',  bg: 'bg-purple-500/10',  label: 'Reasoning Start' },
  reasoning_think:  { icon: Lightbulb,      color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  label: 'Reasoning' },
  tool_call:        { icon: Wrench,         color: 'text-blue-400',    bg: 'bg-blue-500/10',    label: 'Tool Call' },
  tool_result:      { icon: CheckCircle,    color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    label: 'Tool Result' },
  ai_request:       { icon: Cpu,            color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  label: 'AI Request' },
  ai_response:      { icon: Sparkles,       color: 'text-pink-400',    bg: 'bg-pink-500/10',    label: 'AI Response' },
  local_agent_in:   { icon: Monitor,        color: 'text-teal-400',    bg: 'bg-teal-500/10',    label: 'Agent In' },
  local_agent_out:  { icon: Monitor,        color: 'text-orange-400',  bg: 'bg-orange-500/10',  label: 'Agent Out' },
  outgoing:         { icon: ArrowUpRight,   color: 'text-orange-400',  bg: 'bg-orange-500/10',  label: 'Outgoing' },
  error:            { icon: AlertTriangle,  color: 'text-red-400',     bg: 'bg-red-500/10',     label: 'Error' },
};

const directionConfig = {
  INBOUND:  { color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: 'IN' },
  INTERNAL: { color: 'text-blue-400',    bg: 'bg-blue-500/15',    label: 'INT' },
  OUTBOUND: { color: 'text-orange-400',  bg: 'bg-orange-500/15',  label: 'OUT' },
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'unknown';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

/** Format full date/time in user's timezone for tooltips */
function formatFullDate(dateString: string, timezone: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'unknown';
  try {
    return date.toLocaleString('en-US', {
      timeZone: timezone || undefined,
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
  } catch {
    return formatDateTime(dateString);
  }
}

const PAGE_SIZE = 50;

/** Collapsible section for long content */
const CollapsibleSection: React.FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-swarm-border/15 rounded-lg overflow-hidden">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-gray-400 hover:text-gray-300 bg-swarm-dark/50"
      >
        <span className="uppercase tracking-wider font-medium">{title}</span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && <div className="px-3 py-2">{children}</div>}
    </div>
  );
};

/** Structured expanded details for audit entries */
const ExpandedDetails: React.FC<{ entry: AuditEntry }> = ({ entry }) => {
  const meta = entry.metadata as Record<string, any>;
  const isAiRequest = entry.category === 'ai_request';
  const isAiResponse = entry.category === 'ai_response';
  const hasMessages = isAiRequest && Array.isArray(meta.messages);
  const hasFullResponse = isAiResponse && meta.fullResponse;
  const hasBudget = meta.budget;

  // Separate large fields from summary fields
  const summaryFields: Record<string, any> = {};
  const largeFields: Record<string, any> = {};

  for (const [key, val] of Object.entries(meta)) {
    if (key === 'messages' || key === 'fullResponse') {
      largeFields[key] = val;
    } else if (key === 'budget' && typeof val === 'object') {
      // Show budget inline as readable text
      summaryFields[key] = val;
    } else {
      summaryFields[key] = val;
    }
  }

  return (
    <div className="mt-2 ml-7 space-y-2" onClick={(e) => e.stopPropagation()}>
      {/* Summary fields */}
      {Object.keys(summaryFields).length > 0 && (
        <div className="p-3 rounded-lg bg-swarm-darker border border-swarm-border/20">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Details</div>
          {hasBudget && (
            <div className="text-xs text-amber-400/80 mb-2 flex items-center gap-1.5">
              <Wrench className="w-3 h-3" />
              Tool Budget: {meta.budget.tier} tier — max {meta.budget.maxIterations} iterations, {meta.budget.maxToolCalls} tool calls
            </div>
          )}
          <pre className="text-xs text-gray-400 whitespace-pre-wrap break-words font-mono max-h-[150px] overflow-y-auto">
            {JSON.stringify(
              Object.fromEntries(Object.entries(summaryFields).filter(([k]) => k !== 'budget')),
              null, 2
            )}
          </pre>
        </div>
      )}

      {/* Prompt messages (collapsible) */}
      {hasMessages && (
        <CollapsibleSection title={`Prompt Messages (${meta.messages.length})`}>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {meta.messages.map((msg: any, idx: number) => (
              <div key={idx} className="rounded border border-swarm-border/15 overflow-hidden">
                <div className={cn(
                  'px-2 py-1 text-[10px] font-medium uppercase tracking-wider',
                  msg.role === 'system' ? 'bg-purple-500/10 text-purple-400' :
                  msg.role === 'assistant' ? 'bg-blue-500/10 text-blue-400' :
                  'bg-emerald-500/10 text-emerald-400'
                )}>
                  {msg.role} ({msg.contentLength?.toLocaleString() || '?'} chars)
                </div>
                <pre className="text-[11px] text-gray-400 whitespace-pre-wrap break-words font-mono p-2 max-h-[200px] overflow-y-auto bg-black/20">
                  {msg.preview || '(empty)'}
                </pre>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* AI Response (collapsible) */}
      {hasFullResponse && (
        <CollapsibleSection title={`AI Response (${meta.contentLength?.toLocaleString() || '?'} chars)`}>
          <pre className="text-[11px] text-gray-400 whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-y-auto bg-black/20 p-2 rounded">
            {meta.fullResponse}
          </pre>
        </CollapsibleSection>
      )}
    </div>
  );
};

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ agenticId, className }) => {
  const userTimezone = useAuthStore(s => s.user?.preferences?.timezone || 'UTC');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedDirection, setSelectedDirection] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEntries = useCallback(async (newOffset = 0) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(newOffset));
      if (selectedCategories.size > 0) {
        params.set('categories', Array.from(selectedCategories).join(','));
      }
      if (selectedDirection) {
        params.set('direction', selectedDirection);
      }
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await api.get(`/agentic/profiles/${agenticId}/audit-log?${params.toString()}`);
      const data = response.data;
      setEntries(data.entries || []);
      setTotal(data.total || 0);
      setOffset(newOffset);
    } catch (error) {
      console.error('Failed to fetch audit log:', error);
    } finally {
      setIsLoading(false);
    }
  }, [agenticId, selectedCategories, selectedDirection, searchQuery]);

  // Initial fetch and when filters change
  useEffect(() => {
    fetchEntries(0);
  }, [fetchEntries]);

  // Auto-refresh polling
  useEffect(() => {
    if (refreshTimer.current) {
      clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    }
    if (autoRefresh) {
      refreshTimer.current = setInterval(() => {
        fetchEntries(offset);
      }, 10000);
    }
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [autoRefresh, fetchEntries, offset]);

  // WebSocket real-time updates
  useEffect(() => {
    const unsubscribe = websocket.subscribe<AuditEntry & { agenticId: string }>('audit:new' as any, (data) => {
      if (data.agenticId !== agenticId) return;
      // Prepend new entry to the list if on first page
      if (offset === 0) {
        setEntries(prev => {
          const updated = [data, ...prev];
          return updated.slice(0, PAGE_SIZE);
        });
        setTotal(prev => prev + 1);
      }
    });

    return () => { unsubscribe(); };
  }, [agenticId, offset]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedCategories(new Set());
    setSelectedDirection('');
    setSearchQuery('');
  };

  const hasActiveFilters = selectedCategories.size > 0 || selectedDirection || searchQuery;

  const renderEntry = (entry: AuditEntry) => {
    const config = categoryConfig[entry.category as Category] || categoryConfig.error;
    const dirConfig = directionConfig[entry.direction] || directionConfig.INTERNAL;
    const Icon = config.icon;
    const isExpanded = expandedId === entry.id;
    const isError = entry.category === 'error';
    const isToolFail = entry.category === 'tool_result' && entry.metadata?.success === false;

    return (
      <div
        key={entry.id}
        className={cn(
          'group relative pl-8 py-2.5 pr-3 cursor-pointer transition-colors rounded-lg',
          isError || isToolFail
            ? 'hover:bg-red-500/5'
            : 'hover:bg-white/[0.02]',
          isExpanded && 'bg-white/[0.03]'
        )}
        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
      >
        {/* Timeline line */}
        <div className="absolute left-[15px] top-0 bottom-0 w-px bg-swarm-border/20" />

        {/* Timeline dot */}
        <div className={cn(
          'absolute left-[9px] top-3.5 w-[13px] h-[13px] rounded-full border-2 border-swarm-dark',
          config.bg,
          isError ? 'bg-red-500/30' : ''
        )}>
          <div className={cn('w-full h-full rounded-full', isError ? 'bg-red-400' : '')} />
        </div>

        {/* Entry content */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <div className={cn('p-1 rounded-md shrink-0 mt-0.5', config.bg)}>
              <Icon className={cn('w-3.5 h-3.5', config.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', dirConfig.bg, dirConfig.color)}>
                  {dirConfig.label}
                </span>
                {isToolFail && (
                  <XCircle className="w-3 h-3 text-red-400" />
                )}
              </div>
              <p className={cn(
                'text-sm text-gray-300 mt-0.5',
                !isExpanded && 'line-clamp-1'
              )}>
                {entry.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-gray-500" title={formatFullDate(entry.createdAt, userTimezone)}>
              {formatRelativeTime(entry.createdAt)}
            </span>
            {isExpanded
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            }
          </div>
        </div>

        {/* Expanded metadata */}
        {isExpanded && entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <ExpandedDetails entry={entry} />
        )}
      </div>
    );
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-400" />
          <h4 className="text-sm font-medium text-gray-400">Audit Log</h4>
          <Badge variant="default" size="sm">{total} entries</Badge>
          <Badge variant="info" size="sm">48h TTL</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowFilters(!showFilters)}
            icon={<Filter className="w-3.5 h-3.5" />}
            className={hasActiveFilters ? 'text-sky-400' : ''}
          >
            Filter
          </Button>
          <Button
            size="sm"
            variant={autoRefresh ? 'primary' : 'ghost'}
            onClick={() => setAutoRefresh(!autoRefresh)}
            icon={autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          >
            {autoRefresh ? 'Live' : 'Paused'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fetchEntries(0)}
            icon={<RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />}
          />
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-3 rounded-xl bg-swarm-darker border border-swarm-border/20 space-y-3">
          {/* Search */}
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audit entries..."
            iconLeft={<Search className="w-4 h-4" />}
          />

          {/* Direction filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16">Direction:</span>
            {(['', 'INBOUND', 'INTERNAL', 'OUTBOUND'] as const).map((dir) => (
              <button
                key={dir || 'all'}
                onClick={() => setSelectedDirection(dir)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-full border transition-colors',
                  selectedDirection === dir
                    ? 'border-sky-500/50 bg-sky-500/10 text-sky-400'
                    : 'border-swarm-border/20 text-gray-500 hover:border-swarm-border/40'
                )}
              >
                {dir || 'All'}
              </button>
            ))}
          </div>

          {/* Category chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-500 w-16">Category:</span>
            {CATEGORIES.map((cat) => {
              const config = categoryConfig[cat];
              const isActive = selectedCategories.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded-full border transition-colors',
                    isActive
                      ? `${config.bg} ${config.color} border-current/30`
                      : 'border-swarm-border/20 text-gray-500 hover:border-swarm-border/40'
                  )}
                >
                  {config.label}
                </button>
              );
            })}
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-gray-500 hover:text-gray-300 underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {isLoading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No audit entries yet</p>
            <p className="text-xs mt-1">
              {hasActiveFilters
                ? 'Try adjusting your filters'
                : 'Activity will appear here as the agent processes messages'}
            </p>
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto space-y-0.5">
            {entries.map(renderEntry)}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 border-t border-swarm-border/20">
          <span className="text-xs text-gray-500">
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={offset === 0}
              onClick={() => fetchEntries(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => fetchEntries(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogPanel;
