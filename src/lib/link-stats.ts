import "server-only";
import { db } from "@/lib/db";

export type LinkStats = {
  total: number;
  last7d: number;
  last30d: number;
  topReferrers: { host: string; count: number }[];
};

export async function getLinkStats(linkId: string): Promise<LinkStats> {
  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [total, last7d, last30d, referrerGroups] = await Promise.all([
    db.linkClick.count({ where: { linkId } }),
    db.linkClick.count({ where: { linkId, occurredAt: { gte: since7d } } }),
    db.linkClick.count({ where: { linkId, occurredAt: { gte: since30d } } }),
    db.linkClick.groupBy({
      by: ["referrerHost"],
      where: { linkId, referrerHost: { not: null } },
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
