/**
 * Server Setup Screen — First launch
 * User enters SwarmAI server URL and verifies connection.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { setServerUrl } from '../storage/ConfigStore';

interface Props {
  onServerVerified: () => void;
}

export default function ServerSetupScreen({ onServerVerified }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverInfo, setServerInfo] = useState<{ serverName: string; version: string } | null>(null);

  const verifyServer = async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a server URL');
      return;
    }

    setLoading(true);
    setServerInfo(null);

    try {
      // Normalize URL
      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith('http')) {
        normalizedUrl = `https://${normalizedUrl}`;
      }
      // Remove trailing slash
      normalizedUrl = normalizedUrl.replace(/\/+$/, '');

      const response = await fetch(`${normalizedUrl}/api/mobile-agents/verify`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();

      if (!data.valid) {
        throw new Error('Not a valid SwarmAI server');
      }

      setServerInfo({
        serverName: data.serverName || 'SwarmAI',
        version: data.version || 'unknown',
      });

      // Save URL
      await setServerUrl(normalizedUrl);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      Alert.alert('Connection Failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SwarmAI Mobile Agent</Text>
      <Text style={styles.subtitle}>Connect to your SwarmAI server</Text>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="agents.northpeak.app"
          placeholderTextColor="#9CA3AF"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={verifyServer}
        />
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={verifyServer}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Connect</Text>
        )}
      </TouchableOpacity>

      {serverInfo && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{serverInfo.serverName}</Text>
          <Text style={styles.infoVersion}>Version {serverInfo.version}</Text>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={onServerVerified}
          >
            <Text style={styles.continueButtonText}>Continue to Pairing</Text>
          </TouchableOpacity>
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
    marginBottom: 40,
  },
  inputContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  input: {
    color: '#F1F5F9',
    fontSize: 16,
    padding: 16,
  },
  button: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    marginTop: 24,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#22C55E',
    marginBottom: 4,
  },
  infoVersion: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 16,
  },
  continueButton: {
    backgroundColor: '#22C55E',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  continueButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 15,
  },
});
