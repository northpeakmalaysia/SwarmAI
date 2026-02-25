import React from 'react';
import { AlertTriangle, Trash2, Info, HelpCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { cn } from '../../lib/utils';

export type ConfirmDialogVariant = 'danger' | 'warning' | 'info' | 'default';

export interface ConfirmDialogProps {
  /** Whether dialog is open */
  open: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** Callback when user confirms */
  onConfirm: () => void | Promise<void>;
  /** Dialog title */
  title: string;
  /** Dialog message/description */
  message: React.ReactNode;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Dialog variant affects icon and confirm button style */
  variant?: ConfirmDialogVariant;
  /** Whether confirm action is loading */
  loading?: boolean;
  /** Custom icon override */
  icon?: React.ReactNode;
}

const variantConfig: Record<
  ConfirmDialogVariant,
  {
    icon: React.ReactNode;
    iconBgColor: string;
    iconColor: string;
    buttonVariant: 'danger' | 'primary' | 'secondary';
  }
> = {
  danger: {
    icon: <Trash2 className="w-6 h-6" />,
    iconBgColor: 'bg-red-500/20',
    iconColor: 'text-red-400',
    buttonVariant: 'danger',
  },
  warning: {
    icon: <AlertTriangle className="w-6 h-6" />,
    iconBgColor: 'bg-amber-500/20',
    iconColor: 'text-amber-400',
    buttonVariant: 'primary',
  },
  info: {
    icon: <Info className="w-6 h-6" />,
    iconBgColor: 'bg-sky-500/20',
    iconColor: 'text-sky-400',
    buttonVariant: 'primary',
  },
  default: {
    icon: <HelpCircle className="w-6 h-6" />,
    iconBgColor: 'bg-slate-500/20',
    iconColor: 'text-gray-400',
    buttonVariant: 'primary',
  },
};

/**
 * ConfirmDialog component - A modal dialog for confirm/cancel actions.
 * Replaces browser's native confirm() with a styled modal.
 *
 * @example
 * ```tsx
 * const [showDelete, setShowDelete] = useState(false);
 *
 * <ConfirmDialog
 *   open={showDelete}
 *   onClose={() => setShowDelete(false)}
 *   onConfirm={handleDelete}
 *   title="Delete Item"
 *   message="Are you sure you want to delete this item? This action cannot be undone."
 *   variant="danger"
 *   confirmText="Delete"
 * />
 * ```
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  loading = false,
  icon,
}) => {
  const config = variantConfig[variant];

  const handleConfirm = async () => {
    await onConfirm();
    if (!loading) {
      onClose();
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
            config.iconBgColor
          )}
        >
          <span className={config.iconColor}>{icon || config.icon}</span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>

        {/* Message */}
        <p className="text-gray-400 text-sm mb-6">{message}</p>

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
            variant={config.buttonVariant}
            onClick={handleConfirm}
            loading={loading}
            fullWidth
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
