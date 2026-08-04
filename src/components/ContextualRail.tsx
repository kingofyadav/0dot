import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getRecentNotificationsPreview, getNotificationVerb, getNotificationHref } from "@/lib/notifications";
import { getSuggestedUsers } from "@/lib/suggested-users";
import { UserListItem } from "@/components/UserListItem";

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
          <h2>Notifications</h2>
          <Link href="/notifications">See all</Link>
        </div>
        {notifications.length === 0 && <p className="mutedText">Nothing yet.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {notifications.map((n) => (
            <Link key={n.id} href={getNotificationHref(n, recipientHandle)} className="railNotificationItem">
              <strong>{n.actor?.profile?.displayName ?? "Someone"}</strong>
              {n.actor?.profile?.isVerified && (
                <span className="verifiedBadge" title="Verified" aria-label="Verified">
                  ✓
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
            <h2>Suggested for you</h2>
            <Link href="/explore">See all</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {suggestedUsers.map((u) => (
              <UserListItem
                key={u.id}
                userId={u.id}
                handle={u.username?.handle ?? null}
                displayName={u.profile?.displayName ?? "Unknown"}
                avatarUrl={u.profile?.avatarUrl ?? null}
                isVerified={u.profile?.isVerified ?? false}
                isFollowing={followingSet.has(u.id)}
                isSelf={false}
                showFollowButton
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
