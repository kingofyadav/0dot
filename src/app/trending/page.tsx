import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ensureTrendingScoresFresh, getTrendingPosts, parseTrendingCursor } from "@/lib/trending";
import { FeedList } from "@/app/feed/FeedList";

// Trending: velocity-ranked third feed, distinct from both Home (/feed,
// follow-filtered) and Explore (/explore, global chronological) — phase-2
// spec §6.2. Same FeedList/PostCard rendering as those two; only the
// backing query differs (see src/lib/trending.ts).
export default async function TrendingPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  await ensureTrendingScoresFresh();

  const currentUser = await getCurrentUser();
  const { cursor: rawCursor } = await searchParams;
  const cursor = parseTrendingCursor(rawCursor);

  const { items: posts, nextCursor } = await getTrendingPosts({ cursor, viewerId: currentUser?.id ?? null });

  const postIds = posts.map((p) => p.id);
  const [likedPostIds, bookmarkedPostIds] = currentUser
    ? await Promise.all([
        db.postLike
          .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
          .then((rows) => new Set(rows.map((r) => r.postId))),
        db.bookmark
          .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
          .then((rows) => new Set(rows.map((r) => r.postId))),
      ])
    : [new Set<string>(), new Set<string>()];

  return (
    <FeedList
      posts={posts}
      currentUser={currentUser}
      likedPostIds={likedPostIds}
      bookmarkedPostIds={bookmarkedPostIds}
      nextCursor={nextCursor}
      basePath="/trending"
      showComposer={false}
    />
  );
}
