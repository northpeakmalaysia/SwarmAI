import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Agent status types
 */
export type AgentStatus =
  | 'online'
  | 'offline'
  | 'swarming'
  | 'processing'
  | 'disconnected'
  | 'error'
  | 'idle'
  | 'busy';

export interface AgentStatusBadgeProps {
  /** Current agent status */
  status: AgentStatus;
  /** Show text label alongside indicator */
  showLabel?: boolean;
  /** Custom label override */
  label?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
}

/**
 * Status configuration mapping
 */
const statusConfig: Record<
  AgentStatus,
  { bg: string; text: string; label: string; pulse?: boolean }
> = {
  online: {
    bg: 'bg-emerald-400',
    text: 'text-emerald-400',
    label: 'Online',
    pulse: false,
  },
  swarming: {
    bg: 'bg-emerald-400',
    text: 'text-emerald-400',
    label: 'Swarming',
    pulse: true,
  },
  idle: {
    bg: 'bg-emerald-400',
    text: 'text-emerald-400',
    label: 'Ready',
    pulse: false,
  },
  processing: {
    bg: 'bg-amber-400',
    text: 'text-amber-400',
    label: 'Processing',
    pulse: true,
  },
  busy: {
    bg: 'bg-amber-400',
    text: 'text-amber-400',
    label: 'Busy',
    pulse: true,
  },
  offline: {
    bg: 'bg-gray-400',
    text: 'text-gray-400',
    label: 'Offline',
    pulse: false,
  },
  disconnected: {
    bg: 'bg-gray-400',
    text: 'text-gray-400',
    label: 'Disconnected',
    pulse: false,
  },
  error: {
    bg: 'bg-red-400',
    text: 'text-red-400',
    label: 'Error',
    pulse: false,
  },
};

/**
 * Size configuration
 */
const sizeConfig: Record<'sm' | 'md' | 'lg', { dot: string; text: string; container: string }> = {
  sm: {
    dot: 'w-1.5 h-1.5',
    text: 'text-xs',
    container: 'gap-1',
  },
  md: {
    dot: 'w-2 h-2',
    text: 'text-sm',
    container: 'gap-1.5',
  },
  lg: {
    dot: 'w-2.5 h-2.5',
    text: 'text-base',
    container: 'gap-2',
  },
};

/**
 * AgentStatusBadge - Displays agent status with optional label
 *
 * @example
 * ```tsx
 * <AgentStatusBadge status="online" />
 * <AgentStatusBadge status="swarming" showLabel />
 * <AgentStatusBadge status="processing" size="lg" label="Working..." />
 * ```
 */
export const AgentStatusBadge: React.FC<AgentStatusBadgeProps> = ({
  status,
  showLabel = true,
  label,
  size = 'md',
  className,
}) => {
  const config = statusConfig[status] || statusConfig.offline;
  const sizes = sizeConfig[size];

  return (
    <div
      className={cn(
        'inline-flex items-center',
        sizes.container,
        className
      )}
      role="status"
      aria-label={`Status: ${label || config.label}`}
    >
      {/* Status indicator dot */}
      <span className="relative flex">
        <span
          className={cn(
            'rounded-full',
            sizes.dot,
            config.bg
          )}
        />
        {/* Pulse animation for active states */}
        {config.pulse && (
          <span
            className={cn(
              'absolute inline-flex rounded-full opacity-75 animate-ping',
              sizes.dot,
              config.bg
            )}
          />
        )}
      </span>

      {/* Status text */}
      {showLabel && (
        <span className={cn(sizes.text, config.text, 'font-medium')}>
          {label || config.label}
        </span>
      )}
    </div>
  );
};

AgentStatusBadge.displayName = 'AgentStatusBadge';

export default AgentStatusBadge;
