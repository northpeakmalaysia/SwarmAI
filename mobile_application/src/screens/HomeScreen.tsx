/**
 * Home Screen — Main dashboard after pairing
 *
 * Shows connection status, event counters, device stats,
 * and monitoring toggle.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { getSocketService } from '../services/SocketService';
import { getDeviceMonitor } from '../services/DeviceMonitor';
import { getEventBatcher } from '../services/EventBatcher';
import { getNotificationDisplayService } from '../services/NotificationDisplayService';
import { startBackground, stopBackground, isBackgroundRunning } from '../services/BackgroundService';
import { getServerUrl, getDeviceName } from '../storage/ConfigStore';

interface Props {
  onOpenSettings: () => void;
}

export default function HomeScreen({ onOpenSettings }: Props) {
  const [connected, setConnected] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [serverUrl, setServerUrlState] = useState('');
  const [deviceName, setDeviceNameState] = useState('');
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [batteryCharging, setBatteryCharging] = useState(false);
  const [queueSize, setQueueSize] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadConfig();
    const statusInterval = setInterval(updateStatus, 3000);

    // Subscribe to alert count changes
    const unsubscribe = getNotificationDisplayService().onCountChange(setAlertCount);

    return () => {
      clearInterval(statusInterval);
      unsubscribe();
    };
  }, []);

  const loadConfig = async () => {
    const url = await getServerUrl();
    const name = await getDeviceName();
    setServerUrlState(url || '');
    setDeviceNameState(name || '');
    setMonitoring(isBackgroundRunning());
  };

  const updateStatus = () => {
    const socket = getSocketService();
    setConnected(socket.isConnected);
    setQueueSize(getEventBatcher().getQueueSize());
    setMonitoring(isBackgroundRunning());

    const location = getDeviceMonitor().getLastLocation();
    // Battery is pushed via device status — we read from the monitor's last push
  };

  const toggleMonitoring = async () => {
    if (monitoring) {
      await stopBackground();
      setMonitoring(false);
    } else {
      await startBackground();
      setMonitoring(true);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConfig();
    updateStatus();
    setRefreshing(false);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
      }
    >
      <Text style={styles.title}>SwarmAI Agent</Text>
      <Text style={styles.deviceName}>{deviceName}</Text>

      {/* Connection Status */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, connected ? styles.dotOnline : styles.dotOffline]} />
          <Text style={styles.statusText}>
            {connected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
        <Text style={styles.serverUrl}>{serverUrl}</Text>
      </View>

      {/* Monitoring Toggle */}
      <TouchableOpacity
        style={[styles.monitorButton, monitoring ? styles.monitorActive : styles.monitorInactive]}
        onPress={toggleMonitoring}
      >
        <Text style={styles.monitorButtonText}>
          {monitoring ? 'Stop Monitoring' : 'Start Monitoring'}
        </Text>
      </TouchableOpacity>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard label="Event Queue" value={String(queueSize)} />
        <StatCard
          label="Alerts"
          value={String(alertCount)}
          extra={alertCount > 0 ? 'Unread' : ''}
        />
      </View>
      <View style={styles.statsGrid}>
        <StatCard
          label="Battery"
          value={batteryLevel != null ? `${batteryLevel}%` : '--'}
          extra={batteryCharging ? 'Charging' : ''}
        />
      </View>

      {/* Settings Button */}
      <TouchableOpacity style={styles.settingsButton} onPress={onOpenSettings}>
        <Text style={styles.settingsButtonText}>Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatCard({ label, value, extra }: { label: string; value: string; extra?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {extra ? <Text style={styles.statExtra}>{extra}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    padding: 24,
    paddingTop: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F1F5F9',
    textAlign: 'center',
  },
  deviceName: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
  },
  statusCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotOnline: {
    backgroundColor: '#22C55E',
  },
  dotOffline: {
    backgroundColor: '#EF4444',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  serverUrl: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 18,
  },
  monitorButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  monitorActive: {
    backgroundColor: '#EF4444',
  },
  monitorInactive: {
    backgroundColor: '#22C55E',
  },
  monitorButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  statExtra: {
    fontSize: 11,
    color: '#22C55E',
    marginTop: 2,
  },
  settingsButton: {
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  settingsButtonText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
});
