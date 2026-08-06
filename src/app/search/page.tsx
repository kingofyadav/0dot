import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getPostVisibilityConditions } from "@/lib/post-visibility";
import { businessCategoryLabel } from "@/lib/business-categories";
import { fetchAllMarketplaceCategories } from "@/lib/marketplace-browse";
import { semanticRerank } from "@/lib/ai-search";

type SearchTab = "users" | "posts" | "communities" | "businesses" | "projects" | "knowledge" | "events" | "marketplace";
const TABS: { key: SearchTab; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "posts", label: "Posts" },
  { key: "communities", label: "Communities" },
  { key: "businesses", label: "Businesses" },
  { key: "projects", label: "Projects" },
  { key: "knowledge", label: "Articles & Docs" },
  { key: "events", label: "Events" },
  { key: "marketplace", label: "Marketplace" },
];

function tabHref(q: string, tab: SearchTab) {
  return `/search?q=${encodeURIComponent(q)}&tab=${tab}`;
}

function eventWhenHref(q: string, when: "upcoming" | "past") {
  return `/search?q=${encodeURIComponent(q)}&tab=events&when=${when}`;
}

function rankUsers<
  T extends { handle: string; claimedAt: Date; user: { profile: { isVerified: boolean } | null } }
>(rows: T[], query: string): T[] {
  const lowerQ = query.toLowerCase();
  return rows.slice().sort((a, b) => {
    const rank = (row: T) => {
      if (row.handle === lowerQ) return 0;
      if (row.handle.startsWith(lowerQ)) return 1;
      return 2;
    };
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    const verifiedDiff = Number(!a.user.profile?.isVerified) - Number(!b.user.profile?.isVerified);
    if (verifiedDiff !== 0) return verifiedDiff;
    return a.claimedAt.getTime() - b.claimedAt.getTime();
  });
}

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

