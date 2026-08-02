import "server-only";
import { db } from "@/lib/db";

// Bulk sibling of blocks.ts's isBlockedEitherWay — one query pair per feed
// render instead of one isBlockedEitherWay() call per candidate post.
export async function getBlockedEitherWayUserIds(viewerId: string): Promise<string[]> {
  const [blockedByViewer, blockedViewer] = await Promise.all([
    db.block.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } }),
    db.block.findMany({ where: { blockedId: viewerId }, select: { blockerId: true } }),
  ]);
  const ids = new Set<string>();
  for (const row of blockedByViewer) ids.add(row.blockedId);
  for (const row of blockedViewer) ids.add(row.blockerId);
  return [...ids];
}

// Shared visibility gate for every surface that lists posts outside a
// single already-gated context (a community's own page already checks
// canViewContent itself): Home, Explore, Trending, and a public profile's
// post list. Returns independent where-fragments meant to be spread into an
// `AND` array — never merged into the same object as cursorWhere's own
// top-level `OR`, which would silently overwrite it.
export async function getPostVisibilityConditions(viewerId: string | null, precomputedBlockedIds?: string[]) {
  const blockedIds = precomputedBlockedIds ?? (viewerId ? await getBlockedEitherWayUserIds(viewerId) : []);

  const communityPrivacy = {
    OR: [
      { communityId: null },
      { community: { is: { visibility: { not: "private" } } } },
      ...(viewerId
        ? [{ community: { is: { members: { some: { userId: viewerId, status: { in: ["active", "muted"] } } } } } }]
        : []),
    ],
  };

  const blockExclusion = { authorId: { notIn: blockedIds } };

  const pendingBusinessExclusion = {
    OR: [{ businessAuthorId: null }, { businessAuthor: { is: { status: { not: "pending" } } } }],
  };

  const repostVisibility = {
    OR: [
      { repostOfId: null },
      { repostOf: { is: { AND: [communityPrivacy, blockExclusion, pendingBusinessExclusion] } } },
    ],
  };

  return [communityPrivacy, blockExclusion, pendingBusinessExclusion, repostVisibility];
}
