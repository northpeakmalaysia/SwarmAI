/**
 * Pairing Screen — Shows 6-digit code and polls for approval
 *
 * Flow:
 * 1. POST /pair/register-code → get code
 * 2. Display large code on screen with countdown
 * 3. Poll GET /pair/status/:id every 3s
 * 4. On paired → store API key → navigate to Home
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { getServerUrl, setDeviceName as saveDeviceName, setAgentId, setPaired } from '../storage/ConfigStore';
import { storeApiKey } from '../storage/SecureStore';
import { PAIRING_POLL_INTERVAL_MS, PAIRING_CODE_TTL_MS } from '../utils/constants';

interface Props {
  onPaired: () => void;
}

export default function PairingScreen({ onPaired }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [status, setStatus] = useState<'registering' | 'waiting' | 'paired' | 'expired' | 'error'>('registering');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    registerCode();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const registerCode = async () => {
    try {
      setStatus('registering');
      const serverUrl = await getServerUrl();
      if (!serverUrl) {
        Alert.alert('Error', 'No server URL configured');
        return;
      }

      const deviceName = `${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`;
      const deviceModel = DeviceInfo.getModel();
      const deviceManufacturer = DeviceInfo.getBrand();
      const androidVersion = DeviceInfo.getSystemVersion();
      const appVersion = DeviceInfo.getVersion();

      const response = await fetch(`${serverUrl}/api/mobile-agents/pair/register-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName,
          deviceModel,
          deviceManufacturer,
          androidVersion,
          appVersion,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Registration failed' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setCode(data.code);
      setPairingId(data.id);
      setExpiresAt(new Date(data.expiresAt).getTime());
      setStatus('waiting');

      await saveDeviceName(deviceName);

      // Start countdown
      countdownRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.round((new Date(data.expiresAt).getTime() - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          setStatus('expired');
          if (countdownRef.current) clearInterval(countdownRef.current);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 1000);

      // Start polling
      pollRef.current = setInterval(() => pollStatus(data.id, serverUrl), PAIRING_POLL_INTERVAL_MS);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to register';
      Alert.alert('Pairing Error', message);
      setStatus('error');
    }
  };

  const pollStatus = async (id: string, serverUrl: string) => {
    try {
      const response = await fetch(`${serverUrl}/api/mobile-agents/pair/status/${id}`);
      if (!response.ok) return;

      const data = await response.json();

      if (data.status === 'paired' && data.apiKey) {
        // Pairing successful!
        if (pollRef.current) clearInterval(pollRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);

        await storeApiKey(data.apiKey);
        await setAgentId(data.agentId);
        await setPaired(true);

        setStatus('paired');
        setTimeout(onPaired, 500);
      } else if (data.status === 'expired') {
        setStatus('expired');
        if (pollRef.current) clearInterval(pollRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    } catch {
      // Poll failure is not critical — will retry
    }
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pair Your Device</Text>
      <Text style={styles.subtitle}>
        Enter this code in your SwarmAI dashboard
      </Text>

      {status === 'registering' && (
        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
      )}

      {status === 'waiting' && code && (
        <>
          <View style={styles.codeContainer}>
            {code.split('').map((digit, i) => (
              <View key={i} style={styles.digitBox}>
                <Text style={styles.digit}>{digit}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.timer}>Expires in {formatTime(timeLeft)}</Text>

          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.waitingText}>Waiting for approval...</Text>
          </View>
        </>
      )}

      {status === 'paired' && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>Paired!</Text>
          <Text style={styles.successSubtext}>Connecting to server...</Text>
        </View>
      )}

      {status === 'expired' && (
        <View style={styles.expiredBox}>
          <Text style={styles.expiredText}>Code Expired</Text>
          <Text
            style={styles.retryLink}
            onPress={registerCode}
          >
            Tap to get a new code
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F1F5F9',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 32,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  digitBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    width: 48,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  digit: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  timer: {
    fontSize: 16,
    color: '#94A3B8',
    marginBottom: 24,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waitingText: {
    color: '#3B82F6',
    fontSize: 15,
  },
  successBox: {
    marginTop: 24,
    alignItems: 'center',
  },
  successText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#22C55E',
    marginBottom: 8,
  },
  successSubtext: {
    fontSize: 14,
    color: '#94A3B8',
  },
  expiredBox: {
    marginTop: 24,
    alignItems: 'center',
  },
  expiredText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#EF4444',
    marginBottom: 12,
  },
  retryLink: {
    color: '#3B82F6',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});
