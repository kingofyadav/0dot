import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteLink, deleteSocialLink, moveLink, toggleFeatured } from "@/app/actions/profile";
import { getLinkStats } from "@/lib/link-stats";
import { getSocialPlatformLabel, type SocialPlatform } from "@/lib/theme-presets";
import { SocialIcon } from "@/components/SocialIcon";
import { EditProfileForm } from "./EditProfileForm";
import { AddLinkForm } from "./AddLinkForm";
import { SocialLinksForm } from "./SocialLinksForm";

// Owner-only settings surface (everything that used to be inline on the
// public /username page: edit profile, link management, social links,
// share/QR). /username itself is now a clean, read-only public profile —
// think of this split as "API endpoint" (public) vs "control panel" (here).
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!currentUser.profile) redirect("/claim-username");

  // Settings is always about *yourself* — there's no legitimate reason to
  // view someone else's, so a mismatched handle in the URL (stale bookmark,
  // typo, someone else's link) sends you to your own settings rather than
  // 404ing or leaking whether that handle exists.
  if (currentUser.username?.handle !== handle) {
    redirect(`/s/${currentUser.username!.handle}`);
  }

  const profileRow = await db.profile.findUnique({
    where: { userId: currentUser.id },
    include: {
      links: { orderBy: { position: "asc" } },
      socialLinks: { orderBy: { position: "asc" } },
    },
  });
  if (!profileRow) notFound();

  // Every viewer here is the owner — no schedule-window filtering needed
  // (that only ever applied to non-owners on the public page); still sorted
  // featured-first for the same reason the public page does.
  const links = [...profileRow.links].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
  const linkStats = await Promise.all(links.map((link) => getLinkStats(link.id)));
  const now = new Date();

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Settings</h1>
        <Link href={`/${handle}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          View public profile
        </Link>
      </div>

      <details className="profileEditToggle" open>
        <summary>Edit profile</summary>
        <div style={{ marginTop: "0.85rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <EditProfileForm
            displayName={profileRow.displayName}
            bio={profileRow.bio}
            avatarUrl={profileRow.avatarUrl}
            coverUrl={profileRow.coverUrl}
            themePreset={profileRow.themePreset}
          />
        </div>
      </details>

      {/* Share/QR lives on the public profile now (/{handle}) — it's a
          "share this profile" tool useful to anyone, not an owner-only
          setting, so it isn't duplicated here. */}

      <div className="socialLinksRow" style={{ marginTop: "1.1rem" }}>
        {profileRow.socialLinks.length === 0 && <p className="mutedText">No social links yet.</p>}
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
              <button type="submit" className="button buttonSecondary iconButton" aria-label={`Remove ${social.platform} link`}>
                ✕
              </button>
            </form>
          </span>
        ))}
      </div>
      <div style={{ marginTop: "0.75rem" }}>
        <SocialLinksForm />
      </div>

      <div className="linksSection" style={{ marginTop: "1.5rem" }}>
        <p className="sectionHeading">Links</p>
        {links.length === 0 && <p className="mutedText">No links yet.</p>}
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
                      {link.isFeatured ? "★" : "☆"}
                    </button>
                  </form>
                  <form action={moveLink}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button type="submit" className="button buttonSecondary iconButton" disabled={index === 0} aria-label="Move up">
                      ↑
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
                      ↓
                    </button>
                  </form>
                  <form action={deleteLink}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete">
                      ✕
                    </button>
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
