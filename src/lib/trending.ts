import "server-only";
import { db } from "@/lib/db";
import { POST_PAGE_SIZE } from "@/lib/pagination";
import { getBlockedEitherWayUserIds, getPostVisibilityConditions } from "@/lib/post-visibility";
import { cached } from "@/lib/cache/redis-cache";

// phase-2 spec §6.2: velocity, not lifetime popularity or plain recency —
// an old post with many likes accumulated slowly must not outrank a new
// post accelerating fast. Tunable knobs, not fixed by the spec.
const RECOMPUTE_INTERVAL_MS = 5 * 60 * 1000; // "every few minutes" per spec
// "recent" lookback for the numerator — widened from 6h to 24h (live-site
// QA pass, 2026-08-25): at 6h, engagement on a lower-traffic install
// routinely aged out of the window between visits, leaving /trending
// showing "No posts yet." even with liked/replied-to posts on the page.
// 24h keeps the velocity framing (rate = engagement / min(age, window), see
// recomputeTrendingScores below) while giving a realistic install enough
// lookback to actually surface something.
const ENGAGEMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ENGAGEMENT_WINDOW_HOURS = ENGAGEMENT_WINDOW_MS / (60 * 60 * 1000);
const MIN_AGE_HOURS_FLOOR = 1 / 6; // 10 min — stops one early like on a brand-new post from spiking
const LIKE_WEIGHT = 1;
const REPLY_WEIGHT = 2;
const REPOST_WEIGHT = 2;
const CANDIDATE_LIMIT = 1000; // write-volume safety valve, not a product limit

// Module-scope, single-process, no timers — same posture as
// src/lib/rate-limit.ts (deliberate; see that file's comment). Resets on
// restart, doesn't coordinate across multiple instances; revisit with a
// shared store before running more than one instance. The in-flight guard
// (claim lastRecomputedAt *before* awaiting) exists so N requests that all
// cross the staleness threshold at once await one shared recompute instead
// of each triggering their own.
let lastRecomputedAt = 0;
let recomputing: Promise<void> | null = null;

export async function ensureTrendingScoresFresh(): Promise<void> {
  const now = Date.now();
  if (now - lastRecomputedAt < RECOMPUTE_INTERVAL_MS) return;
  if (recomputing) {
    await recomputing;
    return;
  }
  lastRecomputedAt = now;
  recomputing = recomputeTrendingScores(now).finally(() => {
    recomputing = null;
  });
  await recomputing;
}

// Real scheduled trigger — instrumentation.ts (project root) calls this
// once at server startup. Runs in-process (this app is a single long-lived
// `next start` Node process, not serverless — see instrumentation.ts's own
// comment), so a plain setInterval is the right-sized tool: no external
// cron, no new dependency. globalThis-guarded the same way
// message-events.ts guards its subscriber map, so dev-mode module
// re-evaluation can't register a second interval.
//
// ensureTrendingScoresFresh() above stays exactly as it was: with this
// scheduler running, its staleness check almost always short-circuits
// instantly, turning trending/page.tsx's call into a cheap safety net
// rather than the primary (synchronous, per-request) trigger it used to be.
const globalForTrending = globalThis as unknown as { trendingSchedulerStarted?: boolean };

export function startTrendingScheduler(): void {
  if (globalForTrending.trendingSchedulerStarted) return;
  globalForTrending.trendingSchedulerStarted = true;

  const tick = () => void ensureTrendingScoresFresh();
  tick();
  setInterval(tick, RECOMPUTE_INTERVAL_MS);
}

// Cron entry point (web-pro-upgrade addendum M1): on Vercel the schedulers
// above don't run — a platform cron hits /api/cron/frequent instead. This
// bypasses ensureTrendingScoresFresh's in-process staleness throttle
// deliberately: cron owns the cadence, and module-level `lastRecomputedAt`
// is meaningless across separate serverless invocations anyway.
export async function runTrendingRecomputeOnce(): Promise<void> {
  await recomputeTrendingScores(Date.now());
}

