import Link from "next/link";
import type { getCurrentUser } from "@/lib/session";
import { EmptyState } from "@/components/EmptyState";
import { PostCard, type FeedPost } from "@/components/PostCard";
import { ListKeyNav } from "@/components/ListKeyNav";
import { PostComposer } from "./PostComposer";

// Shared between /feed (Home) and /explore — both pages differ only in
// which posts they fetch (see src/lib/feed-query.ts), not in how the list
// itself renders.
export function FeedList({
  posts,
  currentUser,
  likedPostIds,
  bookmarkedPostIds,
  votedOptionIds,
  nextCursor,
  basePath,
  postableBusinesses,
  ownTiers,
  showComposer = true,
}: {
  posts: FeedPost[];
  currentUser: Awaited<ReturnType<typeof getCurrentUser>>;
  likedPostIds: Set<string>;
  bookmarkedPostIds: Set<string>;
  votedOptionIds?: Set<string>;
  nextCursor: string | null;
  basePath: string;
  // phase-4 spec §5: passed through to ComposeBox's "Post as" picker.
  // Optional/defaults to none so any future FeedList caller that doesn't
  // fetch this still renders correctly.
  postableBusinesses?: { id: string; name: string }[];
  // phase-5 spec §4.2: passed through to ComposeBox's "gate this post"
  // picker. Same optional/defaults-to-none posture as postableBusinesses.
  ownTiers?: { id: string; name: string }[];
  // Explore/Trending are read/discovery surfaces, not posting surfaces —
  // composing belongs on Home (/feed) only. Defaults true so /feed's
  // existing call (which never passes this) keeps showing it unchanged.
  showComposer?: boolean;
}) {
  return (
    <div className="profileCard">
      {showComposer && currentUser?.profile && (
        <PostComposer postableBusinesses={postableBusinesses} ownTiers={ownTiers} />
      )}

      <ListKeyNav helpTitle="Feed" supportsLike supportsReply>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {posts.length === 0 && <EmptyState message="No posts yet." />}
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isLiked={likedPostIds.has(post.id)}
              isBookmarked={bookmarkedPostIds.has(post.id)}
              isOwner={currentUser?.id === post.authorId}
              currentUserId={currentUser?.id}
              votedOptionIds={votedOptionIds}
            />
          ))}
        </div>
      </ListKeyNav>
      {nextCursor && (
        <Link
          href={`${basePath}?cursor=${encodeURIComponent(nextCursor)}`}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
