/**
 * EmailThread Component
 * Thread view for email conversations with collapsible messages
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Paperclip,
  Download,
  Reply,
  ReplyAll,
  Forward,
  Star,
  MoreHorizontal,
  Clock,
  User,
  Users,
  Languages,
  Sparkles,
  ExternalLink,
  FileText,
  Image,
  File,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatDateTime } from '../../../utils/dateFormat';
import type { EmailMessage, EmailAttachment } from '../types';

interface EmailThreadProps {
  messages: EmailMessage[];
  subject: string;
  onReply?: (messageId: string, type: 'reply' | 'replyAll' | 'forward') => void;
  onStar?: (messageId: string, isStarred: boolean) => void;
  onTranslate?: (messageId: string) => void;
  onRephrase?: (messageId: string) => void;
  onAttachmentDownload?: (attachment: EmailAttachment) => void;
  isLoading?: boolean;
  className?: string;
}

export const EmailThread: React.FC<EmailThreadProps> = ({
  messages,
  subject,
  onReply,
  onStar,
  onTranslate,
  onRephrase,
  onAttachmentDownload,
  isLoading,
  className,
}) => {
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    () => new Set(messages.length > 0 ? [messages[messages.length - 1].id] : [])
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-expand latest message when messages change
  useEffect(() => {
    if (messages.length > 0) {
      const latestId = messages[messages.length - 1].id;
      setExpandedMessages(prev => {
        const newSet = new Set(prev);
        newSet.add(latestId);
        return newSet;
      });
    }
  }, [messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const toggleMessage = (messageId: string) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <div className={cn('flex-1 overflow-y-auto p-4 space-y-4', className)}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-slate-800/30 rounded-lg p-4 animate-pulse">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-700/50" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-700/50 rounded w-1/3" />
                <div className="h-3 bg-slate-700/30 rounded w-1/2" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-slate-700/30 rounded w-full" />
              <div className="h-3 bg-slate-700/30 rounded w-4/5" />
              <div className="h-3 bg-slate-700/30 rounded w-3/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={cn('flex-1 flex items-center justify-center', className)}>
        <p className="text-gray-500">No messages in this thread</p>
      </div>
    );
  }

  return (
    <div className={cn('flex-1 overflow-y-auto', className)}>
      {/* Messages */}
      <div className="p-4 space-y-3">
        {messages.map((message, index) => (
          <EmailMessageCard
            key={message.id}
            message={message}
            isExpanded={expandedMessages.has(message.id)}
            isLatest={index === messages.length - 1}
            onToggle={() => toggleMessage(message.id)}
            onReply={onReply}
            onStar={onStar}
            onTranslate={onTranslate}
            onRephrase={onRephrase}
            onAttachmentDownload={onAttachmentDownload}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

interface EmailMessageCardProps {
  message: EmailMessage;
  isExpanded: boolean;
  isLatest: boolean;
  onToggle: () => void;
  onReply?: (messageId: string, type: 'reply' | 'replyAll' | 'forward') => void;
  onStar?: (messageId: string, isStarred: boolean) => void;
  onTranslate?: (messageId: string) => void;
  onRephrase?: (messageId: string) => void;
  onAttachmentDownload?: (attachment: EmailAttachment) => void;
}

const EmailMessageCard: React.FC<EmailMessageCardProps> = ({
  message,
  isExpanded,
  isLatest,
  onToggle,
  onReply,
  onStar,
  onTranslate,
  onRephrase,
  onAttachmentDownload,
}) => {
  const [showActions, setShowActions] = useState(false);

  const hasRecipients = message.to.length > 0 || message.cc.length > 0;

  return (
    <div
      className={cn(
        'bg-slate-800/30 rounded-xl border transition-all duration-200',
        isExpanded ? 'border-white/10' : 'border-transparent hover:border-white/5',
        isLatest && 'ring-1 ring-sky-500/20'
      )}
    >
      {/* Collapsed header */}
      <div
        onClick={onToggle}
        className={cn(
          'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
          !isExpanded && 'hover:bg-white/5 rounded-xl'
        )}
      >
        {/* Avatar */}
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          message.isFromAI ? 'bg-purple-500/20' : 'bg-sky-500/20'
        )}>
          {message.from.avatarUrl ? (
            <img
              src={message.from.avatarUrl}
              alt={message.from.name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : message.isFromAI ? (
            <Sparkles className="w-5 h-5 text-purple-400" />
          ) : (
            <User className="w-5 h-5 text-sky-400" />
          )}
        </div>

        {/* Sender info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-sm truncate',
              !message.isRead ? 'font-semibold text-white' : 'font-medium text-gray-300'
            )}>
              {message.from.name || message.from.email}
            </span>
            {message.isFromAI && (
              <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded font-medium">
                AI
              </span>
            )}
          </div>
          {!isExpanded && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {message.content.text?.slice(0, 100)}...
            </p>
          )}
        </div>

        {/* Timestamp & expand icon */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500">
            {formatDateTime(message.timestamp)}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Recipients */}
          {hasRecipients && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 border-t border-white/5 pt-3">
              {message.to.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">To:</span>
                  {message.to.slice(0, 3).map((p, i) => (
                    <span key={i} className="text-gray-400">
                      {p.name || p.email}{i < Math.min(message.to.length, 3) - 1 && ','}
                    </span>
                  ))}
                  {message.to.length > 3 && (
                    <span className="text-gray-500">+{message.to.length - 3} more</span>
                  )}
                </div>
              )}
              {message.cc.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">Cc:</span>
                  {message.cc.slice(0, 2).map((p, i) => (
                    <span key={i} className="text-gray-400">
                      {p.name || p.email}{i < Math.min(message.cc.length, 2) - 1 && ','}
                    </span>
                  ))}
                  {message.cc.length > 2 && (
                    <span className="text-gray-500">+{message.cc.length - 2}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Email body */}
          <div className="prose prose-invert prose-sm max-w-none">
            {message.content.html ? (
              <div
                dangerouslySetInnerHTML={{ __html: message.content.html }}
                className="email-html-content"
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed">
                {message.content.text}
              </div>
            )}
          </div>

          {/* Attachments */}
          {message.attachments.length > 0 && (
            <div className="border-t border-white/5 pt-3">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                <Paperclip className="w-3.5 h-3.5" />
                <span>{message.attachments.length} attachment{message.attachments.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {message.attachments.map((attachment) => (
                  <AttachmentCard
                    key={attachment.id}
                    attachment={attachment}
                    onDownload={() => onAttachmentDownload?.(attachment)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 border-t border-white/5 pt-3">
            <button
              onClick={() => onReply?.(message.id, 'reply')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <Reply className="w-3.5 h-3.5" />
              Reply
            </button>
            {message.to.length > 1 && (
              <button
                onClick={() => onReply?.(message.id, 'replyAll')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <ReplyAll className="w-3.5 h-3.5" />
                Reply All
              </button>
            )}
            <button
              onClick={() => onReply?.(message.id, 'forward')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <Forward className="w-3.5 h-3.5" />
              Forward
            </button>

            <div className="flex-1" />

            {/* AI Actions */}
            <button
              onClick={() => onTranslate?.(message.id)}
              className="p-1.5 text-gray-500 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors"
              title="Translate"
            >
              <Languages className="w-4 h-4" />
            </button>
            <button
              onClick={() => onRephrase?.(message.id)}
              className="p-1.5 text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
              title="Rephrase"
            >
              <Sparkles className="w-4 h-4" />
            </button>
            <button
              onClick={() => onStar?.(message.id, !message.isStarred)}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                message.isStarred
                  ? 'text-amber-400 hover:text-amber-300'
                  : 'text-gray-500 hover:text-amber-400 hover:bg-amber-500/10'
              )}
              title="Star"
            >
              <Star className={cn('w-4 h-4', message.isStarred && 'fill-current')} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface AttachmentCardProps {
  attachment: EmailAttachment;
  onDownload: () => void;
}

const AttachmentCard: React.FC<AttachmentCardProps> = ({ attachment, onDownload }) => {
  const getIcon = () => {
    if (attachment.mimeType.startsWith('image/')) return Image;
    if (attachment.mimeType.includes('pdf')) return FileText;
    return File;
  };

  const Icon = getIcon();
  const sizeStr = attachment.size < 1024 * 1024
    ? `${Math.round(attachment.size / 1024)} KB`
    : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <button
      onClick={onDownload}
      className="flex items-center gap-2 p-2 bg-slate-700/30 hover:bg-slate-700/50 rounded-lg transition-colors text-left group"
    >
      <div className="w-8 h-8 rounded bg-slate-600/50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 truncate">{attachment.filename}</p>
        <p className="text-[10px] text-gray-500">{sizeStr}</p>
      </div>
      <Download className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
};