async function recomputeTrendingScores(now: number): Promise<void> {
  const windowStart = new Date(now - ENGAGEMENT_WINDOW_MS);

  // Candidate set is derived from where recent engagement actually
  // happened, not "posts created in the last N days" — that would wrongly
  // exclude an old post that goes viral today. Bookmarks are deliberately
  // excluded (private, never a public signal — phase-1 spec §5.3).
  const [likeGroups, replyGroups, repostGroups] = await Promise.all([
    db.postLike.groupBy({
      by: ["postId"],
      where: { createdAt: { gte: windowStart } },
      _count: { postId: true },
    }),
    db.post.groupBy({
      by: ["replyToId"],
      where: { replyToId: { not: null }, createdAt: { gte: windowStart }, deletedAt: null },
      _count: { replyToId: true },
    }),
    db.post.groupBy({
      by: ["repostOfId"],
      where: { repostOfId: { not: null }, createdAt: { gte: windowStart }, deletedAt: null },
      _count: { repostOfId: true },
    }),
  ]);

  const engagementByPost = new Map<string, number>();
  const addEngagement = (postId: string | null, weight: number, count: number) => {
    if (!postId) return;
    engagementByPost.set(postId, (engagementByPost.get(postId) ?? 0) + weight * count);
  };
  for (const g of likeGroups) addEngagement(g.postId, LIKE_WEIGHT, g._count.postId);
  for (const g of replyGroups) addEngagement(g.replyToId, REPLY_WEIGHT, g._count.replyToId);
  for (const g of repostGroups) addEngagement(g.repostOfId, REPOST_WEIGHT, g._count.repostOfId);

  const rankedCandidateIds = [...engagementByPost.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CANDIDATE_LIMIT)
    .map(([id]) => id);

  // Replies must never become standalone trending candidates — /feed and
  // /explore both already treat replies as inline-only under their
  // parent, never a standalone card (see src/lib/feed-query.ts's
  // replyToId: null). A liked reply can appear in engagementByPost via
  // the PostLike groupBy above; filtering replyToId: null here means it
  // simply never gets written a nonzero score.
  const candidatePosts =
    rankedCandidateIds.length > 0
      ? await db.post.findMany({
          where: { id: { in: rankedCandidateIds }, deletedAt: null, replyToId: null },
          select: { id: true, createdAt: true },
        })
      : [];

  const scored = candidatePosts.map((post) => {
    const weightedEngagement = engagementByPost.get(post.id) ?? 0;
    const hoursSinceCreated = (now - post.createdAt.getTime()) / (60 * 60 * 1000);
    // The window-capped denominator IS the decay: a post older than the
    // window always divides by the full window (pure recent rate); a
    // young post divides by its actual age, rewarding fast accumulation.
    const denomHours = Math.min(
      Math.max(hoursSinceCreated, MIN_AGE_HOURS_FLOOR),
      ENGAGEMENT_WINDOW_HOURS
    );
    return { id: post.id, trendingScore: weightedEngagement / denomHours };
  });

  const keptIds = scored.map((s) => s.id);
  await db.$transaction([
    // A post that WAS trending but fell out of this pass's candidate map
    // (its engagement aged out of the window) must be reset to 0, not
    // left with a stale score forever. notIn: [] (no candidates this
    // pass) correctly means "reset everything currently nonzero."
    db.post.updateMany({
      where: { trendingScore: { not: 0 }, id: { notIn: keptIds } },
      data: { trendingScore: 0 },
    }),
    ...scored.map((s) => db.post.update({ where: { id: s.id }, data: { trendingScore: s.trendingScore } })),
  ]);
}

