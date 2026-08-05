import { redirect, notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { isOrgAdmin } from "@/lib/organizations";
import { updateOrganizationMember, deactivateOrganizationMember } from "@/app/actions/organizations";
import { VerifyDomainForm } from "./VerifyDomainForm";
import { AddMemberForm } from "./AddMemberForm";
import { SsoConnectionForm } from "./SsoConnectionForm";
import { SsoEnforcementToggle } from "./SsoEnforcementToggle";

export default async function ManageOrganizationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await requireVerifiedUser();

  const organization = await db.organization.findUnique({ where: { id: orgId }, include: { ssoConnection: true } });
  if (!organization) notFound();
  if (!(await isOrgAdmin(orgId, user.id))) redirect(`/org/${orgId}`);

  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId },
    include: { user: { include: { username: true, profile: true } } },
    orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
  });

  function memberName(m: (typeof members)[number]) {
    return m.user.profile?.displayName ?? m.user.username?.handle ?? "Unknown";
  }

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.25rem" }}>Manage {organization.name}</h1>

      <div style={{ marginBottom: "1.75rem" }}>
        <p className="sectionHeading">Domain verification</p>
        {organization.domain ? (
          organization.domainVerifiedAt ? (
            <p className="mutedText">{organization.domain} is verified.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <p className="mutedText">
                Add a DNS TXT record on <strong>{organization.domain}</strong> with value:
              </p>
              <code style={{ padding: "0.4rem 0.6rem", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "0.8rem", wordBreak: "break-all" }}>
                0dot-domain-verify={organization.domainVerificationToken}
              </code>
              <VerifyDomainForm organizationId={orgId} />
            </div>
          )
        ) : (
          <p className="mutedText">No domain set for this organization.</p>
        )}
      </div>

      <div style={{ marginBottom: "1.75rem" }}>
        <p className="sectionHeading">Single sign-on</p>
        {!organization.domainVerifiedAt ? (
          <p className="mutedText">Verify the organization&apos;s domain before configuring SSO.</p>
        ) : (
          <>
            <SsoConnectionForm
              organizationId={orgId}
              protocol={organization.ssoConnection?.protocol ?? "saml2"}
              idpMetadataJson={organization.ssoConnection?.idpMetadataJson ?? ""}
            />
            {organization.ssoConnection && (
              <SsoEnforcementToggle organizationId={orgId} enforced={organization.ssoConnection.enforced} />
            )}
          </>
        )}
      </div>

      <div style={{ marginBottom: "1.75rem" }}>
        <p className="sectionHeading">Members</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1rem" }}>
          {members.map((m) => (
            <div key={m.userId} className="profileLinkItem" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <span>
                {memberName(m)}
                {m.status === "deactivated" && <span className="mutedText"> · Deactivated</span>}
              </span>
              {m.status === "active" && m.userId !== user.id && (
                <span style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <form action={updateOrganizationMember} style={{ display: "flex", gap: "0.3rem" }}>
                    <input type="hidden" name="organizationId" value={orgId} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <select name="role" defaultValue={m.role} className="textInput" style={{ fontSize: "0.8rem" }}>
                      <option value="org_admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                    <input name="title" defaultValue={m.title ?? ""} placeholder="Title" className="textInput" style={{ fontSize: "0.8rem", width: "100px" }} />
                    <input name="department" defaultValue={m.department ?? ""} placeholder="Department" className="textInput" style={{ fontSize: "0.8rem", width: "110px" }} />
                    <button type="submit" className="button buttonSecondary buttonSmall">
                      Update
                    </button>
                  </form>
                  <form action={deactivateOrganizationMember}>
                    <input type="hidden" name="organizationId" value={orgId} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <button type="submit" className="button buttonDanger buttonSmall">
                      Deactivate
                    </button>
                  </form>
                </span>
              )}
            </div>
          ))}
        </div>
        <AddMemberForm organizationId={orgId} />
      </div>
    </div>
  );
}
