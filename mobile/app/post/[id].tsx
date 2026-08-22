import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getPost, createPost, likePost, repostPost, toggleBookmark, ApiError } from "../../src/api/client";
import { resolvePath } from "../../src/links/resolvePath";
import { Avatar } from "../../src/components/Avatar";
import { VerifiedBadge } from "../../src/components/VerifiedBadge";
import { EmptyState } from "../../src/components/EmptyState";
import { PostMediaGrid } from "../../src/components/PostMediaGrid";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { StatButton, statButtonStyles } from "../../src/components/PostRow";
import { SendButton } from "../../src/components/SendButton";
import { animateNextLayout } from "../../src/utils/animateLayout";
import { haptics } from "../../src/utils/haptics";
import { useContentMaxWidth } from "../../src/utils/responsive";
import { useTheme, type Theme } from "../../src/theme";
import { API_BASE_URL } from "../../src/config";
import type { Post } from "../../src/api/types";

const MAX_REPLY_LENGTH = 500;

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const load = useCallback(() => {
    getPost(id)
      .then((result) => {
        animateNextLayout();
        setPost(result);
      })
      .catch((err) => {
        animateNextLayout();
        setError(err instanceof ApiError ? err.message : "Could not load this post.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  function onRetry() {
    setLoading(true);
    setError(null);
    load();
  }

  async function onShare() {
    if (!post) return;
    haptics.light();
    const url = `${API_BASE_URL}/p/${post.id}`;
    // `url` is iOS-only (renders as a proper link in the share sheet);
    // `message` is what Android actually uses — passing both covers each
    // platform's own reading of the API rather than picking one.
    try {
      await Share.share({ message: url, url });
    } catch {
      // User-cancelled or platform share-sheet failure — nothing to
      // recover from, same posture as a dismissed native picker.
    }
  }

  // Same optimistic-with-known-direction posture as the feed screen's
  // onToggleLike — see its comment for why repost doesn't get the same
  // treatment.
  async function onToggleLike() {
    if (!post) return;
    const { isLiked, likeCount } = post;
    setPost({ ...post, isLiked: !isLiked, likeCount: likeCount + (isLiked ? -1 : 1) });
    try {
      const result = await likePost(post.id);
      setPost((prev) => (prev ? { ...prev, isLiked: result.liked, likeCount: result.likeCount } : prev));
    } catch {
      haptics.warning();
      setPost((prev) => (prev ? { ...prev, isLiked, likeCount } : prev));
    }
  }

  async function onToggleRepost() {
    if (!post) return;
    try {
      const result = await repostPost(post.id);
      setPost((prev) => (prev ? { ...prev, repostCount: result.repostCount } : prev));
    } catch {
      haptics.warning();
    }
  }

  async function onToggleBookmark() {
    if (!post) return;
    const { isBookmarked } = post;
    setPost({ ...post, isBookmarked: !isBookmarked });
    try {
      const result = await toggleBookmark(post.id);
      setPost((prev) => (prev ? { ...prev, isBookmarked: result.bookmarked } : prev));
    } catch {
      haptics.warning();
      setPost((prev) => (prev ? { ...prev, isBookmarked } : prev));
    }
  }

  // Same like-bump + repost-pending affordances as PostRow's stat buttons
  // (see that component's own comments) — this screen renders its own
  // stats row rather than PostRow itself, so it re-derives the same two
  // bits of local UI state independently.
  const likeScale = useSharedValue(1);
  const likeAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: likeScale.value }] }));
  useEffect(() => {
    if (post?.isLiked) likeScale.value = withSequence(withSpring(1.3, theme.motion.press), withSpring(1, theme.motion.press));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the like transition itself should trigger the bump
  }, [post?.isLiked]);

  const [repostPending, setRepostPending] = useState(false);
  async function handleToggleRepost() {
    setRepostPending(true);
    try {
      await onToggleRepost();
    } finally {
      setRepostPending(false);
    }
  }

  // No inline thread view yet (see Phase B scope note) — posting a reply
  // hands off to that reply's own post screen instead of trying to render
  // it appended in place, so the user still gets to see what they just
  // posted rendered as a real post.
  async function onSendReply() {
    if (!post || sendingReply) return;
    const body = replyBody.trim();
    if (!body) return;
    setSendingReply(true);
    setReplyError(null);
    try {
      const reply = await createPost({ body, replyToId: post.id });
      haptics.light();
      setReplyBody("");
      setPost((prev) => (prev ? { ...prev, replyCount: prev.replyCount + 1 } : prev));
      router.push({ pathname: "/post/[id]", params: { id: reply.id } });
    } catch (err) {
      haptics.warning();
      setReplyError(err instanceof ApiError ? err.message : "Could not post your reply.");
    } finally {
      setSendingReply(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.scrollContent, { gap: theme.space[3] }]}>
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
      <View style={[styles.screen, styles.scrollContent]}>
        <EmptyState icon="document-text-outline" message={error ?? "Post not found."} onRetry={error ? onRetry : undefined} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="Share post" hitSlop={8} style={styles.headerButton}>
              <Ionicons name="share-outline" size={20} color={theme.colors.foreground} />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
      <View style={[styles.contentWrap, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
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

        {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
        {post.media.length > 0 ? <PostMediaGrid media={post.media} height={280} /> : null}

        <View style={styles.statsRow}>
          <StatButton accessibilityLabel={post.isLiked ? "Unlike" : "Like"} selected={post.isLiked} onPress={onToggleLike}>
            <Animated.View style={likeAnimatedStyle}>
              <Ionicons
                name={post.isLiked ? "heart" : "heart-outline"}
                size={17}
                color={post.isLiked ? theme.colors.accent : theme.colors.mutedForeground}
              />
            </Animated.View>
            <Text style={[styles.statText, post.isLiked && { color: theme.colors.accent }]}>{post.likeCount}</Text>
          </StatButton>
          <View style={styles.stat}>
            <Ionicons name="chatbubble-outline" size={16} color={theme.colors.mutedForeground} />
            <Text style={styles.statText}>{post.replyCount}</Text>
          </View>
          <StatButton accessibilityLabel="Repost" onPress={handleToggleRepost}>
            {repostPending ? (
              <ActivityIndicator size="small" color={theme.colors.mutedForeground} />
            ) : (
              <Ionicons name="repeat-outline" size={18} color={theme.colors.mutedForeground} />
            )}
            <Text style={styles.statText}>{post.repostCount}</Text>
          </StatButton>
          <StatButton
            accessibilityLabel={post.isBookmarked ? "Remove bookmark" : "Bookmark"}
            selected={post.isBookmarked}
            onPress={onToggleBookmark}
            style={statButtonStyles.bookmarkStat}
          >
            <Ionicons
              name={post.isBookmarked ? "bookmark" : "bookmark-outline"}
              size={17}
              color={post.isBookmarked ? theme.colors.accent : theme.colors.mutedForeground}
            />
          </StatButton>
        </View>

        <Text style={styles.timestamp}>{new Date(post.createdAt).toLocaleString()}</Text>

        {replyError ? <Text style={styles.replyError}>{replyError}</Text> : null}
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.composerBar}>
        <TextInput
          style={styles.composerInput}
          placeholder="Reply to this post…"
          placeholderTextColor={theme.colors.mutedForeground}
          value={replyBody}
          onChangeText={setReplyBody}
          multiline
          maxLength={MAX_REPLY_LENGTH}
          accessibilityLabel="Reply text"
        />
        <SendButton onPress={onSendReply} disabled={!replyBody.trim() || sendingReply} accessibilityLabel="Send reply" />
      </SafeAreaView>
      </View>
      </KeyboardAvoidingView>
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    contentWrap: { flex: 1 },
    headerButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { padding: theme.space[5], gap: theme.space[4] },
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
    replyError: { color: theme.colors.danger, fontSize: theme.text.sm },
    composerBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: theme.space[2],
      padding: theme.space[3],
      backgroundColor: theme.colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    composerInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      color: theme.colors.foreground,
      fontSize: theme.text.base,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[2],
    },
  });
}
