import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { getSessions, revokeSession, revokeOtherSessions, ApiError } from "../src/api/client";
import { EmptyState } from "../src/components/EmptyState";
import { SettingsRowSkeleton } from "../src/components/Skeleton";
import { haptics } from "../src/utils/haptics";
import { useTheme, type Theme } from "../src/theme";
import type { LoginEvent, SessionInfo, SessionsResponse } from "../src/api/types";

// Mirrors security/sessions/page.tsx (web). "Sessions" here means web/
// cookie sessions only — mobile never creates one of its own (it
// authenticates via OAuth bearer tokens instead, managed from the
// "Connected apps" row on the main Settings screen), so there's no "this
// device" row to tag here, unlike a web browser tab viewing this same list.
export default function SessionsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [data, setData] = useState<SessionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getSessions()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your sessions."));
  }, []);

  useFocusEffect(load);

  // Now gated behind the same Alert.alert confirm onRevokeAll already has
  // — previously this fired immediately with no confirmation, the one
  // inconsistency between the two revoke actions on this screen.
  function onRevoke(session: SessionInfo) {
    Alert.alert("Revoke this session?", "This signs it out immediately.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          setRevokingId(session.id);
          try {
            await revokeSession(session.id);
            setData((prev) => (prev ? { ...prev, sessions: prev.sessions.filter((s) => s.id !== session.id) } : prev));
            haptics.medium();
          } catch (err) {
            haptics.warning();
            setError(err instanceof ApiError ? err.message : "Could not revoke that session.");
          } finally {
            setRevokingId(null);
          }
        },
      },
    ]);
  }

  function onRevokeAll() {
    Alert.alert("Sign out everywhere?", "This signs out every other browser session.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out everywhere",
        style: "destructive",
        onPress: async () => {
          setRevokingAll(true);
          try {
            await revokeOtherSessions();
            setData((prev) => (prev ? { ...prev, sessions: [] } : prev));
            haptics.light();
          } catch (err) {
            haptics.warning();
            setError(err instanceof ApiError ? err.message : "Could not sign out other sessions.");
          } finally {
            setRevokingAll(false);
          }
        },
      },
    ]);
  }

  if (error && !data) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="desktop-outline" message={error} onRetry={load} />
      </View>
    );
  }

  if (!data) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.group}>
          {[0, 1, 2].map((i) => (
            <SettingsRowSkeleton key={i} />
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.sectionHeading}>Active sessions</Text>
      {data.sessions.length === 0 ? (
        <Text style={styles.hint}>No other browser sessions signed in.</Text>
      ) : (
        <View style={styles.group}>
          {data.sessions.map((session) => (
            <View key={session.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{session.userAgent ?? "Unknown device"}</Text>
                <Text style={styles.rowSub}>
                  {session.ipAddress ?? "Unknown IP"} · last active {new Date(session.lastSeenAt).toLocaleString()}
                </Text>
              </View>
              <Pressable
                onPress={() => onRevoke(session)}
                disabled={revokingId === session.id}
                accessibilityRole="button"
                accessibilityLabel="Revoke session"
                style={({ pressed }) => [styles.revokeButton, { opacity: pressed || revokingId === session.id ? 0.6 : 1 }]}
              >
                {revokingId === session.id ? (
                  <ActivityIndicator size="small" color={theme.colors.danger} />
                ) : (
                  <Text style={styles.revokeText}>Revoke</Text>
                )}
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {data.sessions.length > 0 && (
        <Pressable
          onPress={onRevokeAll}
          disabled={revokingAll}
          accessibilityRole="button"
          accessibilityLabel="Sign out of all other sessions"
          style={({ pressed }) => [styles.signOutAllButton, { opacity: pressed || revokingAll ? 0.6 : 1 }]}
        >
          <Text style={styles.signOutAllText}>{revokingAll ? "Signing out…" : "Sign out of all other sessions"}</Text>
        </Pressable>
      )}

      <Text style={[styles.sectionHeading, styles.sectionSpacing]}>Recent login activity</Text>
      {data.loginEvents.length === 0 ? (
        <Text style={styles.hint}>No recent login activity.</Text>
      ) : (
        <View style={styles.group}>
          {data.loginEvents.map((event) => (
            <LoginEventRow key={event.id} event={event} styles={styles} theme={theme} />
          ))}
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

function LoginEventRow({ event, styles, theme }: { event: LoginEvent; styles: ReturnType<typeof createStyles>; theme: Theme }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, !event.success && { color: theme.colors.danger }]}>
          {event.success ? "Signed in" : "Failed sign-in attempt"} · {event.method}
        </Text>
        <Text style={styles.rowSub}>
          {new Date(event.createdAt).toLocaleString()} · {event.ipAddress ?? "Unknown IP"}
        </Text>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    center: { alignItems: "center", justifyContent: "center" },
    content: { padding: theme.space[5], gap: theme.space[3] },
    sectionHeading: { fontSize: theme.text.sm, fontWeight: theme.weight.label, color: theme.colors.mutedForeground, textTransform: "uppercase" },
    sectionSpacing: { marginTop: theme.space[4] },
    hint: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    group: {
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[3],
      paddingHorizontal: theme.space[4],
      paddingVertical: theme.space[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    rowText: { flex: 1, gap: 2 },
    rowLabel: { color: theme.colors.foreground, fontSize: theme.text.base },
    rowSub: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    revokeButton: {
      minHeight: 36,
      paddingHorizontal: theme.space[3],
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    revokeText: { color: theme.colors.danger, fontSize: theme.text.sm, fontWeight: theme.weight.emphasis },
    signOutAllButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
    signOutAllText: { color: theme.colors.danger, fontSize: theme.text.sm, fontWeight: theme.weight.emphasis },
    errorText: { color: theme.colors.danger, fontSize: theme.text.sm },
  });
}
