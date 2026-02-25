import type { ElementType } from 'react';
import { Cpu, HardDrive, Clock } from 'lucide-react';
import type { HealthMetrics } from '../../stores/localAgentStore';

interface AgentHealthPanelProps {
  metrics: HealthMetrics | null;
  isOnline: boolean;
  className?: string;
}

/** Circular gauge for CPU/Memory usage */
function UsageGauge({ value, label, icon: Icon, color }: {
  value: number;
  label: string;
  icon: ElementType;
  color: string;
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  const getColor = (v: number) => {
    if (v >= 90) return 'text-red-400';
    if (v >= 70) return 'text-yellow-400';
    return color;
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          {/* Background circle */}
          <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor"
            className="text-gray-800" strokeWidth="4" />
          {/* Progress circle */}
          <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor"
            className={getColor(value)} strokeWidth="4"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-sm font-bold ${getColor(value)}`}>{value}%</span>
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs text-gray-400">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
    </div>
  );
}

/** Format uptime as human-readable */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function AgentHealthPanel({ metrics, isOnline, className }: AgentHealthPanelProps) {
  if (!metrics) {
    return (
      <div className={`text-gray-500 text-sm text-center py-4 ${className || ''}`}>
        {isOnline
          ? 'Waiting for health data (next heartbeat)...'
          : 'Health data unavailable — agent is offline.'}
      </div>
    );
  }

  const memUsedPct = metrics.memory.total > 0
    ? Math.round((metrics.memory.used / metrics.memory.total) * 100)
    : 0;

  return (
    <div className={`space-y-3 ${className || ''}`}>
      {/* Gauges row */}
      <div className="flex items-center justify-center gap-8">
        <UsageGauge value={metrics.cpu.usage} label="CPU" icon={Cpu} color="text-cyan-400" />
        <UsageGauge value={memUsedPct} label="Memory" icon={HardDrive} color="text-purple-400" />
      </div>

      {/* Detail metrics */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between text-gray-400">
          <span>CPU Cores</span>
          <span className="text-gray-200">{metrics.cpu.cores}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Load Avg</span>
          <span className="text-gray-200">{metrics.loadAvg.join(', ')}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Memory</span>
          <span className="text-gray-200">
            {(metrics.memory.used / 1024).toFixed(1)}GB / {(metrics.memory.total / 1024).toFixed(1)}GB
          </span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Uptime</span>
          <span className="text-gray-200">{formatUptime(metrics.uptime)}</span>
        </div>
      </div>

      {/* Alert badges */}
      <div className="flex gap-2">
        {metrics.cpu.usage >= 90 && (
          <span className="px-2 py-0.5 bg-red-900/20 border border-red-800/30 rounded text-[10px] text-red-400">
            High CPU
          </span>
        )}
        {memUsedPct >= 90 && (
          <span className="px-2 py-0.5 bg-red-900/20 border border-red-800/30 rounded text-[10px] text-red-400">
            High Memory
          </span>
        )}
        {metrics.cpu.usage < 90 && memUsedPct < 90 && (
          <span className="px-2 py-0.5 bg-green-900/20 border border-green-800/30 rounded text-[10px] text-green-400">
            Healthy
          </span>
        )}
      </div>
    </div>
  );
}
