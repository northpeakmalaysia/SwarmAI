/**
 * Config Storage — Server URL, pairing state, push settings
 * Uses AsyncStorage for non-sensitive persistent data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  SERVER_URL: '@swarm/serverUrl',
  AGENT_ID: '@swarm/agentId',
  DEVICE_NAME: '@swarm/deviceName',
  PAIRED: '@swarm/paired',
  PUSH_CONFIG: '@swarm/pushConfig',
  MONITORING_ENABLED: '@swarm/monitoringEnabled',
  APP_FILTER: '@swarm/appFilter',
} as const;

export async function setServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.SERVER_URL, url);
}

export async function getServerUrl(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.SERVER_URL);
}

export async function setAgentId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.AGENT_ID, id);
}

export async function getAgentId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.AGENT_ID);
}

export async function setDeviceName(name: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.DEVICE_NAME, name);
}

export async function getDeviceName(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.DEVICE_NAME);
}

export async function setPaired(paired: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.PAIRED, paired ? 'true' : 'false');
}

export async function isPaired(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.PAIRED);
  return val === 'true';
}

export async function setMonitoringEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.MONITORING_ENABLED, enabled ? 'true' : 'false');
}

export async function isMonitoringEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.MONITORING_ENABLED);
  return val !== 'false'; // default true
}

export async function setPushConfig(config: Record<string, unknown>): Promise<void> {
  await AsyncStorage.setItem(KEYS.PUSH_CONFIG, JSON.stringify(config));
}

export async function getPushConfig(): Promise<Record<string, unknown>> {
  const val = await AsyncStorage.getItem(KEYS.PUSH_CONFIG);
  return val ? JSON.parse(val) : {};
}

export async function setAppFilter(apps: string[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.APP_FILTER, JSON.stringify(apps));
}

export async function getAppFilter(): Promise<string[]> {
  const val = await AsyncStorage.getItem(KEYS.APP_FILTER);
  return val ? JSON.parse(val) : [];
}

export async function clearAll(): Promise<void> {
  const keys = Object.values(KEYS);
  await AsyncStorage.multiRemove(keys);
}
