import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember, isBusinessStaff } from "@/lib/businesses";
import {
  updateTeamMemberRole,
  updateTeamMemberVisibility,
  removeTeamMember,
  transferBusinessOwnership,
} from "@/app/actions/businesses";
import { Logo } from "@/components/Logo";
import { InviteTeamMemberForm } from "./InviteTeamMemberForm";
import { ManageBusinessForm } from "./ManageBusinessForm";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  member: "Member",
};

export default async function ManageBusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const business = await db.business.findUnique({ where: { slug }, include: { contactInfo: true } });
  if (!business) notFound();

  // Staff (owner or admin) — a plain member/editor gets sent back to the
  // public view rather than a 404, same "wrong place, not secret" posture
  // as /c/[slug]/manage.
  if (!(await isBusinessStaff(business.id, currentUser.id))) {
    redirect(`/b/${business.slug}`);
  }
  const viewerMembership = await getBusinessMember(business.id, currentUser.id);
  const isOwner = viewerMembership?.role === "owner";
  const newContactMessageCount = await db.contactMessage.count({ where: { businessId: business.id, status: "new" } });

  const members = await db.businessMember.findMany({
    where: { businessId: business.id },
    orderBy: { joinedAt: "asc" },
    include: { user: { include: { username: true, profile: true } } },
  });
  // Transfer target must already be on the team, any non-owner role.
  const transferCandidates = members.filter((m) => m.role !== "owner");

  function memberName(m: (typeof members)[number]) {
    return m.user.profile?.displayName ?? m.user.username?.handle ?? "Unknown";
  }

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Manage {business.name}</h1>
        <span style={{ display: "flex", gap: "0.5rem" }}>
          <Link href={`/b/${business.slug}/catalog`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            Catalog
          </Link>
          <Link href={`/b/${business.slug}/manage/contact`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            Contact messages{newContactMessageCount > 0 ? ` (${newContactMessageCount})` : ""}
          </Link>
          <Link href={`/b/${business.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            View business page
          </Link>
        </span>
      </div>

      {business.status === "pending" && (
        <p className="mutedText" style={{ marginBottom: "1.25rem", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "8px" }}>
          Pending review — invisible to search and to anyone outside your team until a platform admin
          approves it.
        </p>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <p className="sectionHeading">Team</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {members.map((m) => (
            <div key={m.userId} className="profileLinkItem" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {m.user.profile?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
                  <img src={m.user.profile.avatarUrl} alt="" width={32} height={32} style={{ borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <Logo size={32} />
                )}
                {memberName(m)}
                <span className="mutedText" style={{ fontSize: "0.75rem" }}>
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
                {m.isPublic && (
                  <span className="mutedText" style={{ fontSize: "0.75rem" }}>
                    Public
                  </span>
                )}
              </span>
              {m.role !== "owner" && (
                <span style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <form action={updateTeamMemberRole} style={{ display: "flex", gap: "0.3rem" }}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <select name="role" defaultValue={m.role} className="textInput" style={{ fontSize: "0.8rem" }}>
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="member">Member</option>
                    </select>
                    <button type="submit" className="button buttonSecondary buttonSmall">
                      Update role
                    </button>
                  </form>
                  <form action={updateTeamMemberVisibility}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <input type="hidden" name="isPublic" value={m.isPublic ? "false" : "true"} />
                    <button type="submit" className="button buttonSecondary buttonSmall">
                      {m.isPublic ? "Hide from team tab" : "Show on team tab"}
                    </button>
                  </form>
                  <form action={removeTeamMember}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <button type="submit" className="button buttonDanger buttonSmall">
                      Remove
                    </button>
                  </form>
                </span>
              )}
            </div>
          ))}
        </div>
        <InviteTeamMemberForm businessId={business.id} />
      </div>

      <p className="sectionHeading">Business details</p>
      <ManageBusinessForm
        businessId={business.id}
        name={business.name}
        tagline={business.tagline}
        description={business.description}
        category={business.category}
        sizeRange={business.sizeRange}
        foundedYear={business.foundedYear}
        logoUrl={business.logoUrl}
        coverUrl={business.coverUrl}
        email={business.contactInfo?.email ?? null}
        phone={business.contactInfo?.phone ?? null}
        website={business.contactInfo?.website ?? null}
      />

      {isOwner && transferCandidates.length > 0 && (
        <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
          <p className="sectionHeading">Danger zone</p>
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
              Transfer ownership
            </summary>
            <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "32ch" }}>
              <p className="mutedText" style={{ fontSize: "0.85rem" }}>
                You&apos;ll become an admin. The new owner is the only one who can transfer it again.
              </p>
              <form action={transferBusinessOwnership} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <input type="hidden" name="businessId" value={business.id} />
                <select name="userId" required>
                  {transferCandidates.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {memberName(m)}
                    </option>
                  ))}
                </select>
                <button type="submit" className="button buttonDanger buttonSmall">
                  Yes, transfer ownership
                </button>
              </form>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
