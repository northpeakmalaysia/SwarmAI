import { useEffect, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { usePlatformHealthStore, type PlatformHealthAccount } from '../../stores/platformHealthStore';

const platformIcons: Record<string, string> = {
  whatsapp: '💬',
  'telegram-bot': '🤖',
  'telegram-user': '📱',
  email: '📧',
};

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-rose-400';
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-emerald-500/10';
  if (score >= 40) return 'bg-amber-500/10';
  return 'bg-rose-500/10';
}

function statusDot(status: string): string {
  switch (status) {
    case 'connected': return 'bg-emerald-400';
    case 'connecting':
    case 'qr_pending': return 'bg-amber-400';
    case 'error': return 'bg-rose-400';
    default: return 'bg-gray-500';
  }
}

function AccountRow({ account }: { account: PlatformHealthAccount }) {
  const icon = platformIcons[account.platform] || '📡';
  const label = account.agentName || account.platform;

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-sm">{icon}</span>
      <div className={`w-2 h-2 rounded-full ${statusDot(account.status)}`} />
      <span className="text-xs text-gray-300 flex-1 truncate" title={label}>
        {label}
      </span>
      <div className={`text-xs font-mono font-bold ${scoreColor(account.healthScore)}`}>
        {account.healthScore}
      </div>
    </div>
  );
}

export function PlatformHealthPanel() {
  const { summary, accounts, isLoading, fetchSummary, fetchAccounts } = usePlatformHealthStore();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (expanded) {
      fetchAccounts();
    }
  }, [expanded, fetchAccounts]);

  const overallStatus = summary
    ? summary.critical > 0
      ? 'critical'
      : summary.degraded > 0
        ? 'degraded'
        : 'healthy'
    : 'unknown';

  const statusConfig = {
    healthy: { icon: Wifi, text: 'All Healthy', cls: 'bg-emerald-500/10 text-emerald-400' },
    degraded: { icon: AlertTriangle, text: 'Degraded', cls: 'bg-amber-500/10 text-amber-400' },
    critical: { icon: WifiOff, text: 'Critical', cls: 'bg-rose-500/10 text-rose-400' },
    unknown: { icon: Activity, text: 'Loading', cls: 'bg-gray-500/10 text-gray-400' },
  }[overallStatus];

  const StatusIcon = statusConfig.icon;

  return (
    <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 p-4 shadow-neu-pressed-glow relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2 text-white">
          <Activity className="w-4 h-4 text-swarm-primary" />
          Channel Health
        </h3>
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${statusConfig.cls}`}>
          <StatusIcon className="w-3 h-3" />
          {statusConfig.text}
        </div>
      </div>

      {isLoading && !summary ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-swarm-card/50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-emerald-400">{summary?.healthy || 0}</div>
              <div className="text-[10px] text-gray-500 uppercase">Healthy</div>
            </div>
            <div className="bg-swarm-card/50 rounded-lg p-2 text-center">
              <div className={`text-lg font-bold ${(summary?.degraded || 0) > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                {summary?.degraded || 0}
              </div>
              <div className="text-[10px] text-gray-500 uppercase">Degraded</div>
            </div>
            <div className="bg-swarm-card/50 rounded-lg p-2 text-center">
              <div className={`text-lg font-bold ${(summary?.critical || 0) > 0 ? 'text-rose-400' : 'text-gray-500'}`}>
                {summary?.critical || 0}
              </div>
              <div className="text-[10px] text-gray-500 uppercase">Critical</div>
            </div>
          </div>

          {/* Per-platform breakdown */}
          {summary?.byPlatform && summary.byPlatform.length > 0 && (
            <div className="space-y-1 mb-3">
              {summary.byPlatform.map((p) => (
                <div key={p.platform} className="flex items-center gap-2 text-xs">
                  <span>{platformIcons[p.platform] || '📡'}</span>
                  <span className="text-gray-400 flex-1 capitalize">
                    {p.platform.replace('-', ' ')}
                  </span>
                  <span className="text-gray-500">{p.total} acct{p.total !== 1 ? 's' : ''}</span>
                  <div className={`px-1.5 py-0.5 rounded font-mono ${scoreBg(p.avg_score)} ${scoreColor(p.avg_score)}`}>
                    {Math.round(p.avg_score)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Expandable account details */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors pt-1 border-t border-swarm-border/20"
          >
            {expanded ? (
              <>Hide Details <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>Show Accounts <ChevronDown className="w-3 h-3" /></>
            )}
          </button>

          {expanded && accounts.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {accounts.map((acct) => (
                <AccountRow key={acct.accountId} account={acct} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
