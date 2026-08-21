import { useCallback, useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getCommunities, ApiError } from "../src/api/client";
import { Avatar } from "../src/components/Avatar";
import { EmptyState } from "../src/components/EmptyState";
import { ListRow } from "../src/components/ListRow";
import { FeedRowSkeleton } from "../src/components/Skeleton";
import { haptics } from "../src/utils/haptics";
import { useContentMaxWidth } from "../src/utils/responsive";
import { useTheme, type Theme } from "../src/theme";
import type { CommunitySummary } from "../src/api/types";

export default function CommunitiesScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [joined, setJoined] = useState<CommunitySummary[]>([]);
  const [discover, setDiscover] = useState<CommunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getCommunities();
      setJoined(result.joined);
      setDiscover(result.discover);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load communities.");
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

  const sections = [
    ...(joined.length > 0 ? [{ title: "Your communities", data: joined }] : []),
    { title: "Discover", data: discover },
  ];

  return (
    <SectionList
      style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
      sections={sections}
      keyExtractor={(item) => item.slug}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      renderSectionHeader={({ section }) => <Text style={styles.sectionHeading}>{section.title}</Text>}
      ListEmptyComponent={
        <EmptyState icon={error ? "cloud-offline-outline" : "people-circle-outline"} message={error ?? "No communities yet."} onRetry={error ? load : undefined} />
      }
      renderItem={({ item }) => (
        <ListRow accessibilityLabel={`View ${item.name}`} onPress={() => router.push({ pathname: "/community/[slug]", params: { slug: item.slug } })}>
          <Avatar uri={item.avatarUrl} name={item.name} size={44} />
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.meta}>
              {item.memberCount} {item.memberCount === 1 ? "member" : "members"}
            </Text>
          </View>
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
    name: { fontWeight: theme.weight.emphasis, color: theme.colors.foreground, fontSize: theme.text.base },
    meta: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
  });
}
