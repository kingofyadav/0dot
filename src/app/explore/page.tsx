import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCursor } from "@/lib/pagination";
import { getFeedPosts, getVotedPollOptionIds } from "@/lib/feed-query";
import { getPostableBusinesses } from "@/lib/businesses";
import { FeedList } from "@/app/feed/FeedList";

// Explore: the Phase 1 global-chronological feed, kept as a distinct
// surface (not removed) once /feed becomes follow-filtered — phase-2 spec
// §6.1. Same query getFeedPosts() runs for /feed, just with no author
// filter.
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const currentUser = await getCurrentUser();
  const { cursor: rawCursor } = await searchParams;
  const cursor = parseCursor(rawCursor);

  const { items: posts, nextCursor } = await getFeedPosts({ cursor, viewerId: currentUser?.id ?? null });

  // All five independent of each other — one batch instead of two halves
  // the round trips this stage pays against the network DB.
  const postIds = posts.map((p) => p.id);
  const [likedPostIds, bookmarkedPostIds, votedOptionIds, postableBusinesses, ownTiers] = await Promise.all([
    currentUser
      ? db.postLike
          .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
          .then((rows) => new Set(rows.map((r) => r.postId)))
      : Promise.resolve(new Set<string>()),
    currentUser
      ? db.bookmark
          .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
          .then((rows) => new Set(rows.map((r) => r.postId)))
      : Promise.resolve(new Set<string>()),
    getVotedPollOptionIds(currentUser?.id, posts),
    currentUser ? getPostableBusinesses(currentUser.id) : Promise.resolve([]),
    currentUser
      ? db.membershipTier.findMany({
          where: { creatorId: currentUser.id, status: "active" },
          select: { id: true, name: true },
          orderBy: { level: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <FeedList
      posts={posts}
      currentUser={currentUser}
      likedPostIds={likedPostIds}
      bookmarkedPostIds={bookmarkedPostIds}
      votedOptionIds={votedOptionIds}
      nextCursor={nextCursor}
      basePath="/explore"
      postableBusinesses={postableBusinesses}
      ownTiers={ownTiers}
      showComposer={false}
    />
  );
}
