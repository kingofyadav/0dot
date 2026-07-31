import Link from "next/link";
import type { getCurrentUser } from "@/lib/session";
import { PostCard, type FeedPost } from "@/components/PostCard";
import { ComposeBox } from "./ComposeBox";
import { PollComposeForm } from "./PollComposeForm";

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
}) {
  return (
    <div className="profileCard">
      {currentUser?.profile && (
        <>
          <ComposeBox postableBusinesses={postableBusinesses} />
          <details className="profileEditToggle" style={{ marginBottom: "1.5rem" }}>
            <summary className="mutedText" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
              + Poll
            </summary>
            <div style={{ marginTop: "0.6rem" }}>
              <PollComposeForm />
            </div>
          </details>
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {posts.length === 0 && <p className="mutedText">No posts yet.</p>}
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
          href={`${basePath}?cursor=${encodeURIComponent(nextCursor)}`}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
