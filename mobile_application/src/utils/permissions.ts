import { PermissionsAndroid, Platform } from 'react-native';

export async function requestSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    PermissionsAndroid.PERMISSIONS.SEND_SMS,
    PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
  ]);

  return Object.values(granted).every(
    (v) => v === PermissionsAndroid.RESULTS.GRANTED,
  );
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  // Android 13+ requires POST_NOTIFICATIONS
  if (Platform.Version >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}

export async function requestLocationPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const fineLocation = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  if (fineLocation !== PermissionsAndroid.RESULTS.GRANTED) return false;

  // Request background location for Android 10+
  if (Platform.Version >= 29) {
    const bgLocation = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
    );
    return bgLocation === PermissionsAndroid.RESULTS.GRANTED;
  }

  return true;
}

export async function requestAllPermissions(): Promise<Record<string, boolean>> {
  const sms = await requestSmsPermissions();
  const notification = await requestNotificationPermission();
  const location = await requestLocationPermissions();
  return { sms, notification, location };
}
