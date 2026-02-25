/**
 * Settings Screen — Permissions, filters, unpair
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { requestSmsPermissions, requestNotificationPermission, requestLocationPermissions } from '../utils/permissions';
import { getNotificationMonitor } from '../services/NotificationMonitor';
import { clearAll } from '../storage/ConfigStore';
import { clearApiKey } from '../storage/SecureStore';
import { stopBackground } from '../services/BackgroundService';

interface Props {
  onUnpaired: () => void;
  onBack: () => void;
}

export default function SettingsScreen({ onUnpaired, onBack }: Props) {
  const [smsGranted, setSmsGranted] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    // Check notification listener
    const notifEnabled = await getNotificationMonitor().isEnabled();
    setNotifGranted(notifEnabled);
  };

  const fixSms = async () => {
    const result = await requestSmsPermissions();
    setSmsGranted(result);
  };

  const fixNotification = () => {
    getNotificationMonitor().openSettings();
  };

  const fixLocation = async () => {
    const result = await requestLocationPermissions();
    setLocationGranted(result);
  };

  const unpairDevice = () => {
    Alert.alert(
      'Unpair Device',
      'This will disconnect from the SwarmAI server and clear all local data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            await stopBackground();
            await clearApiKey();
            await clearAll();
            onUnpaired();
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Settings</Text>

      {/* Permissions */}
      <Text style={styles.sectionTitle}>Permissions</Text>
      <View style={styles.card}>
        <PermissionRow
          label="SMS Access"
          granted={smsGranted}
          onFix={fixSms}
        />
        <PermissionRow
          label="Notification Access"
          granted={notifGranted}
          onFix={fixNotification}
        />
        <PermissionRow
          label="Location Access"
          granted={locationGranted}
          onFix={fixLocation}
        />
      </View>

      {/* Danger Zone */}
      <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Danger Zone</Text>
      <TouchableOpacity style={styles.dangerButton} onPress={unpairDevice}>
        <Text style={styles.dangerText}>Unpair Device</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function PermissionRow({ label, granted, onFix }: { label: string; granted: boolean; onFix: () => void }) {
  return (
    <View style={styles.permRow}>
      <View style={styles.permInfo}>
        <View style={[styles.permDot, granted ? styles.dotGreen : styles.dotRed]} />
        <Text style={styles.permLabel}>{label}</Text>
      </View>
      {!granted && (
        <TouchableOpacity style={styles.fixButton} onPress={onFix}>
          <Text style={styles.fixText}>Fix</Text>
        </TouchableOpacity>
      )}
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
  backButton: {
    marginBottom: 16,
  },
  backText: {
    color: '#3B82F6',
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 4,
  },
  permRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  permInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  permDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotGreen: {
    backgroundColor: '#22C55E',
  },
  dotRed: {
    backgroundColor: '#EF4444',
  },
  permLabel: {
    color: '#F1F5F9',
    fontSize: 15,
  },
  fixButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  fixText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#7F1D1D',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  dangerText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
});
