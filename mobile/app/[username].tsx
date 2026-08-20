import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getProfile, ApiError } from "../src/api/client";
import { Avatar } from "../src/components/Avatar";
import { VerifiedBadge } from "../src/components/VerifiedBadge";
import { EmptyState } from "../src/components/EmptyState";
import { SkeletonBlock } from "../src/components/Skeleton";
import { useTheme, type Theme } from "../src/theme";
import type { Profile } from "../src/api/types";

export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await getProfile(username));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this profile.");
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { gap: theme.space[3] }]}>
        <SkeletonBlock width={80} height={80} radius={40} />
        <SkeletonBlock width={160} height={18} />
        <SkeletonBlock width={100} height={14} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="person-outline" message={error ?? "Profile not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, styles.center]}>
      <Avatar uri={profile.avatarUrl} name={profile.displayName ?? profile.username} size={88} />
      <View style={styles.nameRow}>
        <Text style={styles.title}>{profile.displayName}</Text>
        {profile.isVerified ? <VerifiedBadge size={18} /> : null}
      </View>
      <Text style={styles.handle}>@{profile.username}</Text>
      {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      <View style={styles.statPill}>
        <Text style={styles.statNumber}>{profile.followerCount}</Text>
        <Text style={styles.statLabel}>{profile.followerCount === 1 ? "follower" : "followers"}</Text>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    center: { alignItems: "center", justifyContent: "center", padding: theme.space[6], gap: theme.space[2] },
    nameRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1], marginTop: theme.space[3] },
    title: { fontSize: theme.text.xxl, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    handle: { fontSize: theme.text.base, color: theme.colors.mutedForeground },
    bio: { fontSize: theme.text.base, color: theme.colors.foreground, textAlign: "center", marginTop: theme.space[1] },
    statPill: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: theme.space[1],
      marginTop: theme.space[4],
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.full,
      paddingVertical: theme.space[2],
      paddingHorizontal: theme.space[4],
    },
    statNumber: { fontWeight: theme.weight.heading, color: theme.colors.foreground, fontSize: theme.text.base },
    statLabel: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
  });
}
