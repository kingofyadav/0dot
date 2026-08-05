import Link from "next/link";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";

// phase-14 spec §2: entry point independent of Phase 4's Business flow —
// just this user's own OrganizationMember rows, active or deactivated (a
// deactivated row still shows here so a former employee can see history,
// but every action link below is gated separately per organization).
export default async function OrganizationsPage() {
  const user = await requireVerifiedUser();

  const memberships = await db.organizationMember.findMany({
    where: { userId: user.id },
    include: { organization: { select: { id: true, name: true, domain: true, domainVerifiedAt: true } } },
    orderBy: { joinedAt: "desc" },
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Organizations</h1>
        <Link href="/org/new" className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          New organization
        </Link>
      </div>

      {memberships.length === 0 && <p className="mutedText">You aren&apos;t part of any organization yet.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {memberships.map((m) => (
          <Link key={m.organizationId} href={`/org/${m.organizationId}`} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
            <span>
              {m.organization.name}
              {m.organization.domain && <span className="mutedText"> — {m.organization.domain}</span>}
            </span>
            <span className="mutedText" style={{ fontSize: "0.75rem" }}>
              {m.role === "org_admin" ? "Admin" : "Member"}
              {m.status === "deactivated" ? " · Deactivated" : ""}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
