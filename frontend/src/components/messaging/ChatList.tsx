import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  MessageSquare,
  Pin,
  BellOff,
  Archive,
  MoreVertical,
  Check,
  CheckCheck,
  Trash2,
  Users,
  User,
  Bot,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatChatTimestamp } from '../../utils/dateFormat';
import type { Chat, Platform, Message } from '../../types';

// Chat type filter options
type ChatTypeFilter = 'all' | 'private' | 'groups';

export interface ChatListProps {
  /** List of chats to display */
  chats: Chat[];
  /** Currently selected chat ID */
  selectedId?: string;
  /** Callback when a chat is selected */
  onSelect: (chat: Chat) => void;
  /** Callback when a chat is deleted */
  onDelete?: (chatId: string) => void;
  /** Callback when a chat is updated (pin, mute, archive) */
  onUpdate?: (chatId: string, updates: Partial<Pick<Chat, 'isPinned' | 'isMuted' | 'isArchived'>>) => void;
  /** Loading state */
  isLoading?: boolean;
  /** Callback when filter changes */
  onFilterChange?: (filter: ChatListFilter) => void;
  /** Additional class names */
  className?: string;
}

export interface ChatListFilter {
  search: string;
  chatType: ChatTypeFilter;
  platform?: Platform;
  agentId?: string;
  status?: Chat['status'];
  showArchived: boolean;
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
      return <MessageSquare className={cn(iconClass, 'text-gray-400')} />;
  }
};

/**
 * Truncate text with ellipsis
 */
const truncate = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};

/**
 * Get message preview text
 */
const getMessagePreview = (message?: Message): string => {
  if (!message) return 'No messages yet';

  const { content } = message;
  switch (content.type) {
    case 'text':
      return content.text || '';
    case 'image':
      return `[Photo]${content.media?.caption ? ' ' + content.media.caption : ''}`;
    case 'video':
      return `[Video]${content.media?.caption ? ' ' + content.media.caption : ''}`;
    case 'audio':
      return '[Audio]';
    case 'voice':
      return '[Voice message]';
    case 'document':
      return `[Document] ${content.media?.fileName || ''}`;
    case 'location':
      return `[Location] ${content.location?.name || ''}`;
    case 'contact':
      return `[Contact] ${content.contact?.name || ''}`;
    case 'sticker':
      return '[Sticker]';
    default:
      return '';
  }
};

/**
 * Message status indicator
 */
const MessageStatusIcon: React.FC<{ status?: Message['status'] }> = ({ status }) => {
  switch (status) {
    case 'sent':
      return <Check className="w-3 h-3 text-gray-400" />;
    case 'delivered':
    case 'read':
      return <CheckCheck className={cn('w-3 h-3', status === 'read' ? 'text-sky-400' : 'text-gray-400')} />;
    default:
      return null;
  }
};

/**
 * Single chat item component
 */
