/**
 * Device Monitor — Battery, network, screen state, GPS location
 *
 * Polls device status and pushes to server via SocketService.
 * Also handles GPS location tracking.
 */
import DeviceInfo from 'react-native-device-info';
import NetInfo from '@react-native-community/netinfo';
import Geolocation from 'react-native-geolocation-service';
import { getSocketService } from './SocketService';
import { getEventBatcher } from './EventBatcher';
import { DeviceStatus, DEFAULT_CONFIG, EVENT_TYPES } from '../utils/constants';

class DeviceMonitor {
  private statusInterval: ReturnType<typeof setInterval> | null = null;
  private locationInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastLocation: { latitude: number; longitude: number; accuracy: number; timestamp: string } | null = null;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Push device status periodically
    this.statusInterval = setInterval(() => this.pushStatus(), DEFAULT_CONFIG.deviceStatusIntervalMs);

    // Push initial status
    await this.pushStatus();

    // Start location tracking
    this.startLocationTracking();

    // Listen for network changes
    NetInfo.addEventListener((state) => {
      getEventBatcher().push({
        eventType: EVENT_TYPES.CONNECTIVITY_CHANGE,
        metadata: {
          wifiConnected: state.type === 'wifi' && state.isConnected,
          cellularConnected: state.type === 'cellular' && state.isConnected,
          type: state.type,
          isInternetReachable: state.isInternetReachable,
        },
        deviceTimestamp: new Date().toISOString(),
      });
    });

    console.log('[DeviceMonitor] Started');
  }

  async pushStatus(): Promise<void> {
    try {
      const [batteryLevel, batteryCharging, netState] = await Promise.all([
        DeviceInfo.getBatteryLevel(),
        DeviceInfo.isBatteryCharging(),
        NetInfo.fetch(),
      ]);

      let storageAvailableMb = 0;
      try {
        const freeDisk = await DeviceInfo.getFreeDiskStorage();
        storageAvailableMb = Math.round(freeDisk / (1024 * 1024));
      } catch {
        // Some devices may not support this
      }

      const status: DeviceStatus = {
        batteryLevel: Math.round(batteryLevel * 100),
        batteryCharging: batteryCharging,
        wifiConnected: netState.type === 'wifi' && !!netState.isConnected,
        cellularType: netState.type === 'cellular' ? (netState.details?.cellularGeneration || 'unknown') : 'none',
        screenOn: true, // Can't reliably detect in RN without native module
        storageAvailableMb,
        ...(this.lastLocation && {
          latitude: this.lastLocation.latitude,
          longitude: this.lastLocation.longitude,
          locationAccuracy: this.lastLocation.accuracy,
          locationTimestamp: this.lastLocation.timestamp,
        }),
      };

      getSocketService().pushDeviceStatus(status);

      // Also push battery status event if low
      if (status.batteryLevel < 15) {
        getEventBatcher().push({
          eventType: EVENT_TYPES.BATTERY_STATUS,
          metadata: {
            batteryLevel: status.batteryLevel,
            batteryCharging: status.batteryCharging,
          },
          deviceTimestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn(`[DeviceMonitor] pushStatus failed: ${e}`);
    }
  }

  private startLocationTracking(): void {
    // Get initial position
    this.getCurrentLocation();

    // Poll location periodically
    this.locationInterval = setInterval(
      () => this.getCurrentLocation(),
      DEFAULT_CONFIG.locationIntervalMs,
    );
  }

  private getCurrentLocation(): void {
    Geolocation.getCurrentPosition(
      (position) => {
        this.lastLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString(),
        };

        // Push location update event
        getEventBatcher().push({
          eventType: EVENT_TYPES.LOCATION_UPDATE,
          metadata: {
            latitude: this.lastLocation.latitude,
            longitude: this.lastLocation.longitude,
            accuracy: this.lastLocation.accuracy,
            altitude: position.coords.altitude,
            speed: position.coords.speed,
          },
          deviceTimestamp: this.lastLocation.timestamp,
        });
      },
      (error) => {
        console.warn(`[DeviceMonitor] Location error: ${error.message}`);
      },
      {
        enableHighAccuracy: false, // Use network location to save battery
        timeout: 15000,
        maximumAge: 60000,
      },
    );
  }

  getLastLocation() {
    return this.lastLocation;
  }

  stop(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    if (this.locationInterval) {
      clearInterval(this.locationInterval);
      this.locationInterval = null;
    }
    this.running = false;
    console.log('[DeviceMonitor] Stopped');
  }
}

let instance: DeviceMonitor | null = null;

export function getDeviceMonitor(): DeviceMonitor {
  if (!instance) {
    instance = new DeviceMonitor();
  }
  return instance;
}
