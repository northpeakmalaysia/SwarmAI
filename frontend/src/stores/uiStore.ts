import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Notification, NotificationType, ModalState, ModalType, ThemeMode } from '../types';

/**
 * Generate a unique ID for notifications
 */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Default modal state
 */
const defaultModalState: ModalState = {
  isOpen: false,
  type: null,
  title: undefined,
  data: undefined,
  onConfirm: undefined,
  onCancel: undefined,
};

/**
 * UI Store State Interface
 * Manages UI state including sidebar, notifications, modals, and theme
 */
interface UIStoreState {
  // Sidebar State
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;

  // Navigation State
  activeTab: string;

  // Notifications
  notifications: Notification[];

  // Modal State
  modal: ModalState;

  // Theme
  theme: ThemeMode;

  // Font Scale (0.6 = 60%, 1.0 = 100%, 1.5 = 150%)
  fontScale: number;

  // Sidebar Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  collapseSidebar: (collapsed: boolean) => void;
  setMobileMenuOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;

  // Navigation Actions
  setActiveTab: (tab: string) => void;

  // Notification Actions
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Modal Actions
  openModal: (type: ModalType, options?: Partial<Omit<ModalState, 'isOpen' | 'type'>>) => void;
  closeModal: () => void;
  updateModalData: (data: Record<string, unknown>) => void;

  // Theme Actions
  setTheme: (theme: ThemeMode) => void;

  // Font Scale Actions
  setFontScale: (scale: number) => void;

  // Utility - toast-style notification helpers
  showSuccess: (title: string, message?: string) => string;
  showError: (title: string, message?: string) => string;
  showWarning: (title: string, message?: string) => string;
  showInfo: (title: string, message?: string) => string;
}

export const useUIStore = create<UIStoreState>()(
  persist(
    (set, get) => ({
      // Initial State
      sidebarOpen: true,
      sidebarCollapsed: false,
      mobileMenuOpen: false,
      activeTab: 'dashboard',
      notifications: [],
      modal: defaultModalState,
      theme: 'system',
      fontScale: 1.0, // Default 100%

      /**
       * Toggle sidebar open/closed
       */
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      /**
       * Set sidebar open state directly
       */
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      /**
       * Set sidebar collapsed state (minimized but visible)
       */
      collapseSidebar: (collapsed) => set({ sidebarCollapsed: collapsed }),

      /**
       * Set mobile menu open state
       */
      setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),

      /**
       * Toggle mobile menu open/closed
       */
      toggleMobileMenu: () => set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),

      /**
       * Set the active navigation tab
       */
      setActiveTab: (tab) => set({ activeTab: tab }),

      /**
       * Add a new notification with optional auto-dismiss
       */
      addNotification: (notification) => {
        const id = generateId();
        const newNotification: Notification = {
          ...notification,
          id,
          createdAt: new Date().toISOString(),
          dismissible: notification.dismissible ?? true,
        };

        set((state) => ({
          notifications: [...state.notifications, newNotification],
        }));

        // Auto-dismiss after duration (default: 5000ms, 0 = never)
        const duration = notification.duration ?? 5000;
        if (duration > 0) {
          setTimeout(() => {
            get().removeNotification(id);
          }, duration);
        }

        return id;
      },

      /**
       * Remove a notification by ID
       */
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      /**
       * Clear all notifications
       */
      clearNotifications: () => set({ notifications: [] }),

      /**
       * Open a modal with the specified type and options
       */
      openModal: (type, options = {}) =>
        set({
          modal: {
            isOpen: true,
            type,
            title: options.title,
            data: options.data,
            onConfirm: options.onConfirm,
            onCancel: options.onCancel,
          },
        }),

      /**
       * Close the current modal
       */
      closeModal: () => {
        const { modal } = get();
        // Call onCancel callback if provided
        if (modal.onCancel) {
          modal.onCancel();
        }
        set({ modal: defaultModalState });
      },

      /**
       * Update the modal data without closing it
       */
      updateModalData: (data) =>
        set((state) => ({
          modal: {
            ...state.modal,
            data: { ...state.modal.data, ...data },
          },
        })),

      /**
       * Set the theme mode
       */
      setTheme: (theme) => {
        set({ theme });

        // Apply theme to document
        const root = document.documentElement;
        root.classList.remove('light', 'dark');

        if (theme === 'system') {
          const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
          root.classList.add(systemTheme);
        } else {
          root.classList.add(theme);
        }
      },

      /**
       * Set the font scale (0.6 = 60%, 1.0 = 100%, 1.5 = 150%)
       */
      setFontScale: (scale) => {
        // Clamp to valid range
        const clampedScale = Math.min(Math.max(scale, 0.6), 1.5);
        set({ fontScale: clampedScale });

        // Apply font scale to document using CSS custom property
        document.documentElement.style.setProperty('--font-scale', clampedScale.toString());
      },

      /**
       * Show a success notification
       */
      showSuccess: (title, message) =>
        get().addNotification({
          type: 'success',
          title,
          message,
        }),

      /**
       * Show an error notification
       */
      showError: (title, message) =>
        get().addNotification({
          type: 'error',
          title,
          message,
          duration: 8000, // Errors stay longer
        }),

      /**
       * Show a warning notification
       */
      showWarning: (title, message) =>
        get().addNotification({
          type: 'warning',
          title,
          message,
        }),

      /**
       * Show an info notification
       */
      showInfo: (title, message) =>
        get().addNotification({
          type: 'info',
          title,
          message,
        }),
    }),
    {
      name: 'swarm-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        fontScale: state.fontScale,
      }),
      onRehydrateStorage: () => (state) => {
        // Apply theme and font scale after hydration from localStorage
        if (state) {
          // Apply font scale to CSS variable
          document.documentElement.style.setProperty('--font-scale', state.fontScale.toString());

          // Apply theme
          const root = document.documentElement;
          root.classList.remove('light', 'dark');
          if (state.theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light';
            root.classList.add(systemTheme);
          } else {
            root.classList.add(state.theme);
          }
        }
      },
    }
  )
);

/**
 * Initialize theme and font scale on app load
 * Call this in your App component
 */
export const initializeTheme = (): void => {
  const { theme, setTheme, fontScale, setFontScale } = useUIStore.getState();
  setTheme(theme);
  setFontScale(fontScale);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const { theme } = useUIStore.getState();
    if (theme === 'system') {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(e.matches ? 'dark' : 'light');
    }
  });
};
