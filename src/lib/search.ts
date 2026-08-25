import "server-only";
import { db } from "@/lib/db";

// Extracted from src/app/search/page.tsx (mobile pro-upgrade addendum,
// sub-phase M13) so GET /api/v1/search can call the exact same query/rank
// logic the web search page uses, rather than a second copy that could
// drift — same "shared infra, built once" posture M3's recordMessageAndNotify
// extraction and M12's blockUserById/unblockUserById extraction already
// established for other cross-surface reuse. Comments on each function's
// ranking rationale are preserved from the original.

// phase-3 spec §16: exact slug match first, then name match, tie-broken by
// memberCount — mirrors rankUsers' exact-then-fuzzy-then-tiebreak pattern
// rather than inventing a different ranking philosophy for a second entity
// type.
function rankCommunities<T extends { slug: string; memberCount: number }>(rows: T[], query: string): T[] {
  const lowerQ = query.toLowerCase();
  return rows.slice().sort((a, b) => {
    const rank = (row: T) => (row.slug === lowerQ ? 0 : 1);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return b.memberCount - a.memberCount;
  });
}

// phase-3 spec §16: resolves Phase 1's empty "communities" search tab.
// Only ever selects Community's own columns (name/slug/memberCount) — never
// joins into posts/wiki/chat — so a private community's *content* can't
// leak through this query even accidentally; its existence being
// searchable at all is per §3.1 ("still discoverable by name/slug").
export async function searchCommunities(q: string) {
  const rows = await db.community.findMany({
    where: {
      OR: [{ slug: { contains: q.toLowerCase() } }, { name: { contains: q } }],
    },
    take: 20,
  });
  return rankCommunities(rows, q);
}

// build plan step 10 / spec §14: exact slug/name match first, then category
// match, tie-broken by isVerified then averageRating — same exact-then-
// fuzzy-then-tiebreak shape rankUsers/rankCommunities already established.
function rankBusinesses<
  T extends { slug: string; name: string; category: string; isVerified: boolean; averageRating: number }
>(rows: T[], query: string): T[] {
  const lowerQ = query.toLowerCase();
  return rows.slice().sort((a, b) => {
    const rank = (row: T) => {
      if (row.slug === lowerQ || row.name.toLowerCase() === lowerQ) return 0;
      if (row.category.toLowerCase() === lowerQ) return 1;
      return 2;
    };
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    const verifiedDiff = Number(!a.isVerified) - Number(!b.isVerified);
    if (verifiedDiff !== 0) return verifiedDiff;
    return b.averageRating - a.averageRating;
  });
}

// build plan step 10 / spec §14: resolves Phase 1's other stubbed search
// tab (§6.1 of that spec — "communities" and "businesses" both
// present-but-empty; Phase 3 filled communities, this closes the pair).
// status != "active" is excluded from the WHERE clause itself, not just
// ranked lower — a pending/unclaimed business (§3.3) can't appear in
// search at all, by construction rather than tie-break order.
export async function searchBusinesses(q: string) {
  const rows = await db.business.findMany({
    where: {
      status: "active",
      OR: [
        { slug: { contains: q.toLowerCase() } },
        { name: { contains: q } },
        { category: { contains: q.toLowerCase() } },
      ],
    },
    take: 20,
  });
  return rankBusinesses(rows, q);
}

// spec §9.1: the one deliberate ranking exception — every other rank*
// function above tie-breaks on engagement or recency, but "which matching
// event is most popular" isn't the operative question for events; "which
// can I still attend" is. Exact/fuzzy title match first (consistent with
// every other tab), tie-broken by soonest startsAt instead.
function rankEvents<T extends { title: string; startsAt: Date }>(rows: T[], query: string): T[] {
  const lowerQ = query.toLowerCase();
  return rows.slice().sort((a, b) => {
    const rank = (row: T) => (row.title.toLowerCase() === lowerQ ? 0 : 1);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.startsAt.getTime() - b.startsAt.getTime();
  });
}

// spec §9: only `published` events, split by an explicit Upcoming/Past
// filter rather than blended into one chronologically-confusing list
// (§9.1). §9.2's attendee-privacy acceptance criterion is met by
// construction here — this query never selects EventRSVP/Ticket rows at
// all, so a host_only attendee list has nothing to leak through a search
// result regardless of ranking.
export async function searchEvents(q: string, when: "upcoming" | "past") {
  const now = new Date();
  const timeFilter =
    when === "upcoming"
      ? { OR: [{ endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: now } }] }
      : { OR: [{ endsAt: { lt: now } }, { endsAt: null, startsAt: { lt: now } }] };

  const rows = await db.event.findMany({
    where: {
      status: "published",
      AND: [{ OR: [{ title: { contains: q } }, { description: { contains: q } }] }, timeFilter],
    },
    select: { id: true, slug: true, title: true, startsAt: true },
    take: 20,
  });
  return rankEvents(rows, q);
}
