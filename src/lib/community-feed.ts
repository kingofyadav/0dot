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

function buildPostInclude(blockedIds: string[]) {
  return {
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
  } as const;
}

// phase-3 spec §7.2: per-community feed, pinned posts above the
// chronological list. Pinned posts are fetched only on the first page
// (cursor === null) — not repeated on every subsequent page, a
// simplification the spec doesn't pin down itself — and excluded from the
// chronological query entirely while pinned, rather than duplicated in
// both lists.
export async function getCommunityFeedPosts({
  communityId,
  cursor,
  flairId,
  viewerId,
}: {
  communityId: string;
  cursor: PostCursor | null;
  // phase-3 spec §6: flair "used to filter the community's own feed" —
  // pinned posts are filtered by it too, same as the chronological list,
  // so a pinned post with a different flair doesn't leak into a filtered view.
  flairId?: string | null;
  viewerId: string | null;
}) {
  const flairFilter = flairId ? { flairId } : {};
  // Community-privacy is already gated at the page level by canViewContent
  // (src/app/c/[slug]/page.tsx) — this only needs the block exclusion that
  // canViewContent doesn't cover, plus tier gating (see getTierGatingCondition's
  // own comment: not community-scoped, so this page needs it too even
  // though it skips the rest of getPostVisibilityConditions).
  const blockedIds = viewerId ? await getBlockedEitherWayUserIds(viewerId) : [];
  const tierGating = await getTierGatingCondition(viewerId);
  const postInclude = buildPostInclude(blockedIds);
  const authorBlockFilter = { authorId: { notIn: blockedIds } };

  const pinned =
    cursor === null
      ? await db.post.findMany({
          where: {
            communityId,
            deletedAt: null,
            replyToId: null,
            pinnedAt: { not: null },
            ...flairFilter,
            ...authorBlockFilter,
            AND: [tierGating],
          },
          orderBy: [{ pinnedAt: "desc" }, { id: "desc" }],
          include: postInclude,
        })
      : [];

  const rows = await db.post.findMany({
    where: {
      communityId,
      deletedAt: null,
      replyToId: null,
      pinnedAt: null,
      ...flairFilter,
      ...authorBlockFilter,
      AND: [tierGating, cursorWhere(cursor)],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: postInclude,
  });
  const { items, nextCursor } = paginate(rows);

  return { pinned, items, nextCursor };
}
