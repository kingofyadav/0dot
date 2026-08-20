import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// expo-haptics is a documented no-op on web (no Taptic/vibration engine to
// call), but guard explicitly rather than relying on that silently — this
// module is the one place every screen goes through, so the guard only
// needs writing once.
const supported = Platform.OS === "ios" || Platform.OS === "android";

// Light: low-stakes state toggles (mark-all-read, retry, pull-to-refresh).
// Medium: a confirmed, harder-to-undo action (sign out).
// Warning: something went wrong (a failed action surfaced to the user).
export const haptics = {
  light: () => {
    if (supported) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  medium: () => {
    if (supported) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  warning: () => {
    if (supported) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },
};
