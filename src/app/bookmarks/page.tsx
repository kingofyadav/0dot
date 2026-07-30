import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCursor, paginate, POST_PAGE_SIZE } from "@/lib/pagination";
import { PostCard } from "@/components/PostCard";

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

  // Bookmark has no single `id` (its key is [postId, userId]) so it can't
  // reuse cursorWhere() as-is — same (createdAt, tiebreaker) composite
  // pattern, just written against postId as the tiebreaker instead.
  const bookmarkRows = await db.bookmark.findMany({
    where: {
      userId: currentUser.id,
      post: { deletedAt: null },
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
        {posts.length === 0 && <p className="mutedText">No bookmarks yet.</p>}
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
