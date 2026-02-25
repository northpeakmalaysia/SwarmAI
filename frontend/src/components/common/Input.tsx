import React, { forwardRef, useId } from 'react';
import { cn } from '../../lib/utils';

export type InputSize = 'sm' | 'md' | 'lg';
export type InputType = 'text' | 'password' | 'email' | 'number' | 'search' | 'tel' | 'url';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input label text */
  label?: string;
  /** Error message to display */
  error?: string;
  /** Helper text below input */
  helperText?: string;
  /** Icon element to render at the start */
  iconLeft?: React.ReactNode;
  /** Icon element to render at the end */
  iconRight?: React.ReactNode;
  /** Input size variant */
  size?: InputSize;
  /** Make input full width */
  fullWidth?: boolean;
  /** Container class name */
  containerClassName?: string;
}

const sizeStyles: Record<InputSize, { input: string; icon: string }> = {
  sm: {
    input: 'px-3 py-1.5 text-sm',
    icon: 'w-4 h-4',
  },
  md: {
    input: 'px-4 py-2 text-sm',
    icon: 'w-4 h-4',
  },
  lg: {
    input: 'px-4 py-3 text-base',
    icon: 'w-5 h-5',
  },
};

const iconPadding: Record<InputSize, { left: string; right: string }> = {
  sm: { left: 'pl-9', right: 'pr-9' },
  md: { left: 'pl-10', right: 'pr-10' },
  lg: { left: 'pl-12', right: 'pr-12' },
};

/**
 * Input component with label, error state, and icon support.
 *
 * @example
 * ```tsx
 * <Input
 *   label="Email Address"
 *   type="email"
 *   placeholder="Enter your email"
 *   iconLeft={<Mail />}
 *   error={errors.email}
 * />
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      iconLeft,
      iconRight,
      size = 'md',
      fullWidth = true,
      containerClassName,
      className,
      id,
      type = 'text',
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full', containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-gray-300"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {iconLeft && (
            <div className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none',
              sizeStyles[size].icon
            )}>
              {iconLeft}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={cn(
              // Base styles
              'w-full rounded-lg border bg-slate-800/50 text-white placeholder-gray-500',
              'transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-900',
              // Size styles
              sizeStyles[size].input,
              // Icon padding
              iconLeft && iconPadding[size].left,
              iconRight && iconPadding[size].right,
              // State styles
              error
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
                : 'border-slate-600 focus:border-sky-500 focus:ring-sky-500/50',
              disabled && 'opacity-50 cursor-not-allowed bg-slate-900',
              // Custom classes
              className
            )}
            {...props}
          />

          {iconRight && (
            <div className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none',
              sizeStyles[size].icon
            )}>
              {iconRight}
            </div>
          )}
        </div>

        {error && (
          <p id={errorId} className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {helperText && !error && (
          <p id={helperId} className="text-sm text-gray-500">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
