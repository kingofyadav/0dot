import "server-only";
import { db } from "@/lib/db";
import { getAIProvider, cosineSimilarity } from "@/lib/ai-provider";
import { logAIGeneration } from "@/lib/ai-generation";

// phase-2 spec §3.3 — originally a placeholder heuristic "to revisit when
// there's enough interaction data for the phase-11 AI recommendation
// system to take over" (that spec's own words). Phase-11 §7.2 resolves it
// not by replacing this heuristic but by blending a learned similarity
// signal into it — mutual follows still weigh highest, verified/active
// stay as before, and bio-similarity is one more additive term, same
// "re-ranking signal that supplements the existing tie-break" framing
// §7.2 applies to every other ranking surface in that phase. App-layer
// scoring after a couple of targeted queries, same posture as
// search/page.tsx's rankUsers — SQLite has no clean way to express this as
// a single weighted-scoring query.

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
  const eligible = candidates.filter((u) => u.username && u.profile);

  // phase-11 §7.2: bio-similarity to the viewer's own bio as a learned
  // similarity stand-in — see ai-provider.ts's embed() for why this is a
  // deterministic hash embedding rather than a real learned model, and why
  // that's fine here (every score is a supplementary nudge, none of them
  // gate visibility the way, say, a moderation confidence threshold would).
  const viewerProfile = await db.profile.findUnique({ where: { userId: viewerId }, select: { bio: true } });
  const provider = getAIProvider();
  const viewerVector = provider.embed(viewerProfile?.bio ?? "");
  const similarity = new Map<string, number>();
  for (const u of eligible) {
    similarity.set(u.id, cosineSimilarity(viewerVector, provider.embed(u.profile!.bio)));
  }

  const scored = eligible
    .map((u) => ({
      user: u,
      score:
        (mutualCounts.get(u.id) ?? 0) * 3 + // mutual-follow — highest weight
        (u.profile!.isVerified ? 2 : 0) + // verified — moderate weight
        (activeIds.has(u.id) ? 1 : 0) + // recently active — small weight
        (similarity.get(u.id) ?? 0) * 1.5, // learned similarity — additive, doesn't override the above
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  await logAIGeneration({
    feature: "recommendation",
    requestedById: viewerId,
    subjectType: "user",
    subjectId: viewerId,
    modelName: provider.modelName,
    input: { candidateCount: eligible.length },
    output: { suggestedUserIds: scored.map((s) => s.user.id) },
    costTokens: eligible.length,
  });

  return scored.map((s) => s.user);
}

// Anonymous-visitor variant of the rail's "Suggested for you" — no viewerId
// to score mutual-follows or bio-similarity against, so this is just the
// same "recently active" pool from above, ranked by verified-first. Good
// enough for a logged-out visitor who has no graph yet; they get the real
// personalized ranking once they sign up.
export async function getPublicSuggestedUsers(limit: number) {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const candidates = await db.user.findMany({
    where: { profile: { isNot: null }, username: { isNot: null }, posts: { some: { createdAt: { gte: since7d }, deletedAt: null } } },
    include: { username: true, profile: true },
    take: SUGGESTION_POOL_SIZE,
  });
  const eligible = candidates.filter((u) => u.username && u.profile);

  return eligible
    .map((u) => ({ user: u, score: u.profile!.isVerified ? 1 : 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.user);
}
