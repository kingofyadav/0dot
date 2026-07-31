import type { CSSProperties } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { followUser, unfollowUser } from "@/app/actions/follow";
import { blockUser, unblockUser } from "@/app/actions/block";
import { isBlocked } from "@/lib/blocks";
import { getThemePreset, getSocialPlatformLabel, type SocialPlatform } from "@/lib/theme-presets";
import { Logo } from "@/components/Logo";
import { SocialIcon } from "@/components/SocialIcon";
import { CopyLinkButton } from "@/components/CopyLinkButton";

// Public, read-only profile — identity, links, follow counts. No posts, no
// editing UI: those are what /s/[username] (owner-only settings) is for.
// Think of this page as the "API endpoint" view of an identity — anyone can
// look, only the owner can change anything, and that's done somewhere else.
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const username = await db.username.findUnique({
    where: { handle },
    include: {
      user: {
        include: {
          profile: {
            include: {
              links: { orderBy: { position: "asc" } },
              socialLinks: { orderBy: { position: "asc" } },
            },
          },
        },
      },
    },
  });

  if (!username || !username.user.profile) {
    notFound();
  }

  const profile = username.user.profile;
  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === username.userId;

  const [isFollowing, blockedByViewer, viewerBlockedByOwner] =
    currentUser && !isOwner
      ? await Promise.all([
          db.follow
            .findUnique({
              where: { followerId_followeeId: { followerId: currentUser.id, followeeId: username.userId } },
            })
            .then((row) => row !== null),
          isBlocked(currentUser.id, username.userId),
          isBlocked(username.userId, currentUser.id),
        ])
      : [false, false, false];
  // If the owner has blocked the viewer, no Follow/Block controls render at
  // all — quietly, matching how most platforms don't advertise block state.
  const showViewerControls = currentUser && !isOwner && !viewerBlockedByOwner;

  const now = new Date();
  const visibleLinks = profile.links
    .filter((link) => {
      if (isOwner) return true; // owners see scheduled links too, managed at /s/{handle}
      if (link.startsAt && link.startsAt > now) return false;
      if (link.endsAt && link.endsAt < now) return false;
      return true;
    })
    // Featured links render first, larger — ties within each group keep
    // their existing position order (phase-1 spec §4.2). Array.prototype
    // .sort() is stable per the ECMAScript spec, so a same-featured-state
    // comparison of 0 preserves the incoming position-ascending order.
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));

  const theme = getThemePreset(profile.themePreset);

  // Same dynamic-origin reasoning as src/app/qr/[handle]/route.ts — correct
  // in local dev and any deployment without a hardcoded domain.
  const headersList = await headers();
  const host = headersList.get("host") ?? "0dot.in";
  const proto = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const profileUrl = `${proto}://${host}/${username.handle}`;

  return (
    <div
      className="profileCard"
      style={
        {
          "--accent": theme.accent,
          "--accent-strong": theme.accentStrong,
          "--accent-soft": theme.accentSoft,
        } as CSSProperties
      }
    >
      <div className="profileCover">
        {profile.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
          <img src={profile.coverUrl} alt="" className="profileCoverImg" />
        ) : (
          <div className="profileCoverPlaceholder" />
        )}
      </div>
      <div className="profileHeaderRow">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
          <img
            src={profile.avatarUrl}
            alt={profile.displayName}
            width={96}
            height={96}
            className="profileAvatar"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span className="profileAvatar" style={{ display: "inline-flex", borderRadius: "50%" }}>
            <Logo size={96} />
          </span>
        )}
        <div className="profileHeaderInfo">
          {/* Name and primary actions (Follow/Message for a visitor, Edit
              profile for the owner) share one row — the two things
              competing hardest for attention here, so they're grouped and
              given a deliberate gap rather than the name/buttons crowding
              together with whatever space was left over. Wraps to its own
              line, still left-aligned under the name, once both can't fit. */}
          <div className="profileIdentityRow">
            <h1 className="profileName">
              {profile.displayName}
              {profile.isVerified && (
                <span className="verifiedBadge" title="Verified" aria-label="Verified">
                  ✓
                </span>
              )}
            </h1>
            {(isOwner || showViewerControls) && (
              <div className="profileActions">
                {isOwner && (
                  <Link href={`/s/${username.handle}`} className="button buttonSecondary">
                    Edit profile
                  </Link>
                )}
                {showViewerControls && (
                  <>
                    <form action={isFollowing ? unfollowUser : followUser}>
                      <input type="hidden" name="followeeId" value={username.userId} />
                      <button
                        type="submit"
                        className={`button${isFollowing ? " buttonSecondary" : ""}`}
                        aria-pressed={isFollowing}
                      >
                        {isFollowing ? "Following" : "Follow"}
                      </button>
                    </form>
                    {/* Reachable regardless of follow state — this is the
                        entry point for phase-2 spec §5.2's "message
                        request" path (a DM to someone who doesn't follow
                        you back), since there's no global user search yet
                        to reach a non-followed account any other way.
                        Hidden only when the viewer has blocked this account
                        (blockedByViewer) — sending would just be rejected
                        server-side, per the same check in sendMessage. */}
                    {!blockedByViewer && (
                      <Link href={`/messages/new?to=${username.userId}`} className="button buttonSecondary">
                        Message
                      </Link>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="profileMeta">
            <span>{visibleLinks.length} link{visibleLinks.length === 1 ? "" : "s"}</span>
            <Link href={`/${username.handle}/followers`}>
              {profile.followerCount} follower{profile.followerCount === 1 ? "" : "s"}
            </Link>
            <Link href={`/${username.handle}/following`}>
              {profile.followingCount} following
            </Link>
          </div>
        </div>
      </div>

      {profile.bio && <p className="profileBio">{profile.bio}</p>}

      {/* Share and Block are real but secondary (spec §3.4 calls Share
          "togglable via a share sheet", not a primary action) — grouped
          into one row below the bio instead of competing with the
          Follow/Message/Edit actions up in the header. */}
      <div className="profileUtilityRow">
        <details className="profileEditToggle">
          <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
            Share
          </summary>
          <div style={{ marginTop: "0.85rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- server-generated SVG route, not a static asset */}
            <img src={`/qr/${username.handle}`} alt={`QR code for ${profileUrl}`} width={120} height={120} style={{ borderRadius: "12px", background: "#fff" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span className="mutedText">{profileUrl}</span>
              <CopyLinkButton url={profileUrl} />
            </div>
          </div>
        </details>

        {showViewerControls && (
          blockedByViewer ? (
            <form action={unblockUser}>
              <input type="hidden" name="blockedId" value={username.userId} />
              <button type="submit" className="button buttonSecondary buttonSmall">
                Unblock @{username.handle}
              </button>
            </form>
          ) : (
            <details className="profileEditToggle">
              <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
                Block @{username.handle}
              </summary>
              <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "32ch" }}>
                <p className="mutedText" style={{ fontSize: "0.85rem" }}>
                  Removes any follow between you, hides their notifications
                  from you going forward, and stops suggesting them to
                  you. You can unblock them later.
                </p>
                <form action={blockUser}>
                  <input type="hidden" name="blockedId" value={username.userId} />
                  <button type="submit" className="button buttonDanger buttonSmall">
                    Yes, block @{username.handle}
                  </button>
                </form>
              </div>
            </details>
          )
        )}
      </div>

      {profile.socialLinks.length > 0 && (
        <div className="socialLinksRow">
          {profile.socialLinks.map((social) => (
            <a
              key={social.id}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="button buttonSecondary buttonSmall"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <SocialIcon platform={social.platform as SocialPlatform} />
              {getSocialPlatformLabel(social.platform)}
            </a>
          ))}
        </div>
      )}

      <div className="linksSection">
        {visibleLinks.length > 0 && <p className="sectionHeading">Links</p>}
        {visibleLinks.length === 0 && (
          <p className="mutedText">No links yet.</p>
        )}
        {visibleLinks.map((link) => (
          <div
            key={link.id}
            className={`profileLinkItem${link.isFeatured ? " featuredLink" : ""}`}
          >
            <a
              href={`/r/${link.id}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              style={{ flex: 1, fontWeight: 600 }}
            >
              {link.label}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
