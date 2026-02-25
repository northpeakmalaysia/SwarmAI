/**
 * SwarmAI Mobile Agent — Root App Component
 *
 * Navigation flow:
 * 1. ServerSetup → 2. Pairing → 3. Home ↔ Settings
 *
 * On launch, checks if already paired and skips to Home.
 */
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import ServerSetupScreen from './screens/ServerSetupScreen';
import PairingScreen from './screens/PairingScreen';
import HomeScreen from './screens/HomeScreen';
import SettingsScreen from './screens/SettingsScreen';
import { isPaired, getServerUrl } from './storage/ConfigStore';
import { getApiKey } from './storage/SecureStore';

type Screen = 'loading' | 'server-setup' | 'pairing' | 'home' | 'settings';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');

  useEffect(() => {
    checkState();
  }, []);

  const checkState = async () => {
    try {
      const paired = await isPaired();
      const apiKey = await getApiKey();
      const serverUrl = await getServerUrl();

      if (paired && apiKey && serverUrl) {
        setScreen('home');
      } else if (serverUrl) {
        setScreen('pairing');
      } else {
        setScreen('server-setup');
      }
    } catch {
      setScreen('server-setup');
    }
  };

  if (screen === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (screen === 'server-setup') {
    return <ServerSetupScreen onServerVerified={() => setScreen('pairing')} />;
  }

  if (screen === 'pairing') {
    return <PairingScreen onPaired={() => setScreen('home')} />;
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        onUnpaired={() => setScreen('server-setup')}
        onBack={() => setScreen('home')}
      />
    );
  }

  // Home screen
  return <HomeScreen onOpenSettings={() => setScreen('settings')} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
