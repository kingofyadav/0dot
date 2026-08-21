import { Platform } from "react-native";
import Constants from "expo-constants";
import { FIRST_PARTY_PLATFORM } from "../config";
import { registerDeviceToken } from "../api/client";
import { Notifications } from "./expoNotificationsModule";

// Shown while the app is foregrounded — without a handler, expo-notifications
// silently drops incoming notifications instead of surfacing them.
if (Notifications) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Best-effort, same posture as registerForPushNotificationsAsync's caller.
  }
}

// Originally planned as the *native* APNs/FCM device token
// (getDevicePushTokenAsync), matching DeviceToken.token's old "opaque
// APNs/FCM/Web-Push token" schema comment, on the assumption that
// push.ts's real-provider swap-in would talk to APNs/FCM directly. Changed
// to Expo's own relay token (getExpoPushTokenAsync) when that swap-in
// actually happened: this app is already fully committed to EAS for
// builds, so routing push through Expo's relay too doesn't add a new
// dependency, it just uses more of the one already load-bearing — and it
// needs zero Apple/Google credentials held in this codebase (EAS's own
// credential store covers whatever APNs/FCM keys the relay needs), versus
// two separate vendor accounts to provision for a direct integration.
// push.ts's PushProvider interface stays swappable either way, so a future
// move to direct APNs/FCM is still just a provider swap, not a rewrite.
export async function registerForPushNotificationsAsync(): Promise<void> {
  if (!Notifications) return;

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

  // Same fallback chain Expo's own setup docs use — expoConfig.extra is
  // read at build time (EXPO_PUBLIC_*-style inlining), easConfig at
  // runtime from the native module; either can be the one populated
  // depending on how the binary was built.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;

  const expoPushToken = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerDeviceToken({ platform: FIRST_PARTY_PLATFORM, token: expoPushToken.data });
}
