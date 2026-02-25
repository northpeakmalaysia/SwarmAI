import React, { useState, useEffect, useRef } from 'react';
import { Edit3 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { cn } from '../../lib/utils';

export interface PromptDialogProps {
  /** Whether dialog is open */
  open: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** Callback when user submits with the input value */
  onSubmit: (value: string) => void | Promise<void>;
  /** Dialog title */
  title: string;
  /** Dialog message/description */
  message?: React.ReactNode;
  /** Input placeholder text */
  placeholder?: string;
  /** Default/initial input value */
  defaultValue?: string;
  /** Submit button text */
  submitText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Whether submit action is loading */
  loading?: boolean;
  /** Input validation function - returns error message or undefined if valid */
  validate?: (value: string) => string | undefined;
  /** Whether the input is required (non-empty) */
  required?: boolean;
  /** Custom icon override */
  icon?: React.ReactNode;
  /** Icon background color class */
  iconBgColor?: string;
  /** Icon color class */
  iconColor?: string;
}

/**
 * PromptDialog component - A modal dialog for text input.
 * Replaces browser's native prompt() with a styled modal.
 *
 * @example
 * ```tsx
 * const [showPrompt, setShowPrompt] = useState(false);
 *
 * <PromptDialog
 *   open={showPrompt}
 *   onClose={() => setShowPrompt(false)}
 *   onSubmit={(name) => handleRename(name)}
 *   title="Rename Item"
 *   message="Enter a new name for this item."
 *   placeholder="Enter name..."
 *   defaultValue={currentName}
 *   required
 * />
 * ```
 */
export const PromptDialog: React.FC<PromptDialogProps> = ({
  open,
  onClose,
  onSubmit,
  title,
  message,
  placeholder = 'Enter value...',
  defaultValue = '',
  submitText = 'Submit',
  cancelText = 'Cancel',
  loading = false,
  validate,
  required = false,
  icon,
  iconBgColor = 'bg-sky-500/20',
  iconColor = 'text-sky-400',
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset value when dialog opens/closes or defaultValue changes
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError(undefined);
      // Focus input after a short delay for animation
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [open, defaultValue]);

  const handleSubmit = async () => {
    // Validate required
    if (required && !value.trim()) {
      setError('This field is required');
      return;
    }

    // Custom validation
    if (validate) {
      const validationError = validate(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setError(undefined);
    await onSubmit(value.trim());
    if (!loading) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      showCloseButton={false}
      closeOnOverlayClick={!loading}
      closeOnEscape={!loading}
    >
      <div className="flex flex-col items-center text-center">
        {/* Icon */}
        <div
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center mb-4',
            iconBgColor
          )}
        >
          <span className={iconColor}>
            {icon || <Edit3 className="w-6 h-6" />}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>

        {/* Message */}
        {message && (
          <p className="text-gray-400 text-sm mb-4">{message}</p>
        )}

        {/* Input */}
        <div className="w-full mb-6">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(undefined);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={loading}
            error={error}
            fullWidth
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={loading}
            fullWidth
          >
            {cancelText}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={loading}
            fullWidth
          >
            {submitText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default PromptDialog;