const ChatItem: React.FC<{
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
  onDelete?: (chatId: string) => void;
  onUpdate?: (chatId: string, updates: Partial<Pick<Chat, 'isPinned' | 'isMuted' | 'isArchived'>>) => void;
}> = ({ chat, isSelected, onClick, onDelete, onUpdate }) => {
  const [showMenu, setShowMenu] = useState(false);

  const primaryParticipant = chat.participants[0];
  const avatarInitial = primaryParticipant?.name?.charAt(0).toUpperCase() || '?';

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors',
        isSelected
          ? 'bg-sky-500/20 border border-sky-500/50'
          : 'hover:bg-slate-700/50 border border-transparent'
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {/* Get avatar URL from participant, chat metadata, or contact */}
        {(() => {
          const avatarUrl = primaryParticipant?.avatarUrl ||
                           (chat.metadata?.avatarUrl as string) ||
                           (chat.metadata?.profilePicUrl as string) ||
                           (chat.metadata?.groupImage as string);

          return (
            <div
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center overflow-hidden',
                !avatarUrl && chat.isGroup && 'bg-purple-500/20',
                !avatarUrl && !chat.isGroup && chat.platform === 'whatsapp' && 'bg-emerald-500/20',
                !avatarUrl && !chat.isGroup && chat.platform === 'whatsapp-business' && 'bg-emerald-500/20',
                !avatarUrl && !chat.isGroup && chat.platform === 'telegram-bot' && 'bg-sky-500/20',
                !avatarUrl && !chat.isGroup && chat.platform === 'telegram-user' && 'bg-sky-500/20',
                !avatarUrl && !chat.isGroup && chat.platform === 'email' && 'bg-rose-500/20',
                !avatarUrl && !chat.isGroup && chat.platform === 'http-api' && 'bg-purple-500/20'
              )}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={chat.title}
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => {
                    // Hide broken image and show fallback
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fallback = (e.target as HTMLImageElement).nextElementSibling;
                    if (fallback) (fallback as HTMLElement).style.display = 'flex';
                  }}
                />
              ) : null}
              {/* Fallback - shown when no avatar or image fails to load */}
              <div
                className={cn(
                  'w-full h-full rounded-full flex items-center justify-center',
                  avatarUrl && 'hidden', // Hide by default if avatar exists
                  chat.isGroup && 'bg-purple-500/20',
                  !chat.isGroup && chat.platform === 'whatsapp' && 'bg-emerald-500/20',
                  !chat.isGroup && chat.platform === 'whatsapp-business' && 'bg-emerald-500/20',
                  !chat.isGroup && chat.platform === 'telegram-bot' && 'bg-sky-500/20',
                  !chat.isGroup && chat.platform === 'telegram-user' && 'bg-sky-500/20',
                  !chat.isGroup && chat.platform === 'email' && 'bg-rose-500/20',
                  !chat.isGroup && chat.platform === 'http-api' && 'bg-purple-500/20'
                )}
              >
                {chat.isGroup ? (
                  <Users className="w-6 h-6 text-purple-400" />
                ) : (
                  <span className="text-lg font-medium text-gray-300">{avatarInitial}</span>
                )}
              </div>
            </div>
          );
        })()}
        {/* Platform indicator */}
        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center">
          <PlatformIcon platform={chat.platform} className="w-3 h-3" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium text-white truncate">
              {chat.title}
            </span>
            {chat.isPinned && (
              <Pin className="w-3 h-3 text-gray-500 flex-shrink-0" />
            )}
            {chat.isMuted && (
              <BellOff className="w-3 h-3 text-gray-500 flex-shrink-0" />
            )}
            {chat.isArchived && (
              <Archive className="w-3 h-3 text-gray-500 flex-shrink-0" />
            )}
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0">
            {formatChatTimestamp(chat.lastMessageAt)}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1">
          {/* Message preview */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {chat.lastMessage?.direction === 'outgoing' && (
              <MessageStatusIcon status={chat.lastMessage.status} />
            )}
            <p className="text-sm text-gray-400 truncate">
              {truncate(getMessagePreview(chat.lastMessage), 40)}
            </p>
          </div>

          {/* Unread badge */}
          {chat.unreadCount > 0 && (
            <span
              className={cn(
                'flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-xs font-medium',
                chat.isMuted
                  ? 'bg-gray-600 text-gray-300'
                  : 'bg-sky-500 text-white'
              )}
            >
              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
            </span>
          )}
        </div>

        {/* Chat type and status badges */}
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {/* Agent name badge - helps identify which agent handles this chat */}
          {(chat.metadata?.agentName as string) && (
            <span className="px-1.5 py-0.5 text-[10px] bg-orange-500/20 text-orange-400 rounded font-medium flex items-center gap-1 max-w-[100px] truncate" title={`Agent: ${chat.metadata?.agentName}`}>
              <Bot className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{chat.metadata?.agentName as string}</span>
            </span>
          )}
          {/* Group indicator */}
          {chat.isGroup && (
            <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded font-medium flex items-center gap-1">
              <Users className="w-3 h-3" />
              Group
            </span>
          )}
          {/* AI Agent badge - only show when agent has responded with AI */}
          {(chat.metadata?.hasAIResponse as boolean) && (
            <span className="px-1.5 py-0.5 text-[10px] bg-sky-500/20 text-sky-400 rounded font-medium flex items-center gap-1">
              <Bot className="w-3 h-3" />
              AI
            </span>
          )}
          {/* Platform badge - simplified */}
          <span
            className={cn(
              'px-1.5 py-0.5 text-[10px] rounded font-medium',
              chat.platform === 'whatsapp' && 'bg-emerald-500/10 text-emerald-400/80',
              chat.platform === 'whatsapp-business' && 'bg-emerald-500/10 text-emerald-400/80',
              chat.platform === 'telegram-bot' && 'bg-sky-500/10 text-sky-400/80',
              chat.platform === 'telegram-user' && 'bg-sky-500/10 text-sky-400/80',
              chat.platform === 'email' && 'bg-rose-500/10 text-rose-400/80',
              chat.platform === 'http-api' && 'bg-purple-500/10 text-purple-400/80',
              !['whatsapp', 'whatsapp-business', 'telegram-bot', 'telegram-user', 'email', 'http-api'].includes(chat.platform) && 'bg-slate-500/10 text-gray-400'
            )}
          >
            {chat.platform === 'whatsapp' ? 'WhatsApp' :
             chat.platform === 'whatsapp-business' ? 'WA Business' :
             chat.platform === 'telegram-bot' ? 'Telegram' :
             chat.platform === 'telegram-user' ? 'Telegram' :
             chat.platform === 'http-api' ? 'API' :
             chat.platform.charAt(0).toUpperCase() + chat.platform.slice(1)}
          </span>
          {/* Labels */}
          {chat.labels && chat.labels.slice(0, 2).map((label) => (
            <span
              key={label}
              className="px-1.5 py-0.5 text-[10px] bg-slate-600 text-gray-300 rounded"
            >
              {label}
            </span>
          ))}
          {chat.labels && chat.labels.length > 2 && (
            <span className="text-[10px] text-gray-500">
              +{chat.labels.length - 2}
            </span>
          )}
        </div>
      </div>

      {/* Context menu button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className={cn(
          'p-1 rounded transition-opacity',
          showMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          'hover:bg-slate-600'
        )}
      >
        <MoreVertical className="w-4 h-4 text-gray-400" />
      </button>

      {/* Context menu (placeholder) */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
            }}
          />
          <div className="absolute right-0 top-12 z-50 bg-slate-700 rounded-lg shadow-xl border border-slate-600 py-1 min-w-[140px]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onUpdate?.(chat.id, { isPinned: !chat.isPinned });
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-600 flex items-center gap-2"
            >
              <Pin className="w-4 h-4" />
              {chat.isPinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onUpdate?.(chat.id, { isMuted: !chat.isMuted });
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-600 flex items-center gap-2"
            >
              <BellOff className="w-4 h-4" />
              {chat.isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onUpdate?.(chat.id, { isArchived: !chat.isArchived });
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-600 flex items-center gap-2"
            >
              <Archive className="w-4 h-4" />
              {chat.isArchived ? 'Unarchive' : 'Archive'}
            </button>
            <div className="h-px bg-slate-600 my-1" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onDelete?.(chat.id);
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-red-500/20 text-red-400 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * ChatList component for displaying and filtering conversations
 *
 * @example
 * ```tsx
 * <ChatList
 *   chats={chats}
 *   selectedId={selectedChatId}
 *   onSelect={handleSelectChat}
 *   onFilterChange={handleFilterChange}
 * />
 * ```
 */
export const ChatList: React.FC<ChatListProps> = ({
  chats,
  selectedId,
  onSelect,
  onDelete,
  onUpdate,
  isLoading = false,
  onFilterChange,
  className,
}) => {
  const [filter, setFilter] = useState<ChatListFilter>({
    search: '',
    chatType: 'all',
    showArchived: false,
  });
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Filter chats based on current filter
  const filteredChats = useMemo(() => {
    return chats.filter((chat) => {
      // Chat type filter (private vs groups)
      if (filter.chatType === 'private' && chat.isGroup) {
        return false;
      }
      if (filter.chatType === 'groups' && !chat.isGroup) {
        return false;
      }

      // Search filter
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const titleMatch = chat.title.toLowerCase().includes(searchLower);
        const participantMatch = chat.participants.some(
          (p) => p.name.toLowerCase().includes(searchLower)
        );
        if (!titleMatch && !participantMatch) return false;
      }

      // Platform filter
      if (filter.platform && chat.platform !== filter.platform) {
        return false;
      }

      // Agent filter
      if (filter.agentId && chat.agentId !== filter.agentId) {
        return false;
      }

      // Status filter
      if (filter.status && chat.status !== filter.status) {
        return false;
      }

      // Archived filter
      if (!filter.showArchived && chat.isArchived) {
        return false;
      }

      return true;
    });
  }, [chats, filter]);

  // Count chats by type for tab badges
  const chatCounts = useMemo(() => {
    const all = chats.filter(c => !c.isArchived || filter.showArchived).length;
    const privateChats = chats.filter(c => !c.isGroup && (!c.isArchived || filter.showArchived)).length;
    const groups = chats.filter(c => c.isGroup && (!c.isArchived || filter.showArchived)).length;
    return { all, private: privateChats, groups };
  }, [chats, filter.showArchived]);

  // Sort chats: pinned first, then by last message time
  const sortedChats = useMemo(() => {
    return [...filteredChats].sort((a, b) => {
      // Pinned chats first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      // Then by last message time
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [filteredChats]);

  // Update filter and notify parent
  const updateFilter = (updates: Partial<ChatListFilter>) => {
    const newFilter = { ...filter, ...updates };
    setFilter(newFilter);
    onFilterChange?.(newFilter);
  };

  // Platform filter options
  const platformOptions: { value: Platform | undefined; label: string }[] = [
    { value: undefined, label: 'All Platforms' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'telegram-bot', label: 'Telegram Bot' },
    { value: 'telegram-user', label: 'Telegram User' },
    { value: 'email', label: 'Email' },
  ];

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Search and filter header */}
      <div className="p-3 space-y-2">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={filter.search}
            onChange={(e) => updateFilter({ search: e.target.value })}
            className="w-full pl-10 pr-10 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-600 transition-colors',
              (filter.platform || filter.status) && 'text-sky-400'
            )}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Chat type tabs */}
        <div className="flex bg-slate-700/50 rounded-lg p-1">
          <button
            type="button"
            onClick={() => updateFilter({ chatType: 'all' })}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
              filter.chatType === 'all'
                ? 'bg-slate-600 text-white'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            All
            <span className="text-[10px] opacity-70">({chatCounts.all})</span>
          </button>
          <button
            type="button"
            onClick={() => updateFilter({ chatType: 'private' })}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
              filter.chatType === 'private'
                ? 'bg-slate-600 text-white'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <User className="w-3.5 h-3.5" />
            Private
            <span className="text-[10px] opacity-70">({chatCounts.private})</span>
          </button>
          <button
            type="button"
            onClick={() => updateFilter({ chatType: 'groups' })}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
              filter.chatType === 'groups'
                ? 'bg-slate-600 text-white'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <Users className="w-3.5 h-3.5" />
            Groups
            <span className="text-[10px] opacity-70">({chatCounts.groups})</span>
          </button>
        </div>

        {/* Filter menu */}
        {showFilterMenu && (
          <div className="p-3 bg-slate-700 rounded-lg border border-slate-600 space-y-3">
            {/* Platform filter */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Platform</label>
              <select
                value={filter.platform || ''}
                onChange={(e) =>
                  updateFilter({ platform: (e.target.value as Platform) || undefined })
                }
                className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
              >
                {platformOptions.map((opt) => (
                  <option key={opt.label} value={opt.value || ''}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Status</label>
              <select
                value={filter.status || ''}
                onChange={(e) =>
                  updateFilter({
                    status: (e.target.value as Chat['status']) || undefined,
                  })
                }
                className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            {/* Show archived toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filter.showArchived}
                onChange={(e) => updateFilter({ showArchived: e.target.checked })}
                className="w-4 h-4 rounded border-slate-500 bg-slate-600 text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
              />
              <span className="text-sm text-gray-300">Show archived</span>
            </label>

            {/* Clear filters */}
            {(filter.platform || filter.status || filter.showArchived) && (
              <button
                onClick={() =>
                  updateFilter({
                    platform: undefined,
                    status: undefined,
                    showArchived: false,
                  })
                }
                className="w-full px-3 py-2 text-sm text-sky-400 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        {isLoading ? (
          // Loading skeleton
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-3 rounded-xl animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-slate-700 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-700 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-slate-700 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))
        ) : sortedChats.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">
              {filter.search
                ? 'No conversations found'
                : 'No conversations yet'}
            </p>
          </div>
        ) : (
          // Chat items
          sortedChats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isSelected={chat.id === selectedId}
              onClick={() => onSelect(chat)}
              onDelete={onDelete}
              onUpdate={onUpdate}
            />
          ))
        )}
      </div>

      {/* Footer with count */}
      {!isLoading && sortedChats.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-700 text-xs text-gray-500 text-center">
          {sortedChats.length} conversation{sortedChats.length !== 1 ? 's' : ''}
          {filter.search && ` matching "${filter.search}"`}
        </div>
      )}
    </div>
  );
};

export default ChatList;
