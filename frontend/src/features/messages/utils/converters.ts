import { formatContactDisplay } from './formatters';
import type { Chat, Message, Platform } from '../../../types';

/**
 * Convert legacy conversation to Chat type for ChatList component
 */
export const convertToChat = (
  conversation: {
    id: string;
    title: string;
    agentId?: string;
    agentName?: string;
    platform?: string;
    isGroup?: boolean;
    isPinned?: boolean;
    isMuted?: boolean;
    isArchived?: boolean;
    contactId?: string;
    contactName?: string;
    contactAvatar?: string;
    externalId?: string;
    unreadCount?: number;
    lastMessage?: string;
    lastMessageAt?: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
    category?: string;
  },
  agent?: {
    id: string;
    name: string;
    platform: Platform;
    avatar?: string;
  }
): Chat => {
  // For groups, always use the group title (not the linked contact name)
  // For 1:1 chats, use contactName if available (from linked contact), otherwise format the title
  // This ensures we show the contact's display name from the contacts database for personal chats
  // but always show the actual group name for groups
  const isGroupChat = conversation.isGroup ||
    conversation.externalId?.includes('@g.us') ||
    conversation.externalId?.includes('-group:');
  const displayName = isGroupChat ? conversation.title : (conversation.contactName || conversation.title);
  const formattedTitle = formatContactDisplay(displayName, conversation.id);

  // Use platform from conversation, fallback to agent, then default
  const platform = (conversation.platform as Platform) || agent?.platform || 'whatsapp';

  // Detect chat type from externalId pattern or isGroup flag
  const isGroup = conversation.isGroup ||
    conversation.externalId?.includes('@g.us') ||
    conversation.externalId?.includes('-group:') ||
    false;

  // Extract the raw chat ID from externalId (e.g., "whatsapp:60123@c.us" -> "60123@c.us")
  const rawChatId = conversation.externalId
    ? conversation.externalId.replace(/^(whatsapp|telegram|email)(-group)?:/, '')
    : undefined;

  // Extract phone/email/username from externalId based on platform
  // NOTE: Only extract phone for personal chats, NOT for groups
  let participantPhone: string | undefined;
  let participantEmail: string | undefined;
  let participantUsername: string | undefined;

  if (rawChatId) {
    if (platform === 'whatsapp' || platform === 'whatsapp-business') {
      // Only extract phone for personal chats (@c.us), NOT for groups (@g.us)
      // Personal chat: 628123456789@c.us → phone +628123456789
      // Group chat: 60162182308-1339593330@g.us → NO phone (groups don't have a single phone)
      if (rawChatId.endsWith('@c.us')) {
        const phoneMatch = rawChatId.match(/^(\d+)@c\.us$/);
        if (phoneMatch) {
          participantPhone = '+' + phoneMatch[1];
        }
      }
      // Groups don't have a participant phone - they have multiple members
    } else if (platform === 'telegram-bot' || platform === 'telegram-user') {
      // Telegram format might include username
      if (rawChatId.startsWith('@')) {
        participantUsername = rawChatId.slice(1);
      } else if (!rawChatId.match(/^-?\d+$/)) {
        // Not a numeric ID, assume username
        participantUsername = rawChatId;
      }
    } else if (platform === 'email') {
      // Email format: email@domain.com
      if (rawChatId.includes('@') && rawChatId.includes('.')) {
        participantEmail = rawChatId;
      }
    }
  }

  return {
    id: conversation.id,
    agentId: conversation.agentId || '',
    platform,
    externalId: rawChatId,
    title: formattedTitle,
    isGroup,
    participants: [
      {
        id: 'user-1',
        name: formattedTitle,
        phone: participantPhone,
        email: participantEmail,
        username: participantUsername,
        // Use contactAvatar from linked contact, fallback to agent avatar
        avatarUrl: conversation.contactAvatar || agent?.avatar,
      },
    ],
    // Store contactId for later contact lookup
    contactId: conversation.contactId,
    lastMessage: conversation.lastMessage
      ? {
          id: 'last-msg',
          conversationId: conversation.id,
          platform,
          direction: 'incoming' as const,
          sender: {
            id: 'user-1',
            name: formattedTitle,
          },
          content: {
            type: 'text' as const,
            text: conversation.lastMessage,
          },
          timestamp: conversation.lastMessageAt || conversation.updatedAt,
          createdAt: conversation.lastMessageAt || conversation.updatedAt,
          
        }
      : undefined,
    lastMessageAt: conversation.lastMessageAt || conversation.updatedAt,
    unreadCount: conversation.unreadCount || 0,
    isPinned: conversation.isPinned || false,
    isMuted: conversation.isMuted || false,
    isArchived: conversation.isArchived || false,
    status: 'active',
    category: (conversation.category as 'chat' | 'news' | 'status') || 'chat',
    metadata: {
      agentName: conversation.agentName,
      contactId: conversation.contactId,
      contactName: conversation.contactName,
      contactAvatar: conversation.contactAvatar,
      ...conversation.metadata,
    },
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
};

/**
 * Convert message to Message type for ChatWindow component
 * Accepts both:
 * - New format: nested content object (content.type, content.text, content.media)
 * - Legacy format: flat structure (content as string, separate contentType, mediaUrl)
 */
export const convertToMessage = (
  msg: {
    id: string;
    conversationId: string;
    role?: 'user' | 'assistant' | 'system';
    // Content can be either a string (legacy) or a nested MessageContent object (new)
    content: string | { type?: string; text?: string; media?: any };
    contentType?: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker' | 'location' | 'contact' | 'system' | 'call' | 'revoked';
    mediaUrl?: string;
    mediaMimeType?: string;
    agentId?: string;
    agentName?: string;
    senderId?: string;
    senderName?: string;
    senderAvatar?: string;
    sender?: { id: string; name: string; avatarUrl?: string; isBot?: boolean };
    metadata?: Record<string, unknown>;
    createdAt: string;
    timestamp?: string;
    isFromAI?: boolean;
    status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
    platform?: string;
  },
  platform: Platform = 'whatsapp',
  chatTitle?: string,
  contactAvatar?: string
): Message => {
  // Check if content is already in the new nested format
  const isNestedContent = msg.content && typeof msg.content === 'object' && 'type' in msg.content;
  // Determine if message is from AI
  // Only trust explicit isFromAI value from backend (ai_generated column)
  // Don't default to true just because role is 'assistant' - incoming contact messages also have role='assistant'
  const isFromAI = msg.isFromAI === true;

  // Use platform from message if available
  const actualPlatform = (msg.platform as Platform) || platform;

  // For incoming messages, prioritize senderName from API, then chat title
  // senderName comes from the database (set during WhatsApp sync from contact info)
  const incomingSenderName = msg.senderName || chatTitle || 'Contact';
  // Format the sender name (may be a WhatsApp ID like 60123@c.us)
  const formattedSenderName = formatContactDisplay(incomingSenderName);

  // Determine sender name based on direction and AI status
  let senderName: string;
  const msgRoleForSender = msg.role || 'assistant';
  if (msgRoleForSender === 'user') {
    senderName = 'You';
  } else if (isFromAI) {
    // AI-generated responses show agent name
    senderName = msg.agentName || 'AI Assistant';
  } else {
    // Regular incoming messages from contacts show sender name
    senderName = formattedSenderName;
  }

  // If content is already in nested format, use it directly
  if (isNestedContent) {
    const nestedContent = msg.content as { type?: string; text?: string; media?: any; location?: any; contact?: any; poll?: any };

    // Use senderId from database if available (important for group messages)
    const resolvedSenderId = (msg.role || 'assistant') === 'user'
      ? 'current-user'
      : msg.sender?.id || msg.senderId || msg.agentId || 'contact';

    // Determine avatar URL: use sender-specific avatar, fall back to contact avatar
    const avatarUrl = msg.sender?.avatarUrl || msg.senderAvatar || contactAvatar;

    // Use senderName from sender object or msg properties
    let senderName: string;
    if ((msg.role || 'assistant') === 'user') {
      senderName = 'You';
    } else if (isFromAI) {
      senderName = msg.agentName || 'AI Assistant';
    } else if (msg.sender?.name) {
      senderName = formatContactDisplay(msg.sender.name);
    } else {
      const incomingSenderName = msg.senderName || chatTitle || 'Contact';
      senderName = formatContactDisplay(incomingSenderName);
    }

    return {
      id: msg.id,
      conversationId: msg.conversationId,
      platform: actualPlatform,
      direction: (msg.role || 'assistant') === 'user' ? 'outgoing' : 'incoming',
      sender: {
        id: resolvedSenderId,
        name: senderName,
        avatarUrl: (msg.role || 'assistant') === 'user' ? undefined : avatarUrl,
        isBot: isFromAI,
      },
      content: {
        type: (nestedContent.type as Message['content']['type']) || 'text',
        text: nestedContent.text,
        media: nestedContent.media,
        location: nestedContent.location,
        contact: nestedContent.contact,
        poll: nestedContent.poll,
      },
      isFromAI,
      agentId: msg.agentId,
      agentName: msg.agentName,
      metadata: msg.metadata,
      timestamp: msg.timestamp || msg.createdAt,
      status: msg.status || 'delivered',
      createdAt: msg.createdAt,
    };
  }

  // Legacy flat format: Build proper MessageContent based on contentType
  const msgContent = typeof msg.content === 'string' ? msg.content : '';
  const contentType = msg.contentType || 'text';
  let messageContent: Message['content'];

  switch (contentType) {
    case 'image':
      messageContent = {
        type: 'image',
        text: msgContent || undefined,
        media: msg.mediaUrl ? {
          type: 'image',
          url: msg.mediaUrl,
          mimeType: msg.mediaMimeType,
        } : undefined,
      };
      break;
    case 'video':
      messageContent = {
        type: 'video',
        text: msgContent || undefined,
        media: msg.mediaUrl ? {
          type: 'video',
          url: msg.mediaUrl,
          mimeType: msg.mediaMimeType,
        } : undefined,
      };
      break;
    case 'audio':
    case 'voice':
      messageContent = {
        type: contentType,
        media: msg.mediaUrl ? {
          type: contentType,
          url: msg.mediaUrl,
          mimeType: msg.mediaMimeType,
        } : undefined,
      };
      break;
    case 'document':
      messageContent = {
        type: 'document',
        text: msgContent || undefined,
        media: msg.mediaUrl ? {
          type: 'document',
          url: msg.mediaUrl,
          mimeType: msg.mediaMimeType,
          fileName: (msg.metadata?.fileName as string) || 'document',
          fileSize: msg.metadata?.fileSize as number,
        } : undefined,
      };
      break;
    case 'sticker':
      messageContent = {
        type: 'sticker',
        media: msg.mediaUrl ? {
          type: 'sticker',
          url: msg.mediaUrl,
          mimeType: msg.mediaMimeType,
        } : undefined,
      };
      break;
    case 'location':
      messageContent = {
        type: 'location',
        text: msgContent || undefined,
        location: msg.metadata?.location as Message['content']['location'],
      };
      break;
    case 'contact':
      messageContent = {
        type: 'contact',
        text: msgContent || undefined,
        contact: msg.metadata?.contact as Message['content']['contact'],
      };
      break;
    case 'call':
      messageContent = {
        type: 'call',
        text: msgContent || 'Phone call',
      };
      break;
    case 'revoked':
      messageContent = {
        type: 'revoked',
        text: msgContent || 'This message was deleted',
      };
      break;
    case 'system':
      messageContent = {
        type: 'system',
        text: msgContent,
      };
      break;
    default:
      messageContent = {
        type: 'text',
        text: msgContent,
      };
  }

  // Use senderId from database if available (important for group messages)
  // Each group member has a unique senderId, allowing proper avatar/name display
  const msgRole = msg.role || 'assistant';
  const resolvedSenderId = msgRole === 'user'
    ? 'current-user'
    : msg.senderId || msg.agentId || 'contact';

  // Determine avatar URL: use sender-specific avatar, fall back to contact avatar
  const avatarUrl = msg.senderAvatar || contactAvatar;

  return {
    id: msg.id,
    conversationId: msg.conversationId,
    platform: actualPlatform,
    direction: msgRole === 'user' ? 'outgoing' : 'incoming',
    sender: {
      id: resolvedSenderId,
      name: senderName,
      avatarUrl: msgRole === 'user' ? undefined : avatarUrl,
      isBot: isFromAI,
    },
    content: messageContent,
    isFromAI,
    agentId: msg.agentId,
    agentName: msg.agentName,
    metadata: msg.metadata,
    timestamp: msg.createdAt,
    status: msg.status || 'delivered',
    createdAt: msg.createdAt,
  };
};
