import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { cn } from '../../lib/utils';
import { websocket } from '../../services/websocket';

export type ResyncStatus =
  | 'idle'
  | 'started'
  | 'deleting_messages'
  | 'deleting_conversations'
  | 'syncing_contacts'
  | 'syncing_chats'
  | 'completed'
  | 'error';

export interface ResyncProgress {
  status: ResyncStatus;
  message?: string;
  messagesDeleted?: number;
  conversationsDeleted?: number;
  contactsSynced?: number;
  conversationsSynced?: number;
  error?: string;
}

export interface ForceResyncModalProps {
  /** Whether modal is open */
  open: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Callback when user confirms resync */
  onConfirm: () => Promise<void>;
  /** Agent name for display */
  agentName: string;
  /** Agent ID for WebSocket subscription */
  agentId: string;
  /** Callback when resync completes successfully */
  onComplete?: () => void;
}

const statusSteps: { status: ResyncStatus; label: string; description: string }[] = [
  { status: 'started', label: 'Starting', description: 'Initializing force resync...' },
  { status: 'deleting_messages', label: 'Deleting Messages', description: 'Removing existing messages...' },
  { status: 'deleting_conversations', label: 'Deleting Conversations', description: 'Removing existing conversations...' },
  { status: 'syncing_contacts', label: 'Syncing Contacts', description: 'Syncing contacts from WhatsApp...' },
  { status: 'syncing_chats', label: 'Syncing Chats', description: 'Syncing conversations from WhatsApp...' },
];

const getStepIndex = (status: ResyncStatus): number => {
  const index = statusSteps.findIndex(s => s.status === status);
  return index >= 0 ? index : -1;
};

const getProgressPercent = (status: ResyncStatus): number => {
  if (status === 'idle') return 0;
  if (status === 'completed') return 100;
  if (status === 'error') return 0;
  const index = getStepIndex(status);
  if (index < 0) return 0;
  // Each step is ~20%, completing at 100%
  return Math.min(((index + 1) / statusSteps.length) * 100, 95);
};

/**
 * ForceResyncModal - A modal dialog for force resync with real-time progress tracking.
 * Shows confirmation first, then displays progress with animated progress bar.
 */
