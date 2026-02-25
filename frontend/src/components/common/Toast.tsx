import React, { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  dismissible?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook to access toast functionality.
 *
 * @example
 * ```tsx
 * const { addToast, removeToast } = useToast();
 *
 * addToast({
 *   type: 'success',
 *   title: 'Agent Created',
 *   message: 'Your new agent is ready to use.',
 *   duration: 5000,
 * });
 * ```
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// Toast provider props
export interface ToastProviderProps {
  children: React.ReactNode;
  /** Position of toast container */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  /** Maximum number of visible toasts */
  maxToasts?: number;
}

const positionStyles: Record<NonNullable<ToastProviderProps['position']>, string> = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

/**
 * Toast provider component. Wrap your app with this to enable toasts.
 *
 * @example
 * ```tsx
 * <ToastProvider position="top-right" maxToasts={5}>
 *   <App />
 * </ToastProvider>
 * ```
 */
export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  position = 'top-right',
  maxToasts = 5,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000,
      dismissible: toast.dismissible ?? true,
    };

    setToasts((prev) => {
      const updated = [newToast, ...prev];
      return updated.slice(0, maxToasts);
    });

    return id;
  }, [maxToasts]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
      {children}
      <div
        className={cn(
          'fixed z-[100] flex flex-col gap-2 pointer-events-none',
          positionStyles[position]
        )}
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// Individual toast item
interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
}

const typeConfig: Record<ToastType, { icon: React.ElementType; className: string; iconClassName: string }> = {
  success: {
    icon: CheckCircle,
    className: 'border-emerald-500/50 bg-emerald-500/10',
    iconClassName: 'text-emerald-400',
  },
  error: {
    icon: AlertCircle,
    className: 'border-red-500/50 bg-red-500/10',
    iconClassName: 'text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-amber-500/50 bg-amber-500/10',
    iconClassName: 'text-amber-400',
  },
  info: {
    icon: Info,
    className: 'border-sky-500/50 bg-sky-500/10',
    iconClassName: 'text-sky-400',
  },
};

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(true);
  const config = typeConfig[toast.type];
  const Icon = config.icon;

  // Auto-dismiss after duration
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onDismiss, 200); // Wait for animation
      }, toast.duration);

      return () => clearTimeout(timer);
    }
  }, [toast.duration, onDismiss]);

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto w-80 rounded-lg border shadow-lg',
        'bg-slate-800 border-slate-700',
        'transform transition-all duration-200',
        isVisible
          ? 'translate-x-0 opacity-100'
          : 'translate-x-full opacity-0',
        config.className
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', config.iconClassName)} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{toast.title}</p>
          {toast.message && (
            <p className="text-sm text-gray-400 mt-1">{toast.message}</p>
          )}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-2 text-sm font-medium text-sky-400 hover:text-sky-300 transition-colors"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {toast.dismissible && (
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onDismiss, 200);
            }}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

// Convenience functions for creating toasts
export const toast = {
  success: (title: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'title'>>) => ({
    type: 'success' as const,
    title,
    ...options,
  }),
  error: (title: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'title'>>) => ({
    type: 'error' as const,
    title,
    ...options,
  }),
  warning: (title: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'title'>>) => ({
    type: 'warning' as const,
    title,
    ...options,
  }),
  info: (title: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'title'>>) => ({
    type: 'info' as const,
    title,
    ...options,
  }),
};

export default ToastProvider;
