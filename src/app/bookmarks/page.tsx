import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCursor, paginate, POST_PAGE_SIZE } from "@/lib/pagination";
import { getTierGatingCondition } from "@/lib/post-visibility";
import { PostCard } from "@/components/PostCard";
import { EmptyState } from "@/components/EmptyState";

const authorInclude = { profile: true, username: true } as const;
const mediaInclude = { orderBy: { position: "asc" as const } };

export default async function BookmarksPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { cursor: rawCursor } = await searchParams;
  const cursor = parseCursor(rawCursor);

  // phase-5 spec §4.3/§13.1: a bookmarked post can be (or become, if the
  // viewer's subscription later lapses) tier-gated — re-checked here same
  // as every other post-listing surface, not just at bookmark-creation
  // time, so a lapsed subscriber can't keep reading gated content forever
  // through their bookmarks list.
  const tierGating = await getTierGatingCondition(currentUser.id);

  // Bookmark has no single `id` (its key is [postId, userId]) so it can't
  // reuse cursorWhere() as-is — same (createdAt, tiebreaker) composite
  // pattern, just written against postId as the tiebreaker instead.
  const bookmarkRows = await db.bookmark.findMany({
    where: {
      userId: currentUser.id,
      post: { AND: [{ deletedAt: null }, tierGating] },
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, postId: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { postId: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: {
      post: {
        include: {
          author: { include: authorInclude },
          media: mediaInclude,
          repostOf: { include: { author: { include: authorInclude }, media: mediaInclude } },
          replies: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            include: { author: { include: authorInclude }, media: mediaInclude },
          },
        },
      },
    },
  });

  // paginate() only needs {createdAt, id} to trim/detect a next page —
  // postId stands in for id here.
  const { items, nextCursor } = paginate(bookmarkRows.map((b) => ({ ...b, id: b.postId })));
  const posts = items.map((b) => b.post);
  const postIds = posts.map((p) => p.id);
  const likedPostIds = new Set(
    (
      await db.postLike.findMany({
        where: { userId: currentUser.id, postId: { in: postIds } },
        select: { postId: true },
      })
    ).map((l) => l.postId)
  );

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>Bookmarks</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {posts.length === 0 && <EmptyState message="No bookmarks yet." />}
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            isLiked={likedPostIds.has(post.id)}
            isBookmarked
            isOwner={currentUser.id === post.authorId}
            currentUserId={currentUser.id}
          />
        ))}
      </div>
      {nextCursor && (
        <Link
          href={`/bookmarks?cursor=${encodeURIComponent(nextCursor)}`}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
