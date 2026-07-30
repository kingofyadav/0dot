import type { CSSProperties } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteLink, deleteSocialLink, moveLink, toggleFeatured } from "@/app/actions/profile";
import { getLinkStats } from "@/lib/link-stats";
import { getThemePreset } from "@/lib/theme-presets";
import { parseCursor, cursorWhere, paginate, POST_PAGE_SIZE } from "@/lib/pagination";
import { EditProfileForm } from "./EditProfileForm";
import { AddLinkForm } from "./AddLinkForm";
import { SocialLinksForm } from "./SocialLinksForm";
import { Logo } from "@/components/Logo";
import { PostCard } from "@/components/PostCard";
import { CopyLinkButton } from "@/components/CopyLinkButton";

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ postsCursor?: string }>;
}) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();
  const { postsCursor: rawPostsCursor } = await searchParams;
  const postsCursor = parseCursor(rawPostsCursor);

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

  const authorInclude = { profile: true, username: true } as const;
  const mediaInclude = { orderBy: { position: "asc" as const } };
  const postRows = await db.post.findMany({
    where: {
      authorId: username.userId,
      deletedAt: null,
      replyToId: null,
      ...cursorWhere(postsCursor),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: {
      author: { include: authorInclude },
      media: mediaInclude,
      repostOf: { include: { author: { include: authorInclude }, media: mediaInclude } },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { author: { include: authorInclude }, media: mediaInclude },
      },
    },
  });
  const { items: posts, nextCursor: nextPostsCursor } = paginate(postRows);
  const postIds = posts.map((p) => p.id);
  const postCount = await db.post.count({
    where: { authorId: username.userId, deletedAt: null, replyToId: null },
  });
  const [likedPostIds, bookmarkedPostIds] = currentUser
    ? await Promise.all([
        db.postLike
          .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
          .then((rows) => new Set(rows.map((r) => r.postId))),
        db.bookmark
          .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
          .then((rows) => new Set(rows.map((r) => r.postId))),
      ])
    : [new Set<string>(), new Set<string>()];

  const now = new Date();
  const visibleLinks = profile.links
    .filter((link) => {
      if (isOwner) return true; // owners see scheduled links too, marked below
      if (link.startsAt && link.startsAt > now) return false;
      if (link.endsAt && link.endsAt < now) return false;
      return true;
    })
    // Featured links render first, larger — ties within each group keep
    // their existing position order (phase-1 spec §4.2). Array.prototype
    // .sort() is stable per the ECMAScript spec, so a same-featured-state
    // comparison of 0 preserves the incoming position-ascending order.
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));

  // Analytics are a real query per link — only paid for on the owner's own
  // view, never for visitors just browsing the profile.
  const linkStats = isOwner
    ? await Promise.all(visibleLinks.map((link) => getLinkStats(link.id)))
    : null;

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
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700 }}>
            {profile.displayName}
            {profile.isVerified && (
              <span className="verifiedBadge" title="Verified" aria-label="Verified">
                ✓
              </span>
            )}
          </h1>
          <div className="profileMeta">
            <span>{visibleLinks.length} link{visibleLinks.length === 1 ? "" : "s"}</span>
            <span>{postCount} post{postCount === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      {/* Not shown by default (spec §3.4: "togglable via a share sheet") */}
      <details className="profileEditToggle" style={{ marginTop: "0.75rem" }}>
        <summary>Share</summary>
        <div style={{ marginTop: "0.85rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- server-generated SVG route, not a static asset */}
          <img src={`/qr/${username.handle}`} alt={`QR code for ${profileUrl}`} width={120} height={120} style={{ borderRadius: "12px", background: "#fff" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <span className="mutedText">{profileUrl}</span>
            <CopyLinkButton url={profileUrl} />
          </div>
        </div>
      </details>

      {profile.bio && <p className="profileBio">{profile.bio}</p>}

      {(profile.socialLinks.length > 0 || isOwner) && (
        <div className="socialLinksRow">
          {profile.socialLinks.length === 0 && !isOwner && (
            <p className="mutedText">No social links yet.</p>
          )}
          {profile.socialLinks.map((social) => (
            <span key={social.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
              <a
                href={social.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="button buttonSecondary"
                style={{ padding: "0.4rem 0.7rem", fontSize: "0.85rem" }}
              >
                {social.platform[0].toUpperCase() + social.platform.slice(1)}
              </a>
              {isOwner && (
                <form action={deleteSocialLink}>
                  <input type="hidden" name="socialLinkId" value={social.id} />
                  <button type="submit" className="button buttonSecondary iconButton" aria-label={`Remove ${social.platform} link`}>
                    ✕
                  </button>
                </form>
              )}
            </span>
          ))}
        </div>
      )}

      {isOwner && (
        <details className="profileEditToggle" style={{ marginTop: "1.1rem" }}>
          <summary>Edit profile</summary>
          <div style={{ marginTop: "0.85rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <EditProfileForm
              displayName={profile.displayName}
              bio={profile.bio}
              avatarUrl={profile.avatarUrl}
              coverUrl={profile.coverUrl}
              themePreset={profile.themePreset}
            />
            <SocialLinksForm />
          </div>
        </details>
      )}

      <div className="linksSection">
        {visibleLinks.length > 0 && <p className="sectionHeading">Links</p>}
        {visibleLinks.length === 0 && (
          <p className="mutedText">No links yet.</p>
        )}
        {visibleLinks.map((link, index) => {
          const isScheduledHidden =
            isOwner &&
            ((link.startsAt && link.startsAt > now) ||
              (link.endsAt && link.endsAt < now));
          const stats = linkStats?.[index];
          return (
            <div
              key={link.id}
              className={`profileLinkItem${link.isFeatured ? " featuredLink" : ""}`}
              style={{
                opacity: isScheduledHidden ? 0.5 : 1,
                flexDirection: "column",
                alignItems: "stretch",
                gap: "0.35rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <a
                  href={`/r/${link.id}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  style={{ flex: 1, fontWeight: 600 }}
                >
                  {link.label}
                  {isScheduledHidden && (
                    <span className="mutedText"> (scheduled)</span>
                  )}
                </a>
                {isOwner && (
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
                      <button
                        type="submit"
                        className="button buttonSecondary iconButton"
                        disabled={index === 0}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                    </form>
                    <form action={moveLink}>
                      <input type="hidden" name="linkId" value={link.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        className="button buttonSecondary iconButton"
                        disabled={index === visibleLinks.length - 1}
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
                )}
              </div>

              {isOwner && stats && (
                <details className="profileEditToggle">
                  <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
                    {stats.total} click{stats.total === 1 ? "" : "s"}
                  </summary>
                  <div className="mutedText" style={{ fontSize: "0.85rem", marginTop: "0.4rem" }}>
                    <p>{stats.last7d} in last 7 days · {stats.last30d} in last 30 days</p>
                    {stats.topReferrers.length > 0 ? (
                      <p>
                        Top referrers:{" "}
                        {stats.topReferrers.map((r) => `${r.host} (${r.count})`).join(", ")}
                      </p>
                    ) : (
                      <p>No referrer data yet.</p>
                    )}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {isOwner && (
        <div style={{ marginTop: "1.5rem" }}>
          <AddLinkForm />
        </div>
      )}

      <div className="postsSection">
        <p className="sectionHeading">Posts</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {posts.length === 0 && <p className="mutedText">No posts yet.</p>}
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isLiked={likedPostIds.has(post.id)}
              isBookmarked={bookmarkedPostIds.has(post.id)}
              isOwner={currentUser?.id === post.authorId}
              currentUserId={currentUser?.id}
            />
          ))}
        </div>
        {nextPostsCursor && (
          <Link
            href={`/${username.handle}?postsCursor=${encodeURIComponent(nextPostsCursor)}`}
            className="button buttonSecondary loadMoreLink"
          >
            Load more
          </Link>
        )}
      </div>
    </div>
  );
}
