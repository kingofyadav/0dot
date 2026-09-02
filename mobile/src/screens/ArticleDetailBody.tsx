import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { getArticle, ApiError } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { renderWikiMarkdown } from "../lib/wiki-markdown";
import { relativeTime } from "../utils/relativeTime";
import { useContentMaxWidth } from "../utils/responsive";
import { useTheme, type Theme } from "../theme";
import type { ArticleDetail } from "../api/types";

// Bearer-token-backed counterpart to
// src/app/[username]/articles/[slug]/page.tsx. v1 scope: reading only —
// comments, likes, and translation stay web-only for now (see the route's
// own comment).
export function ArticleDetailBody({ username, slug }: { username: string; slug: string }) {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setArticle(await getArticle(username, slug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this article.");
    }
  }, [username, slug]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  if (!article) {
    return (
      <View style={styles.center}>
        <EmptyState icon="document-text-outline" message={error ?? "Article not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
    >
      {article.coverImageUrl ? <Image source={{ uri: article.coverImageUrl }} style={styles.cover} contentFit="cover" /> : null}

      <Text style={styles.title}>{article.title}</Text>
      {article.subtitle ? <Text style={styles.subtitle}>{article.subtitle}</Text> : null}
      <Text style={styles.meta}>
        {article.formatLabel} · {article.readingTimeMinutes} min read
        {article.status === "draft" ? " · Draft" : ""}
        {article.visibility === "unlisted" ? " · Unlisted" : ""}
        {article.visibility === "private" ? " · Private" : ""}
        {article.publishedAt ? ` · ${relativeTime(article.publishedAt)}` : ""}
      </Text>

      {article.body ? <View style={styles.body}>{renderWikiMarkdown(article.body, theme)}</View> : null}

      {article.hashtags.length > 0 ? (
        <View style={styles.hashtagRow}>
          {article.hashtags.map((tag) => (
            <View key={tag} style={styles.hashtagChip}>
              <Text style={styles.hashtagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space[5], gap: theme.space[2] },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space[6] },
    cover: { width: "100%", aspectRatio: 16 / 9, borderRadius: theme.radius.md, marginBottom: theme.space[2] },
    title: { color: theme.colors.foreground, fontSize: theme.text.xl, fontWeight: theme.weight.heading },
    subtitle: { color: theme.colors.mutedForeground, fontSize: theme.text.base, marginTop: 2 },
    meta: { color: theme.colors.mutedForeground, fontSize: theme.text.xs, marginTop: theme.space[1] },
    body: { gap: theme.space[3], marginTop: theme.space[3] },
    hashtagRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.space[2], marginTop: theme.space[3] },
    hashtagChip: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 999,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[1],
    },
    hashtagText: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
  });
}
