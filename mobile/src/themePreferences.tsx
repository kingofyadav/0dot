import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPreferences } from "./api/client";
import { useAuth } from "./auth/AuthContext";
import { setWebReduceMotionPreference } from "./utils/animateLayout";

export type ThemePrefs = { fontScale: "default" | "large" | "larger"; highContrast: boolean; webReducedMotion: boolean };

const DEFAULT_PREFS: ThemePrefs = { fontScale: "default", highContrast: false, webReducedMotion: false };
const CACHE_KEY = "0dot:theme-prefs";

const ThemePreferencesContext = createContext<ThemePrefs>(DEFAULT_PREFS);

// Read by theme.ts's useTheme() to derive the font-scale/high-contrast
// variant (see applyThemePrefs there) and by any screen that needs the raw
// values directly (preferences.tsx).
export function useThemePreferences(): ThemePrefs {
  return useContext(ThemePreferencesContext);
}

// Mounted once in app/_layout.tsx, alongside AuthProvider/
// MessagesStreamProvider — same "one provider, many consumers" shape those
// use. Cached in AsyncStorage (not SecureStore: these aren't credentials,
// same tier as onboarding.ts's own cached flag) so a cold start applies the
// last-known prefs immediately instead of flashing default styling until
// the network call resolves — addendum §11's own web concern ("so it works
// without a client flash") applies here too.
export function ThemePreferencesProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [prefs, setPrefs] = useState<ThemePrefs>(DEFAULT_PREFS);

  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (raw) setPrefs((prev) => ({ ...prev, ...JSON.parse(raw) }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status !== "signedIn") return;
    getPreferences()
      .then((res) => {
        const next: ThemePrefs = {
          fontScale: res.accessibilityPrefs.fontScale === "large" || res.accessibilityPrefs.fontScale === "larger" ? res.accessibilityPrefs.fontScale : "default",
          highContrast: res.accessibilityPrefs.highContrast,
          // Not writable from mobile (no UI here — see preferences.tsx's own
          // comment on why), but still read and merged into the local
          // reduce-motion check, so turning it on from web's own Preferences
          // page reduces motion on mobile too, without a second redundant
          // toggle.
          webReducedMotion: res.accessibilityPrefs.reducedMotion,
        };
        setPrefs(next);
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
      })
      .catch(() => {
        // Best-effort — a failed fetch just keeps whatever was cached/default.
      });
  }, [status]);

  useEffect(() => {
    setWebReduceMotionPreference(prefs.webReducedMotion);
  }, [prefs.webReducedMotion]);

  return <ThemePreferencesContext.Provider value={prefs}>{children}</ThemePreferencesContext.Provider>;
}
