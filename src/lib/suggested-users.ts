import "server-only";
import { db } from "@/lib/db";

// phase-2 spec §3.3 — a simple weighted heuristic computed on read, not a
// precomputed/ML recommendation (that's Phase 11 territory). Mutual
// follows weigh highest, verified accounts moderate, recently-active
// accounts a small nudge. App-layer scoring after a couple of targeted
// queries, same posture as search/page.tsx's rankUsers — SQLite has no
// clean way to express this as a single weighted-scoring query.

const SUGGESTION_POOL_SIZE = 50; // candidates considered before scoring/limiting

export async function getSuggestedUsers(viewerId: string, limit: number) {
  const [followingRows, blockedRows, blockedByRows] = await Promise.all([
    db.follow.findMany({ where: { followerId: viewerId }, select: { followeeId: true } }),
    db.block.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } }),
    db.block.findMany({ where: { blockedId: viewerId }, select: { blockerId: true } }),
  ]);
  const followingIds = followingRows.map((f) => f.followeeId);
  const excludeIds = new Set([
    viewerId,
    ...followingIds,
    ...blockedRows.map((b) => b.blockedId),
    ...blockedByRows.map((b) => b.blockerId),
  ]);

  // Mutual-follow weight: how many accounts the viewer already follows
  // also follow a given candidate.
  const mutualRows =
    followingIds.length > 0
      ? await db.follow.findMany({
          where: { followerId: { in: followingIds }, followeeId: { notIn: [...excludeIds] } },
          select: { followeeId: true },
        })
      : [];
  const mutualCounts = new Map<string, number>();
  for (const row of mutualRows) {
    mutualCounts.set(row.followeeId, (mutualCounts.get(row.followeeId) ?? 0) + 1);
  }

  // Broader pool so there's always something to suggest even with a thin
  // follow graph (new accounts, sparse network): recently-active accounts,
  // capped at a fixed pool size before scoring.
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const activeCandidates = await db.user.findMany({
    where: {
      id: { notIn: [...excludeIds, ...mutualCounts.keys()] },
      profile: { isNot: null },
      posts: { some: { createdAt: { gte: since7d }, deletedAt: null } },
    },
    select: { id: true },
    take: SUGGESTION_POOL_SIZE,
  });
  const activeIds = new Set(activeCandidates.map((u) => u.id));

  const candidateIds = [...mutualCounts.keys(), ...activeIds];
  if (candidateIds.length === 0) return [];

  const candidates = await db.user.findMany({
    where: { id: { in: candidateIds } },
    include: { username: true, profile: true },
  });

  return candidates
    .filter((u) => u.username && u.profile)
    .map((u) => ({
      user: u,
      score:
        (mutualCounts.get(u.id) ?? 0) * 3 + // mutual-follow — highest weight
        (u.profile!.isVerified ? 2 : 0) + // verified — moderate weight
        (activeIds.has(u.id) ? 1 : 0), // recently active — small weight
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.user);
}
