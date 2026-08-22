import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as WebBrowser from "expo-web-browser";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getBusiness, ApiError } from "../../src/api/client";
import { Avatar } from "../../src/components/Avatar";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { VerifiedBadge } from "../../src/components/VerifiedBadge";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { haptics } from "../../src/utils/haptics";
import { API_BASE_URL } from "../../src/config";
import { useTheme, type Theme } from "../../src/theme";
import type { BusinessDetail } from "../../src/api/types";

// Read-only native card — booking/contact/reviews open the full web profile
// (see GET /api/v1/businesses/[slug]'s own comment for why those stay a
// browser hand-off rather than native screens for each).
export default function BusinessScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBusiness(await getBusiness(slug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this business.");
    }
  }, [slug]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [load])
  );

  function onOpenFullProfile() {
    haptics.light();
    WebBrowser.openBrowserAsync(`${API_BASE_URL}/b/${slug}`).catch(() => {});
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { gap: theme.space[3] }]}>
        <SkeletonBlock width={64} height={64} radius={32} />
        <SkeletonBlock width={160} height={18} />
      </View>
    );
  }

  if (!business) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="storefront-outline" message={error ?? "Business not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: business.name }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {business.coverUrl ? (
          <Image source={{ uri: business.coverUrl }} style={styles.cover} contentFit="cover" alt={`${business.name} cover photo`} />
        ) : (
          <View style={[styles.cover, { backgroundColor: theme.colors.surface }]} />
        )}
        <View style={styles.center}>
          <Avatar uri={business.logoUrl} name={business.name} size={72} />
          <View style={styles.nameRow}>
            <Text style={styles.name}>{business.name}</Text>
            {business.isVerified ? <VerifiedBadge size={16} /> : null}
          </View>
          {business.tagline ? <Text style={styles.tagline}>{business.tagline}</Text> : null}
          {business.reviewCount > 0 ? (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color={theme.colors.warning} />
              <Text style={styles.ratingText}>
                {business.averageRating.toFixed(1)} ({business.reviewCount} {business.reviewCount === 1 ? "review" : "reviews"})
              </Text>
            </View>
          ) : null}
        </View>

        {business.description ? <Text style={styles.description}>{business.description}</Text> : null}

        {business.location ? (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color={theme.colors.mutedForeground} />
            <Text style={styles.infoText}>{business.location.address}</Text>
          </View>
        ) : null}
        {business.website ? (
          <View style={styles.infoRow}>
            <Ionicons name="globe-outline" size={16} color={theme.colors.mutedForeground} />
            <Text style={styles.infoText}>{business.website}</Text>
          </View>
        ) : null}

        <Button label="View full profile" onPress={onOpenFullProfile} style={styles.button} />
      </ScrollView>
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { paddingBottom: theme.space[8], gap: theme.space[3] },
    center: { alignItems: "center", justifyContent: "center", padding: theme.space[5], gap: theme.space[2] },
    cover: { width: "100%", height: 120 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1] },
    name: { fontSize: theme.text.xl, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    tagline: { color: theme.colors.mutedForeground, fontSize: theme.text.base, textAlign: "center" },
    ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    ratingText: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    description: { color: theme.colors.foreground, fontSize: theme.text.base, lineHeight: theme.text.base * 1.4, paddingHorizontal: theme.space[5] },
    infoRow: { flexDirection: "row", alignItems: "center", gap: theme.space[2], paddingHorizontal: theme.space[5] },
    infoText: { color: theme.colors.foreground, fontSize: theme.text.sm },
    button: { marginHorizontal: theme.space[5], marginTop: theme.space[3] },
  });
}
