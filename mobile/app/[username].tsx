import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getProfile, getUserPosts, followUser, unfollowUser, likePost, repostPost, ApiError } from "../src/api/client";
import { Avatar } from "../src/components/Avatar";
import { VerifiedBadge } from "../src/components/VerifiedBadge";
import { EmptyState } from "../src/components/EmptyState";
import { PostRow } from "../src/components/PostRow";
import { SkeletonBlock } from "../src/components/Skeleton";
import { animateNextLayout } from "../src/utils/animateLayout";
import { haptics } from "../src/utils/haptics";
import { useContentMaxWidth } from "../src/utils/responsive";
import { useTheme, type Theme } from "../src/theme";
import { API_BASE_URL } from "../src/config";
import type { Post, Profile } from "../src/api/types";

export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [posts, setPosts] = useState<Post[]>([]);
  const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profileResult, postsResult] = await Promise.all([getProfile(username), getUserPosts(username)]);
      animateNextLayout();
      setProfile(profileResult);
      setPosts(postsResult.items);
      setPostsNextCursor(postsResult.nextCursor);
    } catch (err) {
      animateNextLayout();
      setError(err instanceof ApiError ? err.message : "Could not load this profile.");
    }
  }, [username]);

  // useFocusEffect (not a plain mount useEffect) so returning from
  // edit-profile shows the saved changes without a manual refresh — same
  // reasoning and isFirstLoad shape as the feed screen's own focus
  // effect, keyed by username so navigating feed post -> profile A ->
  // profile B -> back to profile A still treats each *first* visit to a
  // given username as the full-skeleton load, not a silent one.
  const loadedUsername = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const isFirstLoadForUser = loadedUsername.current !== username;
      (async () => {
        if (isFirstLoadForUser) {
          setLoading(true);
          await load();
          setLoading(false);
          loadedUsername.current = username;
        } else {
          await load();
        }
      })();
    }, [load, username])
  );

  async function onPostsEndReached() {
    if (!postsNextCursor || postsLoadingMore) return;
    setPostsLoadingMore(true);
    try {
      const result = await getUserPosts(username, postsNextCursor);
      animateNextLayout();
      setPosts((prev) => [...prev, ...result.items]);
      setPostsNextCursor(result.nextCursor);
    } catch {
      // Best-effort, same posture as the feed's own onEndReached.
    } finally {
      setPostsLoadingMore(false);
    }
  }

  async function onToggleLike(post: Post) {
    haptics.light();
    const { isLiked, likeCount } = post;
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, isLiked: !isLiked, likeCount: likeCount + (isLiked ? -1 : 1) } : p))
    );
    try {
      const result = await likePost(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isLiked: result.liked, likeCount: result.likeCount } : p)));
    } catch {
      haptics.warning();
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isLiked, likeCount } : p)));
    }
  }

  async function onToggleRepost(postId: string) {
    haptics.light();
    try {
      const result = await repostPost(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, repostCount: result.repostCount } : p)));
    } catch {
      haptics.warning();
    }
  }

  async function onShare() {
    if (!profile) return;
    haptics.light();
    const url = `${API_BASE_URL}/${profile.username}`;
    try {
      await Share.share({ message: url, url });
    } catch {
      // User-cancelled or platform share-sheet failure — nothing to
      // recover from.
    }
  }

  // Optimistic in the "unfollow" direction (the current state is always
  // known). In the "follow" direction the count bump assumes acceptance
  // and is corrected once the server responds — a private account replies
  // "pending" instead of "accepted", and that response un-does the
  // optimistic +1 rather than leaving a follower count that was never
  // actually real.
  async function onToggleFollow() {
    if (!profile || profile.isOwnProfile) return;
    haptics.light();
    const prevStatus = profile.followStatus;
    const prevCount = profile.followerCount;

    if (prevStatus === "accepted" || prevStatus === "pending") {
      setProfile({ ...profile, followStatus: "none", followerCount: prevStatus === "accepted" ? prevCount - 1 : prevCount });
      try {
        await unfollowUser(profile.username);
      } catch {
        haptics.warning();
        setProfile((prev) => (prev ? { ...prev, followStatus: prevStatus, followerCount: prevCount } : prev));
      }
      return;
    }

    setProfile({ ...profile, followStatus: "accepted", followerCount: prevCount + 1 });
    try {
      const result = await followUser(profile.username);
      setProfile((prev) =>
        prev ? { ...prev, followStatus: result.status, followerCount: result.status === "accepted" ? prevCount + 1 : prevCount } : prev
      );
    } catch {
      haptics.warning();
      setProfile((prev) => (prev ? { ...prev, followStatus: "none", followerCount: prevCount } : prev));
    }
  }

  const styles = createStyles(theme);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { gap: theme.space[3] }]}>
        <SkeletonBlock width={80} height={80} radius={40} />
        <SkeletonBlock width={160} height={18} />
        <SkeletonBlock width={100} height={14} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="person-outline" message={error ?? "Profile not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="Share profile" hitSlop={8} style={styles.headerButton}>
              <Ionicons name="share-outline" size={20} color={theme.colors.foreground} />
            </Pressable>
          ),
        }}
      />
      <FlatList
      style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
      data={posts}
      keyExtractor={(post) => post.id}
      onEndReached={onPostsEndReached}
      onEndReachedThreshold={0.4}
      renderItem={({ item }) => (
        <PostRow
          post={item}
          onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
          onToggleLike={() => onToggleLike(item)}
          onToggleRepost={() => onToggleRepost(item.id)}
        />
      )}
      ListFooterComponent={postsLoadingMore ? <ActivityIndicator style={styles.footerSpinner} color={theme.colors.accent} /> : null}
      ListEmptyComponent={<Text style={styles.emptyPosts}>No posts yet.</Text>}
      ListHeaderComponent={
        <View>
          {profile.coverUrl ? (
            <Image source={{ uri: profile.coverUrl }} style={styles.cover} contentFit="cover" />
          ) : (
            <View style={[styles.cover, { backgroundColor: theme.colors.surface }]} />
          )}
          <View style={styles.center}>
            <Avatar uri={profile.avatarUrl} name={profile.displayName ?? profile.username} size={88} />
            <View style={styles.nameRow}>
              <Text style={styles.title}>{profile.displayName}</Text>
              {profile.isVerified ? <VerifiedBadge size={18} /> : null}
            </View>
            <Text style={styles.handle}>@{profile.username}</Text>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
            <View style={styles.statPill}>
              <Text style={styles.statNumber}>{profile.followerCount}</Text>
              <Text style={styles.statLabel}>{profile.followerCount === 1 ? "follower" : "followers"}</Text>
            </View>
            {profile.isOwnProfile ? (
              <Pressable
                onPress={() => router.push("/edit-profile")}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
                style={({ pressed }) => [styles.followButton, styles.followButtonSecondary, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.followButtonText}>Edit profile</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={onToggleFollow}
                accessibilityRole="button"
                accessibilityLabel={
                  profile.followStatus === "accepted" ? "Unfollow" : profile.followStatus === "pending" ? "Cancel follow request" : "Follow"
                }
                style={({ pressed }) => [
                  styles.followButton,
                  profile.followStatus === "none" ? styles.followButtonPrimary : styles.followButtonSecondary,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.followButtonText, profile.followStatus === "none" && styles.followButtonTextPrimary]}>
                  {profile.followStatus === "accepted" ? "Following" : profile.followStatus === "pending" ? "Requested" : "Follow"}
                </Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.postsHeading}>Posts</Text>
        </View>
      }
      />
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    headerButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    cover: { width: "100%", height: 140 },
    center: { alignItems: "center", justifyContent: "center", padding: theme.space[6], gap: theme.space[2] },
    nameRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1], marginTop: theme.space[3] },
    title: { fontSize: theme.text.xxl, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    handle: { fontSize: theme.text.base, color: theme.colors.mutedForeground },
    bio: { fontSize: theme.text.base, color: theme.colors.foreground, textAlign: "center", marginTop: theme.space[1] },
    statPill: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: theme.space[1],
      marginTop: theme.space[4],
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.full,
      paddingVertical: theme.space[2],
      paddingHorizontal: theme.space[4],
    },
    statNumber: { fontWeight: theme.weight.heading, color: theme.colors.foreground, fontSize: theme.text.base },
    statLabel: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    followButton: {
      marginTop: theme.space[4],
      minHeight: 44,
      minWidth: 120,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.full,
      paddingHorizontal: theme.space[6],
    },
    followButtonPrimary: { backgroundColor: theme.colors.accent },
    followButtonSecondary: { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
    followButtonText: { fontWeight: theme.weight.emphasis, fontSize: theme.text.base, color: theme.colors.foreground },
    followButtonTextPrimary: { color: theme.colors.onAccent },
    postsHeading: {
      fontSize: theme.text.lg,
      fontWeight: theme.weight.heading,
      color: theme.colors.foreground,
      paddingHorizontal: theme.space[4],
      paddingBottom: theme.space[2],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    emptyPosts: { textAlign: "center", color: theme.colors.mutedForeground, padding: theme.space[6] },
    footerSpinner: { paddingVertical: theme.space[4] },
  });
}
