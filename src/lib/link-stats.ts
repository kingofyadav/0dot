import "server-only";
import { db } from "@/lib/db";

export type LinkStats = {
  total: number;
  last7d: number;
  last30d: number;
  topReferrers: { host: string; count: number }[];
};

// premium-profiles addendum §3.3: click events are always logged and kept
// indefinitely at the storage layer regardless of tier (cheap, privacy-safe
// per phase-1 spec §4.3) — this perk changes what's *queryable*, not what's
// *retained*. windowDays gates the query: null (premium) reaches full
// history, a number (free tier, FREE_ANALYTICS_WINDOW_DAYS in
// platform-billing.ts) bounds every figure below including "total" and
// topReferrers, not just the labeled 30-day figure — a user who upgrades
// later immediately sees complete historical analytics, since nothing was
// ever dropped, only unqueryable.
export async function getLinkStats(linkId: string, windowDays: number | null = null): Promise<LinkStats> {
  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const windowFloor = windowDays !== null ? new Date(now - windowDays * 24 * 60 * 60 * 1000) : null;
  const totalWhere = windowFloor ? { linkId, occurredAt: { gte: windowFloor } } : { linkId };

  const [total, last7d, last30d, referrerGroups] = await Promise.all([
    db.linkClick.count({ where: totalWhere }),
    db.linkClick.count({ where: { linkId, occurredAt: { gte: since7d } } }),
    db.linkClick.count({ where: { linkId, occurredAt: { gte: since30d } } }),
    db.linkClick.groupBy({
      by: ["referrerHost"],
      where: { ...totalWhere, referrerHost: { not: null } },
      _count: { referrerHost: true },
      orderBy: { _count: { referrerHost: "desc" } },
      take: 3,
    }),
  ]);

  return {
    total,
    last7d,
    last30d,
    topReferrers: referrerGroups.map((g) => ({
      host: g.referrerHost as string,
      count: g._count.referrerHost,
    })),
  };
}
