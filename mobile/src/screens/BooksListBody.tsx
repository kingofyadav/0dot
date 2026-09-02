import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getBooks, ApiError } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { useContentMaxWidth } from "../utils/responsive";
import { useTheme, type Theme } from "../theme";
import type { BookSummary } from "../api/types";

// Bearer-token-backed counterpart to src/app/[username]/books/page.tsx.
export function BooksListBody({ username }: { username: string }) {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBooks((await getBooks(username)).items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load books.");
    }
  }, [username]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
      contentContainerStyle={[styles.list, books.length === 0 ? styles.grow : undefined]}
      data={books}
      keyExtractor={(b) => b.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      ListEmptyComponent={
        <EmptyState icon="library-outline" message={error ?? "No published books yet."} onRetry={error ? load : undefined} />
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => router.push({ pathname: "/[username]/books/[slug]", params: { username, slug: item.slug } })}
        >
          <Text style={styles.title}>{item.title}</Text>
          {item.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </Pressable>
      )}
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    list: { padding: theme.space[5], gap: theme.space[3] },
    grow: { flexGrow: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space[6] },
    row: {
      gap: 2,
      paddingVertical: theme.space[2],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    title: { color: theme.colors.foreground, fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
    description: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
  });
}
