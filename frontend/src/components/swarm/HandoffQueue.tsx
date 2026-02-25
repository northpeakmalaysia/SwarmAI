import { useState, useMemo, useEffect } from 'react';
import {
  ArrowRight,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeftRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSwarmStore, SwarmHandoff } from '../../stores/swarmStore';
import { Badge } from '../common/Badge';

export type HandoffStatus = 'pending' | 'accepted' | 'rejected' | 'completed' | 'timeout';

export interface Handoff {
  id: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  toAgentName: string;
  reason: string;
  context?: string;
  status: HandoffStatus;
  createdAt: string;
  completedAt?: string;
}

const getStatusBadgeVariant = (status: HandoffStatus) => {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'accepted':
      return 'info';
    case 'rejected':
      return 'error';
    case 'completed':
      return 'success';
    case 'timeout':
      return 'default';
    default:
      return 'default';
  }
};

const getStatusIcon = (status: HandoffStatus) => {
  switch (status) {
    case 'pending':
      return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    case 'accepted':
    case 'completed':
      return <CheckCircle className="w-3.5 h-3.5" />;
    case 'rejected':
    case 'timeout':
      return <XCircle className="w-3.5 h-3.5" />;
    default:
      return null;
  }
};

const formatTimeElapsed = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return `${diffSeconds}s ago`;
  }
};

interface HandoffItemProps {
  handoff: Handoff;
  onClick?: (handoff: Handoff) => void;
}

const HandoffItem = ({ handoff, onClick }: HandoffItemProps) => {
  return (
    <div
      className={cn(
        'p-3 bg-swarm-dark rounded-xl border border-swarm-border/30 shadow-neu-pressed-sm',
        'hover:shadow-neu-pressed-glow transition-all duration-300 cursor-pointer'
      )}
      onClick={() => onClick?.(handoff)}
    >
      {/* Agent transfer visualization */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-full bg-sky-500/20 flex items-center justify-center">
            <span className="text-xs font-bold text-sky-400">
              {handoff.fromAgentName.substring(0, 2).toUpperCase()}
            </span>
          </div>
          <span className="text-sm text-gray-300 truncate max-w-[80px]">
            {handoff.fromAgentName}
          </span>
        </div>

        <ArrowRight className="w-4 h-4 text-gray-500 flex-shrink-0" />

        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <span className="text-xs font-bold text-emerald-400">
              {handoff.toAgentName.substring(0, 2).toUpperCase()}
            </span>
          </div>
          <span className="text-sm text-gray-300 truncate max-w-[80px]">
            {handoff.toAgentName}
          </span>
        </div>
      </div>

      {/* Reason */}
      <p className="text-xs text-gray-400 mb-2 line-clamp-2">{handoff.reason}</p>

      {/* Context preview */}
      {handoff.context && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-1 italic">
          "{handoff.context}"
        </p>
      )}

      {/* Status and time */}
      <div className="flex items-center justify-between">
        <Badge variant={getStatusBadgeVariant(handoff.status)} size="sm">
          <span className="flex items-center gap-1">
            {getStatusIcon(handoff.status)}
            {handoff.status.charAt(0).toUpperCase() + handoff.status.slice(1)}
          </span>
        </Badge>

        <span className="flex items-center gap-1 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          {formatTimeElapsed(handoff.createdAt)}
        </span>
      </div>
    </div>
  );
};

export interface HandoffQueueProps {
  className?: string;
  maxItems?: number;
  onHandoffClick?: (handoff: Handoff) => void;
}

/**
 * HandoffQueue displays a list of pending and recent handoffs between agents.
 * Shows transfer visualization, reason, status, and time elapsed.
 */
export function HandoffQueue({
  className,
  maxItems = 5,
  onHandoffClick,
}: HandoffQueueProps) {
  const { handoffs: storeHandoffs, fetchHandoffs } = useSwarmStore();
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  // Fetch handoffs on mount
  useEffect(() => {
    fetchHandoffs(maxItems + 5); // Fetch a few extra for filtering
  }, [fetchHandoffs, maxItems]);

  // Transform store handoffs to component format
  const handoffs = useMemo<Handoff[]>(() => {
    return storeHandoffs.map((h: SwarmHandoff) => ({
      id: h.id,
      fromAgentId: h.fromAgent.id,
      fromAgentName: h.fromAgent.name,
      toAgentId: h.toAgent.id,
      toAgentName: h.toAgent.name,
      reason: h.reason || 'No reason provided',
      context: undefined, // Context not returned by API currently
      status: h.status as HandoffStatus,
      createdAt: h.createdAt,
      completedAt: h.completedAt,
    }));
  }, [storeHandoffs]);

  // Filter handoffs
  const filteredHandoffs = useMemo(() => {
    return handoffs
      .filter((h) => {
        if (filter === 'pending') return h.status === 'pending';
        if (filter === 'completed') return h.status === 'completed';
        return true;
      })
      .slice(0, maxItems);
  }, [handoffs, filter, maxItems]);

  if (handoffs.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8', className)}>
        <ArrowLeftRight className="w-12 h-12 text-gray-600 mb-3" />
        <p className="text-gray-400 text-sm">No handoff data</p>
        <p className="text-gray-500 text-xs mt-1">Handoffs will appear here when agents transfer conversations</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-3">
        {(['all', 'pending', 'completed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              'px-3 py-1 text-xs rounded-full transition-colors',
              filter === tab
                ? 'bg-sky-500/20 text-sky-400'
                : 'bg-slate-700/50 text-gray-400 hover:text-gray-300'
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Handoff list */}
      {filteredHandoffs.length > 0 ? (
        <div className="space-y-2">
          {filteredHandoffs.map((handoff) => (
            <HandoffItem
              key={handoff.id}
              handoff={handoff}
              onClick={onHandoffClick}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-gray-500 text-sm">No {filter !== 'all' ? filter : ''} handoffs</p>
        </div>
      )}

      {/* Show more link */}
      {handoffs.length > maxItems && (
        <button className="w-full py-2 text-center text-xs text-sky-400 hover:text-sky-300 transition-colors">
          View all {handoffs.length} handoffs
        </button>
      )}
    </div>
  );
}

export default HandoffQueue;
