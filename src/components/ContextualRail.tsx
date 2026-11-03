import { Suspense } from "react";
import Link from "next/link";
import { Bell, Bot, Flame, Globe, Link2, LogIn, PenLine, Sparkles, TrendingUp, Palette, Users, BadgeCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getRecentNotificationsPreview, getNotificationVerb, getNotificationHref } from "@/lib/notifications";
import { getSuggestedUsers, getPublicSuggestedUsers } from "@/lib/suggested-users";
import { getFolloweeIds } from "@/lib/follow-graph";
import { getTrendingPosts } from "@/lib/trending";
import { UserListItem } from "@/components/UserListItem";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";

const PREVIEW_COUNT = 5;
const SUGGESTED_COUNT = 5;
const TRENDING_PREVIEW_COUNT = 3;
const TRENDING_SNIPPET_LENGTH = 80;

// Routes whose own content already *is* the rail's default "Notifications"
// section — showing it again next to the page it duplicates read as a
// layout bug in review (world-class-pro-level pass, 2026-10-01). Scoped to
// an exact-prefix check since /notifications itself has no further
// sub-routes worth distinguishing.
function isNotificationsPage(pathname: string): boolean {
  return pathname === "/notifications";
}

// /explore's own ExploreDiscovery section already renders "People to
// follow" from the same getSuggestedUsers() call this rail's "Suggested for
// you" makes — same viewer in, same ranked list out, so the two sections
// showed the identical 5 people twice on screen. Same self-duplication bug
// class as isNotificationsPage above, just missed in that pass.
function isExplorePage(pathname: string): boolean {
  return pathname === "/explore";
}

// /explore is a general discovery surface (people/communities/businesses +
// an all-posts feed) where a "what's hot right now" widget adds content the
// page doesn't already show. /trending is NOT that surface — its own content
// already *is* the trending list, so showing this widget there duplicated
// the page's own top post, same self-duplication bug isNotificationsPage
// already exists to prevent.
function wantsTrendingWidget(pathname: string): boolean {
  return pathname === "/explore";
}

// Right-side contextual panel, a fixed global element on every route with
// site chrome (see RootLayout) — including for anonymous visitors now: the
// notifications/AI/upgrade sections are still inherently personalized and
// stay hidden, but "who to follow" doesn't need a viewer, so a logged-out
// visitor gets that plus a sign-in prompt instead of an empty rail. Every
// actionable control in either branch (Follow, notification links, etc.)
// already redirects an anonymous visitor to /login via the underlying
// server action's requireVerifiedUser() guard — nothing extra to wire here.
export async function ContextualRail({ pathname }: { pathname: string }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return <AnonymousContextualRail />;

  const recipientHandle = currentUser.username?.handle ?? null;
  const showNotifications = !isNotificationsPage(pathname);
  const showTrending = wantsTrendingWidget(pathname);
  const showSuggestedForYou = !isExplorePage(pathname);

  return (
    <div className="contextualRail">
      {showNotifications && (
        <Suspense fallback={<NotificationsPreviewFallback />}>
          <NotificationsPreviewSection userId={currentUser.id} recipientHandle={recipientHandle} />
        </Suspense>
      )}

      {showTrending && (
        <Suspense fallback={<TrendingNowFallback />}>
          <TrendingNowSection viewerId={currentUser.id} />
        </Suspense>
      )}

      {/* getSuggestedUsers is the rail's heaviest call — ~6 reads plus a
          logAIGeneration write — so it streams in on its own boundary
          instead of holding back the sections above and the static cards
          below. Suppressed on /explore itself (see isExplorePage) — that
          page's own ExploreDiscovery section already renders the identical
          ranked list under "People to follow". */}
      {showSuggestedForYou && (
        <Suspense fallback={<SuggestedForYouFallback />}>
          <SuggestedForYouSection userId={currentUser.id} />
        </Suspense>
      )}

      <section className="railAiCard">
        <div className="railSectionHeader">
          <h2>
            <Bot size={16} aria-hidden="true" /> AI tools
          </h2>
        </div>
        <div className="railAiCardLinks">
          <Link href={recipientHandle ? `/s/${recipientHandle}` : "/feed"} prefetch={false} className="railAiCardLink">
            <PenLine size={14} aria-hidden="true" /> Write my bio with AI
          </Link>
          <Link
            href={recipientHandle ? `/s/${recipientHandle}/content/articles` : "/feed"}
            prefetch={false}
            className="railAiCardLink"
          >
            <Globe size={14} aria-hidden="true" /> Draft &amp; translate articles
          </Link>
        </div>
      </section>

      {recipientHandle && (
        <section className="railPlanCard">
          <div className="railPlanCardHeader">
            <h2>
              <Sparkles size={16} aria-hidden="true" /> <span className="brandUrl">0dot</span> Pro
            </h2>
            <span className="railPlanCardBadge">Upgrade</span>
          </div>
          <div className="railPlanCardPerks">
            <div className="railPlanCardPerk">
              <Link2 size={14} aria-hidden="true" /> Custom domain included
            </div>
            <div className="railPlanCardPerk">
              <TrendingUp size={14} aria-hidden="true" /> Full-history link analytics
            </div>
            <div className="railPlanCardPerk">
              <Palette size={14} aria-hidden="true" /> Extra curated themes
            </div>
          </div>
          <Link href={`/s/${recipientHandle}`} prefetch={false} className="button buttonSmall railPlanCardCta">
            See plans
          </Link>
        </section>
      )}
    </div>
  );
}

