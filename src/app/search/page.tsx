import Link from "next/link";
import { db } from "@/lib/db";

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
  if (q.length > 0) {
    if (tab === "users") users = await searchUsers(q);
    if (tab === "posts") posts = await searchPosts(q);
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
                {post.author.username ? ` · 0dot.in/${post.author.username.handle}` : ""}
              </span>
              <span>{post.body}</span>
            </Link>
          ))}
        </div>
      )}

      {q.length > 0 && tab === "communities" && (
        <p className="mutedText">Communities aren&apos;t available yet — coming with the Communities phase.</p>
      )}

      {q.length > 0 && tab === "businesses" && (
        <p className="mutedText">Businesses aren&apos;t available yet — coming with the Business Platform phase.</p>
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
