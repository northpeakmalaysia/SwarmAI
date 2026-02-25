/**
 * EmailComposer Component
 * Rich email composer with CC/BCC, subject line, and attachments
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  X,
  Send,
  Paperclip,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clock,
  AlertCircle,
  File,
  Image,
  FileText,
  Loader2,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { EmailComposeState } from '../types';

interface EmailComposerProps {
  initialState?: Partial<EmailComposeState>;
  onSend: (email: EmailComposeState) => Promise<void>;
  onSchedule?: (email: EmailComposeState, scheduledAt: Date) => Promise<void>;
  onSaveDraft?: (email: EmailComposeState) => void;
  onDiscard?: () => void;
  onRephrase?: (text: string) => Promise<string>;
  isOpen?: boolean;
  className?: string;
}

export const EmailComposer: React.FC<EmailComposerProps> = ({
  initialState,
  onSend,
  onSchedule,
  onSaveDraft,
  onDiscard,
  onRephrase,
  isOpen = true,
  className,
}) => {
  const [email, setEmail] = useState<EmailComposeState>({
    to: initialState?.to || [],
    cc: initialState?.cc || [],
    bcc: initialState?.bcc || [],
    subject: initialState?.subject || '',
    body: initialState?.body || '',
    attachments: initialState?.attachments || [],
    replyToMessageId: initialState?.replyToMessageId,
    forwardMessageId: initialState?.forwardMessageId,
    isDraft: initialState?.isDraft ?? true,
  });

  const [showCcBcc, setShowCcBcc] = useState(
    (initialState?.cc?.length || 0) > 0 || (initialState?.bcc?.length || 0) > 0
  );
  const [toInput, setToInput] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRephrasing, setIsRephrasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Email validation
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Add recipient
  const addRecipient = (field: 'to' | 'cc' | 'bcc', value: string) => {
    const trimmed = value.trim();
    if (trimmed && isValidEmail(trimmed) && !email[field].includes(trimmed)) {
      setEmail(prev => ({
        ...prev,
        [field]: [...prev[field], trimmed],
      }));
      return true;
    }
    return false;
  };

  // Remove recipient
  const removeRecipient = (field: 'to' | 'cc' | 'bcc', value: string) => {
    setEmail(prev => ({
      ...prev,
      [field]: prev[field].filter(e => e !== value),
    }));
  };

  // Handle key press in recipient inputs
  const handleRecipientKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    field: 'to' | 'cc' | 'bcc',
    inputValue: string,
    setInputValue: (v: string) => void
  ) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      if (addRecipient(field, inputValue)) {
        setInputValue('');
      }
    } else if (e.key === 'Backspace' && !inputValue && email[field].length > 0) {
      removeRecipient(field, email[field][email[field].length - 1]);
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setEmail(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...files],
    }));
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    setEmail(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  // Handle send
  const handleSend = async () => {
    // Validate
    if (email.to.length === 0) {
      setError('Please add at least one recipient');
      return;
    }

    setError(null);
    setIsSending(true);
    try {
      await onSend(email);
    } catch (err) {
      setError((err as Error).message || 'Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  // Handle rephrase
  const handleRephrase = async () => {
    if (!email.body.trim() || !onRephrase) return;

    setIsRephrasing(true);
    try {
      const rephrased = await onRephrase(email.body);
      setEmail(prev => ({ ...prev, body: rephrased }));
    } catch (err) {
      console.error('Rephrase failed:', err);
    } finally {
      setIsRephrasing(false);
    }
  };

  // Handle discard
  const handleDiscard = () => {
    if (email.body.trim() || email.attachments.length > 0) {
      if (!confirm('Discard this draft?')) return;
    }
    onDiscard?.();
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      'bg-slate-800/50 border border-white/10 rounded-xl overflow-hidden',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/50 border-b border-white/5">
        <h3 className="text-sm font-medium text-white">
          {email.replyToMessageId ? 'Reply' : email.forwardMessageId ? 'Forward' : 'New Email'}
        </h3>
        <button
          onClick={handleDiscard}
          className="p-1 text-gray-500 hover:text-white rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Recipients */}
      <div className="px-4 py-2 space-y-2 border-b border-white/5">
        {/* To field */}
        <div className="flex items-start gap-2">
          <label className="w-12 text-xs text-gray-500 pt-2 flex-shrink-0">To:</label>
          <div className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[32px]">
            {email.to.map((recipient) => (
              <RecipientChip
                key={recipient}
                email={recipient}
                onRemove={() => removeRecipient('to', recipient)}
              />
            ))}
            <input
              type="email"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              onKeyDown={(e) => handleRecipientKeyDown(e, 'to', toInput, setToInput)}
              onBlur={() => {
                if (addRecipient('to', toInput)) setToInput('');
              }}
              placeholder={email.to.length === 0 ? 'recipient@example.com' : ''}
              className="flex-1 min-w-[150px] bg-transparent text-sm text-white placeholder-gray-500 outline-none"
            />
          </div>
          <button
            onClick={() => setShowCcBcc(!showCcBcc)}
            className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded transition-colors"
          >
            {showCcBcc ? <ChevronUp className="w-4 h-4" /> : 'Cc/Bcc'}
          </button>
        </div>

        {/* Cc/Bcc fields */}
        {showCcBcc && (
          <>
            <div className="flex items-start gap-2">
              <label className="w-12 text-xs text-gray-500 pt-2 flex-shrink-0">Cc:</label>
              <div className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[32px]">
                {email.cc.map((recipient) => (
                  <RecipientChip
                    key={recipient}
                    email={recipient}
                    onRemove={() => removeRecipient('cc', recipient)}
                  />
                ))}
                <input
                  type="email"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  onKeyDown={(e) => handleRecipientKeyDown(e, 'cc', ccInput, setCcInput)}
                  onBlur={() => {
                    if (addRecipient('cc', ccInput)) setCcInput('');
                  }}
                  placeholder=""
                  className="flex-1 min-w-[150px] bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-start gap-2">
              <label className="w-12 text-xs text-gray-500 pt-2 flex-shrink-0">Bcc:</label>
              <div className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[32px]">
                {email.bcc.map((recipient) => (
                  <RecipientChip
                    key={recipient}
                    email={recipient}
                    onRemove={() => removeRecipient('bcc', recipient)}
                  />
                ))}
                <input
                  type="email"
                  value={bccInput}
                  onChange={(e) => setBccInput(e.target.value)}
                  onKeyDown={(e) => handleRecipientKeyDown(e, 'bcc', bccInput, setBccInput)}
                  onBlur={() => {
                    if (addRecipient('bcc', bccInput)) setBccInput('');
                  }}
                  placeholder=""
                  className="flex-1 min-w-[150px] bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                />
              </div>
            </div>
          </>
        )}

        {/* Subject */}
        <div className="flex items-center gap-2">
          <label className="w-12 text-xs text-gray-500 flex-shrink-0">Subject:</label>
          <input
            type="text"
            value={email.subject}
            onChange={(e) => setEmail(prev => ({ ...prev, subject: e.target.value }))}
            placeholder="Email subject"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          />
        </div>
      </div>

      {/* Body */}
      <div className="relative">
        <textarea
          ref={bodyRef}
          value={email.body}
          onChange={(e) => setEmail(prev => ({ ...prev, body: e.target.value }))}
          placeholder="Write your email..."
          rows={8}
          className="w-full px-4 py-3 bg-transparent text-sm text-white placeholder-gray-500 resize-none outline-none leading-relaxed"
        />

        {/* Rephrase button */}
        {onRephrase && email.body.trim() && (
          <button
            onClick={handleRephrase}
            disabled={isRephrasing}
            className="absolute bottom-3 right-3 flex items-center gap-1 px-2 py-1 text-xs text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg transition-colors disabled:opacity-50"
          >
            {isRephrasing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            Rephrase
          </button>
        )}
      </div>

      {/* Attachments */}
      {email.attachments.length > 0 && (
        <div className="px-4 py-2 border-t border-white/5">
          <div className="flex flex-wrap gap-2">
            {email.attachments.map((file, index) => (
              <AttachmentChip
                key={`${file.name}-${index}`}
                file={file}
                onRemove={() => removeAttachment(index)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border-t border-red-500/20">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900/30 border-t border-white/5">
        <button
          onClick={handleSend}
          disabled={isSending || email.to.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Send
        </button>

        {onSchedule && (
          <button
            onClick={() => {
              // TODO: Open schedule modal
              console.log('Schedule clicked');
            }}
            className="flex items-center gap-1 px-3 py-2 text-gray-400 hover:text-white hover:bg-white/5 text-sm rounded-lg transition-colors"
          >
            <Clock className="w-4 h-4" />
            Schedule
          </button>
        )}

        <div className="flex-1" />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          title="Attach files"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <button
          onClick={handleDiscard}
          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          title="Discard"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

// Recipient chip component
const RecipientChip: React.FC<{ email: string; onRemove: () => void }> = ({
  email,
  onRemove,
}) => {
  if (!email) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-500/20 text-sky-400 text-xs rounded-full max-w-[250px]">
      <span className="truncate">{email}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="hover:text-sky-200 transition-colors flex-shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
};

// Attachment chip component
const AttachmentChip: React.FC<{ file: File; onRemove: () => void }> = ({
  file,
  onRemove,
}) => {
  const getIcon = () => {
    if (file.type.startsWith('image/')) return Image;
    if (file.type.includes('pdf')) return FileText;
    return File;
  };
  const Icon = getIcon();
  const sizeStr = file.size < 1024 * 1024
    ? `${Math.round(file.size / 1024)} KB`
    : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <span className="inline-flex items-center gap-2 px-2 py-1 bg-slate-700/50 text-gray-300 text-xs rounded-lg">
      <Icon className="w-3.5 h-3.5 text-gray-400" />
      <span className="max-w-[150px] truncate">{file.name}</span>
      <span className="text-gray-500">{sizeStr}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-gray-500 hover:text-red-400 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
};
