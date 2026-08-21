import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Avatar } from "./Avatar";
import { VerifiedBadge } from "./VerifiedBadge";
import { ListRow } from "./ListRow";
import { PostMediaGrid } from "./PostMediaGrid";
import { relativeTime } from "../utils/relativeTime";
import { useTheme, type Theme } from "../theme";
import type { Post } from "../api/types";

type Props = {
  post: Post;
  onPress: () => void;
  onToggleLike: () => void;
  onToggleRepost: () => void;
  onToggleBookmark: () => void;
};

// Shared by the feed and the profile "Posts" tab — both render the exact
// same row shape (avatar, byline, body/media, like/reply/repost/bookmark
// stats), so this is the one place that shape is defined rather than two
// screens each keeping their own copy in sync by hand.
export function PostRow({ post, onPress, onToggleLike, onToggleRepost, onToggleBookmark }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ListRow accessibilityLabel={`Post by ${post.authorDisplayName ?? post.author ?? "someone"}`} onPress={onPress}>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={post.isLiked ? "Unlike" : "Like"}
            hitSlop={8}
            onPress={onToggleLike}
            style={styles.stat}
          >
            <Ionicons
              name={post.isLiked ? "heart" : "heart-outline"}
              size={15}
              color={post.isLiked ? theme.colors.accent : theme.colors.mutedForeground}
            />
            <Text style={[styles.statText, post.isLiked && { color: theme.colors.accent }]}>{post.likeCount}</Text>
          </Pressable>
          <View style={styles.stat}>
            <Ionicons name="chatbubble-outline" size={14} color={theme.colors.mutedForeground} />
            <Text style={styles.statText}>{post.replyCount}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Repost" hitSlop={8} onPress={onToggleRepost} style={styles.stat}>
            <Ionicons name="repeat-outline" size={16} color={theme.colors.mutedForeground} />
            <Text style={styles.statText}>{post.repostCount}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={post.isBookmarked ? "Remove bookmark" : "Bookmark"}
            hitSlop={8}
            onPress={onToggleBookmark}
            style={[styles.stat, styles.bookmarkStat]}
          >
            <Ionicons
              name={post.isBookmarked ? "bookmark" : "bookmark-outline"}
              size={15}
              color={post.isBookmarked ? theme.colors.accent : theme.colors.mutedForeground}
            />
          </Pressable>
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
    stat: { flexDirection: "row", alignItems: "center", gap: 4 },
    bookmarkStat: { marginLeft: "auto" },
    statText: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
  });
}
