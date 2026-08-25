import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, Share, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../auth/AuthContext";
import { getProfile, getUserPosts, followUser, unfollowUser, likePost, repostPost, toggleBookmark, blockUser, ApiError } from "../api/client";
import { Avatar } from "../components/Avatar";
import { DEFAULT_COVER_SOURCE } from "../components/defaultCover";
import { Button } from "../components/Button";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { PremiumBadge } from "../components/PremiumBadge";
import { ImageLightbox } from "../components/ImageLightbox";
import { EmptyState } from "../components/EmptyState";
import { PostActionsSheet } from "../components/PostActionsSheet";
import { PostRow } from "../components/PostRow";
import { ReplySheet } from "../components/ReplySheet";
import { SkeletonBlock } from "../components/Skeleton";
import { animateNextLayout } from "../utils/animateLayout";
import { haptics } from "../utils/haptics";
import { useContentMaxWidth } from "../utils/responsive";
import { useTheme, type Theme } from "../theme";
import { API_BASE_URL } from "../config";
import type { Post, Profile } from "../api/types";

const COVER_HEIGHT = 140;

// The full profile screen body (fetch, optimistic like/repost/bookmark/
// follow, header, posts list) — shared by app/[username].tsx (any
// profile, reached from a post/search tap) and app/(tabs)/profile.tsx (the
// signed-in user's own profile tab). Both render the identical shape;
// `getProfile`'s own isOwnProfile flag is what already decides "Edit
// profile" vs. "Follow" (see below), so the only thing that differs
// between the two call sites is which username they pass in and whether a
// Settings shortcut belongs in the header — not a second copy of this
// logic to keep in sync by hand.
export function ProfileScreenBody({ username, showSettingsShortcut = false }: { username: string; showSettingsShortcut?: boolean }) {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const { me } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [posts, setPosts] = useState<Post[]>([]);
  const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // M9 profile pass: tapping either image opens it full-screen — a shared
  // lightbox regardless of which one, since only one can be open at a
  // time. null both means closed.
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Post | null>(null);
  const [actionsTarget, setActionsTarget] = useState<Post | null>(null);

  // M12 (settings/account parity): "Block" lives on the profile itself,
  // same as web's own [username]/page.tsx button — a blocked-users *list*
  // with no way to add to it from the app would be half a feature (this
  // addendum's own precedent for avoiding that: M9's ConversationRow
  // archive-action scope cut). Alert.alert's own destructive-confirm style
  // is enough for a single action — no BottomSheet menu needed for one item.
  const [blocking, setBlocking] = useState(false);

  // Drives the cover's overscroll "stretch" on pull-down (Twitter/
  // Instagram's own profile cover behavior) — a transform (scale +
  // translateY), not a height change, so the FlatList's header never
  // reflows on every scroll frame.
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const coverAnimatedStyle = useAnimatedStyle(() => {
    const stretch = interpolate(scrollY.value, [-COVER_HEIGHT, 0], [2, 1], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [-COVER_HEIGHT, 0], [-COVER_HEIGHT / 2, 0], Extrapolation.CLAMP);
    return { transform: [{ translateY }, { scale: stretch }] };
  });

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

  // Home/Messages/Notifications all have pull-to-refresh on their list —
  // this screen's posts list didn't, despite reusing the same load()
  // this focus effect below already calls.
  async function onRefresh() {
    setRefreshing(true);
    haptics.light();
    await load();
    setRefreshing(false);
  }

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

  function onBlockPress() {
    if (!profile) return;
    Alert.alert(
      `Block @${profile.username}?`,
      "They won't be able to follow you, message you, or see your posts.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            setBlocking(true);
            try {
              await blockUser(username);
              haptics.medium();
              router.back();
            } catch (err) {
              haptics.warning();
              setBlocking(false);
              Alert.alert("Couldn't block this account", err instanceof ApiError ? err.message : "Please try again.");
            }
          },
        },
      ]
    );
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
      <Animated.FlatList
        style={[styles.screen, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
        data={posts}
        keyExtractor={(post: Post) => post.id}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onEndReached={onPostsEndReached}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
        renderItem={({ item }: { item: Post }) => (
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
        ListFooterComponent={postsLoadingMore ? <ActivityIndicator style={styles.footerSpinner} color={theme.colors.accent} /> : null}
        ListEmptyComponent={<EmptyState icon="document-text-outline" message="No posts yet." />}
        ListHeaderComponent={
          <View>
            <View style={styles.coverClip}>
              <Pressable
                onPress={() => profile.coverUrl && setLightboxUri(profile.coverUrl)}
                accessibilityRole={profile.coverUrl ? "imagebutton" : undefined}
                accessibilityLabel="Cover photo"
                disabled={!profile.coverUrl}
              >
                <Animated.View style={coverAnimatedStyle}>
                  <Image
                    source={profile.coverUrl ? { uri: profile.coverUrl } : DEFAULT_COVER_SOURCE}
                    style={styles.cover}
                    contentFit="cover"
                    alt="Cover photo"
                  />
                </Animated.View>
              </Pressable>
              <View style={styles.headerButtons}>
                <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="Share profile" hitSlop={8} style={styles.headerButton}>
                  <Ionicons name="share-outline" size={20} color="#fff" />
                </Pressable>
                {showSettingsShortcut ? (
                  <Pressable
                    onPress={() => router.push("/settings")}
                    accessibilityRole="button"
                    accessibilityLabel="Settings"
                    hitSlop={8}
                    style={styles.headerButton}
                  >
                    <Ionicons name="settings-outline" size={20} color="#fff" />
                  </Pressable>
                ) : !profile.isOwnProfile ? (
                  <Pressable
                    onPress={onBlockPress}
                    disabled={blocking}
                    accessibilityRole="button"
                    accessibilityLabel="More options"
                    hitSlop={8}
                    style={[styles.headerButton, blocking && { opacity: 0.6 }]}
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
                  </Pressable>
                ) : null}
              </View>
            </View>
            <View style={styles.center}>
              <Pressable
                onPress={() => profile.avatarUrl && setLightboxUri(profile.avatarUrl)}
                accessibilityRole={profile.avatarUrl ? "imagebutton" : undefined}
                accessibilityLabel="Profile photo"
                disabled={!profile.avatarUrl}
              >
                <Avatar uri={profile.avatarUrl} name={profile.displayName ?? profile.username} size={88} />
              </Pressable>
              <View style={styles.nameRow}>
                <Text style={styles.title}>{profile.displayName}</Text>
                {profile.isVerified ? <VerifiedBadge size={18} /> : null}
                {profile.isPremium ? <PremiumBadge size={18} /> : null}
              </View>
              <Text style={styles.handle}>@{profile.username}</Text>
              {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
              <View style={styles.statPill}>
                <Pressable
                  onPress={() => router.push({ pathname: "/[username]/followers", params: { username } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${profile.followerCount} ${profile.followerCount === 1 ? "follower" : "followers"}`}
                  style={styles.statGroup}
                >
                  <Text style={styles.statNumber}>{profile.followerCount}</Text>
                  <Text style={styles.statLabel}>{profile.followerCount === 1 ? "follower" : "followers"}</Text>
                </Pressable>
                <View style={styles.statDivider} />
                <Pressable
                  onPress={() => router.push({ pathname: "/[username]/following", params: { username } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${profile.followingCount} following`}
                  style={styles.statGroup}
                >
                  <Text style={styles.statNumber}>{profile.followingCount}</Text>
                  <Text style={styles.statLabel}>following</Text>
                </Pressable>
              </View>
              {profile.isOwnProfile ? (
                <Button
                  label="Edit profile"
                  variant="secondary"
                  accessibilityLabel="Edit profile"
                  onPress={() => router.push("/edit-profile")}
                  style={styles.followButton}
                />
              ) : (
                <Button
                  label={profile.followStatus === "accepted" ? "Following" : profile.followStatus === "pending" ? "Requested" : "Follow"}
                  variant={profile.followStatus === "none" ? "primary" : "secondary"}
                  accessibilityLabel={
                    profile.followStatus === "accepted" ? "Unfollow" : profile.followStatus === "pending" ? "Cancel follow request" : "Follow"
                  }
                  onPress={onToggleFollow}
                  style={styles.followButton}
                />
              )}
            </View>
            <Text style={styles.postsHeading}>Posts</Text>
          </View>
        }
      />
      <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
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
    screen: { flex: 1, backgroundColor: theme.colors.background },
    // overflow: hidden clips the cover's scroll-driven overscroll stretch
    // (scale transform) to the cover's own bounds, rather than letting the
    // scaled-up image spill into the avatar/name area below it.
    coverClip: { height: COVER_HEIGHT, overflow: "hidden" },
    headerButtons: {
      position: "absolute",
      top: theme.space[3],
      right: theme.space[2],
      flexDirection: "row",
      gap: theme.space[2],
    },
    // Circular scrim (same rgba(0,0,0,0.6) treatment edit-profile.tsx's own
    // coverEditBadge already uses) — these icons float over a photo of
    // unknown brightness, so a fixed white icon + dark backdrop stays
    // legible regardless of theme or the cover's own colors, unlike the
    // previous theme.colors.foreground (which assumed a plain background,
    // not a photo underneath).
    headerButton: {
      minWidth: 36,
      minHeight: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.6)",
    },
    cover: { width: "100%", height: COVER_HEIGHT },
    center: { alignItems: "center", justifyContent: "center", padding: theme.space[6], gap: theme.space[2] },
    nameRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1], marginTop: theme.space[3] },
    title: { fontSize: theme.text.xxl, fontWeight: theme.weight.heading, color: theme.colors.foreground },
    handle: { fontSize: theme.text.base, color: theme.colors.mutedForeground },
    bio: { fontSize: theme.text.base, color: theme.colors.foreground, textAlign: "center", marginTop: theme.space[1] },
    statPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space[3],
      marginTop: theme.space[4],
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.full,
      paddingVertical: theme.space[2],
      paddingHorizontal: theme.space[4],
    },
    statGroup: { flexDirection: "row", alignItems: "baseline", gap: theme.space[1] },
    statDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: theme.colors.border },
    statNumber: { fontWeight: theme.weight.heading, color: theme.colors.foreground, fontSize: theme.text.base },
    statLabel: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    followButton: { marginTop: theme.space[4], minWidth: 140 },
    postsHeading: {
      fontSize: theme.text.lg,
      fontWeight: theme.weight.heading,
      color: theme.colors.foreground,
      paddingHorizontal: theme.space[4],
      paddingBottom: theme.space[2],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    footerSpinner: { paddingVertical: theme.space[4] },
  });
}
