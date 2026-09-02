import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getBookChapter, ApiError } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { renderWikiMarkdown } from "../lib/wiki-markdown";
import { useContentMaxWidth } from "../utils/responsive";
import { useTheme, type Theme } from "../theme";
import type { BookChapterDetail } from "../api/types";

// Bearer-token-backed counterpart to
// src/app/[username]/books/[slug]/[chapterSlug]/page.tsx. Same shape as
// WikiDetailBody (a book chapter is a WikiPage row) — kept as its own
// screen rather than a shared component since its back-navigation target
// (the book) and route params differ.
export function BookChapterBody({ username, slug, chapterSlug }: { username: string; slug: string; chapterSlug: string }) {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [chapter, setChapter] = useState<BookChapterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setChapter(await getBookChapter(username, slug, chapterSlug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this chapter.");
    }
  }, [username, slug, chapterSlug]);

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
  if (!chapter) {
    return (
      <View style={styles.center}>
        <EmptyState icon="library-outline" message={error ?? "Chapter not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
    >
      {chapter.parent ? (
        <Pressable
          onPress={() =>
            router.push({ pathname: "/[username]/books/[slug]/[chapterSlug]", params: { username, slug, chapterSlug: chapter.parent!.slug } })
          }
        >
          <Text style={styles.parentLink}>↑ {chapter.parent.title}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.title}>{chapter.title}</Text>
      {chapter.visibility && chapter.visibility !== "public" ? (
        <Text style={styles.meta}>{chapter.visibility === "unlisted" ? "Unlisted" : "Private"}</Text>
      ) : null}

      {chapter.body ? <View style={styles.body}>{renderWikiMarkdown(chapter.body, theme)}</View> : null}

      {chapter.children.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Sub-sections</Text>
          {chapter.children.map((child) => (
            <Pressable
              key={child.id}
              style={styles.childRow}
              onPress={() =>
                router.push({ pathname: "/[username]/books/[slug]/[chapterSlug]", params: { username, slug, chapterSlug: child.slug } })
              }
            >
              <Text style={styles.childTitle}>{child.title}</Text>
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
    parentLink: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, marginBottom: theme.space[1] },
    title: { color: theme.colors.foreground, fontSize: theme.text.xl, fontWeight: theme.weight.heading },
    meta: { color: theme.colors.mutedForeground, fontSize: theme.text.xs, marginTop: 2 },
    body: { gap: theme.space[3], marginTop: theme.space[3] },
    section: { marginTop: theme.space[4], gap: theme.space[1] },
    sectionHeading: {
      color: theme.colors.mutedForeground,
      fontSize: theme.text.xs,
      fontWeight: theme.weight.label,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginBottom: theme.space[1],
    },
    childRow: { paddingVertical: theme.space[2], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
    childTitle: { color: theme.colors.accent, fontSize: theme.text.base },
  });
}
