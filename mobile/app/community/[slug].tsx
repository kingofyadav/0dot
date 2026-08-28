import { useCallback, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { getCommunity, getCommunityPosts, joinCommunity, leaveCommunity, createCommunityPost, likePost, repostPost, toggleBookmark, ApiError } from "../../src/api/client";
import { Avatar } from "../../src/components/Avatar";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { PostActionsSheet } from "../../src/components/PostActionsSheet";
import { PostRow } from "../../src/components/PostRow";
import { ReplySheet } from "../../src/components/ReplySheet";
import { SkeletonBlock } from "../../src/components/Skeleton";
import { animateNextLayout } from "../../src/utils/animateLayout";
import { haptics } from "../../src/utils/haptics";
import { useContentMaxWidth } from "../../src/utils/responsive";
import { useTheme, type Theme } from "../../src/theme";
import type { CommunityDetail, Post } from "../../src/api/types";

const MAX_POST_LENGTH = 500;

export default function CommunityScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { me } = useAuth();

  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Post | null>(null);
  const [actionsTarget, setActionsTarget] = useState<Post | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const detail = await getCommunity(slug);
      animateNextLayout();
      setCommunity(detail);
      if (detail.canViewContent) {
        const postsResult = await getCommunityPosts(slug);
        setPosts(postsResult.items);
        setNextCursor(postsResult.nextCursor);
      } else {
        setPosts([]);
        setNextCursor(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this community.");
    }
  }, [slug]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [load])
  );

  async function onEndReached() {
    if (!nextCursor || !community?.canViewContent) return;
    try {
      const result = await getCommunityPosts(slug, nextCursor);
      animateNextLayout();
      setPosts((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch {
      // Best-effort, same posture as every other list screen's onEndReached.
    }
  }

  async function onToggleJoin() {
    if (!community || joinBusy) return;
    haptics.light();
    setJoinBusy(true);
    try {
      if (community.membership) {
        await leaveCommunity(slug);
        setCommunity((prev) => (prev ? { ...prev, membership: null, memberCount: prev.memberCount - 1 } : prev));
      } else {
        const result = await joinCommunity(slug);
        setCommunity((prev) =>
          prev ? { ...prev, membership: { role: "member", status: result.status }, memberCount: result.status === "active" ? prev.memberCount + 1 : prev.memberCount } : prev
        );
      }
      await load();
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "That didn't work.");
    } finally {
      setJoinBusy(false);
    }
  }

  async function onPost() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const created = await createCommunityPost(slug, body);
      haptics.light();
      animateNextLayout();
      setDraft("");
      setPosts((prev) => [created, ...prev]);
    } catch (err) {
      haptics.warning();
      setError(err instanceof ApiError ? err.message : "Could not post that.");
    } finally {
      setPosting(false);
    }
  }

  async function onToggleLike(post: Post) {
    const { isLiked, likeCount } = post;
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isLiked: !isLiked, likeCount: likeCount + (isLiked ? -1 : 1) } : p)));
    try {
      const result = await likePost(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isLiked: result.liked, likeCount: result.likeCount } : p)));
    } catch {
      haptics.warning();
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isLiked, likeCount } : p)));
    }
  }

  async function onToggleRepost(postId: string) {
    try {
      const result = await repostPost(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, repostCount: result.repostCount } : p)));
    } catch {
      haptics.warning();
    }
  }

  async function onToggleBookmark(post: Post) {
    const { isBookmarked } = post;
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isBookmarked: !isBookmarked } : p)));
    try {
      const result = await toggleBookmark(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isBookmarked: result.bookmarked } : p)));
    } catch {
      haptics.warning();
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isBookmarked } : p)));
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { gap: theme.space[3] }]}>
        <SkeletonBlock width={64} height={64} radius={32} />
        <SkeletonBlock width={160} height={18} />
      </View>
    );
  }

  if (!community) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="people-circle-outline" message={error ?? "Community not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  const isActiveMember = community.membership?.status === "active";
  const isPending = community.membership?.status === "pending";

  return (
    <>
      <Stack.Screen options={{ title: community.name }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={90}>
        <View style={[styles.contentWrap, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}>
          <FlatList
            style={styles.flex}
            data={community.canViewContent ? posts : []}
            keyExtractor={(post) => post.id}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              <View>
                {community.coverUrl ? (
                  <Image source={{ uri: community.coverUrl }} style={styles.cover} contentFit="cover" alt={`${community.name} cover photo`} />
                ) : (
                  <View style={[styles.cover, { backgroundColor: theme.colors.surface }]} />
                )}
                <View style={styles.headerBody}>
                  <Avatar uri={community.avatarUrl} name={community.name} size={64} />
                  <Text style={styles.name}>{community.name}</Text>
                  <Text style={styles.meta}>
                    {community.memberCount} {community.memberCount === 1 ? "member" : "members"} · {community.visibility}
                  </Text>
                  {community.description ? <Text style={styles.description}>{community.description}</Text> : null}
                  <View style={styles.headerActions}>
                    <Button
                      label={isActiveMember ? "Leave" : isPending ? "Requested" : "Join"}
                      variant={isActiveMember ? "secondary" : "primary"}
                      onPress={onToggleJoin}
                      loading={joinBusy}
                      disabled={isPending}
                      style={styles.headerActionButton}
                    />
                    {community.canViewContent ? (
                      <>
                        <Button
                          label="Chat"
                          variant="secondary"
                          onPress={() =>
                            router.push({ pathname: "/community/[slug]/chat", params: { slug, name: community.name } })
                          }
                          accessibilityLabel={`Open ${community.name} chat`}
                          style={styles.headerActionButton}
                        />
                        <Button
                          label="Voice"
                          variant="secondary"
                          onPress={() =>
                            router.push({ pathname: "/community/[slug]/voice", params: { slug, name: community.name } })
                          }
                          accessibilityLabel={`Open ${community.name} voice rooms`}
                          style={styles.headerActionButton}
                        />
                      </>
                    ) : null}
                  </View>
                </View>
                {!community.canViewContent ? (
                  <EmptyState icon="lock-closed-outline" message="Join this community to see its posts." />
                ) : isActiveMember ? (
                  <View style={styles.composer}>
                    <TextInput
                      style={styles.composerInput}
                      placeholder={`Post in ${community.name}…`}
                      placeholderTextColor={theme.colors.mutedForeground}
                      value={draft}
                      onChangeText={setDraft}
                      multiline
                      maxLength={MAX_POST_LENGTH}
                      accessibilityLabel="Post text"
                    />
                    <Button label="Post" onPress={onPost} loading={posting} disabled={!draft.trim()} style={styles.postButton} />
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={community.canViewContent ? <Text style={styles.emptyPosts}>No posts yet.</Text> : null}
            renderItem={({ item }) => (
              <PostRow
                post={item}
                onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
                onToggleLike={() => onToggleLike(item)}
                onToggleRepost={() => onToggleRepost(item.id)}
                onToggleBookmark={() => onToggleBookmark(item)}
                onReply={() => setReplyTarget(item)}
                onLongPress={() => setActionsTarget(item)}
              />
            )}
          />
        </View>
      </KeyboardAvoidingView>
      <ReplySheet
        post={replyTarget}
        onClose={() => setReplyTarget(null)}
        onReplied={() => {
          const repliedId = replyTarget?.id;
          setPosts((prev) => prev.map((p) => (p.id === repliedId ? { ...p, replyCount: p.replyCount + 1 } : p)));
        }}
      />
      <PostActionsSheet
        post={actionsTarget}
        isOwnPost={actionsTarget !== null && actionsTarget.author === me?.username}
        onClose={() => setActionsTarget(null)}
        onDeleted={() => {
          const deletedId = actionsTarget?.id;
          setPosts((prev) => prev.filter((p) => p.id !== deletedId));
        }}
      />
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    contentWrap: { flex: 1 },
    screen: { flex: 1, backgroundColor: theme.colors.background },
    center: { alignItems: "center", justifyContent: "center" },
    cover: { width: "100%", height: 120 },
    headerBody: { alignItems: "center", gap: theme.space[2], padding: theme.space[5], marginTop: -32 },
    name: { fontSize: theme.text.xl, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    meta: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    description: { color: theme.colors.foreground, fontSize: theme.text.base, textAlign: "center" },
    headerActions: { flexDirection: "row", gap: theme.space[2], marginTop: theme.space[2] },
    headerActionButton: { flex: 1, minWidth: 120 },
    composer: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: theme.space[2],
      padding: theme.space[4],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    composerInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 100,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      color: theme.colors.foreground,
      fontSize: theme.text.base,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[2],
    },
    postButton: { minWidth: 80 },
    emptyPosts: { textAlign: "center", color: theme.colors.mutedForeground, padding: theme.space[6] },
  });
}
