import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { PostCard } from "@/components/PostCard";

const authorInclude = { profile: true, username: true } as const;

export default async function BookmarksPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const bookmarks = await db.bookmark.findMany({
    where: { userId: currentUser.id, post: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: {
      post: {
        include: {
          author: { include: authorInclude },
          repostOf: { include: { author: { include: authorInclude } } },
          replies: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            include: { author: { include: authorInclude } },
          },
        },
      },
    },
  });

  const posts = bookmarks.map((b) => b.post);
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
    </div>
  );
}
