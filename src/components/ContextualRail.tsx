import Link from "next/link";
import { Bell, Bot, Globe, Link2, PenLine, Sparkles, TrendingUp, Palette, Users, BadgeCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getRecentNotificationsPreview, getNotificationVerb, getNotificationHref } from "@/lib/notifications";
import { getSuggestedUsers } from "@/lib/suggested-users";
import { UserListItem } from "@/components/UserListItem";
import { EmptyState } from "@/components/EmptyState";

const PREVIEW_COUNT = 5;
const SUGGESTED_COUNT = 5;

// Right-side contextual panel — opt-in per route (see src/lib/route-context.ts,
// only /feed, /explore, /notifications), not a fixed global element
// (docs/foundations/NAVIGATION.md). Returns null for anonymous visitors:
// every section here is inherently personalized.
export async function ContextualRail() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;

  const [notifications, followingRows] = await Promise.all([
    getRecentNotificationsPreview(currentUser.id, PREVIEW_COUNT),
    db.follow.findMany({ where: { followerId: currentUser.id }, select: { followeeId: true } }),
  ]);
  const followingSet = new Set(followingRows.map((f) => f.followeeId));
  const suggestedUsers = await getSuggestedUsers(currentUser.id, SUGGESTED_COUNT);
  const recipientHandle = currentUser.username?.handle ?? null;

  return (
    <div className="contextualRail">
      <section className="railSection">
        <div className="railSectionHeader">
          <h2>
            <Bell size={16} aria-hidden="true" /> Notifications
          </h2>
          <Link href="/notifications">See all</Link>
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

      {suggestedUsers.length > 0 && (
        <section className="railSection">
          <div className="railSectionHeader">
            <h2>
              <Users size={16} aria-hidden="true" /> Suggested for you
            </h2>
            <Link href="/explore">See all</Link>
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
              />
            ))}
          </div>
        </section>
      )}

      <section className="railAiCard">
        <div className="railSectionHeader">
          <h2>
            <Bot size={16} aria-hidden="true" /> AI tools
          </h2>
        </div>
        <div className="railAiCardLinks">
          <Link href={recipientHandle ? `/s/${recipientHandle}` : "/feed"} className="railAiCardLink">
            <PenLine size={14} aria-hidden="true" /> Write my bio with AI
          </Link>
          <Link
            href={recipientHandle ? `/s/${recipientHandle}/content/articles` : "/feed"}
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
              <Sparkles size={16} aria-hidden="true" /> 0dot Pro
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
          <Link href={`/s/${recipientHandle}`} className="button buttonSmall railPlanCardCta">
            See plans
          </Link>
        </section>
      )}
    </div>
  );
}
