import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "0dot:onboarding:seen";

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === "true";
  } catch {
    // Fails open to "seen" — a broken storage read should never trap a
    // returning user behind onboarding again, worst case is a first-time
    // user sees it once fewer times than intended.
    return true;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, "true");
  } catch {
    // Best-effort — if this fails, onboarding just shows again next
    // launch, not a broken state.
  }
}
