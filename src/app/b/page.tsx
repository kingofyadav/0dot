import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { businessCategoryLabel } from "@/lib/business-categories";
import { Logo } from "@/components/Logo";

// Lightweight index, same shape as /c's community index — "your
// businesses" (including your own pending ones under review) + a small
// discovery list of active businesses. Full ranking/filtering lives in
// /search's businesses tab (build plan step 10); this is just enough to
// make /b/[slug] reachable without a direct link in hand.
function BusinessRow({
  slug,
  name,
  logoUrl,
  category,
  status,
}: {
  slug: string;
  name: string;
  logoUrl: string | null;
  category: string;
  status?: string;
}) {
  return (
    <Link href={`/b/${slug}`} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
          <img src={logoUrl} alt="" width={40} height={40} style={{ borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <Logo size={40} />
        )}
        <span style={{ fontWeight: 600 }}>{name}</span>
      </span>
      <span className="mutedText" style={{ fontSize: "0.85rem" }}>
        {status === "pending" ? "Pending review" : businessCategoryLabel(category)}
      </span>
    </Link>
  );
}

export default async function BusinessesIndexPage() {
  const currentUser = await getCurrentUser();

  const myMemberships = currentUser
    ? await db.businessMember.findMany({
        where: { userId: currentUser.id },
        orderBy: { joinedAt: "desc" },
        include: { business: true },
      })
    : [];
  const myBusinessIds = new Set(myMemberships.map((m) => m.businessId));

  const discover = await db.business.findMany({
    where: { status: "active", id: { notIn: [...myBusinessIds] } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Businesses</h1>
        <Link href="/b/new" className="button" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Create business
        </Link>
      </div>

      {currentUser && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="sectionHeading">Your businesses</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {myMemberships.length === 0 && <p className="mutedText">You&apos;re not part of any business yet.</p>}
            {myMemberships.map((m) => (
              <BusinessRow
                key={m.businessId}
                slug={m.business.slug}
                name={m.business.name}
                logoUrl={m.business.logoUrl}
                category={m.business.category}
                status={m.business.status}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="sectionHeading">Discover</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {discover.length === 0 && <p className="mutedText">No businesses yet.</p>}
          {discover.map((b) => (
            <BusinessRow key={b.id} slug={b.slug} name={b.name} logoUrl={b.logoUrl} category={b.category} />
          ))}
        </div>
      </div>
    </div>
  );
}
