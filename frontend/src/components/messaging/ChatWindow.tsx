import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Phone,
  Video,
  MoreVertical,
  Info,
  ArrowDown,
  Loader2,
  User,
  Users,
  Bot,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDateSeparator as formatDateSeparatorUtil, isSameDay } from '../../utils/dateFormat';
import type { Chat, Message, Platform } from '../../types';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { useAuthStore } from '../../stores/authStore';
import { TypingIndicator } from './TypingIndicator';
import { MediaPreview, MediaItem } from './MediaPreview';
import { useSenderColors } from './hooks/useSenderColors';

export interface ChatWindowProps {
  /** The chat to display */
  chat: Chat;
  /** Messages in the chat */
  messages: Message[];
  /** Whether messages are loading */
  isLoading?: boolean;
  /** Whether more messages can be loaded */
  hasMore?: boolean;
  /** Callback to load more messages */
  onLoadMore?: () => void;
  /** Callback when message is sent */
  onSend: (content: string, attachments?: File[]) => void;
  /** Whether a message is currently being sent */
  isSending?: boolean;
  /** Typing indicators (usernames of people typing) */
  typingUsers?: string[];
  /** Callback when user starts/stops typing */
  onTyping?: (isTyping: boolean) => void;
  /** Callback to toggle info panel */
  onToggleInfo?: () => void;
  /** Whether info panel is open */
  showInfo?: boolean;
  /** Hide the header (useful for mobile when parent has custom header) */
  hideHeader?: boolean;
  /** Whether message sync is in progress */
  isSyncing?: boolean;
  /** Platform of the current chat */
  platform?: Platform;
  /** Callback to trigger message sync */
  onSync?: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Platform icon component
 */
const PlatformIcon: React.FC<{ platform: Platform; className?: string }> = ({
  platform,
  className,
}) => {
  const iconClass = cn('w-4 h-4', className);

  switch (platform) {
    case 'whatsapp':
      return (
        <svg className={cn(iconClass, 'text-emerald-400')} viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      );
    case 'telegram-bot':
    case 'telegram-user':
      return (
        <svg className={cn(iconClass, 'text-sky-400')} viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      );
    case 'email':
      return (
        <svg className={cn(iconClass, 'text-rose-400')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 7L12 14L2 7" />
        </svg>
      );
    default:
      return <Bot className={cn(iconClass, 'text-gray-400')} />;
  }
};

/**
 * Get platform label
 */
const getPlatformLabel = (platform: Platform): string => {
  switch (platform) {
    case 'whatsapp':
      return 'WhatsApp';
    case 'telegram-bot':
      return 'Telegram Bot';
    case 'telegram-user':
      return 'Telegram';
    case 'email':
      return 'Email';
    default:
      return 'Chat';
  }
};

/**
 * Date separator component
 */
const DateSeparator: React.FC<{ date: string }> = ({ date }) => (
  <div className="flex items-center justify-center my-4">
    <div className="px-4 py-1.5 bg-slate-700 rounded-full text-xs text-gray-300">
      {formatDateSeparatorUtil(date)}
    </div>
  </div>
);

/**
 * ChatWindow component for displaying and interacting with messages
 *
 * @example
 * ```tsx
 * <ChatWindow
 *   chat={selectedChat}
 *   messages={messages}
 *   onSend={handleSendMessage}
 *   isSending={isSending}
 *   typingUsers={['John']}
 * />
 * ```
 */
export const ChatWindow: React.FC<ChatWindowProps> = ({
  chat,
  messages,
  isLoading = false,
  hasMore = false,
  onLoadMore,
  onSend,
  isSending = false,
  typingUsers = [],
  onTyping,
  onToggleInfo,
  showInfo = false,
  hideHeader = false,
  isSyncing = false,
  platform,
  onSync,
  className,
}) => {
  const token = useAuthStore((state) => state.token);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const prevChatIdRef = useRef(chat.id);
  const isLoadingMoreRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [replyTo, setReplyTo] = useState<{
    id: string;
    senderName: string;
    content: string;
  } | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{
    open: boolean;
    items: MediaItem[];
    index: number;
  }>({ open: false, items: [], index: 0 });

  // Get primary participant
  const primaryParticipant = chat.participants[0];
  const avatarInitial = primaryParticipant?.name?.charAt(0).toUpperCase() || '?';

  // Get sender colors for group chats
  const { getSenderColor } = useSenderColors(chat.id);

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // Auto-scroll only for NEW messages, not when loading older ones
  useEffect(() => {
    const prevLength = prevMessagesLengthRef.current;
    const prevChatId = prevChatIdRef.current;
    const currentLength = messages.length;

    // Chat switched - scroll to bottom immediately
    if (prevChatId !== chat.id) {
      scrollToBottom(false);
      prevChatIdRef.current = chat.id;
      prevMessagesLengthRef.current = currentLength;
      return;
    }

    // New messages added at the END (not loading older at top)
    // Only scroll if autoScroll is enabled and we're not loading more history
    if (currentLength > prevLength && autoScroll && !isLoadingMoreRef.current) {
      scrollToBottom(true); // Smooth scroll for new messages
    }

    prevMessagesLengthRef.current = currentLength;
  }, [messages.length, chat.id, autoScroll, scrollToBottom]);

  // Handle load more - preserves scroll position
  const handleLoadMore = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || !onLoadMore) return;

    const scrollHeightBefore = container.scrollHeight;

    isLoadingMoreRef.current = true;
    onLoadMore();

    // After messages loaded, maintain scroll position
    requestAnimationFrame(() => {
      const scrollHeightAfter = container.scrollHeight;
      const heightDiff = scrollHeightAfter - scrollHeightBefore;
      container.scrollTop += heightDiff; // Maintain visual position
      isLoadingMoreRef.current = false;
    });
  }, [onLoadMore]);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Show scroll button if user has scrolled up
    setShowScrollButton(distanceFromBottom > 100);

    // Enable auto-scroll when near bottom
    setAutoScroll(distanceFromBottom < 50);

    // Load more when scrolled near top (use handleLoadMore to preserve position)
    if (scrollTop < 100 && hasMore && !isLoading && !isLoadingMoreRef.current) {
      handleLoadMore();
    }
  }, [hasMore, isLoading, handleLoadMore]);

  // Handle reply
  const handleReply = (message: Message) => {
    const content = message.content.text ||
      (message.content.type !== 'text' ? `[${message.content.type}]` : '');
    setReplyTo({
      id: message.id,
      senderName: message.sender.name,
      content,
    });
  };

  // Handle copy
  const handleCopy = (message: Message) => {
    const text = message.content.text || '';
    navigator.clipboard.writeText(text);
  };

  // Handle media preview
  const handleMediaClick = (url: string, type: 'image' | 'video') => {
    // Collect all media items from messages
    const mediaItems: MediaItem[] = messages
      .filter(
        (m) =>
          (m.content.type === 'image' || m.content.type === 'video') &&
          m.content.media?.url
      )
      .map((m) => ({
        id: m.id,
        url: m.content.media!.url!,
        type: m.content.type as 'image' | 'video',
        caption: m.content.media?.caption,
        filename: m.content.media?.fileName,
      }));

    const index = mediaItems.findIndex((item) => item.url === url);
    setMediaPreview({
      open: true,
      items: mediaItems,
      index: index >= 0 ? index : 0,
    });
  };

  // Handle send
  const handleSend = (content: string, attachments?: File[]) => {
    onSend(content, attachments);
    setReplyTo(null);
  };

  // Render messages with date separators
  const renderMessages = () => {
    const elements: React.ReactNode[] = [];
    let lastDate: string | null = null;

    messages.forEach((message, index) => {
      // Add date separator if needed
      if (!lastDate || !isSameDay(lastDate, message.timestamp)) {
        elements.push(
          <DateSeparator key={`date-${message.timestamp}`} date={message.timestamp} />
        );
        lastDate = message.timestamp;
      }

      // Determine if avatar should be shown
      // For group chats: always show avatar/sender name for incoming messages
      // For private chats: show avatar for first message or when sender changes
      const previousMessage = messages[index - 1];
      const isIncoming = message.direction === 'incoming';
      const showAvatar =
        (chat.isGroup && isIncoming) || // Always show for incoming group messages
        !previousMessage ||
        previousMessage.sender.id !== message.sender.id ||
        !isSameDay(previousMessage.timestamp, message.timestamp);

      const isOwn = message.direction === 'outgoing';

      // Get sender color for group messages
      const senderColor = chat.isGroup && !isOwn
        ? getSenderColor(message.sender.id)
        : undefined;

      elements.push(
        <MessageBubble
          key={message.id}
          message={message}
          isOwn={isOwn}
          showAvatar={showAvatar}
          isGroup={chat.isGroup}
          senderColor={senderColor}
          onReply={() => handleReply(message)}
          onCopy={() => handleCopy(message)}
          onMediaClick={handleMediaClick}
        />
      );
    });

    return elements;
  };

  return (
    <div className={cn('flex flex-col bg-slate-900 relative overflow-hidden', className)}>
      {/* Header - can be hidden for mobile when parent provides custom header */}
      {!hideHeader && (
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center relative',
              chat.platform === 'whatsapp' && 'bg-emerald-500/20',
              chat.platform === 'telegram-bot' && 'bg-sky-500/20',
              chat.platform === 'telegram-user' && 'bg-sky-500/20',
              chat.platform === 'email' && 'bg-rose-500/20'
            )}
          >
            {primaryParticipant?.avatarUrl ? (
              <img
                src={primaryParticipant.avatarUrl}
                alt={primaryParticipant.name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : chat.isGroup ? (
              <Users className="w-5 h-5 text-gray-300" />
            ) : (
              <span className="text-lg font-medium text-gray-300">{avatarInitial}</span>
            )}
          </div>

          {/* Info */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-medium text-white">{chat.title}</h2>
              <PlatformIcon platform={chat.platform} />
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{getPlatformLabel(chat.platform)}</span>
              {chat.isGroup && (
                <>
                  <span className="w-1 h-1 bg-gray-500 rounded-full" />
                  <span>{chat.participants.length} participants</span>
                </>
              )}
              {chat.assignedAgentId && (
                <>
                  <span className="w-1 h-1 bg-gray-500 rounded-full" />
                  <span className="flex items-center gap-1">
                    <Bot className="w-3 h-3" />
                    Agent assigned
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {chat.platform === 'whatsapp' && (
            <>
              <button className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                <Phone className="w-5 h-5" />
              </button>
              <button className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                <Video className="w-5 h-5" />
              </button>
            </>
          )}
          <button
            onClick={onToggleInfo}
            className={cn(
              'p-2 rounded-lg transition-colors',
              showInfo
                ? 'text-sky-400 bg-sky-500/20'
                : 'text-gray-400 hover:text-white hover:bg-slate-700'
            )}
          >
            <Info className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>
      )}

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 min-h-0"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {/* Load more indicator */}
        {isLoading && hasMore && (
          <div className="flex justify-center py-4 flex-shrink-0">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        )}

        {/* Load more button */}
        {!isLoading && hasMore && (
          <div className="flex justify-center py-4 flex-shrink-0">
            <button
              type="button"
              onClick={onLoadMore}
              className="px-4 py-2 text-sm text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors"
            >
              Load earlier messages
            </button>
          </div>
        )}

        {/* Spacer to push messages to bottom when content is short */}
        <div style={{ flexGrow: 1 }} />

        {/* Messages */}
        {(isLoading || isSyncing) && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 flex-shrink-0">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            {isSyncing && (
              <p className="mt-3 text-sm text-gray-400">Syncing messages from WhatsApp...</p>
            )}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 flex-shrink-0">
            <User className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">No messages yet</p>
            {(platform || chat.platform) === 'whatsapp' && onSync ? (
              <>
                <p className="text-sm mb-4">Messages may be available on WhatsApp</p>
                <button
                  onClick={onSync}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Sync from WhatsApp
                </button>
              </>
            ) : (
              <p className="text-sm">Send a message to start the conversation</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col flex-shrink-0">
            {renderMessages()}
          </div>
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="mb-2 flex-shrink-0">
            <TypingIndicator
              name={
                typingUsers.length === 1
                  ? typingUsers[0]
                  : `${typingUsers.length} people`
              }
            />
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} className="flex-shrink-0" />
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-24 right-6">
          <button
            onClick={() => scrollToBottom()}
            className="p-3 bg-slate-700 hover:bg-slate-600 rounded-full shadow-lg transition-colors"
          >
            <ArrowDown className="w-5 h-5 text-white" />
          </button>
        </div>
      )}

      {/* Message input */}
      <div className="px-4 py-3 bg-slate-800 border-t border-slate-700">
        <MessageInput
          onSend={handleSend}
          onTyping={onTyping}
          isSending={isSending}
          placeholder={`Message ${chat.title}...`}
          replyTo={replyTo || undefined}
          onCancelReply={() => setReplyTo(null)}
          platform={chat.platform}
          authToken={token || undefined}
        />
      </div>

      {/* Media preview modal */}
      <MediaPreview
        open={mediaPreview.open}
        onClose={() => setMediaPreview({ ...mediaPreview, open: false })}
        items={mediaPreview.items}
        initialIndex={mediaPreview.index}
      />
    </div>
  );
};

export default ChatWindow;
