import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { getOrganizationMember, isActiveOrganizationMember } from "@/lib/organizations";

// spec §6: the employee directory — an org-scoped view over
// OrganizationMember + Profile data, visible only to fellow active members
// of the *same* organization (§6.1's cross-tenant isolation acceptance
// criterion), no public variant at all.
export default async function OrganizationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await requireVerifiedUser();

  const organization = await db.organization.findUnique({ where: { id: orgId } });
  if (!organization) notFound();

  if (!(await isActiveOrganizationMember(orgId, user.id))) {
    redirect("/org");
  }
  const viewerMembership = await getOrganizationMember(orgId, user.id);

  const directory = await db.organizationMember.findMany({
    where: { organizationId: orgId, status: "active" },
    include: { user: { include: { username: true, profile: true } } },
    orderBy: { joinedAt: "asc" },
  });

  function memberName(m: (typeof directory)[number]) {
    return m.user.profile?.displayName ?? m.user.username?.handle ?? "Unknown";
  }

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{organization.name}</h1>
        {viewerMembership?.role === "org_admin" && (
          <span style={{ display: "flex", gap: "0.5rem" }}>
            <Link href={`/org/${orgId}/manage`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
              Manage
            </Link>
            <Link href={`/org/${orgId}/audit-log`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
              Audit log
            </Link>
          </span>
        )}
      </div>

      {organization.domain && (
        <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
          {organization.domain} {organization.domainVerifiedAt ? "· Verified" : "· Domain not yet verified"}
        </p>
      )}

      <p className="sectionHeading">Employee directory</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {directory.map((m) => (
          <div key={m.userId} className="profileLinkItem" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>{memberName(m)}</span>
            <span className="mutedText" style={{ fontSize: "0.8rem" }}>
              {[m.title, m.department].filter(Boolean).join(" · ") || (m.role === "org_admin" ? "Admin" : "Member")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