// phase-6 spec §10: exact title match first, then fuzzy title/summary
// match, tie-broken by like_count then recency — same exact-then-fuzzy-
// then-engagement shape rankUsers/rankCommunities/rankBusinesses already
// established, applied to a fifth entity type rather than inventing a
// different ranking philosophy for it.
function rankProjects<T extends { title: string; summary: string; likeCount: number; createdAt: Date }>(
  rows: T[],
  query: string
): T[] {
  const lowerQ = query.toLowerCase();
  return rows.slice().sort((a, b) => {
    const rank = (row: T) => (row.title.toLowerCase() === lowerQ ? 0 : 1);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    if (a.likeCount !== b.likeCount) return b.likeCount - a.likeCount;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

// spec §9.1: the one deliberate ranking exception in this file — every
// other rank* function above tie-breaks on engagement or recency, but "which
// matching event is most popular" isn't the operative question for events;
// "which can I still attend" is. Exact/fuzzy title match first (consistent
// with every other tab), tie-broken by soonest startsAt instead.
function rankEvents<T extends { title: string; startsAt: Date }>(rows: T[], query: string): T[] {
  const lowerQ = query.toLowerCase();
  return rows.slice().sort((a, b) => {
    const rank = (row: T) => (row.title.toLowerCase() === lowerQ ? 0 : 1);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.startsAt.getTime() - b.startsAt.getTime();
  });
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string; when?: string }>;
}) {
  const { q: rawQ, tab: rawTab, when: rawWhen } = await searchParams;
  const q = (rawQ ?? "").trim();
  const tab: SearchTab = (
    ["users", "posts", "communities", "businesses", "projects", "knowledge", "events", "marketplace"] as const
  ).includes(rawTab as SearchTab)
    ? (rawTab as SearchTab)
    : "users";
  const eventsWhen: "upcoming" | "past" = rawWhen === "past" ? "past" : "upcoming";

  let users: Awaited<ReturnType<typeof searchUsers>> = [];
  let posts: Awaited<ReturnType<typeof searchPosts>> = [];
  let communities: Awaited<ReturnType<typeof searchCommunities>> = [];
  let businesses: Awaited<ReturnType<typeof searchBusinesses>> = [];
  let projects: Awaited<ReturnType<typeof searchProjects>> = [];
  let knowledge: Awaited<ReturnType<typeof searchKnowledge>> = [];
  let events: Awaited<ReturnType<typeof searchEvents>> = [];
  let marketplace: Awaited<ReturnType<typeof fetchAllMarketplaceCategories>> = [];
  if (q.length > 0) {
    if (tab === "users") users = await searchUsers(q);
    if (tab === "posts") {
      const viewerId = (await getCurrentUser())?.id ?? null;
      posts = await searchPosts(q, viewerId);
    }
    if (tab === "communities") communities = await searchCommunities(q);
    if (tab === "businesses") businesses = await searchBusinesses(q);
    if (tab === "projects") projects = await searchProjects(q);
    if (tab === "knowledge") knowledge = await searchKnowledge(q, (await getCurrentUser())?.id ?? null);
    if (tab === "events") events = await searchEvents(q, eventsWhen);
    if (tab === "marketplace") marketplace = await fetchAllMarketplaceCategories(q);
  }

  return (
    <div className="profileCard">
      <form action="/search" method="GET" style={{ marginBottom: "1.25rem" }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search users or posts…"
          className="textInput"
          style={{ width: "100%" }}
          autoFocus
        />
      </form>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(q, t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`button ${tab === t.key ? "" : "buttonSecondary"}`}
            style={{ fontSize: "0.9rem", padding: "0.5rem 0.85rem" }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {q.length === 0 && <p className="mutedText">Search for people or posts.</p>}

      {q.length > 0 && tab === "users" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {users.length === 0 && <EmptyState message={`No users found for "${q}".`} />}
          {users.map((row) => (
            <Link key={row.id} href={`/${row.handle}`} className="profileLinkItem" style={{ fontWeight: 600 }}>
              {row.user.profile?.displayName ?? row.handle}
              {row.user.profile?.isVerified && (
                <span className="verifiedBadge" title="Verified" aria-label="Verified">
                  <BadgeCheck size={14} aria-hidden="true" />
                </span>
              )}
              <span className="mutedText" style={{ marginLeft: "0.5rem" }}>
                0dot.in/{row.handle}
              </span>
            </Link>
          ))}
        </div>
      )}

      {q.length > 0 && tab === "posts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {posts.length === 0 && <EmptyState message={`No posts found for "${q}".`} />}
          {posts.map((post) => (
            <Link
              key={post.id}
              href={post.author.username ? `/${post.author.username.handle}` : "#"}
              className="profileLinkItem"
              style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}
            >
              <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                {post.author.profile?.displayName ?? "Unknown"}
                {post.author.profile?.isVerified && (
                  <span className="verifiedBadge" title="Verified" aria-label="Verified">
                    <BadgeCheck size={14} aria-hidden="true" />
                  </span>
                )}
                {post.author.username ? ` · 0dot.in/${post.author.username.handle}` : ""}
              </span>
              <span>{post.body}</span>
            </Link>
          ))}
        </div>
      )}

      {q.length > 0 && tab === "communities" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {communities.length === 0 && <EmptyState message={`No communities found for "${q}".`} />}
          {communities.map((community) => (
            <Link
              key={community.id}
              href={`/c/${community.slug}`}
              className="profileLinkItem"
              style={{ fontWeight: 600 }}
            >
              {community.name}
              <span className="mutedText" style={{ marginLeft: "0.5rem" }}>
                /c/{community.slug} · {community.memberCount} member{community.memberCount === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      )}

      {q.length > 0 && tab === "businesses" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {businesses.length === 0 && <EmptyState message={`No businesses found for "${q}".`} />}
          {businesses.map((business) => (
            <Link key={business.id} href={`/b/${business.slug}`} className="profileLinkItem" style={{ fontWeight: 600 }}>
              {business.name}
              {business.isVerified && (
                <span className="verifiedBadge" title="Verified" aria-label="Verified">
                  <BadgeCheck size={14} aria-hidden="true" />
                </span>
              )}
              <span className="mutedText" style={{ marginLeft: "0.5rem" }}>
                {businessCategoryLabel(business.category)}
                {business.reviewCount > 0 && ` · ★ ${business.averageRating.toFixed(1)} (${business.reviewCount})`}
              </span>
            </Link>
          ))}
        </div>
      )}
      {q.length > 0 && tab === "projects" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {projects.length === 0 && <EmptyState message={`No projects found for "${q}".`} />}
          {projects.map((project) => (
            <Link key={project.id} href={`/p/${project.slug}`} className="profileLinkItem" style={{ fontWeight: 600 }}>
              {project.title}
              <span className="mutedText" style={{ marginLeft: "0.5rem" }}>
                {project.summary}
                {project.likeCount > 0 && ` · ♥ ${project.likeCount}`}
              </span>
            </Link>
          ))}
        </div>
      )}
      {q.length > 0 && tab === "knowledge" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {knowledge.length === 0 && <EmptyState message={`No articles or docs found for "${q}".`} />}
          {knowledge.map((row) => (
            <Link key={`${row.type}-${row.id}`} href={row.href} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.15rem" }}>
              <span style={{ fontWeight: 600 }}>{row.title}</span>
              <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                {row.typeLabel}
                {row.subtitle && ` · ${row.subtitle}`}
              </span>
            </Link>
          ))}
        </div>
      )}
      {q.length > 0 && tab === "events" && (
        <div>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Link
              href={eventWhenHref(q, "upcoming")}
              aria-current={eventsWhen === "upcoming" ? "page" : undefined}
              className={`button buttonSmall ${eventsWhen === "upcoming" ? "" : "buttonSecondary"}`}
            >
              Upcoming
            </Link>
            <Link
              href={eventWhenHref(q, "past")}
              aria-current={eventsWhen === "past" ? "page" : undefined}
              className={`button buttonSmall ${eventsWhen === "past" ? "" : "buttonSecondary"}`}
            >
              Past
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {events.length === 0 && <EmptyState message={`No ${eventsWhen} events found for "${q}".`} />}
            {events.map((event) => (
              <Link key={event.id} href={`/e/${event.slug}`} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.15rem" }}>
                <span style={{ fontWeight: 600 }}>{event.title}</span>
                <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                  {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(event.startsAt)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {q.length > 0 && tab === "marketplace" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {marketplace.length === 0 && <EmptyState message={`No marketplace results found for "${q}".`} />}
          {marketplace.map((item) => (
            <Link
              key={`${item.category}-${item.id}`}
              href={item.href}
              className="profileLinkItem"
              style={{ flexDirection: "column", alignItems: "stretch", gap: "0.15rem" }}
            >
              <span style={{ fontWeight: 600 }}>{item.title}</span>
              <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                {item.categoryLabel} · {item.subtitle} · {item.priceLabel}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

async function searchUsers(q: string) {
  const rows = await db.username.findMany({
    where: {
      OR: [
        { handle: { contains: q.toLowerCase() } },
        { user: { profile: { displayName: { contains: q } } } },
      ],
    },
    include: { user: { include: { profile: true } } },
    take: 20,
  });
  return rankUsers(rows, q);
}

// phase-5 spec §4.3/§13.1: same tier-gating + block/community-privacy
// conditions every other post-listing surface (feed-query.ts,
// community-feed.ts, trending) applies — search was the one surface that
// queried Post directly and would otherwise leak a gated post's full body
// to anyone who searches its text, bypassing the gate entirely.
async function searchPosts(q: string, viewerId: string | null) {
  const query = q.startsWith("#") ? q.slice(1) : q;
  if (query.length === 0) return [];
  const visibilityConditions = await getPostVisibilityConditions(viewerId);
  return db.post.findMany({
    where: {
      AND: [
        { deletedAt: null, replyToId: null, body: { contains: query } },
        ...visibilityConditions,
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { author: { include: { profile: true, username: true } } },
  });
}

// phase-3 spec §16: resolves Phase 1's empty "communities" search tab.
// Only ever selects Community's own columns (name/slug/memberCount) — never
// joins into posts/wiki/chat — so a private community's *content* can't
// leak through this query even accidentally; its existence being
// searchable at all is per §3.1 ("still discoverable by name/slug").
async function searchCommunities(q: string) {
  const rows = await db.community.findMany({
    where: {
      OR: [{ slug: { contains: q.toLowerCase() } }, { name: { contains: q } }],
    },
    take: 20,
  });
  return rankCommunities(rows, q);
}

// build plan step 10 / spec §14: resolves Phase 1's other stubbed search
// tab (§6.1 of that spec — "communities" and "businesses" both
// present-but-empty; Phase 3 filled communities, this closes the pair).
// status != "active" is excluded from the WHERE clause itself, not just
// ranked lower — a pending/unclaimed business (§3.3) can't appear in
// search at all, by construction rather than tie-break order.
async function searchBusinesses(q: string) {
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

// phase-6 spec §10: unlisted projects are excluded from the WHERE clause
// itself, not just ranked lower — same "excluded by construction" posture
// searchBusinesses already uses for non-active businesses, so an unlisted
// project can never surface here regardless of match quality (spec §10
// bullet 3's explicit acceptance criterion).
async function searchProjects(q: string) {
  const rows = await db.project.findMany({
    where: {
      visibility: "public",
      status: { not: "archived" },
      OR: [{ title: { contains: q } }, { summary: { contains: q } }],
    },
    select: { id: true, slug: true, title: true, summary: true, likeCount: true, createdAt: true },
    take: 20,
  });
  return rankProjects(rows, q);
}

type KnowledgeResult = {
  type: "article" | "book" | "wiki_page" | "published_file";
  typeLabel: string;
  id: string;
  href: string;
  title: string;
  subtitle: string;
  likeCount: number;
  createdAt: Date;
};

// phase-7 spec §8: exact title match first, then fuzzy match, tie-broken by
// like_count then recency — same shape rankProjects already established,
// applied across four entity types combined into one tab rather than one
// tab per type (§8's own "worth resisting" reasoning). WikiPage/
// PublishedFile have no cached likeCount (see Reaction/Comment's schema
// comment) so they always tie-break on recency alone within this
// comparator — an accepted, spec-flagged gap (research report's note),
// not an oversight.
function rankKnowledge(rows: KnowledgeResult[], query: string): KnowledgeResult[] {
  const lowerQ = query.toLowerCase();
  return rows.slice().sort((a, b) => {
    const rank = (row: KnowledgeResult) => (row.title.toLowerCase() === lowerQ ? 0 : 1);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    if (a.likeCount !== b.likeCount) return b.likeCount - a.likeCount;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

// phase-7 spec §8: one combined "Articles & Docs" tab spanning Article,
// Book, and public WikiPage/PublishedFile rows — `private` is excluded from
// every WHERE clause itself (never merely filtered post-fetch, same
// "excluded by construction" posture searchBusinesses/searchProjects use),
// and per the spec's own admission that this SQLite codebase has no real
// FTS engine (see searchProjects et al.'s plain `contains` queries),
// `unlisted` gets the identical treatment as unlisted projects: excluded
// from the WHERE too, not "indexed but excluded" (there is no separate
// index to exclude *from* here — reality wins over the spec's Postgres-FTS
// prose, same posture this codebase applies throughout).
async function searchKnowledge(q: string, viewerId: string | null) {
  const [articles, books, wikiPages, files] = await Promise.all([
    db.article.findMany({
      where: {
        status: "published",
        visibility: "public",
        OR: [{ title: { contains: q } }, { body: { contains: q } }],
      },
      include: { author: { select: { username: true } } },
      take: 20,
    }),
    db.book.findMany({
      where: {
        status: "published",
        visibility: "public",
        OR: [{ title: { contains: q } }, { description: { contains: q } }],
      },
      include: { profile: { select: { user: { select: { username: true } } } } },
      take: 20,
    }),
    db.wikiPage.findMany({
      where: {
        profileId: { not: null },
        kind: { in: ["wiki", "documentation"] },
        visibility: "public",
        OR: [{ title: { contains: q } }, { currentRevision: { is: { body: { contains: q } } } }],
      },
      include: { profile: { select: { user: { select: { username: true } } } } },
      take: 20,
    }),
    db.publishedFile.findMany({
      where: {
        visibility: "public",
        OR: [{ title: { contains: q } }, { description: { contains: q } }],
      },
      include: { profile: { select: { user: { select: { username: true } } } } },
      take: 20,
    }),
  ]);

  const results: KnowledgeResult[] = [];

  for (const a of articles) {
    const handle = a.author.username?.handle;
    if (!handle) continue;
    results.push({
      type: "article",
      typeLabel: "Article",
      id: a.id,
      href: `/${handle}/articles/${a.slug}`,
      title: a.title,
      subtitle: a.subtitle ?? "",
      likeCount: a.likeCount,
      createdAt: a.createdAt,
    });
  }
  for (const b of books) {
    const handle = b.profile.user.username?.handle;
    if (!handle) continue;
    results.push({
      type: "book",
      typeLabel: "Book",
      id: b.id,
      href: `/${handle}/books/${b.slug}`,
      title: b.title,
      subtitle: b.description,
      likeCount: b.likeCount,
      createdAt: b.createdAt,
    });
  }
  for (const w of wikiPages) {
    const handle = w.profile?.user.username?.handle;
    if (!handle) continue;
    results.push({
      type: "wiki_page",
      typeLabel: w.kind === "documentation" ? "Documentation" : "Wiki",
      id: w.id,
      href: `/${handle}/wiki/${w.slug}`,
      title: w.title,
      subtitle: "",
      likeCount: 0,
      createdAt: w.createdAt,
    });
  }
  for (const f of files) {
    const handle = f.profile.user.username?.handle;
    if (!handle) continue;
    results.push({
      type: "published_file",
      typeLabel: "File",
      id: f.id,
      href: `/${handle}/files/${f.slug}`,
      title: f.title,
      subtitle: f.description,
      likeCount: 0,
      createdAt: f.createdAt,
    });
  }

  const lexicallyRanked = rankKnowledge(results, q).slice(0, 20);

  // phase-11 spec §8.1: semantic re-ranking as a supplementary signal over
  // the existing lexical order, exact title matches pinned ahead of it —
  // see semanticRerank's own comment for why this needs no separate vector
  // index (§8.2).
  return semanticRerank({
    query: q,
    rows: lexicallyRanked,
    getText: (row) => `${row.title} ${row.subtitle}`,
    getId: (row) => row.id,
    isExactMatch: (row) => row.title.toLowerCase() === q.toLowerCase(),
    requestedById: viewerId,
  });
}

// spec §9: only `published` events, split by an explicit Upcoming/Past
// filter rather than blended into one chronologically-confusing list
// (§9.1). §9.2's attendee-privacy acceptance criterion is met by
// construction here — this query never selects EventRSVP/Ticket rows at
// all, so a host_only attendee list has nothing to leak through a search
// result regardless of ranking.
async function searchEvents(q: string, when: "upcoming" | "past") {
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
