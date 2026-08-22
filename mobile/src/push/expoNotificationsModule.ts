import type * as NotificationsModule from "expo-notifications";

// expo-notifications throws synchronously merely from being imported on
// Android in Expo Go (remote push was removed from Expo Go as of SDK 53) —
// its own DevicePushTokenAutoRegistration.fx submodule registers a push
// token listener at module-load time, and that registration is what trips
// the check. A plain `import * as Notifications from "expo-notifications"`
// can't be try/caught (imports run before any code in the importing file),
// so this loads it lazily via `require` instead, guarded once here, and
// every push-touching module (registerPush.ts, pushNavigation.ts) reads
// from this instead of importing the package directly. Real device/dev-client
// builds, which don't run inside Expo Go, load it normally.
export const Notifications: typeof NotificationsModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must be `require`, not `import`: see comment above.
    return require("expo-notifications");
  } catch {
    return null;
  }
})();
