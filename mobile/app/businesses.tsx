import { useCallback, useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { getBusinesses, ApiError } from "../src/api/client";
import { Avatar } from "../src/components/Avatar";
import { EmptyState } from "../src/components/EmptyState";
import { ListRow } from "../src/components/ListRow";
import { VerifiedBadge } from "../src/components/VerifiedBadge";
import { FeedRowSkeleton } from "../src/components/Skeleton";
import { haptics } from "../src/utils/haptics";
import { useContentMaxWidth } from "../src/utils/responsive";
import { useTheme, type Theme } from "../src/theme";
import type { BusinessSummary } from "../src/api/types";

export default function BusinessesScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [mine, setMine] = useState<BusinessSummary[]>([]);
  const [discover, setDiscover] = useState<BusinessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getBusinesses();
      setMine(result.mine);
      setDiscover(result.discover);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load businesses.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    haptics.light();
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        {[0, 1, 2].map((i) => (
          <FeedRowSkeleton key={i} />
        ))}
      </View>
    );
  }

  const sections = [...(mine.length > 0 ? [{ title: "Your businesses", data: mine }] : []), { title: "Discover", data: discover }];

  return (
    <SectionList
      style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
      sections={sections}
      keyExtractor={(item) => item.slug}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      renderSectionHeader={({ section }) => <Text style={styles.sectionHeading}>{section.title}</Text>}
      ListEmptyComponent={
        <EmptyState icon={error ? "cloud-offline-outline" : "storefront-outline"} message={error ?? "No businesses yet."} onRetry={error ? load : undefined} />
      }
      renderItem={({ item }) => (
        <ListRow accessibilityLabel={`View ${item.name}`} onPress={() => router.push({ pathname: "/business/[slug]", params: { slug: item.slug } })}>
          <Avatar uri={item.logoUrl} name={item.name} size={44} />
          <View style={styles.body}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {item.isVerified ? <VerifiedBadge size={14} /> : null}
            </View>
            <Text style={styles.meta}>{item.status === "pending" ? "Pending review" : item.category}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedForeground} />
        </ListRow>
      )}
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    sectionHeading: {
      fontSize: theme.text.sm,
      fontWeight: theme.weight.heading,
      color: theme.colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.space[4],
      paddingTop: theme.space[4],
      paddingBottom: theme.space[2],
    },
    body: { flex: 1, gap: 2, justifyContent: "center" },
    nameRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1] },
    name: { fontWeight: theme.weight.emphasis, color: theme.colors.foreground, fontSize: theme.text.base },
    meta: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
  });
}
