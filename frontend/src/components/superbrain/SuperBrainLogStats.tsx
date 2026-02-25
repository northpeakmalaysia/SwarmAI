/**
 * SuperBrain Log Stats
 *
 * Displays summary statistics for SuperBrain activity logs.
 */

import React from 'react';
import { Activity, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import { SuperBrainLogStats as StatsType } from '@/stores/superbrainLogStore';

interface Props {
  stats: StatsType | null;
  isLoading?: boolean;
  ttlHours?: number;
}

export const SuperBrainLogStats: React.FC<Props> = ({ stats, isLoading, ttlHours = 12 }) => {
  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-3 bg-slate-800/50 rounded-lg animate-pulse h-20" />
        ))}
      </div>
    );
  }

  const successRate = stats.total > 0
    ? ((stats.byStatus.success / stats.total) * 100).toFixed(1)
    : '0';

  const topProvider = getTopItem(stats.byProvider);
  const topTier = getTopItem(stats.byTier);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {/* Total Logs */}
      <StatCard
        icon={<Activity className="w-4 h-4" />}
        label={`Total (${ttlHours}h)`}
        value={stats.total.toString()}
        color="blue"
      />

      {/* Success Rate */}
      <StatCard
        icon={Number(successRate) >= 90 ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        label="Success Rate"
        value={`${successRate}%`}
        subValue={`${stats.byStatus.success} / ${stats.total}`}
        color={Number(successRate) >= 90 ? 'green' : Number(successRate) >= 70 ? 'yellow' : 'red'}
      />

      {/* Avg Duration */}
      <StatCard
        icon={<Clock className="w-4 h-4" />}
        label="Avg Duration"
        value={formatDuration(stats.avgDuration)}
        color="purple"
      />

      {/* Top Provider */}
      <StatCard
        icon={<Zap className="w-4 h-4" />}
        label="Top Provider"
        value={formatProvider(topProvider)}
        color="indigo"
      />

      {/* Top Tier */}
      <StatCard
        icon={<Activity className="w-4 h-4" />}
        label="Common Tier"
        value={topTier || 'N/A'}
        color="orange"
      />
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, subValue, color }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    green: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    yellow: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    red: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
    indigo: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  };

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color] || colorClasses.blue}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-lg font-semibold text-white">{value}</div>
      {subValue && (
        <div className="text-xs text-gray-500 mt-0.5">{subValue}</div>
      )}
    </div>
  );
};

function getTopItem(obj: Record<string, number>): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return '';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function formatProvider(provider: string): string {
  if (!provider) return 'N/A';
  const map: Record<string, string> = {
    'ollama': 'Ollama',
    'openrouter': 'OpenRouter',
    'openrouter-free': 'OR Free', // Legacy
    'openrouter-paid': 'OR Paid', // Legacy
    'cli-claude': 'Claude',
    'cli-gemini': 'Gemini',
    'cli-opencode': 'OpenCode',
  };
  return map[provider] || provider;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default SuperBrainLogStats;
