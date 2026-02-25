import { useState, useMemo, useEffect } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAgentStore, type Agent } from '../../stores/agentStore';
import { useSwarmStore } from '../../stores/swarmStore';

type SwarmStatus = 'swarming' | 'busy' | 'idle' | 'offline' | 'error';

const getStatusColor = (status: Agent['status']): string => {
  switch (status) {
    case 'idle':
      return 'bg-emerald-500';
    case 'busy':
      return 'bg-amber-500';
    case 'offline':
    default:
      return 'bg-gray-500';
  }
};

const getStatusBorderColor = (status: Agent['status']): string => {
  switch (status) {
    case 'idle':
      return 'border-emerald-500/50';
    case 'busy':
      return 'border-amber-500/50';
    case 'offline':
    default:
      return 'border-gray-500/50';
  }
};

const getStatusLabel = (status: Agent['status']): string => {
  switch (status) {
    case 'idle':
      return 'Online';
    case 'busy':
      return 'Busy';
    case 'offline':
    default:
      return 'Offline';
  }
};

interface AgentTooltipProps {
  agent: Agent;
  load?: number;
}

const AgentTooltip = ({ agent, load = 0 }: AgentTooltipProps) => {
  return (
    <div className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 min-w-[180px]">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              getStatusColor(agent.status)
            )}
          />
          <span className="text-sm font-medium text-white">{agent.name}</span>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Status</span>
            <span className="text-gray-200">{getStatusLabel(agent.status)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Load</span>
            <span className="text-gray-200">{load}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Model</span>
            <span className="text-gray-200 truncate max-w-[100px]">{agent.model}</span>
          </div>
          {agent.skills?.length > 0 && (
            <div className="pt-1 border-t border-slate-700 mt-1">
              <span className="text-gray-400">Skills:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {agent.skills.slice(0, 3).map((skill) => (
                  <span
                    key={skill}
                    className="px-1.5 py-0.5 bg-slate-700 rounded text-gray-300"
                  >
                    {skill}
                  </span>
                ))}
                {agent.skills.length > 3 && (
                  <span className="text-gray-400">+{agent.skills.length - 3}</span>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Tooltip arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900" />
      </div>
    </div>
  );
};

export interface AgentStatusGridProps {
  className?: string;
  onAgentClick?: (agent: Agent) => void;
}

/**
 * AgentStatusGrid displays a visual grid of all agents with their status.
 * Each agent node shows status color, can be hovered for details,
 * and clicked to view full agent information.
 */
export function AgentStatusGrid({ className, onAgentClick }: AgentStatusGridProps) {
  const { agents, isLoading } = useAgentStore();
  const { extendedStats, fetchExtendedStats } = useSwarmStore();
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  // Fetch extended stats on mount
  useEffect(() => {
    fetchExtendedStats();
  }, [fetchExtendedStats]);

  // Get agent load from real data (loadBalance from extended stats)
  const agentLoads = useMemo(() => {
    const loads: Record<string, number> = {};
    agents.forEach((agent) => {
      if (extendedStats?.loadBalance && extendedStats.loadBalance[agent.id]) {
        const lb = extendedStats.loadBalance[agent.id];
        // Calculate load percentage from current load vs max concurrent
        loads[agent.id] = lb.maxConcurrent > 0
          ? Math.round((lb.currentLoad / lb.maxConcurrent) * 100)
          : 0;
      } else {
        // Default to 0 if no load data available
        loads[agent.id] = 0;
      }
    });
    return loads;
  }, [agents, extendedStats]);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8', className)}>
        <Bot className="w-12 h-12 text-gray-600 mb-3" />
        <p className="text-gray-400 text-sm">No agents available</p>
        <p className="text-gray-500 text-xs mt-1">Create agents to see them here</p>
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2', className)}>
      {agents.map((agent) => {
        const load = agentLoads[agent.id] || 0;

        return (
          <div
            key={agent.id}
            className="relative group"
            onMouseEnter={() => setHoveredAgent(agent.id)}
            onMouseLeave={() => setHoveredAgent(null)}
          >
            <button
              onClick={() => onAgentClick?.(agent)}
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200',
                'border-2 hover:scale-110 hover:shadow-lg',
                getStatusColor(agent.status),
                getStatusBorderColor(agent.status),
                'relative overflow-hidden'
              )}
              title={agent.name}
            >
              {/* Load indicator overlay */}
              {agent.status !== 'offline' && load > 0 && (
                <div
                  className="absolute inset-0 bg-black/30 transition-all duration-300"
                  style={{ clipPath: `inset(${100 - load}% 0 0 0)` }}
                />
              )}

              {/* Agent initials */}
              <span className="relative text-xs text-white font-bold tracking-wide">
                {agent.name.substring(0, 2).toUpperCase()}
              </span>

              {/* Pulse animation for busy agents */}
              {agent.status === 'busy' && (
                <span className="absolute inset-0 rounded-lg animate-ping bg-amber-500 opacity-30" />
              )}
            </button>

            {/* Tooltip */}
            <AgentTooltip agent={agent} load={load} />
          </div>
        );
      })}
    </div>
  );
}

export default AgentStatusGrid;
