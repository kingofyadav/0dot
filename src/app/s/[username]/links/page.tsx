import { redirect } from "next/navigation";
import { ChevronDown, ChevronUp, Star, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteLink, deleteSocialLink, moveLink, toggleFeatured } from "@/app/actions/profile";
import { getLinkStats } from "@/lib/link-stats";
import { getSocialPlatformLabel, type SocialPlatform } from "@/lib/theme-presets";
import { SocialIcon } from "@/components/SocialIcon";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";
import { AddLinkForm } from "../AddLinkForm";
import { SocialLinksForm } from "../SocialLinksForm";

export default async function LinksSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const profileRow = await db.profile.findUnique({
    where: { userId: currentUser.id },
    include: {
      links: { orderBy: { position: "asc" } },
      socialLinks: { orderBy: { position: "asc" } },
    },
  });
  if (!profileRow) redirect("/claim-username");

  // Every viewer here is the owner — no schedule-window filtering needed
  // (that only ever applied to non-owners on the public page); still
  // sorted featured-first for the same reason the public page does.
  const links = [...profileRow.links].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
  const linkStats = await Promise.all(links.map((link) => getLinkStats(link.id)));
  const now = new Date();

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Links</h2>

      <p className="sectionHeading">Social links</p>
      <div className="socialLinksRow">
        {profileRow.socialLinks.length === 0 && <EmptyState message="No social links yet." />}
        {profileRow.socialLinks.map((social) => (
          <span key={social.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <a
              href={social.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="button buttonSecondary"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.7rem", fontSize: "0.85rem" }}
            >
              <SocialIcon platform={social.platform as SocialPlatform} />
              {getSocialPlatformLabel(social.platform)}
            </a>
            <form action={deleteSocialLink}>
              <input type="hidden" name="socialLinkId" value={social.id} />
              <ConfirmButton
                className="button buttonSecondary iconButton"
                aria-label={`Remove ${social.platform} link`}
                title="Remove this link?"
                description={`This removes your ${getSocialPlatformLabel(social.platform)} link from your profile. You can add it again anytime.`}
                confirmLabel="Remove"
              >
                <X size={16} aria-hidden="true" />
              </ConfirmButton>
            </form>
          </span>
        ))}
      </div>
      <div style={{ marginTop: "0.75rem" }}>
        <SocialLinksForm />
      </div>

      <div className="linksSection">
        <p className="sectionHeading">Links</p>
        {links.length === 0 && <EmptyState message="No links yet." />}
        {links.map((link, index) => {
          const isScheduledHidden =
            (link.startsAt && link.startsAt > now) || (link.endsAt && link.endsAt < now);
          const stats = linkStats[index];
          return (
            <div
              key={link.id}
              className={`profileLinkItem${link.isFeatured ? " featuredLink" : ""}`}
              style={{ opacity: isScheduledHidden ? 0.5 : 1, flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <a href={`/r/${link.id}`} target="_blank" rel="noopener noreferrer nofollow" style={{ flex: 1, fontWeight: 600 }}>
                  {link.label}
                  {isScheduledHidden && <span className="mutedText"> (scheduled)</span>}
                </a>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <form action={toggleFeatured}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <button
                      type="submit"
                      className="button buttonSecondary iconButton"
                      aria-label={link.isFeatured ? "Unfeature" : "Feature"}
                      aria-pressed={link.isFeatured}
                      style={link.isFeatured ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
                    >
                      <Star size={16} aria-hidden="true" fill={link.isFeatured ? "currentColor" : "none"} />
                    </button>
                  </form>
                  <form action={moveLink}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button type="submit" className="button buttonSecondary iconButton" disabled={index === 0} aria-label="Move up">
                      <ChevronUp size={16} aria-hidden="true" />
                    </button>
                  </form>
                  <form action={moveLink}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      className="button buttonSecondary iconButton"
                      disabled={index === links.length - 1}
                      aria-label="Move down"
                    >
                      <ChevronDown size={16} aria-hidden="true" />
                    </button>
                  </form>
                  <form action={deleteLink}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <ConfirmButton
                      className="button buttonSecondary iconButton"
                      aria-label="Delete"
                      title="Delete this link?"
                      description={`"${link.label}" will be permanently removed from your profile, along with its click history.`}
                      confirmLabel="Delete"
                    >
                      <X size={16} aria-hidden="true" />
                    </ConfirmButton>
                  </form>
                </div>
              </div>

              <details className="profileEditToggle">
                <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
                  {stats.total} click{stats.total === 1 ? "" : "s"}
                </summary>
                <div className="mutedText" style={{ fontSize: "0.85rem", marginTop: "0.4rem" }}>
                  <p>{stats.last7d} in last 7 days · {stats.last30d} in last 30 days</p>
                  {stats.topReferrers.length > 0 ? (
                    <p>Top referrers: {stats.topReferrers.map((r) => `${r.host} (${r.count})`).join(", ")}</p>
                  ) : (
                    <p>No referrer data yet.</p>
                  )}
                </div>
              </details>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <AddLinkForm />
      </div>
    </div>
  );
}
