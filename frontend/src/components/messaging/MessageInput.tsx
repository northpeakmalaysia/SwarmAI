import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Paperclip,
  Smile,
  Mic,
  X,
  Image,
  FileText,
  MapPin,
  User,
  Loader2,
  StopCircle,
  Wand2,
  Check,
  RotateCcw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { EmojiPicker } from './EmojiPicker';
import type { Platform } from '../../types/frontend';

export interface MessageInputProps {
  /** Callback when message is sent */
  onSend: (content: string, attachments?: File[]) => void;
  /** Callback when user starts/stops typing */
  onTyping?: (isTyping: boolean) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether sending is disabled */
  disabled?: boolean;
  /** Whether currently sending a message */
  isSending?: boolean;
  /** Maximum character count (0 = unlimited) */
  maxLength?: number;
  /** Reply preview content */
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
  };
  /** Callback to cancel reply */
  onCancelReply?: () => void;
  /** Platform for rephrase context (whatsapp, telegram, email) */
  platform?: Platform;
  /** Rephrase style (professional, casual, concise, etc.) */
  rephraseStyle?: string;
  /** Auth token for API calls */
  authToken?: string;
  /** Enable AI rephrase feature */
  enableRephrase?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Attachment type button
 */
const AttachmentButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-slate-600 transition-colors"
  >
    <div className="w-10 h-10 flex items-center justify-center bg-slate-700 rounded-full">
      {icon}
    </div>
    <span className="text-xs text-gray-400">{label}</span>
  </button>
);

/**
 * Attachment preview chip
 */
const AttachmentChip: React.FC<{
  file: File;
  onRemove: () => void;
}> = ({ file, onRemove }) => {
  const isImage = file.type.startsWith('image/');

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 rounded-lg">
      {isImage ? (
        <Image className="w-4 h-4 text-sky-400" />
      ) : (
        <FileText className="w-4 h-4 text-gray-400" />
      )}
      <span className="text-sm truncate max-w-[120px]">{file.name}</span>
      <button
        onClick={onRemove}
        className="p-0.5 hover:bg-slate-500 rounded"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

/**
 * Rephrase preview component
 */
const RephrasePreview: React.FC<{
  original: string;
  rephrased: string;
  onAccept: () => void;
  onReject: () => void;
  onRetry: () => void;
  isLoading?: boolean;
}> = ({ original, rephrased, onAccept, onReject, onRetry, isLoading }) => (
  <div className="px-4 py-3 bg-gradient-to-r from-purple-500/10 to-sky-500/10 border border-purple-500/30 rounded-t-lg">
    <div className="flex items-center gap-2 mb-2">
      <Wand2 className="w-4 h-4 text-purple-400" />
      <span className="text-xs font-medium text-purple-300">AI Rephrased via SuperBrain</span>
    </div>

    {isLoading ? (
      <div className="flex items-center gap-2 text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Rephrasing your message...</span>
      </div>
    ) : (
      <>
        <div className="mb-2">
          <p className="text-sm text-gray-400 mb-1">Original:</p>
          <p className="text-sm text-gray-500 italic line-through">{original}</p>
        </div>
        <div className="mb-3">
          <p className="text-sm text-gray-400 mb-1">Rephrased:</p>
          <p className="text-sm text-white">{rephrased}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAccept}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm"
          >
            <Check className="w-4 h-4" />
            Use this
          </button>
          <button
            onClick={onRetry}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-600/50 text-gray-300 rounded-lg hover:bg-slate-600 transition-colors text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Retry
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-600/50 text-gray-400 rounded-lg hover:bg-slate-600 transition-colors text-sm"
          >
            <X className="w-4 h-4" />
            Keep original
          </button>
        </div>
      </>
    )}
  </div>
);

/**
 * MessageInput component for composing and sending messages
 * Features auto-resize textarea, file attachments, and typing indicator
 *
 * @example
 * ```tsx
 * <MessageInput
 *   onSend={handleSend}
 *   onTyping={handleTyping}
 *   placeholder="Type a message..."
 *   isSending={isSending}
 * />
 * ```
 */
