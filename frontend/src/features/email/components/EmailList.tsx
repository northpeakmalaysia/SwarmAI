/**
 * EmailList Component
 * Thread-based email list with subject lines and metadata
 */

import React from 'react';
import {
  Star,
  Paperclip,
  Mail,
  MailOpen,
  Clock,
  User,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { EmailThread } from '../types';

interface EmailListProps {
  threads: EmailThread[];
  selectedId?: string;
  onSelect: (thread: EmailThread) => void;
  onStar?: (threadId: string, isStarred: boolean) => void;
  isLoading?: boolean;
  className?: string;
}

export const EmailList: React.FC<EmailListProps> = ({
  threads,
  selectedId,
  onSelect,
  onStar,
  isLoading,
  className,
}) => {
  if (isLoading) {
    return (
      <div className={cn('flex-1 overflow-y-auto', className)}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-white/5 animate-pulse">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-700/50" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-700/50 rounded w-3/4" />
                <div className="h-3 bg-slate-700/30 rounded w-1/2" />
                <div className="h-3 bg-slate-700/20 rounded w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className={cn('flex-1 flex flex-col items-center justify-center py-12', className)}>
        <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
          <Mail className="w-8 h-8 text-gray-500" />
        </div>
        <p className="text-gray-400 text-sm">No emails found</p>
        <p className="text-gray-500 text-xs mt-1">Your inbox is empty</p>
      </div>
    );
  }

  return (
    <div className={cn('flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700', className)}>
      {threads.map((thread) => (
        <EmailListItem
          key={thread.id}
          thread={thread}
          isSelected={thread.id === selectedId}
          onClick={() => onSelect(thread)}
          onStar={onStar}
        />
      ))}
    </div>
  );
};

interface EmailListItemProps {
  thread: EmailThread;
  isSelected: boolean;
  onClick: () => void;
  onStar?: (threadId: string, isStarred: boolean) => void;
}

const EmailListItem: React.FC<EmailListItemProps> = ({
  thread,
  isSelected,
  onClick,
  onStar,
}) => {
  const isUnread = thread.unreadCount > 0;

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStar?.(thread.id, !thread.isStarred);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'group px-4 py-3 border-b border-white/5 cursor-pointer transition-all duration-200',
        isSelected
          ? 'bg-sky-500/10 border-l-2 border-l-sky-500'
          : 'hover:bg-white/5 border-l-2 border-l-transparent',
        isUnread && !isSelected && 'bg-slate-800/30'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar / Unread indicator */}
        <div className="relative flex-shrink-0">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center',
            isUnread ? 'bg-sky-500/20' : 'bg-slate-700/50'
          )}>
            {isUnread ? (
              <Mail className="w-5 h-5 text-sky-400" />
            ) : (
              <MailOpen className="w-5 h-5 text-gray-500" />
            )}
          </div>
          {isUnread && thread.unreadCount > 1 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-sky-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Subject line */}
          <div className="flex items-center gap-2">
            <h4 className={cn(
              'text-sm truncate flex-1',
              isUnread ? 'font-semibold text-white' : 'font-medium text-gray-300'
            )}>
              {thread.subject || '(No Subject)'}
            </h4>
            {thread.messageCount > 1 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-slate-700/50 text-gray-400 rounded font-medium">
                {thread.messageCount}
              </span>
            )}
          </div>

          {/* Participants */}
          <div className="flex items-center gap-1 mt-0.5">
            <User className="w-3 h-3 text-gray-500" />
            <p className="text-xs text-gray-400 truncate">
              {thread.participants.map(p => p.name || p.email).join(', ') || 'Unknown sender'}
            </p>
          </div>

          {/* Preview */}
          <p className="text-xs text-gray-500 truncate mt-1 leading-relaxed">
            {thread.preview}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-2">
            {/* Timestamp */}
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <Clock className="w-3 h-3" />
              <span>{formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}</span>
            </div>

            {/* Labels */}
            {thread.labels.length > 0 && (
              <div className="flex items-center gap-1">
                {thread.labels.slice(0, 2).map((label) => (
                  <span
                    key={label}
                    className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded"
                  >
                    {label}
                  </span>
                ))}
                {thread.labels.length > 2 && (
                  <span className="text-[10px] text-gray-500">
                    +{thread.labels.length - 2}
                  </span>
                )}
              </div>
            )}

            <div className="flex-1" />

            {/* Indicators */}
            <div className="flex items-center gap-1">
              {thread.hasAttachments && (
                <Paperclip className="w-3.5 h-3.5 text-gray-500" />
              )}
              <button
                onClick={handleStarClick}
                className={cn(
                  'p-0.5 rounded transition-colors',
                  thread.isStarred
                    ? 'text-amber-400 hover:text-amber-300'
                    : 'text-gray-600 hover:text-gray-400 opacity-0 group-hover:opacity-100'
                )}
              >
                <Star className={cn('w-4 h-4', thread.isStarred && 'fill-current')} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
