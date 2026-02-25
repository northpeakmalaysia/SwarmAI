/**
 * Notification Display Service — Shows native Android notifications via @notifee
 *
 * Handles:
 * - Creating Android notification channels (by priority)
 * - Requesting POST_NOTIFICATIONS permission (Android 13+)
 * - Displaying alerts as native notifications with appropriate sound/vibration
 * - Tracking unread alert count
 */
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AuthorizationStatus,
} from '@notifee/react-native';
import { MobileAlert, AlertPriority, NOTIFICATION_CHANNELS } from '../utils/constants';

class NotificationDisplayService {
  private initialized = false;
  private unreadCount = 0;
  private countListeners: Set<(count: number) => void> = new Set();

  /**
   * Initialize notification channels and request permissions.
   * Must be called once at startup.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Request notification permission (Android 13+ requires explicit grant)
    const settings = await notifee.requestPermission();
    if (settings.authorizationStatus < AuthorizationStatus.AUTHORIZED) {
      console.warn('[NotificationDisplay] Notification permission not granted');
    }

    // Create channels by priority level
    await notifee.createChannel({
      id: NOTIFICATION_CHANNELS.URGENT,
      name: 'Urgent Alerts',
      description: 'Critical alerts requiring immediate attention',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      vibration: true,
      vibrationPattern: [0, 500, 200, 500],
      lights: true,
      lightColor: '#EF4444',
      bypassDnd: true,
    });

    await notifee.createChannel({
      id: NOTIFICATION_CHANNELS.HIGH,
      name: 'High Priority',
      description: 'Important notifications like approvals and warnings',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      vibration: true,
      vibrationPattern: [0, 250],
    });

    await notifee.createChannel({
      id: NOTIFICATION_CHANNELS.NORMAL,
      name: 'Normal',
      description: 'Standard notifications like task completions and reports',
      importance: AndroidImportance.DEFAULT,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      vibration: false,
    });

    await notifee.createChannel({
      id: NOTIFICATION_CHANNELS.LOW,
      name: 'Low Priority',
      description: 'Informational notifications',
      importance: AndroidImportance.LOW,
      visibility: AndroidVisibility.PUBLIC,
      sound: undefined,
      vibration: false,
    });

    this.initialized = true;
    console.log('[NotificationDisplay] Initialized with 4 channels');
  }

  /**
   * Display a native Android notification for an incoming alert.
   */
  async displayAlert(alert: MobileAlert): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const channelId = this.getChannelForPriority(alert.priority);
    const emoji = this.getEmojiForType(alert.alertType);

    await notifee.displayNotification({
      id: alert.alertId,
      title: `${emoji} ${alert.title}`,
      body: alert.body || '',
      android: {
        channelId,
        smallIcon: 'ic_launcher',
        pressAction: { id: 'default' },
        timestamp: new Date(alert.timestamp).getTime(),
        showTimestamp: true,
        autoCancel: true,
      },
    });

    // Update unread count
    this.unreadCount++;
    this.notifyCountListeners();
  }

  /**
   * Cancel/dismiss a specific notification.
   */
  async clearAlert(alertId: string): Promise<void> {
    await notifee.cancelNotification(alertId);
    if (this.unreadCount > 0) {
      this.unreadCount--;
      this.notifyCountListeners();
    }
  }

  /**
   * Get current unread alert count.
   */
  getUnreadCount(): number {
    return this.unreadCount;
  }

  /**
   * Subscribe to unread count changes.
   * Returns an unsubscribe function.
   */
  onCountChange(callback: (count: number) => void): () => void {
    this.countListeners.add(callback);
    return () => { this.countListeners.delete(callback); };
  }

  /**
   * Reset unread counter (e.g. user viewed alerts).
   */
  resetCount(): void {
    this.unreadCount = 0;
    this.notifyCountListeners();
  }

  private notifyCountListeners(): void {
    for (const cb of this.countListeners) {
      try { cb(this.unreadCount); } catch { /* ignore */ }
    }
  }

  private getChannelForPriority(priority: AlertPriority): string {
    switch (priority) {
      case 'urgent': return NOTIFICATION_CHANNELS.URGENT;
      case 'high': return NOTIFICATION_CHANNELS.HIGH;
      case 'low': return NOTIFICATION_CHANNELS.LOW;
      default: return NOTIFICATION_CHANNELS.NORMAL;
    }
  }

  private getEmojiForType(alertType: string): string {
    switch (alertType) {
      case 'approval_needed': return '\u26A0\uFE0F';
      case 'critical_error': return '\uD83D\uDEA8';
      case 'budget_warning': return '\uD83D\uDCB0';
      case 'budget_exceeded': return '\uD83D\uDEAB';
      case 'task_completed': return '\u2705';
      case 'schedule_alert': return '\u23F0';
      case 'daily_report': return '\uD83D\uDCCA';
      case 'reminder': return '\uD83D\uDD14';
      case 'test': return '\uD83E\uDDEA';
      default: return '\uD83D\uDD14';
    }
  }
}

// Singleton
let instance: NotificationDisplayService | null = null;

export function getNotificationDisplayService(): NotificationDisplayService {
  if (!instance) {
    instance = new NotificationDisplayService();
  }
  return instance;
}
