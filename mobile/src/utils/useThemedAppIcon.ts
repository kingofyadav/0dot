import { useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Keeps the Android launcher icon in step with the device's light/dark
// appearance.
//
// iOS needs nothing here — the light / dark / tinted variants declared in
// app.json's `ios.icon` are swapped by the system automatically. Android
// has no equivalent, so this activates a "light" alternate icon (a real
// adaptive icon on a white background, built by ./plugins/withThemedAppIcons)
// in light mode, and falls back to the default dark icon
// (app.json > android.adaptiveIcon) in dark mode.
//
// The swap (expo-dynamic-app-icon's autolinked native module) is only
// issued when the target differs from what was last applied (persisted) —
// setComponentEnabledSetting is comparatively expensive and some launchers
// flash the icon while they re-cache, so it must not run on every launch.
const STORAGE_KEY = "themed-app-icon:applied";

export function useThemedAppIcon(scheme: "light" | "dark") {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    let cancelled = false;

    // "" resets to the default (dark) icon; "light" enables the alternate.
    const target = scheme === "light" ? "light" : "";

    (async () => {
      try {
        const applied = (await AsyncStorage.getItem(STORAGE_KEY)) ?? "";
        if (cancelled || applied === target) return;

        // Lazy import: the native module is absent in Expo Go and in any
        // build made before this package was added — a static import would
        // crash those at startup.
        const { setAppIcon } = await import("expo-dynamic-app-icon");
        if (cancelled) return;

        // Returns the icon name on success, `false` on failure. The
        // launcher only re-reads the icon once the app is next
        // backgrounded.
        const result = setAppIcon(target);
        if (result !== false) await AsyncStorage.setItem(STORAGE_KEY, target);
      } catch {
        // Module missing or the OS refused the swap — the current icon
        // stays, which is a fine fallback.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scheme]);
}
