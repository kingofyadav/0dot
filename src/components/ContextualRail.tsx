import { Suspense } from "react";
import Link from "next/link";
import { Bell, Bot, Globe, Link2, LogIn, PenLine, Sparkles, TrendingUp, Palette, Users, BadgeCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getRecentNotificationsPreview, getNotificationVerb, getNotificationHref } from "@/lib/notifications";
import { getSuggestedUsers, getPublicSuggestedUsers } from "@/lib/suggested-users";
import { getFolloweeIds } from "@/lib/follow-graph";
import { UserListItem } from "@/components/UserListItem";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";

const PREVIEW_COUNT = 5;
const SUGGESTED_COUNT = 5;

// Right-side contextual panel, a fixed global element on every route with
// site chrome (see RootLayout) — including for anonymous visitors now: the
// notifications/AI/upgrade sections are still inherently personalized and
// stay hidden, but "who to follow" doesn't need a viewer, so a logged-out
// visitor gets that plus a sign-in prompt instead of an empty rail. Every
// actionable control in either branch (Follow, notification links, etc.)
// already redirects an anonymous visitor to /login via the underlying
// server action's requireVerifiedUser() guard — nothing extra to wire here.
export async function ContextualRail() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return <AnonymousContextualRail />;

  const notifications = await getRecentNotificationsPreview(currentUser.id, PREVIEW_COUNT);
  const recipientHandle = currentUser.username?.handle ?? null;

  return (
    <div className="contextualRail">
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
        {notifications.length === 0 && <EmptyState message="Nothing yet." />}
        <div className="stack">
          {notifications.map((n) => (
            <Link key={n.id} href={getNotificationHref(n, recipientHandle)} className="railNotificationItem">
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

      {/* getSuggestedUsers is the rail's heaviest call — ~6 reads plus a
          logAIGeneration write — so it streams in on its own boundary
          instead of holding back the Notifications section above and the
          static cards below. */}
      <Suspense fallback={<SuggestedForYouFallback />}>
        <SuggestedForYouSection userId={currentUser.id} />
      </Suspense>

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
