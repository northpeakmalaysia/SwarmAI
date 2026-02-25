import React from 'react';
import { cn } from '../../lib/utils';

export interface ToggleSwitchProps {
  /** Whether the toggle is checked */
  checked: boolean;
  /** Callback when toggle state changes */
  onChange: (checked: boolean) => void;
  /** Label text */
  label?: string;
  /** Description text below label */
  description?: string;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional className for container */
  className?: string;
}

/**
 * ToggleSwitch - A styled toggle switch component
 */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  className,
}) => {
  const sizes = {
    sm: {
      track: 'w-9 h-5',
      dot: 'w-3.5 h-3.5',
      translate: 'translate-x-4',
    },
    md: {
      track: 'w-11 h-6',
      dot: 'w-4 h-4',
      translate: 'translate-x-5',
    },
  };

  const s = sizes[size];

  return (
    <div className={cn('flex items-center justify-between', className)}>
      {(label || description) && (
        <div className="flex-1 min-w-0 mr-3">
          {label && (
            <p className={cn(
              'font-medium text-white',
              size === 'sm' ? 'text-xs' : 'text-sm'
            )}>
              {label}
            </p>
          )}
          {description && (
            <p className={cn(
              'text-gray-400 mt-0.5',
              size === 'sm' ? 'text-[10px]' : 'text-xs'
            )}>
              {description}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          s.track,
          'relative inline-flex flex-shrink-0 rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:ring-offset-2 focus:ring-offset-slate-900',
          checked ? 'bg-sky-500' : 'bg-slate-600',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            s.dot,
            'pointer-events-none inline-block rounded-full bg-white shadow-sm transform transition-transform duration-200 ease-in-out',
            checked ? s.translate : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
};

ToggleSwitch.displayName = 'ToggleSwitch';

export default ToggleSwitch;
