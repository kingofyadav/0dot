import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { getBook, ApiError } from "../api/client";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { renderWikiMarkdown } from "../lib/wiki-markdown";
import { useContentMaxWidth } from "../utils/responsive";
import { useTheme, type Theme } from "../theme";
import type { BookDetail } from "../api/types";

// Bearer-token-backed counterpart to
// src/app/[username]/books/[slug]/page.tsx. v1 scope: reading only —
// comments/likes/editing stay web-only for now.
export function BookDetailBody({ username, slug }: { username: string; slug: string }) {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [book, setBook] = useState<BookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBook(await getBook(username, slug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this book.");
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
  if (!book) {
    return (
      <View style={styles.center}>
        <EmptyState icon="library-outline" message={error ?? "Book not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
    >
      {book.coverImageUrl ? <Image source={{ uri: book.coverImageUrl }} style={styles.cover} contentFit="cover" /> : null}

      <Text style={styles.title}>{book.title}</Text>
      <Text style={styles.meta}>
        {book.status === "draft" ? "Draft" : ""}
        {book.visibility === "unlisted" ? " · Unlisted" : ""}
        {book.visibility === "private" ? " · Private" : ""}
      </Text>

      {book.description ? <View style={styles.description}>{renderWikiMarkdown(book.description, theme)}</View> : null}

      {book.ebookFileUrl ? (
        <Button
          label="Download ebook"
          variant="secondary"
          onPress={() => Linking.openURL(book.ebookFileUrl!)}
          style={styles.downloadButton}
        />
      ) : null}

      {book.chapters.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Chapters</Text>
          {book.chapters.map((chapter, index) => (
            <Pressable
              key={chapter.id}
              style={styles.chapterRow}
              onPress={() =>
                router.push({ pathname: "/[username]/books/[slug]/[chapterSlug]", params: { username, slug, chapterSlug: chapter.slug } })
              }
            >
              <Text style={styles.chapterTitle}>
                {index + 1}. {chapter.title}
              </Text>
            </Pressable>
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
    cover: { width: "100%", aspectRatio: 3 / 4, borderRadius: theme.radius.md, marginBottom: theme.space[2] },
    title: { color: theme.colors.foreground, fontSize: theme.text.xl, fontWeight: theme.weight.heading },
    meta: { color: theme.colors.mutedForeground, fontSize: theme.text.xs, marginTop: 2 },
    description: { gap: theme.space[3], marginTop: theme.space[3] },
    downloadButton: { alignSelf: "flex-start", marginTop: theme.space[3] },
    section: { marginTop: theme.space[4], gap: theme.space[1] },
    sectionHeading: {
      color: theme.colors.mutedForeground,
      fontSize: theme.text.xs,
      fontWeight: theme.weight.label,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginBottom: theme.space[1],
    },
    chapterRow: { paddingVertical: theme.space[2], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
    chapterTitle: { color: theme.colors.accent, fontSize: theme.text.base },
  });
}
