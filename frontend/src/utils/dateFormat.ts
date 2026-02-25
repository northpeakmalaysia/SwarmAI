import { useAuthStore } from '../stores/authStore';

/**
 * Get the user's timezone from authStore, defaulting to UTC.
 * Use this in components: const tz = getUserTimezone();
 */
export function getUserTimezone(): string {
  return useAuthStore.getState().user?.preferences?.timezone || 'UTC';
}

/**
 * Format a date string to a full date+time display in the user's timezone.
 * Example: "Feb 22, 2026, 06:30 PM"
 */
export function formatDateTime(dateString?: string | null, timezone?: string): string {
  if (!dateString) return 'N/A';
  const tz = timezone || getUserTimezone();
  try {
    return new Date(dateString).toLocaleString('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format a date string to date-only display in the user's timezone.
 * Example: "Feb 22, 2026"
 */
export function formatDate(dateString?: string | null, timezone?: string): string {
  if (!dateString) return 'N/A';
  const tz = timezone || getUserTimezone();
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format a date string to short date display (no year).
 * Example: "Feb 22"
 */
export function formatShortDate(dateString?: string | null, timezone?: string): string {
  if (!dateString) return 'N/A';
  const tz = timezone || getUserTimezone();
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format a date string to time-only display in the user's timezone.
 * Example: "06:30 PM" or "18:30"
 */
export function formatTime(dateString?: string | null, timezone?: string): string {
  if (!dateString) return 'N/A';
  const tz = timezone || getUserTimezone();
  try {
    return new Date(dateString).toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format a date string to 24h time-only display.
 * Example: "18:30:45"
 */
export function formatTime24h(dateString?: string | null, timezone?: string): string {
  if (!dateString) return 'N/A';
  const tz = timezone || getUserTimezone();
  try {
    return new Date(dateString).toLocaleTimeString('en-US', {
      timeZone: tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format relative time ("5 minutes ago", "2 hours ago", "Yesterday").
 * Falls back to formatShortDate for dates older than 7 days.
 */
export function formatRelativeTime(dateString?: string | null, timezone?: string): string {
  if (!dateString) return 'N/A';
  const tz = timezone || getUserTimezone();
  try {
    const date = new Date(dateString);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatShortDate(dateString, tz);
  } catch {
    return dateString;
  }
}

/**
 * Format a chat timestamp - time for today, weekday for this week, date for older.
 * Similar to how messaging apps display timestamps.
 */
export function formatChatTimestamp(dateString?: string | null, timezone?: string): string {
  if (!dateString) return '';
  const tz = timezone || getUserTimezone();
  try {
    const date = new Date(dateString);
    const now = new Date();

    const todayStr = now.toLocaleDateString('en-US', { timeZone: tz });
    const dateStr = date.toLocaleDateString('en-US', { timeZone: tz });

    if (dateStr === todayStr) {
      return formatTime(dateString, tz);
    }

    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toLocaleDateString('en-US', { timeZone: tz });
    if (dateStr === yesterdayStr) {
      return 'Yesterday';
    }

    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
    }

    return date.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

/**
 * Format a date separator for chat views ("Today", "Yesterday", "Monday, February 22, 2026").
 */
export function formatDateSeparator(dateString?: string | null, timezone?: string): string {
  if (!dateString) return '';
  const tz = timezone || getUserTimezone();
  try {
    const date = new Date(dateString);
    const now = new Date();

    const todayStr = now.toLocaleDateString('en-US', { timeZone: tz });
    const dateStr = date.toLocaleDateString('en-US', { timeZone: tz });

    if (dateStr === todayStr) return 'Today';

    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toLocaleDateString('en-US', { timeZone: tz });
    if (dateStr === yesterdayStr) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
      timeZone: tz,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Check if two date strings fall on the same calendar day in the user's timezone.
 */
export function isSameDay(dateString1: string, dateString2: string, timezone?: string): boolean {
  const tz = timezone || getUserTimezone();
  try {
    const d1 = new Date(dateString1).toLocaleDateString('en-US', { timeZone: tz });
    const d2 = new Date(dateString2).toLocaleDateString('en-US', { timeZone: tz });
    return d1 === d2;
  } catch {
    return false;
  }
}