export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  onTyping,
  placeholder = 'Type a message...',
  disabled = false,
  isSending = false,
  maxLength = 0,
  replyTo,
  onCancelReply,
  platform = 'whatsapp',
  rephraseStyle = 'professional',
  authToken,
  enableRephrase = true,
  className,
}) => {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRephrasing, setIsRephrasing] = useState(false);
  const [rephrasedContent, setRephrasedContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTypingRef = useRef(false);

  /**
   * Handle rephrase button click
   */
  const handleRephrase = useCallback(async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || isRephrasing) return;

    setOriginalContent(trimmedContent);
    setIsRephrasing(true);
    setRephrasedContent(null);

    try {
      // Map platform types to API format
      const apiPlatform = platform === 'telegram-bot' || platform === 'telegram-user'
        ? 'telegram'
        : platform;

      const response = await fetch('/api/ai/rephrase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && { Authorization: `Bearer ${authToken}` }),
        },
        body: JSON.stringify({
          message: trimmedContent,
          platform: apiPlatform,
          style: rephraseStyle,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.rephrasedMessage) {
          setRephrasedContent(data.rephrasedMessage);
        } else {
          // If failed, just keep original
          setRephrasedContent(null);
          setIsRephrasing(false);
        }
      } else {
        setRephrasedContent(null);
        setIsRephrasing(false);
      }
    } catch (error) {
      console.error('Rephrase failed:', error);
      setRephrasedContent(null);
      setIsRephrasing(false);
    }
  }, [content, platform, rephraseStyle, authToken, isRephrasing]);

  /**
   * Accept rephrased content
   */
  const acceptRephrase = useCallback(() => {
    if (rephrasedContent) {
      setContent(rephrasedContent);
    }
    setRephrasedContent(null);
    setOriginalContent('');
    setIsRephrasing(false);
  }, [rephrasedContent]);

  /**
   * Reject rephrase and keep original
   */
  const rejectRephrase = useCallback(() => {
    setRephrasedContent(null);
    setOriginalContent('');
    setIsRephrasing(false);
  }, []);

  /**
   * Retry rephrase
   */
  const retryRephrase = useCallback(() => {
    if (originalContent) {
      setRephrasedContent(null);
      handleRephrase();
    }
  }, [originalContent, handleRephrase]);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [content, adjustTextareaHeight]);

  // Handle typing indicator
  const handleTyping = useCallback(
    (value: string) => {
      if (!onTyping) return;

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // If user is typing and wasn't before, emit typing start
      if (value.length > 0 && !wasTypingRef.current) {
        wasTypingRef.current = true;
        onTyping(true);
      }

      // Set timeout to emit typing stop
      typingTimeoutRef.current = setTimeout(() => {
        if (wasTypingRef.current) {
          wasTypingRef.current = false;
          onTyping(false);
        }
      }, 2000);
    },
    [onTyping]
  );

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (wasTypingRef.current && onTyping) {
        onTyping(false);
      }
    };
  }, [onTyping]);

  // Handle content change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (maxLength > 0 && value.length > maxLength) {
      return;
    }
    setContent(value);
    handleTyping(value);
  };

  // Handle send
  const handleSend = () => {
    const trimmedContent = content.trim();
    if (!trimmedContent && attachments.length === 0) return;
    if (disabled || isSending) return;

    onSend(trimmedContent, attachments.length > 0 ? attachments : undefined);
    setContent('');
    setAttachments([]);

    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (wasTypingRef.current && onTyping) {
      wasTypingRef.current = false;
      onTyping(false);
    }

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Handle key down (Enter to send)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments((prev) => [...prev, ...files]);
    setShowAttachMenu(false);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Open file picker for specific type
  const openFilePicker = (accept?: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept || '*/*';
      fileInputRef.current.click();
    }
    setShowAttachMenu(false);
  };

  // Toggle voice recording (placeholder)
  const toggleRecording = () => {
    setIsRecording(!isRecording);
    // TODO: Implement actual voice recording
  };

  // Common emoji reactions (placeholder)
  const commonEmojis = ['thumbsup', 'heart', 'laugh', 'surprised', 'sad', 'angry'];

  const canSend = (content.trim().length > 0 || attachments.length > 0) && !disabled && !isSending;

  return (
    <div className={cn('relative', className)}>
      {/* Rephrase preview */}
      {(isRephrasing || rephrasedContent) && (
        <RephrasePreview
          original={originalContent}
          rephrased={rephrasedContent || ''}
          onAccept={acceptRephrase}
          onReject={rejectRephrase}
          onRetry={retryRephrase}
          isLoading={isRephrasing && !rephrasedContent}
        />
      )}

      {/* Reply preview */}
      {replyTo && !isRephrasing && !rephrasedContent && (
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-700 border-l-2 border-sky-500 rounded-t-lg">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sky-400">{replyTo.senderName}</p>
            <p className="text-sm text-gray-400 truncate">{replyTo.content}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 hover:bg-slate-600 rounded"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 py-2 bg-slate-700/50">
          {attachments.map((file, index) => (
            <AttachmentChip
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() => removeAttachment(index)}
            />
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-3 bg-slate-800 rounded-lg border border-slate-700">
        {/* Attachment button */}
        <div className="relative">
          <button
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            disabled={disabled}
            className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Attachment menu */}
          {showAttachMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowAttachMenu(false)}
              />
              <div className="absolute bottom-full left-0 mb-2 z-50 bg-slate-700 rounded-xl shadow-xl border border-slate-600 p-2">
                <div className="flex gap-2">
                  <AttachmentButton
                    icon={<Image className="w-5 h-5 text-sky-400" />}
                    label="Image"
                    onClick={() => openFilePicker('image/*')}
                  />
                  <AttachmentButton
                    icon={<FileText className="w-5 h-5 text-amber-400" />}
                    label="Document"
                    onClick={() => openFilePicker()}
                  />
                  <AttachmentButton
                    icon={<MapPin className="w-5 h-5 text-red-400" />}
                    label="Location"
                    onClick={() => {
                      // TODO: Implement location picker
                      setShowAttachMenu(false);
                    }}
                  />
                  <AttachmentButton
                    icon={<User className="w-5 h-5 text-emerald-400" />}
                    label="Contact"
                    onClick={() => {
                      // TODO: Implement contact picker
                      setShowAttachMenu(false);
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Emoji button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            disabled={disabled}
            className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Full Emoji picker */}
          {showEmojiPicker && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowEmojiPicker(false)}
              />
              <div className="absolute bottom-full left-0 mb-2 z-50">
                <EmojiPicker
                  onSelect={(emoji) => {
                    setContent((prev) => prev + emoji);
                  }}
                  onClose={() => setShowEmojiPicker(false)}
                />
              </div>
            </>
          )}
        </div>

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isRephrasing}
            rows={1}
            className={cn(
              'w-full bg-transparent text-white placeholder-gray-500 resize-none outline-none',
              'scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent',
              (disabled || isRephrasing) && 'opacity-50 cursor-not-allowed'
            )}
            style={{ maxHeight: '150px' }}
          />
          {maxLength > 0 && (
            <span
              className={cn(
                'absolute right-0 bottom-0 text-xs',
                content.length >= maxLength * 0.9 ? 'text-amber-400' : 'text-gray-500'
              )}
            >
              {content.length}/{maxLength}
            </span>
          )}
        </div>

        {/* AI Rephrase button - shows when there's content */}
        {enableRephrase && content.trim().length > 0 && !isRephrasing && !rephrasedContent && (
          <button
            type="button"
            onClick={handleRephrase}
            disabled={disabled || isRephrasing}
            title="AI Rephrase (SuperBrain)"
            className={cn(
              'p-2 rounded-lg transition-colors',
              'text-purple-400 hover:text-purple-300 hover:bg-purple-500/20',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Wand2 className="w-5 h-5" />
          </button>
        )}

        {/* Voice message button or Send button */}
        {content.trim().length === 0 && attachments.length === 0 ? (
          <button
            type="button"
            onClick={toggleRecording}
            disabled={disabled}
            className={cn(
              'p-2 rounded-lg transition-colors',
              isRecording
                ? 'text-red-400 hover:text-red-300 bg-red-400/20'
                : 'text-gray-400 hover:text-white hover:bg-slate-700',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isRecording ? (
              <StopCircle className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend || isRephrasing}
            className={cn(
              'p-2 rounded-lg transition-colors',
              canSend && !isRephrasing
                ? 'text-white bg-sky-500 hover:bg-sky-600'
                : 'text-gray-500 bg-slate-700 cursor-not-allowed'
            )}
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

export default MessageInput;
