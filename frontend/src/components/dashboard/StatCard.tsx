import { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  subtitleColor?: 'emerald' | 'gray' | 'amber' | 'rose';
  icon: ReactNode;
  iconColor?: string;
}

const subtitleColorClasses = {
  emerald: 'text-emerald-400',
  gray: 'text-gray-500',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
};

export function StatCard({
  title,
  value,
  subtitle,
  subtitleColor = 'gray',
  icon,
  iconColor = 'text-swarm-primary',
}: StatCardProps) {
  return (
    <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed hover:shadow-neu-pressed-glow transition-all duration-300">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{title}</span>
        <div className={iconColor}>{icon}</div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {subtitle && (
        <div className={`text-xs mt-1 ${subtitleColorClasses[subtitleColor]}`}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
