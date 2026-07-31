import Link from "next/link";
import { db } from "@/lib/db";
import { businessCategoryLabel } from "@/lib/business-categories";

type SearchTab = "users" | "posts" | "communities" | "businesses";
const TABS: { key: SearchTab; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "posts", label: "Posts" },
  { key: "communities", label: "Communities" },
  { key: "businesses", label: "Businesses" },
];

function tabHref(q: string, tab: SearchTab) {
  return `/search?q=${encodeURIComponent(q)}&tab=${tab}`;
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

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const { q: rawQ, tab: rawTab } = await searchParams;
  const q = (rawQ ?? "").trim();
  const tab: SearchTab = (["users", "posts", "communities", "businesses"] as const).includes(
    rawTab as SearchTab
  )
    ? (rawTab as SearchTab)
    : "users";

  let users: Awaited<ReturnType<typeof searchUsers>> = [];
  let posts: Awaited<ReturnType<typeof searchPosts>> = [];
  let communities: Awaited<ReturnType<typeof searchCommunities>> = [];
  let businesses: Awaited<ReturnType<typeof searchBusinesses>> = [];
  if (q.length > 0) {
    if (tab === "users") users = await searchUsers(q);
    if (tab === "posts") posts = await searchPosts(q);
    if (tab === "communities") communities = await searchCommunities(q);
    if (tab === "businesses") businesses = await searchBusinesses(q);
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
          {users.length === 0 && <p className="mutedText">No users found for &ldquo;{q}&rdquo;.</p>}
          {users.map((row) => (
            <Link key={row.id} href={`/${row.handle}`} className="profileLinkItem" style={{ fontWeight: 600 }}>
              {row.user.profile?.displayName ?? row.handle}
              {row.user.profile?.isVerified && (
                <span className="verifiedBadge" title="Verified" aria-label="Verified">
                  ✓
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
          {posts.length === 0 && <p className="mutedText">No posts found for &ldquo;{q}&rdquo;.</p>}
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
                    ✓
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
          {communities.length === 0 && <p className="mutedText">No communities found for &ldquo;{q}&rdquo;.</p>}
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
          {businesses.length === 0 && <p className="mutedText">No businesses found for &ldquo;{q}&rdquo;.</p>}
          {businesses.map((business) => (
            <Link key={business.id} href={`/b/${business.slug}`} className="profileLinkItem" style={{ fontWeight: 600 }}>
              {business.name}
              {business.isVerified && (
                <span className="verifiedBadge" title="Verified" aria-label="Verified">
                  ✓
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

async function searchPosts(q: string) {
  const query = q.startsWith("#") ? q.slice(1) : q;
  if (query.length === 0) return [];
  return db.post.findMany({
    where: { deletedAt: null, replyToId: null, body: { contains: query } },
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
