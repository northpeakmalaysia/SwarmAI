import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Badge visual variant */
  variant?: BadgeVariant;
  /** Badge size */
  size?: BadgeSize;
  /** Show dot indicator before text */
  dot?: boolean;
  /** Pulse animation for dot (useful for status indicators) */
  pulse?: boolean;
  /** Make badge rounded-full (pill shape) */
  pill?: boolean;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  default: {
    bg: 'bg-slate-600/50',
    text: 'text-gray-300',
    dot: 'bg-gray-400',
  },
  success: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
  },
  warning: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
  },
  error: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    dot: 'bg-red-400',
  },
  info: {
    bg: 'bg-sky-500/20',
    text: 'text-sky-400',
    dot: 'bg-sky-400',
  },
};

const sizeStyles: Record<BadgeSize, { badge: string; dot: string }> = {
  sm: {
    badge: 'px-2 py-0.5 text-xs',
    dot: 'w-1.5 h-1.5',
  },
  md: {
    badge: 'px-2.5 py-1 text-sm',
    dot: 'w-2 h-2',
  },
};

/**
 * Badge component for status indicators, labels, and tags.
 *
 * @example
 * ```tsx
 * // Simple badge
 * <Badge variant="success">Active</Badge>
 *
 * // With dot indicator
 * <Badge variant="success" dot pulse>Online</Badge>
 *
 * // Small size
 * <Badge variant="info" size="sm">New</Badge>
 * ```
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'default',
      size = 'md',
      dot = false,
      pulse = false,
      pill = true,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const styles = variantStyles[variant];
    const sizes = sizeStyles[size];

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 font-medium',
          styles.bg,
          styles.text,
          sizes.badge,
          pill ? 'rounded-full' : 'rounded-md',
          className
        )}
        {...props}
      >
        {dot && (
          <span
            className={cn(
              'rounded-full flex-shrink-0',
              styles.dot,
              sizes.dot,
              pulse && 'animate-pulse'
            )}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

/**
 * Status badge specifically for agent/connection status.
 */
export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  /** Status type that maps to visual variant */
  status: 'online' | 'offline' | 'busy' | 'away' | 'error';
}

const statusVariantMap: Record<StatusBadgeProps['status'], BadgeVariant> = {
  online: 'success',
  offline: 'default',
  busy: 'warning',
  away: 'warning',
  error: 'error',
};

const statusLabelMap: Record<StatusBadgeProps['status'], string> = {
  online: 'Online',
  offline: 'Offline',
  busy: 'Busy',
  away: 'Away',
  error: 'Error',
};

/**
 * Pre-configured status badge for common status types.
 *
 * @example
 * ```tsx
 * <StatusBadge status="online" />
 * <StatusBadge status="busy" />
 * ```
 */
export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, children, ...props }, ref) => {
    return (
      <Badge
        ref={ref}
        variant={statusVariantMap[status]}
        dot
        pulse={status === 'online'}
        {...props}
      >
        {children || statusLabelMap[status]}
      </Badge>
    );
  }
);

StatusBadge.displayName = 'StatusBadge';

export default Badge;
