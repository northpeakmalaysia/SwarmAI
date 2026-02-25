// Simple tab modes (no platform-specific filtering)
// 'chats' and 'status' are legacy (V1) — kept for backwards compatibility
export type SimpleViewMode = 'chat' | 'chats' | 'email' | 'news' | 'status' | 'contacts';

// Default view mode is 'unset' — hook will auto-resolve to first platform tab
export const DEFAULT_VIEW_MODE = 'unset' as const;

// Platform-specific tab selection (WhatsApp / Telegram with account filtering)
export interface PlatformTabSelection {
  type: 'platform';
  platform: 'whatsapp' | 'telegram';
  accountId?: string;        // specific platform_accounts.id — undefined = "All"
  subFilter?: 'chat' | 'status'; // WhatsApp only (status = WA Status updates)
}

// Union type for all view modes
export type ViewMode = SimpleViewMode | PlatformTabSelection;

// Type guard helpers
export function isPlatformTab(mode: ViewMode): mode is PlatformTabSelection {
  return typeof mode === 'object' && mode.type === 'platform';
}

export function getViewModeKey(mode: ViewMode): string {
  if (isPlatformTab(mode)) {
    return `platform:${mode.platform}:${mode.accountId || 'all'}`;
  }
  return mode;
}

export interface ContactFilterTag {
  value: string;
  label: string;
  color: string;
}

export const CONTACT_FILTER_TAGS: ContactFilterTag[] = [
  { value: 'all', label: 'All', color: 'bg-slate-600' },
  { value: 'Customer', label: 'Customers', color: 'bg-blue-500' },
  { value: 'Lead', label: 'Leads', color: 'bg-yellow-500' },
  { value: 'VIP', label: 'VIP', color: 'bg-purple-500' },
  { value: 'Partner', label: 'Partners', color: 'bg-green-500' },
];
