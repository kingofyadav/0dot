import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { FIRST_PARTY_PLATFORM } from "../config";
import { registerDeviceToken } from "../api/client";

// Shown while the app is foregrounded — without a handler, expo-notifications
// silently drops incoming notifications instead of surfacing them.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// spec §4.1: DeviceToken.token is documented as "opaque APNs/FCM/Web-Push
// token" — this uses getDevicePushTokenAsync (the native APNs/FCM token)
// rather than getExpoPushTokenAsync (Expo's own relay-service token),
// since push.ts's eventual real-provider swap-in (replacing
// StubPushProvider) will talk to APNs/FCM directly, matching the schema
// comment rather than introducing a third, Expo-specific token shape.
export async function registerForPushNotificationsAsync(): Promise<void> {
  if (Platform.OS === "android") {
    // Required on Android 8+ before a notification can display at all —
    // harmless to call every launch, setNotificationChannelAsync upserts.
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return;

  const devicePushToken = await Notifications.getDevicePushTokenAsync();
  await registerDeviceToken({ platform: FIRST_PARTY_PLATFORM, token: String(devicePushToken.data) });
}
