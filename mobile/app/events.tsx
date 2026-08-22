import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { getEvents, ApiError } from "../src/api/client";
import { Avatar } from "../src/components/Avatar";
import { EmptyState } from "../src/components/EmptyState";
import { ListRow } from "../src/components/ListRow";
import { FeedRowSkeleton } from "../src/components/Skeleton";
import { haptics } from "../src/utils/haptics";
import { useContentMaxWidth } from "../src/utils/responsive";
import { useTheme, type Theme } from "../src/theme";
import type { EventSummary } from "../src/api/types";

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export default function EventsScreen() {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getEvents();
      setEvents(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load events.");
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

  return (
    <FlatList
      style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
      data={events}
      keyExtractor={(event) => event.slug}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      ListEmptyComponent={
        <EmptyState icon={error ? "cloud-offline-outline" : "calendar-outline"} message={error ?? "No upcoming events."} onRetry={error ? load : undefined} />
      }
      renderItem={({ item }) => (
        <ListRow accessibilityLabel={`View ${item.title}`} onPress={() => router.push({ pathname: "/event/[slug]", params: { slug: item.slug } })}>
          {item.coverImageUrl ? (
            <Avatar uri={item.coverImageUrl} name={item.title} size={44} />
          ) : (
            <View style={[styles.iconFallback, { backgroundColor: theme.colors.accentSoft }]}>
              <Ionicons name="calendar" size={20} color={theme.colors.accentStrong} />
            </View>
          )}
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.meta}>
              {formatWhen(item.startsAt)} · {item.hostLabel}
            </Text>
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
    iconFallback: { width: 44, height: 44, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center" },
    body: { flex: 1, gap: 2, justifyContent: "center" },
    title: { fontWeight: theme.weight.emphasis, color: theme.colors.foreground, fontSize: theme.text.base },
    meta: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
  });
}