// Streamed separately from the rest of the rail (see the <Suspense> above).
// Re-derives the follow set via the cache()-wrapped getFolloweeIds rather
// than taking it as a prop, so it stays self-contained on its own boundary.
async function SuggestedForYouSection({ userId }: { userId: string }) {
  const [suggestedUsers, followingIds] = await Promise.all([
    getSuggestedUsers(userId, SUGGESTED_COUNT),
    getFolloweeIds(userId),
  ]);
  if (suggestedUsers.length === 0) return null;
  const followingSet = new Set(followingIds);
  // Same gap FIX_PLAN P3 #3 (see UserListItem.tsx) called out for other
  // lists: without this, a pending request against a private suggested
  // account would show "Follow" forever and silently no-op on repeat click.
  const pendingSet = new Set(
    (
      await db.follow.findMany({
        where: { followerId: userId, followeeId: { in: suggestedUsers.map((u) => u.id) }, status: "pending" },
        select: { followeeId: true },
      })
    ).map((f) => f.followeeId)
  );

  return (
    <section className="railSection">
      <div className="railSectionHeader">
        <h2>
          <Users size={16} aria-hidden="true" /> Suggested for you
        </h2>
        <Link href="/explore" prefetch={false}>See all</Link>
      </div>
      <div className="stack">
        {suggestedUsers.map((u) => (
          <UserListItem
            key={u.id}
            userId={u.id}
            handle={u.username?.handle ?? null}
            displayName={u.profile?.displayName ?? "Unknown"}
            avatarUrl={u.profile?.avatarUrl ?? null}
            isFollowing={followingSet.has(u.id)}
            isFollowRequestPending={pendingSet.has(u.id)}
            isSelf={false}
            showFollowButton
            showHandle={false}
            compact
          />
        ))}
      </div>
    </section>
  );
}

function SuggestedForYouFallback() {
  return (
    <section className="railSection" aria-busy="true">
      <div className="railSectionHeader">
        <h2>
          <Users size={16} aria-hidden="true" /> Suggested for you
        </h2>
      </div>
      <div className="stack">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height="2.25rem" style={{ display: "block" }} />
        ))}
      </div>
    </section>
  );
}

// Extracted out of ContextualRail's own body (unchanged markup/behavior)
// so it can stream in on its own <Suspense> boundary like the other
// sections, and be skipped entirely on /notifications where it would just
// repeat that page's own content.
async function NotificationsPreviewSection({ userId, recipientHandle }: { userId: string; recipientHandle: string | null }) {
  const notifications = await getRecentNotificationsPreview(userId, PREVIEW_COUNT);

  return (
    <section className="railSection">
      <div className="railSectionHeader">
        <h2>
          <Bell size={16} aria-hidden="true" /> Notifications
        </h2>
        {/* prefetch={false}: this rail is persistent chrome on every route
            (see the component comment above) — eagerly prefetching these
            fixed nav-style destinations on every single page view was
            contributing to the DB-connection-burst 503s NavLinks.tsx's
            own comment documents (same root cause, same fix). */}
        <Link href="/notifications" prefetch={false}>See all</Link>
      </div>
      {notifications.length === 0 && <EmptyState title="Nothing yet." />}
      <div className="stack">
        {/* prefetch={false}: up to PREVIEW_COUNT (5) of these render at
            once, each pointing at a different post/profile/message
            thread — same DB-connection-burst-503 fix as the "See all"
            link above and every Link elsewhere in this file. */}
        {notifications.map((n) => (
          <Link key={n.id} href={getNotificationHref(n, recipientHandle)} prefetch={false} className="railNotificationItem">
            <strong>{n.actor?.profile?.displayName ?? "Someone"}</strong>
            {n.actor?.profile?.isVerified && (
              <span className="verifiedBadge" title="Verified" aria-label="Verified">
                <BadgeCheck size={14} aria-hidden="true" />
              </span>
            )}{" "}
            {getNotificationVerb(n.type, n.subjectType)}
          </Link>
        ))}
      </div>
    </section>
  );
}

