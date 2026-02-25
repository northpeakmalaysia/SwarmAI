/**
 * Email Feature Type Definitions
 * Types specific to email UI/UX patterns
 */

import type { Message, Platform } from '../../types';

/**
 * Email thread representing a conversation chain
 */
export interface EmailThread {
  id: string;
  agentId: string;
  subject: string;
  participants: EmailParticipant[];
  preview: string;
  messageCount: number;
  unreadCount: number;
  hasAttachments: boolean;
  isStarred: boolean;
  labels: string[];
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Email participant (sender or recipient)
 */
export interface EmailParticipant {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  type: 'from' | 'to' | 'cc' | 'bcc';
}

/**
 * Email message within a thread
 */
export interface EmailMessage {
  id: string;
  threadId: string;
  conversationId: string;
  platform: Platform;
  subject: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  bcc: EmailParticipant[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  content: {
    type: 'text' | 'html';
    text?: string;
    html?: string;
  };
  attachments: EmailAttachment[];
  isRead: boolean;
  isStarred: boolean;
  isFromAI?: boolean;
  agentId?: string;
  agentName?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

/**
 * Email attachment
 */
export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
  contentId?: string;
  isInline: boolean;
}

/**
 * Email compose state
 */
export interface EmailComposeState {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachments: File[];
  replyToMessageId?: string;
  forwardMessageId?: string;
  isDraft: boolean;
}

/**
 * Email folder types
 */
export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash' | 'spam';

/**
 * Email filter options
 */
export interface EmailFilter {
  folder: EmailFolder;
  agentId?: string;
  isUnread?: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  searchQuery?: string;
  labels?: string[];
  dateRange?: {
    from: string;
    to: string;
  };
}

/**
 * Email sort options
 */
export type EmailSortBy = 'date' | 'from' | 'subject' | 'size';
export type EmailSortOrder = 'asc' | 'desc';

/**
 * Convert conversation to EmailThread
 */
export function convertToEmailThread(conversation: {
  id: string;
  title: string;
  agentId?: string;
  agentName?: string;
  platform?: string;
  unreadCount?: number;
  lastMessage?: string;
  lastMessageAt?: string;
  messageCount: number;
  metadata?: Record<string, unknown>;
  contactId?: string;
  contactName?: string;
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}): EmailThread {
  // Extract email metadata
  const emailMeta = conversation.metadata?.email as Record<string, unknown> | undefined;

  return {
    id: conversation.id,
    agentId: conversation.agentId || '',
    subject: emailMeta?.subject as string || conversation.title || '(No Subject)',
    participants: conversation.contactName
      ? [{ id: conversation.contactId || conversation.externalId || '', name: conversation.contactName, email: conversation.externalId?.replace('email:', '') || '', type: 'from' as const }]
      : [],
    preview: conversation.lastMessage || '',
    messageCount: conversation.messageCount,
    unreadCount: conversation.unreadCount || 0,
    hasAttachments: Boolean(emailMeta?.hasAttachments),
    isStarred: Boolean(emailMeta?.isStarred),
    labels: (emailMeta?.labels as string[]) || [],
    lastMessageAt: conversation.lastMessageAt || conversation.updatedAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

/**
 * Convert message to EmailMessage
 */
export function convertToEmailMessage(
  msg: Message,
  threadId: string
): EmailMessage {
  const emailMeta = msg.metadata?.email as Record<string, unknown> | undefined;

  return {
    id: msg.id,
    threadId,
    conversationId: msg.conversationId,
    platform: msg.platform,
    subject: emailMeta?.subject as string || '',
    from: {
      id: msg.sender.id,
      name: msg.sender.name,
      email: emailMeta?.from as string || msg.sender.email || '',
      avatarUrl: msg.sender.avatarUrl,
      type: 'from',
    },
    to: (emailMeta?.to as string[] || []).map((email, i) => ({
      id: `to-${i}`,
      name: email.split('@')[0],
      email,
      type: 'to' as const,
    })),
    cc: (emailMeta?.cc as string[] || []).map((email, i) => ({
      id: `cc-${i}`,
      name: email.split('@')[0],
      email,
      type: 'cc' as const,
    })),
    bcc: [],
    replyTo: emailMeta?.replyTo as string,
    inReplyTo: emailMeta?.inReplyTo as string,
    references: emailMeta?.references as string[],
    content: {
      type: msg.content.type === 'text' ? 'text' : 'html',
      text: msg.content.text,
      html: emailMeta?.htmlContent as string,
    },
    attachments: (emailMeta?.attachments as EmailAttachment[] || []).map(a => ({
      id: a.id || crypto.randomUUID(),
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      url: a.url,
      contentId: a.contentId,
      isInline: a.isInline || false,
    })),
    isRead: msg.status === 'read',
    isStarred: Boolean(emailMeta?.isStarred),
    isFromAI: msg.isFromAI,
    agentId: msg.agentId,
    agentName: msg.agentName,
    metadata: msg.metadata,
    timestamp: msg.timestamp,
    createdAt: msg.createdAt,
  };
}
