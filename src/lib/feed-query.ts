import "server-only";
import { db } from "@/lib/db";
import { cursorWhere, paginate, POST_PAGE_SIZE, type PostCursor } from "@/lib/pagination";

// Exported so src/lib/community-feed.ts can build the identical post shape
// for the community feed rather than duplicating these — one post
// rendering contract (src/components/PostCard.tsx) across every surface.
export const authorInclude = { profile: true, username: true } as const;
export const mediaInclude = { orderBy: { position: "asc" as const } };
// phase-3 spec §7.1: community posts aren't excluded from Home/Explore (no
// separate code path) — this include just lets PostCard render an "in
// [community]" byline wherever the post shows up, not only on the
// community's own feed.
export const communityInclude = { select: { name: true, slug: true } } as const;
// phase-3 spec §6: lets PostCard render the flair pill wherever the post
// shows up, same "present on every surface" reasoning as communityInclude.
export const flairInclude = { select: { id: true, label: true, color: true } } as const;
// phase-4 spec §5: lets PostCard show the business's name/logo as the
// visible author instead of the human's, same "present on every surface"
// reasoning as communityInclude/flairInclude above.
export const businessAuthorInclude = { select: { id: true, name: true, slug: true, logoUrl: true } } as const;
// phase-3 spec §8.1: polls aren't community-exclusive, so this rides along
// on every feed query, not just the community one — a per-option vote
// count via _count, results always visible (spec: no "hide until you vote"
// gating).
export const pollInclude = {
  include: { options: { orderBy: { position: "asc" as const }, include: { _count: { select: { votes: true } } } } },
} as const;

// Shared by every page that renders posts-with-polls (/feed, /explore, the
// community feed) — one query for "which of these posts' poll options has
// this viewer already voted for," instead of duplicating it per page. No
// query at all (and no wasted round-trip) on a page with no polls in its
// current post batch.
export async function getVotedPollOptionIds(
  userId: string | undefined,
  posts: { poll?: { options: { id: string }[] } | null }[]
): Promise<Set<string>> {
  if (!userId) return new Set();
  const optionIds = posts.flatMap((p) => p.poll?.options.map((o) => o.id) ?? []);
  if (optionIds.length === 0) return new Set();

  const rows = await db.pollVote.findMany({
    where: { userId, pollOptionId: { in: optionIds } },
    select: { pollOptionId: true },
  });
  return new Set(rows.map((r) => r.pollOptionId));
}

// Shared by /feed (Home, filtered to the follow graph) and /explore (the
// old Phase 1 global-chronological behavior, unfiltered) — see phase-2
// spec §6.1. Only top-level posts are listed here — replies render inline
// under their parent (phase-1 spec §5.3), handled by PostCard itself.
export async function getFeedPosts({
  authorFilter,
  cursor,
}: {
  authorFilter?: { authorId: { in: string[] } };
  cursor: PostCursor | null;
}) {
  const rows = await db.post.findMany({
    where: {
      deletedAt: null,
      replyToId: null,
      ...authorFilter,
      ...cursorWhere(cursor),
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
      repostOf: { include: { author: { include: authorInclude }, media: mediaInclude } },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { author: { include: authorInclude }, media: mediaInclude },
      },
    },
  });
  return paginate(rows);
}
