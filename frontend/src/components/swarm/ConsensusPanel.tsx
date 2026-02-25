import {
  Vote,
  Clock,
  CheckCircle2,
  Users,
  ThumbsUp,
  ThumbsDown,
  Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSwarmStore, type ConsensusRequest, type ConsensusStatus } from '../../stores/swarmStore';
import { Badge } from '../common/Badge';

// Re-export types for backward compatibility
export type { ConsensusStatus, ConsensusRequest };
export type { ConsensusOption } from '../../stores/swarmStore';

const getStatusColor = (status: ConsensusStatus) => {
  switch (status) {
    case 'voting':
      return 'text-amber-400';
    case 'passed':
      return 'text-emerald-400';
    case 'failed':
      return 'text-red-400';
    case 'expired':
      return 'text-gray-400';
  }
};

const getStatusBadgeVariant = (status: ConsensusStatus) => {
  switch (status) {
    case 'voting':
      return 'warning';
    case 'passed':
      return 'success';
    case 'failed':
      return 'error';
    case 'expired':
      return 'default';
  }
};

const getTimeRemaining = (expiresAt: string): string => {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();

  if (diffMs <= 0) return 'Expired';

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours > 0) {
    return `${diffHours}h ${diffMinutes % 60}m left`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ${diffSeconds % 60}s left`;
  } else {
    return `${diffSeconds}s left`;
  }
};

interface ConsensusItemProps {
  consensus: ConsensusRequest;
  onClick?: (consensus: ConsensusRequest) => void;
}

const ConsensusItem = ({ consensus, onClick }: ConsensusItemProps) => {
  const votingProgress = consensus.totalVoters > 0
    ? (consensus.votedCount / consensus.totalVoters) * 100
    : 0;

  return (
    <div
      className={cn(
        'p-3 bg-slate-800/50 rounded-lg border border-slate-700',
        'hover:border-slate-600 transition-colors cursor-pointer'
      )}
      onClick={() => onClick?.(consensus)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-white line-clamp-1">
          {consensus.title}
        </h4>
        <Badge variant={getStatusBadgeVariant(consensus.status)} size="sm">
          {consensus.status.charAt(0).toUpperCase() + consensus.status.slice(1)}
        </Badge>
      </div>

      {/* Description */}
      {consensus.description && (
        <p className="text-xs text-gray-400 mb-3 line-clamp-2">
          {consensus.description}
        </p>
      )}

      {/* Voting progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="flex items-center gap-1 text-gray-400">
            <Users className="w-3 h-3" />
            {consensus.votedCount}/{consensus.totalVoters} voted
          </span>
          <span className="text-gray-500">{votingProgress.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-500 rounded-full transition-all duration-300"
            style={{ width: `${votingProgress}%` }}
          />
        </div>
      </div>

      {/* Options with vote counts */}
      <div className="space-y-2 mb-3">
        {consensus.options.map((option) => {
          const isWinning =
            consensus.status !== 'voting' &&
            option.votes ===
              Math.max(...consensus.options.map((o) => o.votes));

          return (
            <div key={option.id} className="flex items-center gap-2">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span
                    className={cn(
                      'flex items-center gap-1',
                      isWinning ? 'text-emerald-400 font-medium' : 'text-gray-300'
                    )}
                  >
                    {isWinning && <CheckCircle2 className="w-3 h-3" />}
                    {option.label}
                  </span>
                  <span className="text-gray-500">
                    {option.votes} vote{option.votes !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      isWinning ? 'bg-emerald-500' : 'bg-slate-500'
                    )}
                    style={{ width: `${option.percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Time remaining / Result */}
      <div className="flex items-center justify-between">
        {consensus.status === 'voting' ? (
          <span className="flex items-center gap-1 text-xs text-amber-400">
            <Clock className="w-3 h-3" />
            {getTimeRemaining(consensus.expiresAt)}
          </span>
        ) : consensus.result ? (
          <span className={cn('text-xs', getStatusColor(consensus.status))}>
            Result: {consensus.result}
          </span>
        ) : (
          <span className="text-xs text-gray-500">Voting ended</span>
        )}

        {consensus.status === 'voting' && (
          <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
        )}
      </div>
    </div>
  );
};

export interface ConsensusPanelProps {
  className?: string;
  maxItems?: number;
  onConsensusClick?: (consensus: ConsensusRequest) => void;
}

/**
 * ConsensusPanel displays active and recent consensus voting requests.
 * Shows voting progress, options with vote counts, and time remaining.
 * Uses real data from the swarmStore.
 */
export function ConsensusPanel({
  className,
  maxItems = 4,
  onConsensusClick,
}: ConsensusPanelProps) {
  const { consensus } = useSwarmStore();

  // Slice to maxItems
  const displayedConsensus = consensus.slice(0, maxItems);

  const activeCount = consensus.filter((c) => c.status === 'voting').length;
  const passedCount = consensus.filter((c) => c.status === 'passed').length;
  const failedCount = consensus.filter((c) => c.status === 'failed').length;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Summary */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-amber-400">
          {activeCount > 0 ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Vote className="w-3.5 h-3.5" />
          )}
          {activeCount} active vote{activeCount !== 1 ? 's' : ''}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <ThumbsUp className="w-3 h-3" />
          {passedCount} passed
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <ThumbsDown className="w-3 h-3" />
          {failedCount} failed
        </div>
      </div>

      {/* Consensus list */}
      {displayedConsensus.length > 0 ? (
        <div className="space-y-2">
          {displayedConsensus.map((consensusItem) => (
            <ConsensusItem
              key={consensusItem.id}
              consensus={consensusItem}
              onClick={onConsensusClick}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8">
          <Vote className="w-12 h-12 text-gray-600 mb-3" />
          <p className="text-gray-400 text-sm">No consensus votes</p>
          <p className="text-gray-500 text-xs mt-1">Create a consensus vote to start</p>
        </div>
      )}

      {/* Show more link */}
      {consensus.length > maxItems && (
        <button type="button" className="w-full py-2 text-center text-xs text-sky-400 hover:text-sky-300 transition-colors">
          View all {consensus.length} votes
        </button>
      )}
    </div>
  );
}

export default ConsensusPanel;
