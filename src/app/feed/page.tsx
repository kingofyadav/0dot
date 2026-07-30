import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { PostCard } from "@/components/PostCard";
import { ComposeBox } from "./ComposeBox";

const authorInclude = { profile: true, username: true } as const;

export default async function FeedPage() {
  const currentUser = await getCurrentUser();

  // Only top-level posts are listed here — replies render inline under
  // their parent (phase-1 spec §5.3), and reposts render inline with the
  // original attached, both handled by PostCard itself.
  const posts = await db.post.findMany({
    where: { deletedAt: null, replyToId: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      author: { include: authorInclude },
      repostOf: { include: { author: { include: authorInclude } } },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { author: { include: authorInclude } },
      },
    },
  });

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
    <div className="profileCard">
      {currentUser?.profile && <ComposeBox />}

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
          />
        ))}
      </div>
    </div>
  );
}
