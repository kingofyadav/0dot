import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getPost, ApiError } from "../../src/api/client";
import { resolvePath } from "../../src/links/resolvePath";
import { Avatar } from "../../src/components/Avatar";
import { VerifiedBadge } from "../../src/components/VerifiedBadge";
import { EmptyState } from "../../src/components/EmptyState";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { useTheme, type Theme } from "../../src/theme";
import type { Post } from "../../src/api/types";

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPost(await getPost(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this post.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.screen, { gap: theme.space[3] }]}>
        <View style={styles.byline}>
          <SkeletonBlock width={36} height={36} radius={18} />
          <SkeletonBlock width={120} height={14} />
        </View>
        <SkeletonBlock width="100%" height={16} />
        <SkeletonBlock width="80%" height={16} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="document-text-outline" message={error ?? "Post not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {post.author ? (
        <Pressable
          onPress={() => resolvePath(`/${post.author}`)}
          accessibilityRole="button"
          accessibilityLabel={`View ${post.authorDisplayName ?? post.author}'s profile`}
          style={styles.byline}
        >
          <Avatar uri={post.authorAvatarUrl} name={post.authorDisplayName ?? post.author} size={44} />
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.author}>{post.authorDisplayName ?? `@${post.author}`}</Text>
              {post.authorVerified ? <VerifiedBadge size={14} /> : null}
            </View>
            <Text style={styles.handle}>@{post.author}</Text>
          </View>
        </Pressable>
      ) : null}

      <Text style={styles.body}>{post.body}</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Ionicons name="heart-outline" size={17} color={theme.colors.mutedForeground} />
          <Text style={styles.statText}>{post.likeCount}</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="chatbubble-outline" size={16} color={theme.colors.mutedForeground} />
          <Text style={styles.statText}>{post.replyCount}</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="repeat-outline" size={18} color={theme.colors.mutedForeground} />
          <Text style={styles.statText}>{post.repostCount}</Text>
        </View>
      </View>

      <Text style={styles.timestamp}>{new Date(post.createdAt).toLocaleString()}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background, padding: theme.space[5], gap: theme.space[4] },
    byline: { flexDirection: "row", alignItems: "center", gap: theme.space[3] },
    nameRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1] },
    author: { fontWeight: theme.weight.emphasis, fontSize: theme.text.base, color: theme.colors.foreground },
    handle: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    body: { fontSize: theme.text.lg, lineHeight: theme.text.lg * 1.4, color: theme.colors.foreground },
    statsRow: {
      flexDirection: "row",
      gap: theme.space[6],
      paddingVertical: theme.space[3],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    stat: { flexDirection: "row", alignItems: "center", gap: theme.space[1] },
    statText: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    timestamp: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
  });
}
