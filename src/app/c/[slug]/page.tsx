import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCommunityMember } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";
import { joinCommunity, leaveCommunity } from "@/app/actions/communities";
import { getCommunityFeedPosts } from "@/lib/community-feed";
import { getVotedPollOptionIds } from "@/lib/feed-query";
import { parseCursor } from "@/lib/pagination";
import { communityTagLabel } from "@/lib/community-tags";
import { Logo } from "@/components/Logo";
import { CommunityFeedList } from "./CommunityFeedList";

const VISIBILITY_LABEL: Record<string, string> = {
  public: "Public",
  restricted: "Restricted",
  private: "Private",
};

// Identity + membership header (step 1) plus, per §3.1's visibility rules,
// the community's post feed (step 3) — public/restricted content is
// visible to everyone, private content only to members.
export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string; flair?: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const community = await db.community.findUnique({ where: { slug } });
  if (!community) notFound();

  // phase-3 spec §5/§6: rules and discovery tags are identity/about-level
  // info, visible the same way the description already is — not gated by
  // the private-content check below (that gate protects posts/feed, not
  // the community's own about info).
  const [rules, tags] = await Promise.all([
    db.communityRule.findMany({ where: { communityId: community.id }, orderBy: { position: "asc" } }),
    db.communityTag.findMany({ where: { communityId: community.id } }),
  ]);

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getCommunityMember(community.id, currentUser.id) : null;
  const isOwner = membership?.role === "owner";
  // Moderators get the Manage link too — they can mute/ban members and
  // approve join requests there, just not the owner-only Danger Zone.
  const isStaff = isOwner || (membership?.role === "moderator" && membership?.status === "active");
  // Muted counts as "still a member" for leave purposes — muting restricts
  // writes (once there's content to restrict), not membership itself.
  const isActiveMember = membership?.status === "active" || membership?.status === "muted";
  const isPending = membership?.status === "pending";

  // spec §3.1/§17.1: private content is member-only; public/restricted
  // content is visible to everyone regardless of membership (restricted
  // only gates *joining*, not viewing). phase-14 spec §4.3: an
  // org-restricted community is gated the same way regardless of its own
  // visibility value (isGatedFromCommunityContent, organizations.ts).
  const canViewContent = !isGatedFromCommunityContent(community, isActiveMember);

  return (
    <>
      <div className="profileCard">
        <div className="profileCover">
          {community.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
            <img src={community.coverUrl} alt="" className="profileCoverImg" />
          ) : (
            <div className="profileCoverPlaceholder" />
          )}
        </div>
        <div className="profileHeaderRow">
          {community.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
            <img
              src={community.avatarUrl}
              alt={community.name}
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
            <div className="profileIdentityRow">
              <h1 className="profileName">{community.name}</h1>
            </div>
            <div className="profileMeta">
              <span>{VISIBILITY_LABEL[community.visibility] ?? community.visibility}</span>
              <span>
                {community.memberCount} member{community.memberCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>

        {community.description && <p className="profileBio">{community.description}</p>}

        {tags.length > 0 && (
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
            {tags.map((t) => (
              <Link
                key={t.tag}
                href={`/search?q=${encodeURIComponent(communityTagLabel(t.tag))}&tab=communities`}
                className="mutedText"
                style={{
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.55rem",
                  borderRadius: "999px",
                  border: "1px solid var(--border)",
                }}
              >
                {communityTagLabel(t.tag)}
              </Link>
            ))}
          </div>
        )}

        {/* prefetch={false}: same burst-prefetch-triggers-503 mechanism as
            the business page's tab row (see the "Disable prefetch on
            persistent chrome nav links" commit) — dynamic, DB-backed
            sub-routes mounted together. */}
        <div className="profileActionsGrid">
          <Link href={`/c/${community.slug}/voice`} className="button buttonSecondary" prefetch={false}>
            Voice
          </Link>
          <Link href={`/c/${community.slug}/chat`} className="button buttonSecondary" prefetch={false}>
            Chat
          </Link>
          <Link href={`/c/${community.slug}/wiki`} className="button buttonSecondary" prefetch={false}>
            Wiki
          </Link>
          {isStaff && (
            <Link href={`/c/${community.slug}/manage`} className="button buttonSecondary" prefetch={false}>
              Manage
            </Link>
          )}
          {currentUser && !isOwner && isActiveMember && (
            <form action={leaveCommunity}>
              <input type="hidden" name="communityId" value={community.id} />
              <button type="submit" className="button buttonSecondary">
                Leave
              </button>
            </form>
          )}
          {currentUser && !membership && (
            <form action={joinCommunity}>
              <input type="hidden" name="communityId" value={community.id} />
              <button type="submit" className="button">
                Join
              </button>
            </form>
          )}
          {isPending && (
            <span className="button buttonSecondary" aria-disabled="true" style={{ cursor: "default", opacity: 0.7 }}>
              Request pending
            </span>
          )}
        </div>

        {rules.length > 0 && (
          <details className="profileEditToggle" style={{ marginTop: "0.75rem" }}>
            <summary className="sectionHeading" style={{ cursor: "pointer" }}>
              Rules ({rules.length})
            </summary>
            <ol style={{ marginTop: "0.5rem", paddingInlineStart: "1.2rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {rules.map((rule) => (
                <li key={rule.id}>
                  <strong>{rule.title}</strong>
                  {rule.body && <p className="mutedText" style={{ margin: "0.15rem 0 0" }}>{rule.body}</p>}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>

      {!canViewContent ? (
        <p className="mutedText" style={{ marginTop: "1rem" }}>
          This is a private community. Join to see posts.
        </p>
      ) : (
        <CommunityFeedContent
          community={community}
          currentUser={currentUser}
          canPost={membership?.status === "active"}
          canModerate={isStaff}
          searchParams={searchParams}
        />
      )}
    </>
  );
}

async function CommunityFeedContent({
  community,
  currentUser,
  canPost,
  canModerate,
  searchParams,
}: {
  community: { id: string; slug: string };
  currentUser: Awaited<ReturnType<typeof getCurrentUser>>;
  canPost: boolean;
  canModerate: boolean;
  searchParams: Promise<{ cursor?: string; flair?: string }>;
}) {
  const { cursor: rawCursor, flair: rawFlair } = await searchParams;
  const cursor = parseCursor(rawCursor);
  const activeFlairId = rawFlair?.trim() || null;

  const flairs = await db.communityPostFlair.findMany({ where: { communityId: community.id } });
  // Ignore an invalid/stale flairId from the URL rather than erroring —
  // same "quiet no-op on bad input" posture as this codebase's write-side
  // actions, applied here to a read-side filter instead.
  const validFlairId = activeFlairId && flairs.some((f) => f.id === activeFlairId) ? activeFlairId : null;

  const {
    pinned,
    items: posts,
    nextCursor,
  } = await getCommunityFeedPosts({
    communityId: community.id,
    cursor,
    flairId: validFlairId,
    viewerId: currentUser?.id ?? null,
  });

  const postIds = [...pinned, ...posts].map((p) => p.id);
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
  const votedOptionIds = await getVotedPollOptionIds(currentUser?.id, [...pinned, ...posts]);
  const ownTiers = currentUser
    ? await db.membershipTier.findMany({
        where: { creatorId: currentUser.id, status: "active" },
        select: { id: true, name: true },
        orderBy: { level: "asc" },
      })
    : [];

  return (
    <CommunityFeedList
      communitySlug={community.slug}
      communityId={community.id}
      pinned={pinned}
      posts={posts}
      currentUser={currentUser}
      likedPostIds={likedPostIds}
      bookmarkedPostIds={bookmarkedPostIds}
      votedOptionIds={votedOptionIds}
      nextCursor={nextCursor}
      canPost={canPost}
      canModerate={canModerate}
      flairs={flairs}
      ownTiers={ownTiers}
      activeFlairId={validFlairId}
    />
  );
}
