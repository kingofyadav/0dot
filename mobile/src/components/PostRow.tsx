import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Avatar } from "./Avatar";
import { VerifiedBadge } from "./VerifiedBadge";
import { ListRow } from "./ListRow";
import { PostMediaGrid } from "./PostMediaGrid";
import { relativeTime } from "../utils/relativeTime";
import { haptics } from "../utils/haptics";
import { usePressScale } from "../utils/usePressScale";
import { useTheme, type Theme } from "../theme";
import type { Post } from "../api/types";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  post: Post;
  onPress: () => void;
  onToggleLike: () => void;
  onToggleRepost: () => void | Promise<void>;
  onToggleBookmark: () => void;
  onReply: () => void;
  onLongPress?: () => void;
};

// Shared by the three stat toggles below (like/repost/bookmark) so each
// gets the same press-spring feedback the rest of the app now has,
// instead of the bare unstyled Pressables this row had before — these are
// the single most-tapped controls in the app, so they'd previously given
// zero visual response to a tap (only whatever the icon-swap itself did).
export function StatButton({
  accessibilityLabel,
  selected,
  onPress,
  style,
  children,
}: {
  accessibilityLabel: string;
  selected?: boolean;
  onPress: () => void;
  style?: object;
  children: React.ReactNode;
}) {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale({ scale: 0.85, opacity: 0.6 });
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      hitSlop={10}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[shellStyles.stat, style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

const shellStyles = StyleSheet.create({
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  bookmarkStat: { marginLeft: "auto" },
});

// Re-exported for post/[id].tsx's own stats row, which mirrors this one's
// shape at a slightly larger icon size rather than rendering PostRow itself.
export const statButtonStyles = shellStyles;

// Shared by the feed and the profile "Posts" tab — both render the exact
// same row shape (avatar, byline, body/media, like/reply/repost/bookmark
// stats), so this is the one place that shape is defined rather than two
// screens each keeping their own copy in sync by hand.
export function PostRow({ post, onPress, onToggleLike, onToggleRepost, onToggleBookmark, onReply, onLongPress }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // A small scale-bump on the heart itself (independent of the button's
  // own press-down spring) whenever a like lands — the parent applies the
  // like optimistically, so this fires the instant post.isLiked flips
  // true, same beat X/Instagram's own like animation lands on.
  const likeScale = useSharedValue(1);
  const likeAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: likeScale.value }] }));
  useEffect(() => {
    if (post.isLiked) likeScale.value = withSequence(withSpring(1.3, theme.motion.press), withSpring(1, theme.motion.press));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the like transition itself should trigger the bump, not every theme/likeScale identity change
  }, [post.isLiked]);

  // Repost has no optimistic count update (unlike like/bookmark) since the
  // server round-trip is what determines the final state — this local
  // pending flag just gives the tap something to visibly react to in the
  // meantime instead of appearing unresponsive next to the instant like.
  const [repostPending, setRepostPending] = useState(false);
  async function handleToggleRepost() {
    setRepostPending(true);
    try {
      await onToggleRepost();
    } finally {
      setRepostPending(false);
    }
  }

  return (
    <ListRow accessibilityLabel={`Post by ${post.authorDisplayName ?? post.author ?? "someone"}`} onPress={onPress} onLongPress={onLongPress}>
      <Avatar uri={post.authorAvatarUrl} name={post.authorDisplayName ?? post.author} size={44} />
      <View style={styles.postBody}>
        <View style={styles.byline}>
          <Text style={styles.author} numberOfLines={1}>
            {post.authorDisplayName ?? (post.author ? `@${post.author}` : "0dot user")}
          </Text>
          {post.authorVerified ? <VerifiedBadge size={14} /> : null}
          <Text style={styles.dot}>·</Text>
          <Text style={styles.time}>{relativeTime(post.createdAt)}</Text>
        </View>
        {post.body ? (
          <Text style={styles.postText} numberOfLines={4}>
            {post.body}
          </Text>
        ) : null}
        {post.media.length > 0 ? <PostMediaGrid media={post.media} /> : null}
        <View style={styles.statsRow}>
          <StatButton accessibilityLabel={post.isLiked ? "Unlike" : "Like"} selected={post.isLiked} onPress={onToggleLike}>
            <Animated.View style={likeAnimatedStyle}>
              <Ionicons
                name={post.isLiked ? "heart" : "heart-outline"}
                size={15}
                color={post.isLiked ? theme.colors.accent : theme.colors.mutedForeground}
              />
            </Animated.View>
            <Text style={[styles.statText, post.isLiked && { color: theme.colors.accent }]}>{post.likeCount}</Text>
          </StatButton>
          <StatButton accessibilityLabel="Reply" onPress={onReply}>
            <Ionicons name="chatbubble-outline" size={14} color={theme.colors.mutedForeground} />
            <Text style={styles.statText}>{post.replyCount}</Text>
          </StatButton>
          <StatButton accessibilityLabel="Repost" onPress={handleToggleRepost}>
            {repostPending ? (
              <ActivityIndicator size="small" color={theme.colors.mutedForeground} />
            ) : (
              <Ionicons name="repeat-outline" size={16} color={theme.colors.mutedForeground} />
            )}
            <Text style={styles.statText}>{post.repostCount}</Text>
          </StatButton>
          <StatButton
            accessibilityLabel={post.isBookmarked ? "Remove bookmark" : "Bookmark"}
            selected={post.isBookmarked}
            onPress={onToggleBookmark}
            style={shellStyles.bookmarkStat}
          >
            <Ionicons
              name={post.isBookmarked ? "bookmark" : "bookmark-outline"}
              size={15}
              color={post.isBookmarked ? theme.colors.accent : theme.colors.mutedForeground}
            />
          </StatButton>
        </View>
      </View>
    </ListRow>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    postBody: { flex: 1, gap: theme.space[1] },
    byline: { flexDirection: "row", alignItems: "center", gap: theme.space[1] },
    author: { fontWeight: theme.weight.emphasis, color: theme.colors.foreground, fontSize: theme.text.sm, flexShrink: 1 },
    dot: { color: theme.colors.mutedForeground },
    time: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    postText: { color: theme.colors.foreground, fontSize: theme.text.base, lineHeight: theme.text.base * 1.3 },
    statsRow: { flexDirection: "row", alignItems: "center", gap: theme.space[5], marginTop: theme.space[1] },
    statText: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
  });
}
