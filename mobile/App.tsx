import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Button, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { signIn, signOut, getStoredTokens } from "./src/auth/pkceAuth";
import { isBiometricLockAvailable, unlockWithBiometrics } from "./src/auth/biometricLock";
import { getMe, ApiError } from "./src/api/client";
import { registerForPushNotificationsAsync } from "./src/push/registerPush";
import { subscribeToIncomingLinks } from "./src/links/universalLinks";
import type { StoredTokens } from "./src/auth/tokenStorage";
import type { Me } from "./src/api/types";

// Build plan steps 3–7: PKCE sign-in, the /v1 API client, push
// registration, universal-link handling, and biometric app-unlock — each
// one wired here just enough to prove it actually works, not as full app
// screens yet.
export default function App() {
  const [tokens, setTokens] = useState<StoredTokens | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedVia, setOpenedVia] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    try {
      setMe(await getMe());
    } catch (err) {
      // No refresh-token grant exists yet (build plan step 3's flagged
      // follow-up) — a dead token's only recovery is signing in again, not
      // a silent retry, so a 401 here drops back to the signed-out state.
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
        setTokens(null);
        setError("Your session expired. Please sign in again.");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load your account.");
    }
  }, []);

  // §7: run after a session becomes visible, whether that's a fresh
  // interactive sign-in or an unlock in front of an already-stored one —
  // loadMe re-proves the token still works (step 4), and push registration
  // (step 5) needs a valid token to call /api/v1/device-tokens with.
  const afterAuthEstablished = useCallback(async () => {
    await loadMe();
    registerForPushNotificationsAsync().catch(() => {
      // Best-effort, same posture as dispatchPushEvent server-side — a
      // denied permission or missing hardware (simulator) shouldn't block
      // the rest of the app.
    });
  }, [loadMe]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await getStoredTokens();
        setTokens(stored);
        if (stored) {
          // §7: gate behind biometrics only when the device actually
          // supports it — never lock a user out of their own already-valid
          // session on a device with no Face ID/fingerprint enrolled.
          if (await isBiometricLockAvailable()) {
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

  useEffect(() => subscribeToIncomingLinks(setOpenedVia), []);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    try {
      const newTokens = await signIn();
      setTokens(newTokens);
      await afterAuthEstablished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlock() {
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

  async function handleSignOut() {
    // Deliberately doesn't call unregisterDeviceToken: a signed-out-in-app
    // device token is meant to survive (push.ts's clearWebPushTokensForUser
    // comment — ios/android tokens are tied to the app install, not a
    // single session, unlike web_push).
    await signOut();
    setTokens(null);
    setMe(null);
    setLocked(false);
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator />
      ) : locked ? (
        <>
          <Text style={styles.title}>0dot is locked</Text>
          <Button title="Unlock" onPress={handleUnlock} />
          {/* Without this, a user whose biometrics stop working (broken
              sensor, no longer enrolled) would be permanently stuck here —
              a valid session they can neither access nor discard. */}
          <Button title="Sign out instead" onPress={handleSignOut} />
        </>
      ) : tokens ? (
        <>
          <Text style={styles.title}>{me ? `Hi, ${me.displayName ?? me.username ?? "there"}` : "Signed in to 0dot"}</Text>
          {me?.username ? <Text style={styles.mutedText}>@{me.username}</Text> : null}
          <Text style={styles.mutedText}>Access token expires {new Date(tokens.expiresAt).toLocaleTimeString()}</Text>
          {openedVia ? <Text style={styles.mutedText}>Opened via: {openedVia}</Text> : null}
          <Button title="Sign out" onPress={handleSignOut} />
        </>
      ) : (
        <>
          <Text style={styles.title}>0dot</Text>
          <Button title="Sign in with 0dot" onPress={handleSignIn} />
        </>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
  },
  mutedText: {
    color: "#666",
  },
  errorText: {
    color: "#c00",
    textAlign: "center",
  },
});
