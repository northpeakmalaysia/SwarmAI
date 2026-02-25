import { ArrowRight } from 'lucide-react';

export interface Handoff {
  id: string;
  fromAgent: {
    name: string;
    color: string;
  };
  toAgent: {
    name: string;
    color: string;
  };
  timestamp: string;
}

interface RecentHandoffsProps {
  handoffs: Handoff[];
}

const agentColors: Record<string, string> = {
  emerald: 'text-emerald-400',
  sky: 'text-sky-400',
  rose: 'text-rose-400',
  amber: 'text-amber-400',
  purple: 'text-purple-400',
  blue: 'text-blue-400',
};

export function RecentHandoffs({ handoffs }: RecentHandoffsProps) {
  if (handoffs.length === 0) {
    return (
      <div>
        <h4 className="text-sm font-medium mb-3 text-white">Recent Handoffs</h4>
        <p className="text-xs text-gray-500">No recent handoffs</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-medium mb-3 text-white">Recent Handoffs</h4>
      <div className="space-y-2">
        {handoffs.map((handoff) => (
          <div key={handoff.id} className="flex items-center gap-2 text-xs">
            <span className={agentColors[handoff.fromAgent.color] || 'text-gray-400'}>
              {handoff.fromAgent.name}
            </span>
            <ArrowRight className="w-3 h-3 text-gray-500" />
            <span className={agentColors[handoff.toAgent.color] || 'text-gray-400'}>
              {handoff.toAgent.name}
            </span>
            <span className="text-gray-500 ml-auto">{handoff.timestamp}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
