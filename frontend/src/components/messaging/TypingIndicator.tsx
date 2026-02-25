import React from 'react';
import { cn } from '../../lib/utils';

export interface TypingIndicatorProps {
  /** Name of the person typing */
  name?: string;
  /** Whether to show the indicator */
  isVisible?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Animated typing indicator showing dots animation
 * Used to indicate when someone is typing a message
 *
 * @example
 * ```tsx
 * <TypingIndicator name="John" isVisible={isTyping} />
 * ```
 */
export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  name,
  isVisible = true,
  className,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-1 px-4 py-2 bg-slate-700 rounded-[18px_18px_18px_4px]">
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '0ms', animationDuration: '600ms' }}
        />
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '150ms', animationDuration: '600ms' }}
        />
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '300ms', animationDuration: '600ms' }}
        />
      </div>
      {name && (
        <span className="text-xs text-gray-400">
          {name} is typing...
        </span>
      )}
    </div>
  );
};

export default TypingIndicator;
