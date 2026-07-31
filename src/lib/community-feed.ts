import "server-only";
import { db } from "@/lib/db";
import { cursorWhere, paginate, POST_PAGE_SIZE, type PostCursor } from "@/lib/pagination";
import {
  authorInclude,
  mediaInclude,
  communityInclude,
  flairInclude,
  businessAuthorInclude,
  pollInclude,
} from "@/lib/feed-query";

const postInclude = {
  author: { include: authorInclude },
  media: mediaInclude,
  community: communityInclude,
  flair: flairInclude,
  businessAuthor: businessAuthorInclude,
  poll: pollInclude,
  repostOf: { include: { author: { include: authorInclude }, media: mediaInclude } },
  replies: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" as const },
    include: { author: { include: authorInclude }, media: mediaInclude },
  },
} as const;

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
}: {
  communityId: string;
  cursor: PostCursor | null;
  // phase-3 spec §6: flair "used to filter the community's own feed" —
  // pinned posts are filtered by it too, same as the chronological list,
  // so a pinned post with a different flair doesn't leak into a filtered view.
  flairId?: string | null;
}) {
  const flairFilter = flairId ? { flairId } : {};

  const pinned =
    cursor === null
      ? await db.post.findMany({
          where: { communityId, deletedAt: null, replyToId: null, pinnedAt: { not: null }, ...flairFilter },
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
      ...cursorWhere(cursor),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: postInclude,
  });
  const { items, nextCursor } = paginate(rows);

  return { pinned, items, nextCursor };
}
