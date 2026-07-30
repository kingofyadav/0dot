import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteLink, deleteSocialLink, moveLink } from "@/app/actions/profile";
import { getLinkStats } from "@/lib/link-stats";
import { getThemePreset } from "@/lib/theme-presets";
import { EditProfileForm } from "./EditProfileForm";
import { AddLinkForm } from "./AddLinkForm";
import { SocialLinksForm } from "./SocialLinksForm";
import { Logo } from "@/components/Logo";
import { PostCard } from "@/components/PostCard";

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

  const authorInclude = { profile: true, username: true } as const;
  const posts = await db.post.findMany({
    where: { authorId: username.userId, deletedAt: null, replyToId: null },
    orderBy: { createdAt: "desc" },
    include: {
      author: { include: authorInclude },
      repostOf: { include: { author: { include: authorInclude } } },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { author: { include: authorInclude } },
      },
    },
  });
  const postIds = posts.map((p) => p.id);
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
  const visibleLinks = profile.links.filter((link) => {
    if (isOwner) return true; // owners see scheduled links too, marked below
    if (link.startsAt && link.startsAt > now) return false;
    if (link.endsAt && link.endsAt < now) return false;
    return true;
  });

  // Analytics are a real query per link — only paid for on the owner's own
  // view, never for visitors just browsing the profile.
  const linkStats = isOwner
    ? await Promise.all(visibleLinks.map((link) => getLinkStats(link.id)))
    : null;

  const theme = getThemePreset(profile.themePreset);

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
      {profile.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
        <img
          src={profile.coverUrl}
          alt=""
          style={{ width: "100%", maxHeight: "160px", objectFit: "cover", borderRadius: "16px", marginBottom: "1.1rem" }}
        />
      )}
      <div className="profileHeaderRow">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
          <img
            src={profile.avatarUrl}
            alt={profile.displayName}
            width={72}
            height={72}
            className="profileAvatar"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span className="profileAvatar" style={{ display: "inline-flex", borderRadius: "50%" }}>
            <Logo size={72} />
          </span>
        )}
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700 }}>{profile.displayName}</h1>
          <p className="mutedText">0dot.in/{username.handle}</p>
        </div>
      </div>

      {profile.bio && <p style={{ marginTop: "1.1rem" }}>{profile.bio}</p>}

      {(profile.socialLinks.length > 0 || isOwner) && (
        <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
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

      <div style={{ marginTop: "1.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
              className="profileLinkItem"
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

      <div style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.85rem" }}>
          Posts
        </h2>
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
      </div>
    </div>
  );
}
