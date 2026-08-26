import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

// Shared by toggleLike/toggleRepost (posts.ts) and castVote (polls.ts) — a
// like/repost/vote needs every surface that can render this post via
// PostCard/MiniPostCard refreshed, not just /feed and /explore. Without
// this, liking a post from a profile, a community feed, a business's posts
// tab, or /bookmarks left the count stale there until an unrelated
// navigation happened to revalidate that path.
//
// Not exported from a "use server" file on purpose (see posts.ts's
// checkPostRateLimit comment on the same pitfall) — a plain function
// exported from a "use server" module becomes a client-invokable action,
// which a revalidation-only helper with no auth check of its own must
// never be.
export async function revalidatePostSurfaces(postId: string): Promise<void> {
  revalidatePath("/feed");
  revalidatePath("/explore");
  revalidatePath("/bookmarks");

  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      author: { select: { username: { select: { handle: true } } } },
      community: { select: { slug: true } },
      businessAuthor: { select: { slug: true } },
    },
  });
  if (!post) return;

  if (post.author.username) revalidatePath(`/${post.author.username.handle}`);
  if (post.community) revalidatePath(`/c/${post.community.slug}`);
  if (post.businessAuthor) revalidatePath(`/b/${post.businessAuthor.slug}/posts`);
}
