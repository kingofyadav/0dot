import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useAuth } from "../src/auth/AuthContext";
import { Avatar } from "../src/components/Avatar";
import { SettingsRow } from "../src/components/SettingsRow";
import { API_BASE_URL } from "../src/config";
import { useTheme, type Theme } from "../src/theme";
import { haptics } from "../src/utils/haptics";

// M12 (settings/account parity): grouped into sections mirroring
// settingsNavGroups() (web's own single source of truth for its Settings
// nav) — Profile/Security/Notifications/Preferences/Account/Developer —
// rather than one flat list, now that this screen has grown from 4 rows to
// covering the same ground web's settings shell does.
export default function SettingsScreen() {
  const { me, tokens, error, signOut } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  async function onOpenConnectedApps() {
    if (!me?.username) return;
    haptics.light();
    await WebBrowser.openBrowserAsync(`${API_BASE_URL}/s/${encodeURIComponent(me.username)}/authorized-apps`);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable
        onPress={() => me?.username && router.push(`/${me.username}`)}
        accessibilityRole="button"
        accessibilityLabel="View your profile"
        style={styles.profileCard}
      >
        <Avatar uri={me?.avatarUrl ?? null} name={me?.displayName ?? me?.username} size={56} />
        <View style={styles.profileText}>
          <Text style={styles.name}>{me?.displayName ?? me?.username ?? "Signed in to 0dot"}</Text>
          {me?.username ? <Text style={styles.handle}>@{me.username}</Text> : null}
        </View>
      </Pressable>

      <View style={styles.groups}>
        <Text style={styles.groupLabel}>Profile</Text>
        <View style={styles.group}>
          <SettingsRow icon="person-outline" label="Edit profile" onPress={() => router.push("/edit-profile")} />
          <SettingsRow icon="lock-closed-outline" label="Privacy" onPress={() => router.push("/privacy-settings")} />
          <SettingsRow icon="ban-outline" label="Blocked users" onPress={() => router.push("/blocked-users")} />
          <SettingsRow icon="bookmark-outline" label="Bookmarks" onPress={() => router.push("/bookmarks")} />
        </View>

        <Text style={styles.groupLabel}>Security</Text>
        <View style={styles.group}>
          <SettingsRow icon="key-outline" label="Change password" onPress={() => router.push("/change-password")} />
          <SettingsRow icon="shield-checkmark-outline" label="Two-factor authentication" onPress={() => router.push("/two-factor")} />
          <SettingsRow icon="desktop-outline" label="Active sessions" onPress={() => router.push("/sessions")} />
          <SettingsRow icon="mail-outline" label="Email & phone" onPress={() => router.push("/contact-settings")} />
        </View>

        <Text style={styles.groupLabel}>Notifications</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="notifications-outline"
            label="Notification preferences"
            onPress={() => router.push("/notification-preferences")}
          />
        </View>

        <Text style={styles.groupLabel}>Preferences</Text>
        <View style={styles.group}>
          <SettingsRow icon="options-outline" label="Language & accessibility" onPress={() => router.push("/preferences")} />
        </View>

        <Text style={styles.groupLabel}>Account</Text>
        <View style={styles.group}>
          <SettingsRow icon="warning-outline" label="Account management" onPress={() => router.push("/account-management")} />
        </View>

        <Text style={styles.groupLabel}>Developer</Text>
        <View style={styles.group}>
          <SettingsRow icon="apps-outline" label="Connected apps" onPress={onOpenConnectedApps} />
        </View>
      </View>

      {tokens ? (
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={18} color={theme.colors.mutedForeground} />
          <Text style={styles.infoText}>Session expires {new Date(tokens.expiresAt).toLocaleTimeString()}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          haptics.medium();
          signOut();
        }}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={({ pressed }) => [styles.signOutButton, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="log-out-outline" size={18} color={theme.colors.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Text style={styles.version}>0dot {Constants.expoConfig?.version ?? "1.0.0"}</Text>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space[5], gap: theme.space[4] },
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
    groups: { gap: theme.space[2] },
    groupLabel: {
      fontSize: theme.text.xs,
      fontWeight: theme.weight.label,
      color: theme.colors.mutedForeground,
      textTransform: "uppercase",
      marginTop: theme.space[2],
    },
    group: {
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      overflow: "hidden",
    },
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
    version: { textAlign: "center", color: theme.colors.mutedForeground, fontSize: theme.text.xs },
  });
}
