import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { EmptyState } from "@/components/EmptyState";

// Lightweight index — just enough to make step 1 usable without a direct
// /c/{slug} link in hand. Full search integration (phase-3 spec §16) is a
// later build-sequence step; this is "your communities" + a small discovery
// list, not a search experience.
function CommunityRow({
  slug,
  name,
  avatarUrl,
  memberCount,
}: {
  slug: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
}) {
  return (
    <Link href={`/c/${slug}`} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
          <img src={avatarUrl} alt="" width={40} height={40} style={{ borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <Logo size={40} />
        )}
        <span style={{ fontWeight: 600 }}>{name}</span>
      </span>
      <span className="mutedText" style={{ fontSize: "0.85rem" }}>
        {memberCount} member{memberCount === 1 ? "" : "s"}
      </span>
    </Link>
  );
}

export default async function CommunitiesIndexPage() {
  const currentUser = await getCurrentUser();

  const myMemberships = currentUser
    ? await db.communityMember.findMany({
        where: { userId: currentUser.id, status: "active" },
        orderBy: { joinedAt: "desc" },
        include: { community: true },
      })
    : [];
  const myCommunityIds = new Set(myMemberships.map((m) => m.communityId));

  const recentPublic = await db.community.findMany({
    where: { visibility: "public", id: { notIn: [...myCommunityIds] } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Communities</h1>
        <Link href="/c/new" className="button" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Create community
        </Link>
      </div>

      {currentUser && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="sectionHeading">Your communities</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {myMemberships.length === 0 && <p className="mutedText">You haven&apos;t joined any communities yet.</p>}
            {myMemberships.map((m) => (
              <CommunityRow
                key={m.communityId}
                slug={m.community.slug}
                name={m.community.name}
                avatarUrl={m.community.avatarUrl}
                memberCount={m.community.memberCount}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="sectionHeading">Discover</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {recentPublic.length === 0 && <EmptyState message="No public communities yet." />}
          {recentPublic.map((c) => (
            <CommunityRow key={c.id} slug={c.slug} name={c.name} avatarUrl={c.avatarUrl} memberCount={c.memberCount} />
          ))}
        </div>
      </div>
    </div>
  );
}
