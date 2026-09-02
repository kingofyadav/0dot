import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { signIn as pkceSignIn, signOut as pkceSignOut, getStoredTokens } from "./pkceAuth";
import { isBiometricLockAvailable, unlockWithBiometrics } from "./biometricLock";
import { getMe, ApiError } from "../api/client";
import { registerForPushNotificationsAsync } from "../push/registerPush";
import type { StoredTokens } from "./tokenStorage";
import type { Me } from "../api/types";

type AuthStatus = "loading" | "locked" | "signedOut" | "signedIn";

type AuthContextValue = {
  status: AuthStatus;
  tokens: StoredTokens | null;
  me: Me | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  unlock: () => Promise<void>;
  clearError: () => void;
  // Re-fetch the signed-in user. `status` flips to "signedIn" as soon as
  // tokens restore — independent of whether `getMe()` has resolved — so a
  // slow or failed /me on cold start leaves `me` null with the app
  // otherwise usable. Screens that can't render without `me` (the profile
  // tab) call this to retry rather than sitting on a dead blank screen.
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Moved from App.tsx (build plan steps 3-7's original smoke-test screen) —
// same logic, now owned by a context so every screen under app/ can read
// auth state instead of it living in one root component's local state.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<StoredTokens | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Push registration only needs to happen once per established session, not
  // on every biometric unlock in front of an already-registered one — the
  // server's push:write rate limit is shared per-app, and re-hitting it on
  // every unlock exhausts that limit at even modest scale.
  const pushRegisteredRef = useRef(false);

  const loadMe = useCallback(async () => {
    try {
      setMe(await getMe());
      setError(null);
    } catch (err) {
      // api/client.ts's authorizedRequest already tries one silent
      // refresh-and-retry on a 401 — reaching here as a 401 means that
      // failed too (refresh token rotated away, revoked, or the app itself
      // lost access), so the only real recovery left is signing in again.
      if (err instanceof ApiError && err.status === 401) {
        await pkceSignOut();
        setTokens(null);
        setError("Your session expired. Please sign in again.");
        pushRegisteredRef.current = false;
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load your account.");
    }
  }, []);

  const afterAuthEstablished = useCallback(async () => {
    await loadMe();
    if (!pushRegisteredRef.current) {
      try {
        await registerForPushNotificationsAsync();
        pushRegisteredRef.current = true;
      } catch {
        // Best-effort, same posture as dispatchPushEvent server-side — a
        // denied permission or missing hardware (simulator) shouldn't block
        // the rest of the app. Leave the ref false so a future unlock can
        // retry rather than giving up on push forever.
      }
    }
  }, [loadMe]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await getStoredTokens();
        setTokens(stored);
        if (stored) {
          // §7: gate behind biometrics only when the device actually
          // supports it — never lock a user out of their own already-valid
          // session on a device with no Face ID/fingerprint enrolled. A
          // platform where the check itself isn't implemented (e.g. `expo
          // start --web`) is treated the same as "not available" rather than
          // surfacing a restore error while leaving tokens set but unlocked.
          let biometricAvailable = false;
          try {
            biometricAvailable = await isBiometricLockAvailable();
          } catch {
            biometricAvailable = false;
          }
          if (biometricAvailable) {
            setLocked(true);
          } else {
            await afterAuthEstablished();
          }
        }
      } catch (err) {
        // getStoredTokens/isBiometricLockAvailable can throw on platforms
        // where SecureStore/LocalAuthentication aren't implemented (e.g.
        // `expo start --web`) — without this catch, an uncaught rejection
        // here left setLoading(false) below unreachable, stranding the app
        // on its loading spinner forever with no way to recover.
        setError(err instanceof Error ? err.message : "Could not restore your session.");
      } finally {
        setLoading(false);
      }
    })();
  }, [afterAuthEstablished]);

  async function signIn() {
    setError(null);
    setLoading(true);
    try {
      const newTokens = await pkceSignIn();
      setTokens(newTokens);
      await afterAuthEstablished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function unlock() {
    setError(null);
    try {
      if (await unlockWithBiometrics()) {
        setLocked(false);
        await afterAuthEstablished();
      } else {
        setError("Unlock failed.");
      }
    } catch (err) {
      // authenticateAsync can reject (not just resolve success:false) on
      // some hardware-error paths — without this, that left the app stuck
      // on the locked screen with no visible error and no way forward
      // besides the sign-out escape hatch below.
      setError(err instanceof Error ? err.message : "Unlock failed.");
    }
  }

  async function signOut() {
    // Deliberately doesn't call unregisterDeviceToken: a signed-out-in-app
    // device token is meant to survive (push.ts's clearWebPushTokensForUser
    // comment — ios/android tokens are tied to the app install, not a
    // single session, unlike web_push).
    await pkceSignOut();
    setTokens(null);
    setMe(null);
    setLocked(false);
    setError(null);
    pushRegisteredRef.current = false;
  }

  const status: AuthStatus = loading ? "loading" : locked ? "locked" : tokens ? "signedIn" : "signedOut";

  // Self-heal a failed cold-start /me: if we're signed in but `me` never
  // arrived (a slow backend or a transient 5xx — the 401 path already
  // signs out), retry a few times with backoff rather than leaving the
  // app in a half-loaded state until the user manually pulls to refresh.
  useEffect(() => {
    if (status !== "signedIn" || me) return;
    let cancelled = false;
    let attempt = 0;
    const tick = () => {
      if (cancelled) return;
      attempt += 1;
      loadMe().finally(() => {
        if (cancelled || attempt >= 4) return;
        timer = setTimeout(tick, 2000 * attempt);
      });
    };
    let timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, me, loadMe]);

  return (
    <AuthContext.Provider
      value={{ status, tokens, me, error, signIn, signOut, unlock, clearError: () => setError(null), refreshMe: loadMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
