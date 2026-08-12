import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember, isBusinessStaff } from "@/lib/businesses";
import {
  updateTeamMemberRole,
  updateTeamMemberVisibility,
  removeTeamMember,
  transferBusinessOwnership,
  deleteBusiness,
} from "@/app/actions/businesses";
import { deleteBusinessLink, moveBusinessLink } from "@/app/actions/business-links";
import { deleteLocation } from "@/app/actions/business-locations";
import { parseBusinessHours } from "@/lib/businesses";
import { Logo } from "@/components/Logo";
import { InviteTeamMemberForm } from "./InviteTeamMemberForm";
import { ManageBusinessForm } from "./ManageBusinessForm";
import { BusinessLinksForm } from "./BusinessLinksForm";
import { LocationForm } from "./LocationForm";

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

  const business = await db.business.findUnique({ where: { slug }, include: { contactInfo: true, locations: true } });
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
  const links = await db.link.findMany({ where: { businessId: business.id }, orderBy: { position: "asc" } });

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
          <Link href={`/b/${business.slug}/manage/crm`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            CRM
          </Link>
          <Link href={`/b/${business.slug}/manage/billing`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            Billing
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

      <div style={{ marginTop: "1.5rem" }}>
        <p className="sectionHeading">Locations</p>
        {business.locations.length === 0 && <p className="mutedText">No locations yet.</p>}
        {business.locations.map((location) => (
          <div key={location.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>
                <strong>{location.label}</strong> <span className="mutedText">{location.address}</span>
              </span>
              <form action={deleteLocation}>
                <input type="hidden" name="locationId" value={location.id} />
                <button type="submit" className="button buttonDanger buttonSmall">Delete</button>
              </form>
            </div>
            <details className="profileEditToggle">
              <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit</summary>
              <div style={{ marginTop: "0.5rem" }}>
                <LocationForm
                  businessId={business.id}
                  location={{ ...location, hours: parseBusinessHours(location.hoursJson) }}
                />
              </div>
            </details>
          </div>
        ))}
        <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
          <summary>Add a location</summary>
          <div style={{ marginTop: "0.5rem" }}>
            <LocationForm businessId={business.id} />
          </div>
        </details>
      </div>

      <div className="linksSection" style={{ marginTop: "1.5rem" }}>
        <p className="sectionHeading">Links</p>
        {links.length === 0 && <p className="mutedText">No links yet.</p>}
        {links.map((link, index) => (
          <div key={link.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <a href={`/r/${link.id}`} target="_blank" rel="noopener noreferrer nofollow" style={{ flex: 1, fontWeight: 600 }}>
                {link.label}
              </a>
              <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                {link.clickCount} click{link.clickCount === 1 ? "" : "s"}
              </span>
              <div style={{ display: "flex", gap: "0.35rem" }}>
                <form action={moveBusinessLink}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="linkId" value={link.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" className="button buttonSecondary iconButton" disabled={index === 0} aria-label="Move up"><ChevronUp size={16} aria-hidden="true" /></button>
                </form>
                <form action={moveBusinessLink}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="linkId" value={link.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button type="submit" className="button buttonSecondary iconButton" disabled={index === links.length - 1} aria-label="Move down"><ChevronDown size={16} aria-hidden="true" /></button>
                </form>
                <form action={deleteBusinessLink}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="linkId" value={link.id} />
                  <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete"><X size={16} aria-hidden="true" /></button>
                </form>
              </div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: "0.75rem" }}>
          <BusinessLinksForm businessId={business.id} />
        </div>
      </div>

      {isOwner && (
        <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
          <p className="sectionHeading">Danger zone</p>
          {transferCandidates.length > 0 && (
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
          )}

          <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
              Delete business
            </summary>
            <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "32ch" }}>
              <p className="mutedText" style={{ fontSize: "0.85rem" }}>
                Permanently deletes {business.name} — team, catalog, reviews, jobs, appointments, and
                documents all go with it. This cannot be undone.
              </p>
              <form action={deleteBusiness}>
                <input type="hidden" name="businessId" value={business.id} />
                <button type="submit" className="button buttonDanger buttonSmall">
                  Yes, delete {business.name}
                </button>
              </form>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
