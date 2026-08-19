import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getProfile, ApiError } from "../src/api/client";
import type { Profile } from "../src/api/types";

export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        setProfile(await getProfile(username));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load this profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [username]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.mutedText}>{error ?? "Profile not found."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {profile.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} /> : null}
      <Text style={styles.title}>
        {profile.displayName} {profile.isVerified ? "✓" : ""}
      </Text>
      <Text style={styles.mutedText}>@{profile.username}</Text>
      {profile.bio ? <Text>{profile.bio}</Text> : null}
      <Text style={styles.mutedText}>{profile.followerCount} followers</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  container: { flex: 1, padding: 24, gap: 8, alignItems: "center" },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  title: { fontSize: 20, fontWeight: "600" },
  mutedText: { color: "#666" },
});
