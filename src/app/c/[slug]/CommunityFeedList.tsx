import Link from "next/link";
import type { getCurrentUser } from "@/lib/session";
import { EmptyState } from "@/components/EmptyState";
import { PostCard, type FeedPost } from "@/components/PostCard";
import { PostComposer } from "@/app/feed/PostComposer";

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
  ownTiers,
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
  ownTiers?: { id: string; name: string }[];
}) {
  const basePath = `/c/${communitySlug}`;

  return (
    <div className="profileCard">
      {canPost && <PostComposer communityId={communityId} flairs={flairs} ownTiers={ownTiers} />}

      {flairs.length > 0 && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {/* prefetch={false} on every flair filter below: all render at
              once, each re-running this community's full feed query for a
              different filter — same DB-connection-burst-503 fix as
              PostCard.tsx's Links (this list is full of them) and the
              "Load more" link further down. */}
          <Link
            href={basePath}
            prefetch={false}
            className={`button buttonSmall ${activeFlairId === null ? "" : "buttonSecondary"}`}
          >
            All
          </Link>
          {flairs.map((f) => (
            <Link
              key={f.id}
              href={`${basePath}?flair=${f.id}`}
              prefetch={false}
              className={`button buttonSmall ${activeFlairId === f.id ? "" : "buttonSecondary"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {pinned.length === 0 && posts.length === 0 && <EmptyState message="No posts yet." />}
        {pinned.map((post, index) => (
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
            priority={index === 0}
          />
        ))}
        {posts.map((post, index) => (
          <PostCard
            key={post.id}
            post={post}
            isLiked={likedPostIds.has(post.id)}
            isBookmarked={bookmarkedPostIds.has(post.id)}
            isOwner={currentUser?.id === post.authorId}
            currentUserId={currentUser?.id}
            votedOptionIds={votedOptionIds}
            canModerate={canModerate}
            // Pinned posts render first when there are any — only make the
            // very first *unpinned* one priority when there's nothing
            // pinned above it, so at most one image on the whole page ever
            // gets marked priority (see PostMediaGrid's comment).
            priority={pinned.length === 0 && index === 0}
          />
        ))}
      </div>
      {nextCursor && (
        <Link
          href={`${basePath}?cursor=${encodeURIComponent(nextCursor)}${activeFlairId ? `&flair=${activeFlairId}` : ""}`}
          prefetch={false}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
