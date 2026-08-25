import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember, parseBusinessHours } from "@/lib/businesses";
import { businessCategoryLabel } from "@/lib/business-categories";
import { leaveBusinessTeam } from "@/app/actions/businesses";
import { getPrimaryLiveDomain } from "@/lib/custom-domains";
import { Logo } from "@/components/Logo";
import { BusinessContactForm } from "./BusinessContactForm";

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABEL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const SIZE_RANGE_LABEL: Record<string, string> = {
  solo: "Just me",
  "2_10": "2-10 employees",
  "11_50": "11-50 employees",
  "51_200": "51-200 employees",
  "201_1000": "201-1000 employees",
  "1000_plus": "1000+ employees",
};

// custom-domains addendum §6.3: same canonical-preference pattern as the
// profile page's generateMetadata — see that file's comment.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const business = await db.business.findUnique({ where: { slug }, select: { id: true } });
  if (!business) return {};

  const primaryDomain = await getPrimaryLiveDomain("business", business.id);
  return primaryDomain ? { alternates: { canonical: `https://${primaryDomain}` } } : {};
}

// Identity header + about content (build plan step 1) plus links to every
// other tab this phase builds (Posts, Catalog, Store, Reviews, Jobs,
// Appointments, Documents) — spec §6 lists a business post feed as one of
// these tabs; composing as the business still happens from the global
// /feed "Post as" picker (ComposeBox's postableBusinesses prop, spec §5),
// this tab is just the browsable feed.
export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const business = await db.business.findUnique({
    where: { slug },
    include: { contactInfo: true, locations: true, links: { orderBy: { position: "asc" } } },
  });
  if (!business) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getBusinessMember(business.id, currentUser.id) : null;

  // spec §3.3: a pending business is invisible to anyone outside its own
  // team, not just unsearchable — a non-member visitor sees the same 404 as
  // a slug that doesn't exist.
  if (business.status === "pending" && !membership) notFound();

  const isStaff = membership?.role === "owner" || membership?.role === "admin";
  const isOwner = membership?.role === "owner";

  const publicTeam = await db.businessMember.findMany({
    where: { businessId: business.id, isPublic: true },
    orderBy: { joinedAt: "asc" },
    include: { user: { include: { username: true, profile: true } } },
  });

  return (
    <div className="profileCard">
      {business.status === "pending" && (
        <p className="mutedText" style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "8px" }}>
          Pending review — only your team can see this page. It won&apos;t appear in search until a
          platform admin approves it.
        </p>
      )}

      <div className="profileCover">
        {business.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
          <img src={business.coverUrl} alt="" className="profileCoverImg" />
        ) : (
          <div className="profileCoverPlaceholder" />
        )}
      </div>
      <div className="profileHeaderRow">
        {business.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
          <img src={business.logoUrl} alt={business.name} width={96} height={96} className="profileAvatar" style={{ objectFit: "cover" }} />
        ) : (
          <span className="profileAvatar" style={{ display: "inline-flex", borderRadius: "50%" }}>
            <Logo size={96} />
          </span>
        )}
        <div className="profileHeaderInfo">
          <div className="profileIdentityRow">
            <h1 className="profileName">
              {business.name}
              {business.isVerified && (
                <span className="verifiedBadge" title="Verified" aria-label="Verified">
                  <BadgeCheck size={14} aria-hidden="true" />
                </span>
              )}
            </h1>
          </div>
          {business.tagline && <p className="mutedText">{business.tagline}</p>}
          <div className="profileMeta">
            <span>{businessCategoryLabel(business.category)}</span>
            {business.sizeRange && <span>{SIZE_RANGE_LABEL[business.sizeRange]}</span>}
            {business.foundedYear && <span>Founded {business.foundedYear}</span>}
            {business.reviewCount > 0 && (
              <Link href={`/b/${business.slug}/reviews`}>
                ★ {business.averageRating.toFixed(1)} ({business.reviewCount})
              </Link>
            )}
          </div>
        </div>
      </div>

      {business.description && <p className="profileBio">{business.description}</p>}

      {business.contactInfo && (business.contactInfo.website || business.contactInfo.email || business.contactInfo.phone) && (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.75rem", fontSize: "0.85rem" }}>
          {business.contactInfo.website && (
            <a href={`https://${business.contactInfo.website.replace(/^https?:\/\//, "")}`} target="_blank" rel="noopener noreferrer">
              {business.contactInfo.website}
            </a>
          )}
          {business.contactInfo.email && <span className="mutedText">{business.contactInfo.email}</span>}
          {business.contactInfo.phone && <span className="mutedText">{business.contactInfo.phone}</span>}
        </div>
      )}

      {/* A primary CTA next to the header rather than a grid tile below —
          previously the last tile in .profileActionsGrid, where it landed
          alone on its own row whenever the grid's auto-fill column count
          didn't divide the item count evenly (live-site QA pass,
          2026-08-25). Messaging a business is also arguably a more
          prominent action than "Documents"/"Catalog", not an equal peer. */}
      <details style={{ marginTop: "0.75rem" }}>
        <summary className="button" style={{ display: "inline-block", listStyle: "none" }}>
          Message
        </summary>
        <div style={{ marginTop: "0.5rem" }}>
          <BusinessContactForm businessId={business.id} isLoggedIn={Boolean(currentUser)} />
        </div>
      </details>

      <div className="profileActionsGrid">
        <Link href={`/b/${business.slug}/posts`} className="button buttonSecondary">
          Posts
        </Link>
        <Link href={`/b/${business.slug}/catalog`} className="button buttonSecondary">
          Catalog
        </Link>
        <Link href={`/b/${business.slug}/store`} className="button buttonSecondary">
          Store
        </Link>
        <Link href={`/b/${business.slug}/reviews`} className="button buttonSecondary">
          Reviews
        </Link>
        <Link href={`/b/${business.slug}/jobs`} className="button buttonSecondary">
          Jobs
        </Link>
        <Link href={`/b/${business.slug}/appointments`} className="button buttonSecondary">
          Appointments
        </Link>
        <Link href={`/b/${business.slug}/documents`} className="button buttonSecondary">
          Documents
        </Link>
        {isStaff && (
          <Link href={`/b/${business.slug}/manage`} className="button buttonSecondary">
            Manage
          </Link>
        )}
        {membership && !isOwner && (
          <form action={leaveBusinessTeam}>
            <input type="hidden" name="businessId" value={business.id} />
            <button type="submit" className="button buttonSecondary">
              Leave team
            </button>
          </form>
        )}
        <details className="profileActionsToggle">
          <summary className="button buttonSecondary">Message</summary>
          <div className="profileActionsExpand">
            <BusinessContactForm businessId={business.id} isLoggedIn={Boolean(currentUser)} />
          </div>
        </details>
      </div>

      {business.locations.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="sectionHeading">Locations</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {business.locations.map((location) => {
              const hours = parseBusinessHours(location.hoursJson);
              return (
                <div key={location.id}>
                  <strong>{location.label}</strong>
                  <p className="mutedText" style={{ margin: "0.1rem 0 0", fontSize: "0.85rem" }}>
                    {location.address}
                  </p>
                  {hours && (
                    <div style={{ marginTop: "0.3rem", fontSize: "0.8rem" }}>
                      {DAY_ORDER.filter((day) => hours[day]?.length).map((day) => (
                        <div key={day} className="mutedText">
                          {DAY_LABEL[day]}:{" "}
                          {hours[day].map((range) => `${range.opens}–${range.closes}`).join(", ")}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {business.links.length > 0 && (
        <div className="linksSection" style={{ marginTop: "0.75rem" }}>
          <p className="sectionHeading">Links</p>
          {business.links.map((link) => (
            <div key={link.id} className="profileLinkItem">
              <a href={`/r/${link.id}`} target="_blank" rel="noopener noreferrer nofollow" style={{ flex: 1, fontWeight: 600 }}>
                {link.label}
              </a>
            </div>
          ))}
        </div>
      )}

      {publicTeam.length > 0 && (
        <details className="profileEditToggle" style={{ marginTop: "0.75rem" }}>
          <summary className="sectionHeading" style={{ cursor: "pointer" }}>
            Team ({publicTeam.length})
          </summary>
          <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {publicTeam.map((m) => {
              const memberName = m.user.profile?.displayName ?? m.user.username?.handle ?? "Unknown";
              return (
                <span key={m.userId} className="mutedText" style={{ fontSize: "0.85rem" }}>
                  <strong style={{ color: "var(--foreground)" }}>{memberName}</strong>
                  {m.title ? ` — ${m.title}` : ""}
                </span>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
