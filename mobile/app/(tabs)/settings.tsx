import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../../src/auth/AuthContext";
import { Avatar } from "../../src/components/Avatar";
import { useTheme, type Theme } from "../../src/theme";

export default function SettingsScreen() {
  const { me, tokens, error, signOut } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.screen}>
      <View style={styles.profileCard}>
        <Avatar uri={null} name={me?.displayName ?? me?.username} size={56} />
        <View style={styles.profileText}>
          <Text style={styles.name}>{me?.displayName ?? me?.username ?? "Signed in to 0dot"}</Text>
          {me?.username ? <Text style={styles.handle}>@{me.username}</Text> : null}
        </View>
      </View>

      {tokens ? (
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={18} color={theme.colors.mutedForeground} />
          <Text style={styles.infoText}>Session expires {new Date(tokens.expiresAt).toLocaleTimeString()}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={signOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={({ pressed }) => [styles.signOutButton, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="log-out-outline" size={18} color={theme.colors.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Text style={styles.version}>0dot {Constants.expoConfig?.version ?? "1.0.0"}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background, padding: theme.space[5], gap: theme.space[5] },
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[4],
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      padding: theme.space[4],
    },
    profileText: { flex: 1, gap: 2 },
    name: { fontSize: theme.text.lg, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    handle: { fontSize: theme.text.sm, color: theme.colors.mutedForeground },
    infoRow: { flexDirection: "row", alignItems: "center", gap: theme.space[2] },
    infoText: { fontSize: theme.text.sm, color: theme.colors.mutedForeground },
    signOutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.space[2],
      minHeight: 48,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.dangerSoft,
      backgroundColor: theme.colors.dangerSoft,
    },
    signOutText: { color: theme.colors.danger, fontWeight: theme.weight.emphasis, fontSize: theme.text.base },
    errorText: { color: theme.colors.danger, textAlign: "center", fontSize: theme.text.sm },
    version: { marginTop: "auto", textAlign: "center", color: theme.colors.mutedForeground, fontSize: theme.text.xs, paddingBottom: theme.space[4] },
  });
}
