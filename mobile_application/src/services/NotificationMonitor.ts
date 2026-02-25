/**
 * Notification Monitor — Captures app notifications via NotificationListenerService
 *
 * Uses react-native-notification-listener which bridges Android's
 * NotificationListenerService. User must enable notification access
 * in Settings > Notification Access.
 */
import RNNotificationListener from 'react-native-notification-listener';
import { getEventBatcher } from './EventBatcher';
import { getAppFilter } from '../storage/ConfigStore';
import { EVENT_TYPES, MobileEvent } from '../utils/constants';

// Dedup: track recent notifications to avoid re-posted duplicates
const recentNotifications = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;

class NotificationMonitor {
  private running = false;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Check if notification listening permission is granted
    const status = await RNNotificationListener.getPermissionStatus();
    if (status !== 'authorized') {
      console.warn('[NotificationMonitor] Notification access not granted. Opening settings...');
      RNNotificationListener.requestPermission();
      return;
    }

    // Register the listener
    RNNotificationListener.connect();

    RNNotificationListener.onNotificationReceived(async (notification: {
      app: string;
      title: string;
      text: string;
      time: string;
      extra?: string;
    }) => {
      // Apply app filter
      const filterApps = await getAppFilter();
      if (filterApps.length > 0 && !filterApps.includes(notification.app)) {
        return; // Skip — not in allowed apps list
      }

      // Dedup check
      const dedupKey = `${notification.app}:${notification.title}:${notification.text}`;
      const now = Date.now();
      if (recentNotifications.has(dedupKey)) {
        const lastSeen = recentNotifications.get(dedupKey)!;
        if (now - lastSeen < DEDUP_WINDOW_MS) return;
      }
      recentNotifications.set(dedupKey, now);

      // Cleanup old dedup entries
      if (recentNotifications.size > 200) {
        const cutoff = now - DEDUP_WINDOW_MS;
        for (const [key, ts] of recentNotifications) {
          if (ts < cutoff) recentNotifications.delete(key);
        }
      }

      const event: MobileEvent = {
        eventType: EVENT_TYPES.NOTIFICATION,
        sourceApp: notification.app,
        title: notification.title,
        body: notification.text,
        deviceTimestamp: notification.time || new Date().toISOString(),
        metadata: {
          extra: notification.extra ? JSON.parse(notification.extra) : undefined,
        },
      };

      getEventBatcher().push(event);
    });

    console.log('[NotificationMonitor] Started');
  }

  stop(): void {
    RNNotificationListener.disconnect();
    this.running = false;
    recentNotifications.clear();
    console.log('[NotificationMonitor] Stopped');
  }

  async isEnabled(): Promise<boolean> {
    const status = await RNNotificationListener.getPermissionStatus();
    return status === 'authorized';
  }

  openSettings(): void {
    RNNotificationListener.requestPermission();
  }
}

let instance: NotificationMonitor | null = null;

export function getNotificationMonitor(): NotificationMonitor {
  if (!instance) {
    instance = new NotificationMonitor();
  }
  return instance;
}