export const ForceResyncModal: React.FC<ForceResyncModalProps> = ({
  open,
  onClose,
  onConfirm,
  agentName,
  agentId,
  onComplete,
}) => {
  const [phase, setPhase] = useState<'confirm' | 'progress'>('confirm');
  const [progress, setProgress] = useState<ResyncProgress>({ status: 'idle' });
  const [isStarting, setIsStarting] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isSubscribedRef = useRef(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setProgress({ status: 'idle' });
      setIsStarting(false);
    }
  }, [open]);

  // Cleanup subscription when modal closes
  useEffect(() => {
    if (!open && unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
      isSubscribedRef.current = false;
      if (agentId) {
        websocket.unsubscribeFromAgent(agentId);
      }
    }
  }, [open, agentId]);

  // Setup WebSocket subscription function
  const setupSubscription = useCallback(() => {
    if (!agentId || isSubscribedRef.current) return;

    websocket.subscribeToAgent(agentId);
    isSubscribedRef.current = true;

    const unsubscribe = websocket.subscribe<ResyncProgress>('resync:status', (data) => {
      setProgress(data);

      if (data.status === 'completed') {
        setTimeout(() => {
          onComplete?.();
        }, 1500);
      }
    });

    unsubscribeRef.current = unsubscribe;
  }, [agentId, onComplete]);

  const handleConfirm = useCallback(async () => {
    setIsStarting(true);

    // Subscribe to WebSocket BEFORE making API call
    setupSubscription();

    // Small delay to ensure subscription is established
    await new Promise(resolve => setTimeout(resolve, 100));

    setPhase('progress');
    setProgress({ status: 'started', message: 'Starting force resync...' });

    try {
      await onConfirm();
    } catch (error: any) {
      setProgress({
        status: 'error',
        error: error?.message || 'Failed to start resync'
      });
    } finally {
      setIsStarting(false);
    }
  }, [onConfirm, setupSubscription]);

  const handleClose = useCallback(() => {
    // Only allow close if not in progress (unless completed/error)
    if (phase === 'progress' && progress.status !== 'completed' && progress.status !== 'error') {
      return;
    }
    onClose();
  }, [phase, progress.status, onClose]);

  const currentStepIndex = getStepIndex(progress.status);
  const progressPercent = getProgressPercent(progress.status);
  const isInProgress = phase === 'progress' && !['idle', 'completed', 'error'].includes(progress.status);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="md"
      showCloseButton={!isInProgress}
      closeOnOverlayClick={!isInProgress}
      closeOnEscape={!isInProgress}
    >
      {phase === 'confirm' ? (
        // Confirmation Phase
        <div className="flex flex-col items-center text-center">
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
          </div>

          {/* Title */}
          <h3 className="text-xl font-semibold text-white mb-2">Force Resync</h3>

          {/* Message */}
          <div className="text-gray-400 text-sm mb-6 space-y-2">
            <p>
              This will <span className="text-red-400 font-medium">DELETE</span> all conversations
              and messages for agent "<span className="text-white font-medium">{agentName}</span>"
              and perform a fresh sync from WhatsApp.
            </p>
            <p className="text-amber-400">
              This action cannot be undone.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isStarting}
              fullWidth
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirm}
              loading={isStarting}
              fullWidth
            >
              Start Resync
            </Button>
          </div>
        </div>
      ) : (
        // Progress Phase
        <div className="flex flex-col">
          {/* Header with status icon */}
          <div className="flex items-center gap-3 mb-6">
            <div className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center',
              progress.status === 'completed' && 'bg-green-500/20',
              progress.status === 'error' && 'bg-red-500/20',
              !['completed', 'error'].includes(progress.status) && 'bg-sky-500/20'
            )}>
              {progress.status === 'completed' ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : progress.status === 'error' ? (
                <XCircle className="w-6 h-6 text-red-400" />
              ) : (
                <RefreshCw className="w-6 h-6 text-sky-400 animate-spin" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {progress.status === 'completed'
                  ? 'Resync Complete!'
                  : progress.status === 'error'
                  ? 'Resync Failed'
                  : 'Syncing...'}
              </h3>
              <p className="text-sm text-gray-400">
                {progress.message || 'Processing...'}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>Progress</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 ease-out',
                  progress.status === 'completed' && 'bg-green-500',
                  progress.status === 'error' && 'bg-red-500',
                  !['completed', 'error'].includes(progress.status) && 'bg-gradient-to-r from-sky-500 to-cyan-400'
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3 mb-6">
            {statusSteps.map((step, index) => {
              const isActive = currentStepIndex === index;
              const isCompleted = currentStepIndex > index || progress.status === 'completed';
              const isPending = currentStepIndex < index && progress.status !== 'completed';

              return (
                <div
                  key={step.status}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg transition-all duration-300',
                    isActive && 'bg-sky-500/10 border border-sky-500/30',
                    isCompleted && 'bg-green-500/5',
                    isPending && 'opacity-50'
                  )}
                >
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                    isCompleted && 'bg-green-500',
                    isActive && 'bg-sky-500',
                    isPending && 'bg-slate-600'
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    ) : isActive ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <span className="text-xs text-gray-400">{index + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm font-medium',
                      isCompleted && 'text-green-400',
                      isActive && 'text-sky-400',
                      isPending && 'text-gray-500'
                    )}>
                      {step.label}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stats (shown on completion) */}
          {progress.status === 'completed' && (
            <div className="grid grid-cols-2 gap-3 mb-6 p-4 bg-slate-700/50 rounded-lg">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {progress.messagesDeleted ?? 0}
                </p>
                <p className="text-xs text-gray-400">Messages Deleted</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {progress.conversationsDeleted ?? 0}
                </p>
                <p className="text-xs text-gray-400">Conversations Deleted</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-400">
                  {progress.contactsSynced ?? 0}
                </p>
                <p className="text-xs text-gray-400">Contacts Synced</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-400">
                  {progress.conversationsSynced ?? 0}
                </p>
                <p className="text-xs text-gray-400">Conversations Synced</p>
              </div>
            </div>
          )}

          {/* Error message */}
          {progress.status === 'error' && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">
                {progress.error || 'An unexpected error occurred during resync.'}
              </p>
            </div>
          )}

          {/* Close button (only when complete/error) */}
          {(progress.status === 'completed' || progress.status === 'error') && (
            <Button
              variant={progress.status === 'completed' ? 'primary' : 'ghost'}
              onClick={handleClose}
              fullWidth
            >
              {progress.status === 'completed' ? 'Done' : 'Close'}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ForceResyncModal;
