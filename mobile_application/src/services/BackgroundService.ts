/**
 * Background Service — Keeps monitoring alive in Android foreground service
 *
 * Uses react-native-background-actions to run a persistent foreground service
 * that shows a notification "SwarmAI Agent active".
 * Starts all monitors and maintains the WebSocket connection.
 */
import BackgroundService from 'react-native-background-actions';
import { NativeModules, Platform } from 'react-native';
import { getSocketService } from './SocketService';
import { getSmsMonitor } from './SmsMonitor';
import { getNotificationMonitor } from './NotificationMonitor';
import { getDeviceMonitor } from './DeviceMonitor';
import { getEventBatcher } from './EventBatcher';
import { getNotificationDisplayService } from './NotificationDisplayService';

const BACKGROUND_TASK_OPTIONS = {
  taskName: 'SwarmMobileAgent',
  taskTitle: 'SwarmAI Agent',
  taskDesc: 'Monitoring SMS, notifications, and device status',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#3B82F6',
  linkingURI: 'swarmagent://home',
  parameters: {
    delay: 1000,
  },
};

// The background task function
const backgroundTask = async (_taskData?: { delay: number }): Promise<void> => {
  // This function runs in background — keep connection and monitors alive
  // The actual work is done by the monitors and socket service.
  // We just need to keep the promise alive so the service doesn't stop.

  await new Promise<void>((resolve) => {
    // This promise never resolves while the service is running
    // It will be resolved when stopBackground() is called
    const check = setInterval(() => {
      if (!BackgroundService.isRunning()) {
        clearInterval(check);
        resolve();
      }
    }, 5000);
  });
};

export async function startBackground(): Promise<void> {
  if (BackgroundService.isRunning()) {
    console.log('[BackgroundService] Already running');
    return;
  }

  // 1. Connect socket
  const socketService = getSocketService();
  await socketService.connect();

  // 2. Set up event batcher → socket push
  const batcher = getEventBatcher();
  batcher.setFlushCallback((events) => {
    socketService.pushEvents(events);
  });
  batcher.start();

  // 3. Set up command handler (e.g. send_sms)
  socketService.setCommandHandler(async (command, params, _commandId) => {
    if (command === 'send_sms' && Platform.OS === 'android') {
      const { SmsModule } = NativeModules;
      if (SmsModule?.sendSms) {
        return await SmsModule.sendSms(params.recipient as string, params.message as string);
      }
      throw new Error('SMS sending not available on this device');
    }
    throw new Error(`Unknown command: ${command}`);
  });

  // 4. Initialize notification display and wire alert callback
  const notificationDisplay = getNotificationDisplayService();
  await notificationDisplay.initialize();
  socketService.setOnAlert((alert) => {
    notificationDisplay.displayAlert(alert);
  });

  // 5. Start monitors
  getSmsMonitor().start();
  await getNotificationMonitor().start();
  await getDeviceMonitor().start();

  // 6. Start background service (shows persistent notification)
  await BackgroundService.start(backgroundTask, BACKGROUND_TASK_OPTIONS);
  console.log('[BackgroundService] Started');
}

export async function stopBackground(): Promise<void> {
  // Stop monitors
  getSmsMonitor().stop();
  getNotificationMonitor().stop();
  getDeviceMonitor().stop();
  getEventBatcher().stop();
  getEventBatcher().clear();

  // Disconnect socket
  getSocketService().disconnect();

  // Stop background service
  if (BackgroundService.isRunning()) {
    await BackgroundService.stop();
  }

  console.log('[BackgroundService] Stopped');
}

export function isBackgroundRunning(): boolean {
  return BackgroundService.isRunning();
}
