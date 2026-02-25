/**
 * Messaging Components
 *
 * Components for the messaging interface including chat lists,
 * message bubbles, input, and media preview.
 *
 * @example
 * ```tsx
 * import {
 *   ChatList,
 *   ChatWindow,
 *   MessageBubble,
 *   MessageInput,
 *   MediaPreview,
 *   TypingIndicator,
 * } from '@/components/messaging';
 * ```
 */

// ChatList
export { ChatList, default as ChatListComponent } from './ChatList';
export type { ChatListProps, ChatListFilter } from './ChatList';

// ChatWindow
export { ChatWindow, default as ChatWindowComponent } from './ChatWindow';
export type { ChatWindowProps } from './ChatWindow';

// MessageBubble
export { MessageBubble, default as MessageBubbleComponent } from './MessageBubble';
export type { MessageBubbleProps } from './MessageBubble';

// MessageInput
export { MessageInput, default as MessageInputComponent } from './MessageInput';
export type { MessageInputProps } from './MessageInput';

// MediaPreview
export { MediaPreview, default as MediaPreviewComponent } from './MediaPreview';
export type { MediaPreviewProps, MediaItem } from './MediaPreview';

// TypingIndicator
export { TypingIndicator, default as TypingIndicatorComponent } from './TypingIndicator';
export type { TypingIndicatorProps } from './TypingIndicator';

// HandoffNotification
export { HandoffNotification, default as HandoffNotificationComponent } from './HandoffNotification';
export type { HandoffNotificationProps } from './HandoffNotification';

// AddContactModal
export { AddContactModal } from './AddContactModal';
export type { AddContactModalProps } from './AddContactModal';
