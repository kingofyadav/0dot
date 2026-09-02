import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getWikiPage, ApiError } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { renderWikiMarkdown } from "../lib/wiki-markdown";
import { useContentMaxWidth } from "../utils/responsive";
import { useTheme, type Theme } from "../theme";
import type { WikiPageDetail } from "../api/types";

// Bearer-token-backed counterpart to
// src/app/[username]/wiki/[slug]/page.tsx. v1 scope: reading only —
// comments/likes/editing stay web-only for now.
export function WikiDetailBody({ username, slug }: { username: string; slug: string }) {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [page, setPage] = useState<WikiPageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(await getWikiPage(username, slug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this page.");
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
  if (!page) {
    return (
      <View style={styles.center}>
        <EmptyState icon="book-outline" message={error ?? "Page not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
    >
      {page.parent ? (
        <Pressable onPress={() => router.push({ pathname: "/[username]/wiki/[slug]", params: { username, slug: page.parent!.slug } })}>
          <Text style={styles.parentLink}>↑ {page.parent.title}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.title}>{page.title}</Text>
      <Text style={styles.meta}>
        {page.kindLabel}
        {page.visibility === "unlisted" ? " · Unlisted" : ""}
        {page.visibility === "private" ? " · Private" : ""}
      </Text>

      {page.body ? <View style={styles.body}>{renderWikiMarkdown(page.body, theme)}</View> : null}

      {page.children.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Sub-pages</Text>
          {page.children.map((child) => (
            <Pressable
              key={child.id}
              style={styles.childRow}
              onPress={() => router.push({ pathname: "/[username]/wiki/[slug]", params: { username, slug: child.slug } })}
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
