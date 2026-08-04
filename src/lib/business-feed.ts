import "server-only";
import { db } from "@/lib/db";
import { cursorWhere, paginate, POST_PAGE_SIZE, type PostCursor } from "@/lib/pagination";
import { getBlockedEitherWayUserIds, getTierGatingCondition } from "@/lib/post-visibility";
import {
  authorInclude,
  mediaInclude,
  communityInclude,
  flairInclude,
  businessAuthorInclude,
  pollInclude,
  requiredTierInclude,
} from "@/lib/feed-query";

// phase-4 gap-fill, spec §6: the business post feed tab the spec calls for
// but the original build never gave a route to. Modeled on
// getCommunityFeedPosts (src/lib/community-feed.ts) but deliberately
// WITHOUT a pinned-post branch — Post.pinnedAt's own schema comment calls
// it "community-scoped meaning only... never read outside a
// community-feed query," so a business feed must not read it.
export async function getBusinessFeedPosts({
  businessId,
  cursor,
  viewerId,
}: {
  businessId: string;
  cursor: PostCursor | null;
  viewerId: string | null;
}) {
  const blockedIds = viewerId ? await getBlockedEitherWayUserIds(viewerId) : [];
  const tierGating = await getTierGatingCondition(viewerId);

  const rows = await db.post.findMany({
    where: {
      businessAuthorId: businessId,
      deletedAt: null,
      replyToId: null,
      authorId: { notIn: blockedIds },
      AND: [tierGating, cursorWhere(cursor)],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: {
      author: { include: authorInclude },
      media: mediaInclude,
      community: communityInclude,
      flair: flairInclude,
      businessAuthor: businessAuthorInclude,
      poll: pollInclude,
      requiredTier: requiredTierInclude,
      repostOf: { include: { author: { include: authorInclude }, media: mediaInclude, requiredTier: requiredTierInclude } },
      replies: {
        where: { deletedAt: null, authorId: { notIn: blockedIds } },
        orderBy: { createdAt: "asc" as const },
        include: { author: { include: authorInclude }, media: mediaInclude },
      },
    },
  });

  return paginate(rows);
}
