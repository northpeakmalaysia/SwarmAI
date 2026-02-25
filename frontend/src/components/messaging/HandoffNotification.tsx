import React from 'react';
import { Share2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatTime } from '../../utils/dateFormat';

export interface HandoffNotificationProps {
  /** Agent receiving the handoff */
  toAgentName: string;
  /** Reason for the handoff */
  reason: string;
  /** Timestamp of the handoff */
  timestamp?: string;
  /** Additional class names */
  className?: string;
}

/**
 * HandoffNotification displays a notification when a conversation
 * is handed off from one agent to another.
 *
 * @example
 * ```tsx
 * <HandoffNotification
 *   toAgentName="Technical Agent"
 *   reason="CRM integration query"
 *   timestamp="2024-01-28T10:35:00Z"
 * />
 * ```
 */
export const HandoffNotification: React.FC<HandoffNotificationProps> = ({
  toAgentName,
  reason,
  timestamp,
  className,
}) => {
  return (
    <div className={cn('flex justify-center my-4', className)}>
      <div className="px-4 py-2 bg-purple-500/20 rounded-lg text-xs text-purple-400 flex items-center gap-2">
        <Share2 className="w-3.5 h-3.5" />
        <span>
          Conversation handed off to{' '}
          <span className="font-medium">{toAgentName}</span>
          {reason && (
            <>
              {' '}
              for <span className="text-purple-300">{reason}</span>
            </>
          )}
        </span>
        {timestamp && (
          <span className="text-purple-500 ml-2">{formatTime(timestamp)}</span>
        )}
      </div>
    </div>
  );
};

export default HandoffNotification;
