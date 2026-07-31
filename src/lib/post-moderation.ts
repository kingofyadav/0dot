import "server-only";
import { db } from "@/lib/db";

// Plain server-only lib, not a "use server" action file — same reasoning as
// blocks.ts/messaging.ts/communities.ts: this trusts a bare post row with
// no permission check of its own. Every export of a "use server" module
// (src/app/actions/posts.ts, src/app/actions/communities.ts) becomes a
// client-invokable server reference; this function does no auth, so it must
// never live in one of those files directly. Callers (deletePost,
// removeCommunityPost) are each responsible for their own permission check
// before calling this.

// Soft delete — tombstone remains so reply threads and reposts referencing
// it don't 404, but denormalized counts on whatever it was attached to
// still need to come back down. Shared by the author-only deletePost and
// communities.ts's staff-only removeCommunityPost — same tombstone
// mechanics regardless of who's removing it, just a different permission
// check at the call site.
export async function softDeletePostAndDecrementCounts(post: {
  id: string;
  replyToId: string | null;
  repostOfId: string | null;
}): Promise<void> {
  const updates = [db.post.update({ where: { id: post.id }, data: { deletedAt: new Date() } })];
  if (post.replyToId) {
    updates.push(
      db.post.update({ where: { id: post.replyToId }, data: { replyCount: { decrement: 1 } } })
    );
  }
  if (post.repostOfId) {
    // Applies to both a plain repost and a quote-repost being deleted —
    // both counted toward the original's repostCount when created.
    updates.push(
      db.post.update({ where: { id: post.repostOfId }, data: { repostCount: { decrement: 1 } } })
    );
  }
  await db.$transaction(updates);
}
