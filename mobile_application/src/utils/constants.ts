export const EVENT_TYPES = {
  SMS_RECEIVED: 'sms_received',
  SMS_SENT: 'sms_sent',
  NOTIFICATION: 'notification',
  BATTERY_STATUS: 'battery_status',
  DEVICE_STATUS: 'device_status',
  CALL_MISSED: 'call_missed',
  CALL_INCOMING: 'call_incoming',
  CONNECTIVITY_CHANGE: 'connectivity_change',
  LOCATION_UPDATE: 'location_update',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface MobileEvent {
  eventType: EventType;
  sourceApp?: string;
  sender?: string;
  title?: string;
  body?: string;
  metadata?: Record<string, unknown>;
  deviceTimestamp?: string;
}

export interface DeviceStatus {
  batteryLevel: number;
  batteryCharging: boolean;
  wifiConnected: boolean;
  cellularType: string;
  screenOn: boolean;
  storageAvailableMb: number;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  locationTimestamp?: string;
}

export const DEFAULT_CONFIG = {
  pushIntervalMs: 30000, // 30s
  maxBatchSize: 20,
  maxQueueSize: 500,
  heartbeatIntervalMs: 15000,
  deviceStatusIntervalMs: 60000,
  locationIntervalMs: 300000, // 5 min
  reconnectBaseMs: 1000,
  reconnectMaxMs: 30000,
};

export const PAIRING_POLL_INTERVAL_MS = 3000;
export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000; // 5 min

// ============================================
// Mobile Alert Types (server → phone push)
// ============================================

export const ALERT_TYPES = {
  APPROVAL_NEEDED: 'approval_needed',
  TASK_COMPLETED: 'task_completed',
  CRITICAL_ERROR: 'critical_error',
  BUDGET_WARNING: 'budget_warning',
  BUDGET_EXCEEDED: 'budget_exceeded',
  DAILY_REPORT: 'daily_report',
  SCHEDULE_ALERT: 'schedule_alert',
  REMINDER: 'reminder',
  CUSTOM: 'custom',
  TEST: 'test',
} as const;

export type AlertType = (typeof ALERT_TYPES)[keyof typeof ALERT_TYPES];

export type AlertPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface MobileAlert {
  alertId: string;
  alertType: AlertType;
  title: string;
  body?: string;
  priority: AlertPriority;
  referenceType?: string;
  referenceId?: string;
  timestamp: string;
}

export const NOTIFICATION_CHANNELS = {
  URGENT: 'swarm-urgent',
  HIGH: 'swarm-high',
  NORMAL: 'swarm-normal',
  LOW: 'swarm-low',
} as const;
