import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button visual variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Show loading spinner */
  loading?: boolean;
  /** Icon element to render before children */
  icon?: React.ReactNode;
  /** Icon element to render after children */
  iconRight?: React.ReactNode;
  /** Make button full width */
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-sky-500 text-white hover:bg-sky-600 focus:ring-sky-500 focus:ring-offset-slate-900',
  secondary: 'bg-violet-500 text-white hover:bg-violet-600 focus:ring-violet-500 focus:ring-offset-slate-900',
  danger: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500 focus:ring-offset-slate-900',
  ghost: 'text-gray-300 hover:bg-slate-700 focus:ring-slate-500 focus:ring-offset-slate-900',
  outline: 'border border-slate-600 text-gray-300 hover:bg-slate-700 hover:border-slate-500 focus:ring-slate-500 focus:ring-offset-slate-900',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2',
};

const iconSizes: Record<ButtonSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

/**
 * Button component with multiple variants, sizes, and states.
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md" icon={<Plus />}>
 *   Add Agent
 * </Button>
 *
 * <Button variant="danger" loading>
 *   Deleting...
 * </Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconRight,
      fullWidth = false,
      disabled,
      className,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center font-medium rounded-lg',
          'transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // Variant styles
          variantStyles[variant],
          // Size styles
          sizeStyles[size],
          // Full width
          fullWidth && 'w-full',
          // Custom classes
          className
        )}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <Loader2 className={cn(iconSizes[size], 'animate-spin')} aria-hidden="true" />
        ) : (
          icon && <span className={iconSizes[size]} aria-hidden="true">{icon}</span>
        )}
        {children}
        {iconRight && !loading && (
          <span className={iconSizes[size]} aria-hidden="true">{iconRight}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