function NotificationsPreviewFallback() {
  return (
    <section className="railSection" aria-busy="true">
      <div className="railSectionHeader">
        <h2>
          <Bell size={16} aria-hidden="true" /> Notifications
        </h2>
      </div>
      <div className="stack">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height="2.25rem" style={{ display: "block" }} />
        ))}
      </div>
    </section>
  );
}

// /explore and /trending's contextual replacement for the generic AI tools
// promo (see wantsTrendingWidget above) — the top few globally trending
// posts right now, each linking straight to the post on its author's
// profile (same `#post-{id}` anchor pattern notifications.ts uses). Reuses
// getTrendingPosts with no cursor rather than a dedicated query: it's
// already cached for anonymous-shaped results and recomputed on the same
// schedule /trending itself reads from.
async function TrendingNowSection({ viewerId }: { viewerId: string }) {
  const { items } = await getTrendingPosts({ cursor: null, viewerId });
  const preview = items.slice(0, TRENDING_PREVIEW_COUNT);
  if (preview.length === 0) return null;

  return (
    <section className="railSection">
      <div className="railSectionHeader">
        <h2>
          <Flame size={16} aria-hidden="true" /> Trending now
        </h2>
        <Link href="/trending" prefetch={false}>See all</Link>
      </div>
      <div className="stack">
        {preview.map((post) => {
          const handle = post.author.username?.handle;
          if (!handle) return null;
          const snippet =
            post.body.length > TRENDING_SNIPPET_LENGTH ? `${post.body.slice(0, TRENDING_SNIPPET_LENGTH).trimEnd()}…` : post.body;
          return (
            <Link key={post.id} href={`/${handle}#post-${post.id}`} prefetch={false} className="railNotificationItem">
              <strong>{post.author.profile?.displayName ?? handle}</strong>
              {post.author.profile?.isVerified && (
                <span className="verifiedBadge" title="Verified" aria-label="Verified">
                  <BadgeCheck size={14} aria-hidden="true" />
                </span>
              )}
              {snippet.trim().length > 0 ? `: ${snippet}` : " posted"}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TrendingNowFallback() {
  return (
    <section className="railSection" aria-busy="true">
      <div className="railSectionHeader">
        <h2>
          <Flame size={16} aria-hidden="true" /> Trending now
        </h2>
      </div>
      <div className="stack">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height="2.25rem" style={{ display: "block" }} />
        ))}
      </div>
    </section>
  );
}

async function AnonymousContextualRail() {
  const suggestedUsers = await getPublicSuggestedUsers(SUGGESTED_COUNT);

  return (
    <div className="contextualRail">
      <section className="railPlanCard">
        <div className="railPlanCardHeader">
          <h2>
            <LogIn size={16} aria-hidden="true" /> New here?
          </h2>
        </div>
        <div className="railPlanCardPerks">
          <div className="railPlanCardPerk">Log in to like, reply, and follow.</div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.15rem" }}>
          <Link href="/login" prefetch={false} className="button buttonSmall" style={{ flex: 1, textAlign: "center" }}>
            Log in
          </Link>
          <Link href="/signup" prefetch={false} className="button buttonSecondary buttonSmall" style={{ flex: 1, textAlign: "center" }}>
            Sign up
          </Link>
        </div>
      </section>

      {suggestedUsers.length > 0 && (
        <section className="railSection">
          <div className="railSectionHeader">
            <h2>
              <Users size={16} aria-hidden="true" /> Who to follow
            </h2>
          </div>
          <div className="stack">
            {suggestedUsers.map((u) => (
              <UserListItem
                key={u.id}
                userId={u.id}
                handle={u.username?.handle ?? null}
                displayName={u.profile?.displayName ?? "Unknown"}
                avatarUrl={u.profile?.avatarUrl ?? null}
                isFollowing={false}
                isSelf={false}
                showFollowButton
                showHandle={false}
                compact
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
