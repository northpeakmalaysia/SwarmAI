import { Activity } from 'lucide-react';

interface HealthMetric {
  label: string;
  value: number;
  color: 'emerald' | 'amber' | 'sky' | 'rose';
}

interface SwarmHealthPanelProps {
  connectivity?: number;
  averageLoad?: number;
  collaborationRate?: number;
  consensusSuccess?: number;
}

const colorClasses = {
  emerald: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500',
  },
  amber: {
    text: 'text-amber-400',
    bg: 'bg-amber-500',
  },
  sky: {
    text: 'text-swarm-primary',
    bg: 'bg-swarm-primary',
  },
  rose: {
    text: 'text-rose-400',
    bg: 'bg-rose-500',
  },
};

function getColorForValue(value: number, isLoad = false): 'emerald' | 'amber' | 'rose' {
  if (isLoad) {
    // For load, lower is better
    if (value <= 50) return 'emerald';
    if (value <= 75) return 'amber';
    return 'rose';
  }
  // For other metrics, higher is better
  if (value >= 80) return 'emerald';
  if (value >= 50) return 'amber';
  return 'rose';
}

function ProgressBar({ value, color }: { value: number; color: keyof typeof colorClasses }) {
  const classes = colorClasses[color];
  return (
    <div className="h-2 bg-swarm-dark rounded-full overflow-hidden">
      <div
        className={`h-full ${classes.bg} rounded-full transition-all duration-500`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function SwarmHealthPanel({
  connectivity = 0,
  averageLoad = 0,
  collaborationRate = 0,
  consensusSuccess = 0,
}: SwarmHealthPanelProps) {
  const metrics: HealthMetric[] = [
    {
      label: 'Connectivity',
      value: connectivity,
      color: getColorForValue(connectivity),
    },
    {
      label: 'Average Load',
      value: averageLoad,
      color: getColorForValue(averageLoad, true),
    },
    {
      label: 'Collaboration Rate',
      value: collaborationRate,
      color: 'sky',
    },
    {
      label: 'Consensus Success',
      value: consensusSuccess,
      color: getColorForValue(consensusSuccess),
    },
  ];

  return (
    <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 p-4 shadow-neu-pressed-glow relative overflow-hidden">
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-white">
        <Activity className="w-4 h-4 text-swarm-primary" />
        Swarm Health
      </h3>

      <div className="space-y-4">
        {metrics.map((metric) => {
          const classes = colorClasses[metric.color];
          return (
            <div key={metric.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-400">{metric.label}</span>
                <span className={classes.text}>{metric.value}%</span>
              </div>
              <ProgressBar value={metric.value} color={metric.color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
