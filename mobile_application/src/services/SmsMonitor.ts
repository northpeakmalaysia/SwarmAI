/**
 * SMS Monitor — Reads SMS inbox and listens for incoming SMS
 *
 * Uses:
 * - react-native-get-sms-android for inbox reading
 * - react-native-android-sms-listener for real-time incoming SMS
 */
import SmsAndroid from 'react-native-get-sms-android';
import SmsListener from 'react-native-android-sms-listener';
import { getEventBatcher } from './EventBatcher';
import { EVENT_TYPES, MobileEvent } from '../utils/constants';

class SmsMonitor {
  private listener: { remove: () => void } | null = null;
  private running = false;
  private lastReadTimestamp: number = Date.now();

  start(): void {
    if (this.running) return;
    this.running = true;

    // Listen for incoming SMS in real time
    this.listener = SmsListener.addListener((message: { originatingAddress: string; body: string }) => {
      const event: MobileEvent = {
        eventType: EVENT_TYPES.SMS_RECEIVED,
        sender: message.originatingAddress,
        body: message.body,
        deviceTimestamp: new Date().toISOString(),
        metadata: { realtime: true },
      };
      getEventBatcher().push(event);
    });

    console.log('[SmsMonitor] Started listening for SMS');
  }

  /**
   * Read recent SMS from inbox (one-time sync)
   * Reads messages newer than lastReadTimestamp
   */
  readInbox(maxCount: number = 50): Promise<MobileEvent[]> {
    return new Promise((resolve) => {
      const filter = {
        box: 'inbox',
        maxCount,
        minDate: this.lastReadTimestamp,
      };

      SmsAndroid.list(
        JSON.stringify(filter),
        (fail: string) => {
          console.warn(`[SmsMonitor] Failed to read inbox: ${fail}`);
          resolve([]);
        },
        (_count: number, smsList: string) => {
          try {
            const messages = JSON.parse(smsList);
            const events: MobileEvent[] = messages.map((sms: { address: string; body: string; date: number; type: number }) => ({
              eventType: sms.type === 2 ? EVENT_TYPES.SMS_SENT : EVENT_TYPES.SMS_RECEIVED,
              sender: sms.address,
              body: sms.body,
              deviceTimestamp: new Date(sms.date).toISOString(),
              metadata: { fromInbox: true },
            }));

            this.lastReadTimestamp = Date.now();
            resolve(events);
          } catch (e) {
            console.warn('[SmsMonitor] Failed to parse SMS list');
            resolve([]);
          }
        },
      );
    });
  }

  stop(): void {
    if (this.listener) {
      this.listener.remove();
      this.listener = null;
    }
    this.running = false;
    console.log('[SmsMonitor] Stopped');
  }
}

let instance: SmsMonitor | null = null;

export function getSmsMonitor(): SmsMonitor {
  if (!instance) {
    instance = new SmsMonitor();
  }
  return instance;
}
