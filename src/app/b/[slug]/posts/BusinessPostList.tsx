import Link from "next/link";
import type { getCurrentUser } from "@/lib/session";
import { EmptyState } from "@/components/EmptyState";
import { PostCard, type FeedPost } from "@/components/PostCard";

// Read-only browsing of everything authored as this business (spec §6) —
// mirrors CommunityFeedList.tsx's list/pagination shape, minus the compose
// box (posting as a business still goes through the global /feed "Post as"
// picker, ComposeBox's postableBusinesses prop) and the pinned/flair
// sections community feeds have that don't apply here.
export function BusinessPostList({
  businessSlug,
  posts,
  currentUser,
  likedPostIds,
  bookmarkedPostIds,
  votedOptionIds,
  nextCursor,
}: {
  businessSlug: string;
  posts: FeedPost[];
  currentUser: Awaited<ReturnType<typeof getCurrentUser>>;
  likedPostIds: Set<string>;
  bookmarkedPostIds: Set<string>;
  votedOptionIds: Set<string>;
  nextCursor: string | null;
}) {
  return (
    <div className="profileCard">
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
      {nextCursor && (
        <Link
          href={`/b/${businessSlug}/posts?cursor=${encodeURIComponent(nextCursor)}`}
          prefetch={false}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
