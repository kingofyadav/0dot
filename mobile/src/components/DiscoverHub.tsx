import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SettingsRow } from "./SettingsRow";
import { useTheme, type Theme } from "../theme";

// Shown on Explore before a search query is typed — the "categorized
// discovery hub" M1's plan called for: Communities/Businesses/Marketplace/
// Events/Wallet/Bookmarks all live as pushed screens reachable from here
// (and from search results, once those domains grow their own search
// tabs), not from the tab bar directly — five new domains would overflow
// a 5-tab bar built for Home/Explore/Messages/Notifications/Profile.
export function DiscoverHub() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="search-outline" size={28} color={theme.colors.mutedForeground} />
        <Text style={styles.headerText}>Search for people and posts, or browse below.</Text>
      </View>

      <Text style={styles.sectionHeading}>Discover</Text>
      <View style={styles.group}>
        <SettingsRow icon="people-circle-outline" label="Communities" onPress={() => router.push("/communities")} />
        <SettingsRow icon="storefront-outline" label="Businesses" onPress={() => router.push("/businesses")} />
        <SettingsRow icon="bag-outline" label="Marketplace" onPress={() => router.push("/marketplace")} />
        <SettingsRow icon="calendar-outline" label="Events" onPress={() => router.push("/events")} />
      </View>

      <Text style={styles.sectionHeading}>You</Text>
      <View style={styles.group}>
        <SettingsRow icon="wallet-outline" label="Wallet" onPress={() => router.push("/wallet")} />
        <SettingsRow icon="bookmark-outline" label="Bookmarks" onPress={() => router.push("/bookmarks")} />
      </View>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    content: { padding: theme.space[5], gap: theme.space[2] },
    header: { alignItems: "center", gap: theme.space[3], paddingVertical: theme.space[6] },
    headerText: { color: theme.colors.mutedForeground, fontSize: theme.text.base, textAlign: "center" },
    sectionHeading: {
      fontSize: theme.text.sm,
      fontWeight: theme.weight.heading,
      color: theme.colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginTop: theme.space[3],
      marginBottom: theme.space[2],
    },
    group: {
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      overflow: "hidden",
    },
  });
}
