import "server-only";
import { db } from "@/lib/db";

// phase-3 spec §14: owner/moderator-facing, mirroring Phase 1's link-
// analytics pattern (denormalized counts for fast display where they
// already exist, e.g. Post.likeCount; an append-only log — see
// CommunityMembershipEvent's schema comment — only where current state
// genuinely can't answer the question; no per-visitor identification
// retained anywhere here). Day-bucketing is done in JS over a windowed
// fetch rather than a raw SQL date-trunc — this app's scale doesn't need
// it, consistent with avoiding raw queries elsewhere in this codebase.

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, UTC — good enough for an owner-facing chart, not a legal timestamp
}

function emptyDayBuckets(days: number, now: number): Map<string, { joins: number; leaves: number }> {
  const buckets = new Map<string, { joins: number; leaves: number }>();
  for (let i = 0; i < days; i++) {
    buckets.set(dayKey(new Date(now - i * DAY_MS)), { joins: 0, leaves: 0 });
  }
  return buckets;
}

export async function getMemberGrowth(communityId: string, days = 30) {
  const now = Date.now();
  const windowStart = new Date(now - days * DAY_MS);

  const events = await db.communityMembershipEvent.findMany({
    where: { communityId, createdAt: { gte: windowStart } },
    select: { type: true, createdAt: true },
  });

  const buckets = emptyDayBuckets(days, now);
  for (const event of events) {
    const bucket = buckets.get(dayKey(event.createdAt));
    if (!bucket) continue; // outside the requested window's day granularity, ignore
    if (event.type === "join") bucket.joins += 1;
    else bucket.leaves += 1;
  }

  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, counts]) => ({ date, ...counts }));
}

export async function getPostVolume(communityId: string, days = 30) {
  const now = Date.now();
  const windowStart = new Date(now - days * DAY_MS);

  const communityPostIds = await db.post.findMany({ where: { communityId }, select: { id: true } });
  const idList = communityPostIds.map((p) => p.id);

  const [posts, comments] = await Promise.all([
    db.post.findMany({
      where: { communityId, replyToId: null, deletedAt: null, createdAt: { gte: windowStart } },
      select: { createdAt: true },
    }),
    // A reply's own communityId is never set (replies aren't community-
    // scoped independently of their parent — see posts.ts's createPost
    // comment), so "comments in this community" means replies to any of
    // this community's own posts, not replyToId's own communityId.
    idList.length > 0
      ? db.post.findMany({
          where: { replyToId: { in: idList }, deletedAt: null, createdAt: { gte: windowStart } },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const buckets = new Map<string, { posts: number; comments: number }>();
  for (let i = 0; i < days; i++) buckets.set(dayKey(new Date(now - i * DAY_MS)), { posts: 0, comments: 0 });
  for (const p of posts) {
    const bucket = buckets.get(dayKey(p.createdAt));
    if (bucket) bucket.posts += 1;
  }
  for (const c of comments) {
    const bucket = buckets.get(dayKey(c.createdAt));
    if (bucket) bucket.comments += 1;
  }

  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, counts]) => ({ date, ...counts }));
}

export async function getActiveMemberCount(communityId: string, days: number): Promise<number> {
  const windowStart = new Date(Date.now() - days * DAY_MS);

  // Dedup happens in the Set below, not via Prisma `distinct` — keeps this
  // independent of connector-specific DISTINCT-on-a-selected-column support.
  const [postAuthors, chatSenders] = await Promise.all([
    db.post.findMany({
      where: { communityId, createdAt: { gte: windowStart }, deletedAt: null },
      select: { authorId: true },
    }),
    db.communityChatMessage.findMany({
      where: { communityId, createdAt: { gte: windowStart }, deletedAt: null },
      select: { senderId: true },
    }),
  ]);

  const active = new Set<string>();
  for (const p of postAuthors) active.add(p.authorId);
  for (const c of chatSenders) active.add(c.senderId);
  return active.size;
}

const authorInclude = { profile: true, username: true } as const;

export async function getTopPosts(communityId: string, limit = 10) {
  // Bounded candidate set, re-sorted by total engagement in JS — SQLite via
  // Prisma can't ORDER BY a computed sum directly. Fine at this app's
  // scale (same posture as the rest of this file); revisit with a
  // denormalized "engagementScore" column if a community's post volume
  // ever makes this candidate fetch expensive.
  const candidates = await db.post.findMany({
    where: { communityId, replyToId: null, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      body: true,
      likeCount: true,
      replyCount: true,
      repostCount: true,
      createdAt: true,
      author: { include: authorInclude },
    },
  });

  return candidates
    .slice()
    .sort((a, b) => b.likeCount + b.replyCount + b.repostCount - (a.likeCount + a.replyCount + a.repostCount))
    .slice(0, limit);
}