// Small local sibling of src/lib/pagination.ts's cursor helpers, not a
// generalization of them — trendingScore is the primary sort key here
// (unlike followers/following, which only remap the tiebreaker while
// createdAt stays primary), and pagination.ts's encodeCursor() hardcodes
// a createdAt-based cursor string with no clean way to relabel around
// that. Pagination is non-monotonic between recomputes (a page loaded
// mid-drift can rarely skip or repeat at the boundary) — same class of
// imprecision every cached-ranking feed (HN, Reddit "hot") has, not worth
// solving with snapshotting.
type TrendingCursor = { score: number; id: string };

export function parseTrendingCursor(raw: string | undefined): TrendingCursor | null {
  if (!raw) return null;
  const sepIndex = raw.lastIndexOf("~");
  if (sepIndex === -1) return null;
  const score = Number(raw.slice(0, sepIndex));
  const id = raw.slice(sepIndex + 1);
  if (Number.isNaN(score) || !id) return null;
  return { score, id };
}

function encodeTrendingCursor(post: { trendingScore: number; id: string }): string {
  return `${post.trendingScore}~${post.id}`;
}

function trendingCursorWhere(cursor: TrendingCursor | null) {
  if (!cursor) return {};
  return {
    OR: [
      { trendingScore: { lt: cursor.score } },
      { trendingScore: cursor.score, id: { lt: cursor.id } },
    ],
  };
}

function paginateTrending<T extends { trendingScore: number; id: string }>(
  rows: T[]
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > POST_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, POST_PAGE_SIZE) : rows;
  const nextCursor = hasMore ? encodeTrendingCursor(items[items.length - 1]) : null;
  return { items, nextCursor };
}

const authorInclude = { profile: true, username: true } as const;
const mediaInclude = { orderBy: { position: "asc" as const } };

// Mirrors getFeedPosts (src/lib/feed-query.ts)'s query/include shape —
// same author/media/repostOf/replies includes, deletedAt/replyToId
// filters — but ordered by trendingScore instead of createdAt, and only
// ever includes posts with a nonzero score: an untouched post has no
// business appearing in "trending," and without this filter pagination
// would eventually drift into an arbitrary, meaningless tie-break order
// across the entire zero-score long tail.
export async function getTrendingPosts({
  cursor,
  viewerId,
}: {
  cursor: TrendingCursor | null;
  viewerId: string | null;
}) {
  // Anonymous viewers all see the identical, content-only visibility filter
  // (getPostVisibilityConditions with no viewerId/blockedIds) — safe to
  // share one cached result across every logged-out request. A signed-in
  // viewer's result depends on their own blocks/community-membership/tier
  // state (post-visibility.ts), so it is never cached here. Scores only
  // change every RECOMPUTE_INTERVAL_MS anyway, so this TTL trails that by
  // design rather than adding staleness of its own.
  if (viewerId === null) {
    return cached(`trending:${cursor ? `${cursor.score}:${cursor.id}` : "first"}`, 90, () =>
      fetchTrendingPosts({ cursor, viewerId })
    );
  }
  return fetchTrendingPosts({ cursor, viewerId });
}

async function fetchTrendingPosts({
  cursor,
  viewerId,
}: {
  cursor: TrendingCursor | null;
  viewerId: string | null;
}) {
  const blockedIds = viewerId ? await getBlockedEitherWayUserIds(viewerId) : [];
  const visibilityConditions = await getPostVisibilityConditions(viewerId, blockedIds);

  const rows = await db.post.findMany({
    where: {
      deletedAt: null,
      replyToId: null,
      trendingScore: { gt: 0 },
      AND: [...visibilityConditions, trendingCursorWhere(cursor)],
    },
    orderBy: [{ trendingScore: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: {
      author: { include: authorInclude },
      media: mediaInclude,
      repostOf: { include: { author: { include: authorInclude }, media: mediaInclude } },
      replies: {
        where: { deletedAt: null, authorId: { notIn: blockedIds } },
        orderBy: { createdAt: "asc" },
        include: { author: { include: authorInclude }, media: mediaInclude },
      },
    },
  });
  return paginateTrending(rows);
}
