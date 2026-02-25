/**
 * Secure Storage — API key stored in Android Keystore via react-native-keychain
 */
import * as Keychain from 'react-native-keychain';

const SERVICE_NAME = 'SwarmMobileAgent';

export async function storeApiKey(apiKey: string): Promise<void> {
  await Keychain.setGenericPassword('apiKey', apiKey, {
    service: SERVICE_NAME,
  });
}

export async function getApiKey(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword({
    service: SERVICE_NAME,
  });
  if (credentials) {
    return credentials.password;
  }
  return null;
}

export async function clearApiKey(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE_NAME });
}
