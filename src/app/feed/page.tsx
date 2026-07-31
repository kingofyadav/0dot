import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCursor } from "@/lib/pagination";
import { getFeedPosts, getVotedPollOptionIds } from "@/lib/feed-query";
import { getPostableBusinesses } from "@/lib/businesses";
import { FeedList } from "./FeedList";

// Home: posts from accounts the viewer follows, plus their own posts —
// resolves phase-1's open question (§5.4/§7.5) now that Follow exists.
// Strictly personalized — a logged-out visitor has no follow graph, so
// there's nothing meaningful to show them here; they're sent to /explore
// (the global chronological feed) instead of seeing a faked-up fallback.
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/explore");

  const { cursor: rawCursor } = await searchParams;
  const cursor = parseCursor(rawCursor);

  const followedIds = await db.follow.findMany({
    where: { followerId: currentUser.id },
    select: { followeeId: true },
  });
  const authorFilter = {
    authorId: { in: [currentUser.id, ...followedIds.map((f) => f.followeeId)] },
  };

  const { items: posts, nextCursor } = await getFeedPosts({ authorFilter, cursor });

  const postIds = posts.map((p) => p.id);
  const [likedPostIds, bookmarkedPostIds] = await Promise.all([
    db.postLike
      .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
      .then((rows) => new Set(rows.map((r) => r.postId))),
    db.bookmark
      .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
      .then((rows) => new Set(rows.map((r) => r.postId))),
  ]);

  const votedOptionIds = await getVotedPollOptionIds(currentUser.id, posts);
  const postableBusinesses = await getPostableBusinesses(currentUser.id);

  return (
    <FeedList
      posts={posts}
      currentUser={currentUser}
      likedPostIds={likedPostIds}
      bookmarkedPostIds={bookmarkedPostIds}
      votedOptionIds={votedOptionIds}
      nextCursor={nextCursor}
      basePath="/feed"
      postableBusinesses={postableBusinesses}
    />
  );
}
