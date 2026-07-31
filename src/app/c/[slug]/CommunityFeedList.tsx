import Link from "next/link";
import type { getCurrentUser } from "@/lib/session";
import { PostCard, type FeedPost } from "@/components/PostCard";
import { ComposeBox } from "@/app/feed/ComposeBox";
import { PollComposeForm } from "@/app/feed/PollComposeForm";

// Mirrors src/app/feed/FeedList.tsx's shape (compose box + list + "load
// more" cursor link) — the two differ only in where posts come from
// (src/lib/community-feed.ts vs feed-query.ts) and the pinned section /
// moderator controls this one adds on top.
export function CommunityFeedList({
  communitySlug,
  communityId,
  pinned,
  posts,
  currentUser,
  likedPostIds,
  bookmarkedPostIds,
  votedOptionIds,
  nextCursor,
  canPost,
  canModerate,
  flairs,
  activeFlairId,
}: {
  communitySlug: string;
  communityId: string;
  pinned: FeedPost[];
  posts: FeedPost[];
  currentUser: Awaited<ReturnType<typeof getCurrentUser>>;
  likedPostIds: Set<string>;
  bookmarkedPostIds: Set<string>;
  votedOptionIds: Set<string>;
  nextCursor: string | null;
  canPost: boolean;
  canModerate: boolean;
  flairs: { id: string; label: string; color: string }[];
  activeFlairId: string | null;
}) {
  const basePath = `/c/${communitySlug}`;

  return (
    <div className="profileCard">
      {canPost && (
        <>
          <ComposeBox communityId={communityId} flairs={flairs} />
          <details className="profileEditToggle" style={{ marginBottom: "1.5rem" }}>
            <summary className="mutedText" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
              + Poll
            </summary>
            <div style={{ marginTop: "0.6rem" }}>
              <PollComposeForm communityId={communityId} flairs={flairs} />
            </div>
          </details>
        </>
      )}

      {flairs.length > 0 && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <Link
            href={basePath}
            className={`button buttonSmall ${activeFlairId === null ? "" : "buttonSecondary"}`}
          >
            All
          </Link>
          {flairs.map((f) => (
            <Link
              key={f.id}
              href={`${basePath}?flair=${f.id}`}
              className={`button buttonSmall ${activeFlairId === f.id ? "" : "buttonSecondary"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {pinned.length === 0 && posts.length === 0 && <p className="mutedText">No posts yet.</p>}
        {pinned.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            isLiked={likedPostIds.has(post.id)}
            isBookmarked={bookmarkedPostIds.has(post.id)}
            isOwner={currentUser?.id === post.authorId}
            currentUserId={currentUser?.id}
            votedOptionIds={votedOptionIds}
            isPinned
            canModerate={canModerate}
          />
        ))}
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            isLiked={likedPostIds.has(post.id)}
            isBookmarked={bookmarkedPostIds.has(post.id)}
            isOwner={currentUser?.id === post.authorId}
            currentUserId={currentUser?.id}
            votedOptionIds={votedOptionIds}
            canModerate={canModerate}
          />
        ))}
      </div>
      {nextCursor && (
        <Link
          href={`${basePath}?cursor=${encodeURIComponent(nextCursor)}${activeFlairId ? `&flair=${activeFlairId}` : ""}`}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
