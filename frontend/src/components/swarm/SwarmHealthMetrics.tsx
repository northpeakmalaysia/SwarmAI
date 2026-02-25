import { useMemo, useEffect } from 'react';
import {
  Activity,
  Cpu,
  Users,
  Vote,
  Database,
  ArrowLeftRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSwarmStore } from '../../stores/swarmStore';
import { useAgentStore } from '../../stores/agentStore';

type MetricStatus = 'good' | 'warning' | 'critical';

interface Metric {
  label: string;
  value: string;
  percent: number;
  status: MetricStatus;
  icon: React.ReactNode;
  description?: string;
}

const getStatusColor = (status: MetricStatus): string => {
  switch (status) {
    case 'good':
      return 'bg-emerald-500';
    case 'warning':
      return 'bg-amber-500';
    case 'critical':
      return 'bg-red-500';
  }
};

const getStatusTextColor = (status: MetricStatus): string => {
  switch (status) {
    case 'good':
      return 'text-emerald-400';
    case 'warning':
      return 'text-amber-400';
    case 'critical':
      return 'text-red-400';
  }
};

const getStatusBgColor = (status: MetricStatus): string => {
  switch (status) {
    case 'good':
      return 'bg-emerald-500/10';
    case 'warning':
      return 'bg-amber-500/10';
    case 'critical':
      return 'bg-red-500/10';
  }
};

export interface SwarmHealthMetricsProps {
  className?: string;
}

/**
 * SwarmHealthMetrics displays key health metrics for the swarm.
 * Shows connectivity, load, collaboration rate, consensus success rate,
 * knowledge sync lag, and handoff latency with color-coded status indicators.
 */
export function SwarmHealthMetrics({ className }: SwarmHealthMetricsProps) {
  const { status, extendedStats, fetchExtendedStats } = useSwarmStore();
  const { agents } = useAgentStore();

  // Fetch extended stats on mount
  useEffect(() => {
    fetchExtendedStats();
  }, [fetchExtendedStats]);

  const metrics = useMemo<Metric[]>(() => {
    const totalAgents = agents.length || 1;
    const activeAgents = agents.filter((a) => a.status !== 'offline').length;
    const connectivityPercent = (activeAgents / totalAgents) * 100;

    // Calculate average load from load balance data if available
    let avgLoad = 0;
    if (extendedStats?.loadBalance) {
      const loadValues = Object.values(extendedStats.loadBalance);
      if (loadValues.length > 0) {
        const totalLoad = loadValues.reduce((sum, lb) => {
          const loadPercent = lb.maxConcurrent > 0 ? (lb.currentLoad / lb.maxConcurrent) * 100 : 0;
          return sum + loadPercent;
        }, 0);
        avgLoad = totalLoad / loadValues.length;
      }
    } else {
      // Fallback to task-based calculation
      const activeTasks = status?.activeTasks || 0;
      avgLoad = Math.min(100, (activeTasks / Math.max(activeAgents, 1)) * 25);
    }

    // Collaboration rate from extended stats
    const collaborationRate = extendedStats?.collaborations
      ? Math.min(100, ((extendedStats.collaborations.inProgressTasksCount + extendedStats.collaborations.completedTasksCount) /
          Math.max(1, extendedStats.collaborations.activeSessionsCount + extendedStats.collaborations.completedTasksCount)) * 100)
      : 0;

    // Consensus success rate from extended stats
    const totalConsensus = (extendedStats?.consensus?.decidedSessionsCount || 0) +
                          (extendedStats?.consensus?.noConsensusCount || 0);
    const consensusSuccessRate = totalConsensus > 0
      ? ((extendedStats?.consensus?.decidedSessionsCount || 0) / totalConsensus) * 100
      : 0;

    // Average handoff accept time (converted from ms to display value)
    const handoffLatency = extendedStats?.handoffs?.averageAcceptTimeMs ?? 0;

    // Knowledge sync lag (placeholder - could be derived from reputation update timing)
    const knowledgeSyncLag = extendedStats?.reputation?.averageScore
      ? Math.max(0, 100 - extendedStats.reputation.averageScore) * 2
      : 0;

    return [
      {
        label: 'Connectivity',
        value: `${activeAgents}/${totalAgents}`,
        percent: connectivityPercent,
        status: connectivityPercent >= 80 ? 'good' : connectivityPercent >= 50 ? 'warning' : 'critical',
        icon: <Users className="w-4 h-4" />,
        description: 'Online agents',
      },
      {
        label: 'Average Load',
        value: `${avgLoad.toFixed(0)}%`,
        percent: avgLoad,
        status: avgLoad <= 60 ? 'good' : avgLoad <= 80 ? 'warning' : 'critical',
        icon: <Cpu className="w-4 h-4" />,
        description: 'Task distribution',
      },
      {
        label: 'Collaboration',
        value: `${collaborationRate.toFixed(0)}%`,
        percent: collaborationRate,
        status: collaborationRate >= 60 ? 'good' : collaborationRate >= 30 ? 'warning' : 'critical',
        icon: <Activity className="w-4 h-4" />,
        description: 'Multi-agent tasks',
      },
      {
        label: 'Consensus',
        value: `${consensusSuccessRate}%`,
        percent: consensusSuccessRate,
        status: consensusSuccessRate >= 80 ? 'good' : consensusSuccessRate >= 60 ? 'warning' : 'critical',
        icon: <Vote className="w-4 h-4" />,
        description: 'Vote success rate',
      },
      {
        label: 'Knowledge Sync',
        value: `${knowledgeSyncLag}ms`,
        percent: Math.max(0, 100 - knowledgeSyncLag),
        status: knowledgeSyncLag <= 50 ? 'good' : knowledgeSyncLag <= 200 ? 'warning' : 'critical',
        icon: <Database className="w-4 h-4" />,
        description: 'Sync latency',
      },
      {
        label: 'Handoff Latency',
        value: `${handoffLatency}ms`,
        percent: Math.max(0, 100 - handoffLatency / 10),
        status: handoffLatency <= 300 ? 'good' : handoffLatency <= 1000 ? 'warning' : 'critical',
        icon: <ArrowLeftRight className="w-4 h-4" />,
        description: 'Transfer speed',
      },
    ];
  }, [status, extendedStats, agents]);

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4', className)}>
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="bg-slate-800 border border-slate-700 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className={cn(
                'p-1.5 rounded-md',
                getStatusBgColor(metric.status)
              )}
            >
              <span className={getStatusTextColor(metric.status)}>
                {metric.icon}
              </span>
            </div>
            <span className="text-sm text-gray-400">{metric.label}</span>
          </div>
          <p className="text-2xl font-bold text-white mb-1">{metric.value}</p>
          {metric.description && (
            <p className="text-xs text-gray-500 mb-2">{metric.description}</p>
          )}
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                getStatusColor(metric.status)
              )}
              style={{ width: `${Math.min(100, Math.max(0, metric.percent))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default SwarmHealthMetrics;
