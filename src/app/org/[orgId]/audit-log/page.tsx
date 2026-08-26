import { redirect, notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { isOrgAdmin } from "@/lib/organizations";
import { EmptyState } from "@/components/EmptyState";

const ACTION_LABEL: Record<string, string> = {
  member_added: "Member added",
  member_removed: "Member removed",
  member_deactivated: "Member deactivated",
  sso_connection_configured: "SSO connection configured",
  sso_enforcement_changed: "SSO enforcement changed",
  community_created: "Community created",
  org_settings_changed: "Organization settings changed",
};

// spec §7.4 acceptance criterion: an organization's admins can only query
// their own organization's audit log — enforced by the same isOrgAdmin gate
// every other admin-console page/action in this phase uses, scoped to this
// route's own :orgId (never a cross-organization query).
export default async function OrganizationAuditLogPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await requireVerifiedUser();

  const organization = await db.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true } });
  if (!organization) notFound();
  if (!(await isOrgAdmin(orgId, user.id))) redirect(`/org/${orgId}`);

  const entries = await db.organizationAuditLog.findMany({
    where: { organizationId: orgId },
    include: { actor: { include: { username: true, profile: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  function actorName(e: (typeof entries)[number]) {
    if (!e.actor) return "System";
    return e.actor.profile?.displayName ?? e.actor.username?.handle ?? "Unknown";
  }

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.25rem" }}>Audit log — {organization.name}</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {entries.length === 0 && <EmptyState message="No activity recorded yet." />}
        {entries.map((e) => (
          <div key={e.id} className="profileLinkItem" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <span>{ACTION_LABEL[e.action] ?? e.action}</span>
            <span className="mutedText" style={{ fontSize: "0.8rem" }}>
              {actorName(e)} · {e.createdAt.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
