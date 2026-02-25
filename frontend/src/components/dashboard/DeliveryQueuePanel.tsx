import { useEffect, useState } from 'react';
import { Send, AlertTriangle, CheckCircle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { useDLQStore } from '../../stores/dlqStore';
import { formatDateTime } from '@/utils/dateFormat';

export function DeliveryQueuePanel() {
  const {
    stats,
    healthStatus,
    recent24h,
    deadLetters,
    isLoading,
    fetchStats,
    fetchDeadLetters,
    retryDeadLetter,
  } = useDLQStore();

  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (expanded) {
      fetchDeadLetters();
    }
  }, [expanded, fetchDeadLetters]);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    await retryDeadLetter(id);
    setRetrying(null);
  };

  const total = stats
    ? (stats.pending || 0) + (stats.sending || 0) + (stats.sent || 0) + (stats.retrying || 0) + (stats.dead || 0)
    : 0;

  const deadCount = stats?.dead || 0;
  const retryingCount = stats?.retrying || 0;

  return (
    <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 p-4 shadow-neu-pressed-glow relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2 text-white">
          <Send className="w-4 h-4 text-swarm-primary" />
          Delivery Queue
        </h3>
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
          healthStatus === 'healthy'
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-amber-500/10 text-amber-400'
        }`}>
          {healthStatus === 'healthy'
            ? <CheckCircle className="w-3 h-3" />
            : <AlertTriangle className="w-3 h-3" />
          }
          {healthStatus === 'healthy' ? 'Healthy' : 'Attention'}
        </div>
      </div>

      {isLoading && !stats ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-swarm-card/50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-emerald-400">{stats?.sent || 0}</div>
              <div className="text-[10px] text-gray-500 uppercase">Sent</div>
            </div>
            <div className="bg-swarm-card/50 rounded-lg p-2 text-center">
              <div className={`text-lg font-bold ${retryingCount > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                {retryingCount}
              </div>
              <div className="text-[10px] text-gray-500 uppercase">Retrying</div>
            </div>
            <div className="bg-swarm-card/50 rounded-lg p-2 text-center">
              <div className={`text-lg font-bold ${deadCount > 0 ? 'text-rose-400' : 'text-gray-500'}`}>
                {deadCount}
              </div>
              <div className="text-[10px] text-gray-500 uppercase">Dead</div>
            </div>
          </div>

          {/* 24h summary */}
          <div className="text-xs text-gray-500 mb-3">
            Last 24h: <span className="text-emerald-400">{recent24h.sent} sent</span>
            {recent24h.dead > 0 && (
              <>, <span className="text-rose-400">{recent24h.dead} failed</span></>
            )}
            {total > 0 && <span className="text-gray-600 ml-1">({total} total)</span>}
          </div>

          {/* Dead letters expandable section */}
          {deadCount > 0 && (
            <div className="border-t border-swarm-border/20 pt-2">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center justify-between w-full text-xs text-gray-400 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  {deadCount} dead letter{deadCount !== 1 ? 's' : ''}
                </span>
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {expanded && (
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                  {deadLetters.map((dl) => (
                    <div key={dl.id} className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-300 truncate">{dl.recipient}</div>
                          <div className="text-[10px] text-rose-400 truncate mt-0.5">{dl.last_error}</div>
                          <div className="text-[10px] text-gray-600 mt-0.5">
                            {dl.source} &middot; {dl.retry_count} retries &middot; {formatDateTime(dl.dead_at)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRetry(dl.id)}
                          disabled={retrying === dl.id}
                          className="shrink-0 p-1.5 rounded-md bg-swarm-card hover:bg-swarm-border text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                          title="Retry"
                        >
                          <RotateCcw className={`w-3 h-3 ${retrying === dl.id ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
