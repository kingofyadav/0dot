import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getArticles, ApiError } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { relativeTime } from "../utils/relativeTime";
import { useContentMaxWidth } from "../utils/responsive";
import { useTheme, type Theme } from "../theme";
import type { ArticleSummary } from "../api/types";

// Bearer-token-backed counterpart to src/app/[username]/articles/page.tsx
// — same public+published-only scope. No pagination (the server route
// caps at 50, matching the web page's own unpaginated choice for this
// list).
export function ArticlesListBody({ username }: { username: string }) {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setArticles((await getArticles(username)).items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load articles.");
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
      contentContainerStyle={[styles.list, articles.length === 0 ? styles.grow : undefined]}
      data={articles}
      keyExtractor={(a) => a.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      ListEmptyComponent={
        <EmptyState icon="document-text-outline" message={error ?? "No published articles yet."} onRetry={error ? load : undefined} />
      }
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push({ pathname: "/[username]/articles/[slug]", params: { username, slug: item.slug } })}>
          <ArticleRow article={item} theme={theme} />
        </Pressable>
      )}
    />
  );
}

function ArticleRow({ article, theme }: { article: ArticleSummary; theme: Theme }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.row}>
      <Text style={styles.title} numberOfLines={2}>
        {article.title}
      </Text>
      {article.subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2}>
          {article.subtitle}
        </Text>
      ) : null}
      <Text style={styles.meta}>
        {article.formatLabel} · {article.readingTimeMinutes} min read
        {article.publishedAt ? ` · ${relativeTime(article.publishedAt)}` : ""}
      </Text>
    </View>
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
    subtitle: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    meta: { color: theme.colors.mutedForeground, fontSize: theme.text.xs, marginTop: 2 },
  });
}
