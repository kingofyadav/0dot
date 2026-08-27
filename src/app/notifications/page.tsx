import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCursor, cursorWhere, POST_PAGE_SIZE } from "@/lib/pagination";
import { getNotificationVerb, getNotificationHref, AGGREGATION_WINDOW_MS } from "@/lib/notifications";
import { markAllNotificationsRead, clearAllNotifications } from "@/app/actions/notifications";
import { acceptFollowRequest, rejectFollowRequest } from "@/app/actions/follow";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ListKeyNav } from "@/components/ListKeyNav";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { EmptyState } from "@/components/EmptyState";

const actorInclude = { username: true, profile: true } as const;

// Over-fetched raw rows before grouping — more than a page's worth of raw
// rows can collapse into one display group (e.g. 40 likes on one post), so
// this needs headroom beyond POST_PAGE_SIZE to reliably fill a page of
// *groups*, not rows.
const OVER_FETCH = 60;

async function fetchRawRows(recipientId: string, cursor: ReturnType<typeof parseCursor>) {
  return db.notification.findMany({
    where: { recipientId, ...cursorWhere(cursor) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: OVER_FETCH,
    include: { actor: { include: actorInclude } },
  });
}

type NotificationRow = Awaited<ReturnType<typeof fetchRawRows>>[number];

type DisplayGroup = {
  type: string;
  subjectId: string;
  subjectType: string;
  actorNames: string[];
  // Only needed to build the Accept/Reject forms for a follow_request group
  // below — follow_request is never dedupable (DEDUPABLE_TYPES), so this is
  // always the single actor of that one row, not "the first of several."
  actorId: string | null;
  firstActorVerified: boolean;
  createdAt: Date;
  href: string;
  isUnread: boolean;
  rowIds: string[];
};

// Read-time aggregation (spec §4.2): same-(type, subjectId) rows for
// like/comment within the aggregation window fold into one group ("Alice
// and 12 others liked your post"), even when a different notification
// (e.g. a follow) interleaves between them in the newest-first stream —
// tracked via openGroups below, not just "does this row match the
// immediately preceding one." mention/new_follower are each independently
// meaningful and never grouped. Rows arrive newest-first, so each group's
// rowIds[last] is that group's oldest member — the correct resume point
// for pagination; group position in the returned array is still exactly
// when that group was first encountered, so overall ordering is unchanged.
function groupRows(rows: NotificationRow[], recipientHandle: string | null): DisplayGroup[] {
  const groups: DisplayGroup[] = [];
  // type:subjectId -> the still-open group for that key, so a later row
  // can rejoin it even if other rows appeared in between. Only tracks
  // dedupable types; mention/new_follower/message never enter this map.
  const openGroups = new Map<string, DisplayGroup>();

  for (const row of rows) {
    const dedupable = row.type === "like" || row.type === "comment";
    const key = `${row.type}:${row.subjectId}`;
    const open = dedupable ? openGroups.get(key) : undefined;
    const withinWindow = open !== undefined && open.createdAt.getTime() - row.createdAt.getTime() <= AGGREGATION_WINDOW_MS;

    if (open && withinWindow) {
      open.actorNames.push(row.actor?.profile?.displayName ?? "Someone");
      open.rowIds.push(row.id);
      if (row.readAt === null) open.isUnread = true;
      continue;
    }

    const group: DisplayGroup = {
      type: row.type,
      subjectId: row.subjectId,
      subjectType: row.subjectType,
      actorNames: [row.actor?.profile?.displayName ?? "Someone"],
      actorId: row.actorId,
      // Only the first actor's badge is shown (spec §3.2's "renders in...
      // notifications") — matches the same "one badge per row" precedent
      // follow lists already set (UserListItem), even when a group has
      // multiple actors ("Alice and 12 others liked your post").
      firstActorVerified: row.actor?.profile?.isVerified ?? false,
      createdAt: row.createdAt,
      href: getNotificationHref(row, recipientHandle),
      isUnread: row.readAt === null,
      rowIds: [row.id],
    };
    groups.push(group);
    // Replaces any expired entry for this key — the old group stays as-is
    // in `groups`, this just starts a fresh window going forward.
    if (dedupable) openGroups.set(key, group);
  }

  return groups;
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
}

function GroupDescription({ group }: { group: DisplayGroup }) {
  const verb = getNotificationVerb(group.type, group.subjectType, group.subjectId);
  const [first, ...rest] = group.actorNames;
  return (
    <>
      <span style={{ fontWeight: group.isUnread ? 700 : 400 }}>
        {first}
        {group.firstActorVerified && (
          <span className="verifiedBadge" title="Verified" aria-label="Verified">
            <BadgeCheck size={14} aria-hidden="true" />
          </span>
        )}
        {rest.length > 0 && ` and ${rest.length} other${rest.length === 1 ? "" : "s"}`}
        {` ${verb}`}
      </span>
      <span className="mutedText" style={{ fontSize: "0.8rem", marginLeft: "0.5rem" }}>
        {relativeTime(group.createdAt)}
      </span>
    </>
  );
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { cursor: rawCursor } = await searchParams;
  const cursor = parseCursor(rawCursor);

  const rawRows = await fetchRawRows(currentUser.id, cursor);
  const hasMoreRaw = rawRows.length === OVER_FETCH; // heuristic, see OVER_FETCH's comment
  const allGroups = groupRows(rawRows, currentUser.username?.handle ?? null);
  const truncated = allGroups.length > POST_PAGE_SIZE;
  const groups = truncated ? allGroups.slice(0, POST_PAGE_SIZE) : allGroups;

  const nextCursor =
    groups.length > 0 && (truncated || hasMoreRaw)
      ? (() => {
          const lastGroup = groups[groups.length - 1];
          const lastRowId = lastGroup.rowIds[lastGroup.rowIds.length - 1];
          const lastRow = rawRows.find((r) => r.id === lastRowId)!;
          return `${lastRow.createdAt.toISOString()}~${lastRow.id}`;
        })()
      : null;

  // Read-on-view (spec §4.4: "mark-as-read on view, not on click-through"):
  // mark exactly this batch of rows read, after capturing which were
  // unread for this render's styling. A direct DB write inside a Server
  // Component render — the first instance of that pattern in this
  // codebase (every other mutation goes through a form-triggered action)
  // — deliberate, not an oversight. Idempotent on re-render.
  const unreadIds = rawRows.filter((r) => r.readAt === null).map((r) => r.id);

  // A follow_request notification row is never deleted once acted on (only
  // the underlying Follow row is), so this page's history can contain a
  // follow_request group for a request that's already been accepted or
  // rejected — re-check which of this page's follow_request actors still
  // have a genuinely "pending" row before showing Accept/Reject, or a
  // long-stale request would keep re-offering an action that's a no-op.
  const followRequestActorIds = groups
    .filter((g) => g.type === "follow_request" && g.actorId)
    .map((g) => g.actorId!);

  // The read-on-view write and the pending-request re-check don't depend on
  // each other — one Promise.all instead of two sequential awaits drops a
  // libsql round trip from this page's TTFB (and therefore its FCP). The
  // follow lookup is skipped outright when this page has no follow_request
  // rows to check, which is the common case.
  const [, pendingFollows] = await Promise.all([
    unreadIds.length > 0
      ? db.notification.updateMany({ where: { id: { in: unreadIds } }, data: { readAt: new Date() } })
      : undefined,
    followRequestActorIds.length > 0
      ? db.follow.findMany({
          where: { followeeId: currentUser.id, status: "pending", followerId: { in: followRequestActorIds } },
          select: { followerId: true },
        })
      : [],
  ]);
  const pendingRequesterIds = new Set(pendingFollows.map((f) => f.followerId));

  return (
    <div className="profileCard">
      {/* RootLayout's unread badge (NotificationBell, MobileBottomNav) won't
          otherwise see this render's read-on-view write above — see
          RefreshOnMount's comment. */}
      {unreadIds.length > 0 && <RefreshOnMount />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Notifications</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="button buttonSecondary"
              style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}
            >
              Mark all read
            </button>
          </form>
          <form action={clearAllNotifications}>
            <ConfirmButton
              className="button buttonSecondary"
              style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}
              title="Clear all notifications?"
              description="This permanently deletes every notification in this list. This can't be undone."
              confirmLabel="Clear all"
            >
              Clear all
            </ConfirmButton>
          </form>
        </div>
      </div>

      <ListKeyNav helpTitle="Notifications">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {groups.length === 0 && <EmptyState message="No notifications yet." />}
          {groups.map((group) => {
            // A still-pending follow_request gets Accept/Reject controls
            // instead of a plain navigate-away Link — see pendingRequesterIds
            // above for why "still" needs its own re-check.
            const isPendingFollowRequest =
              group.type === "follow_request" && group.actorId !== null && pendingRequesterIds.has(group.actorId);

            if (isPendingFollowRequest) {
              return (
                <div
                  key={group.rowIds[0]}
                  className="profileLinkItem"
                  data-nav-item
                  style={{
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    background: group.isUnread ? "var(--accent-soft)" : undefined,
                  }}
                >
                  <Link href={group.href} data-nav-open style={{ flex: 1 }}>
                    <GroupDescription group={group} />
                  </Link>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <form action={acceptFollowRequest}>
                      <input type="hidden" name="followerId" value={group.actorId!} />
                      <button type="submit" className="button buttonSmall" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
                        Accept
                      </button>
                    </form>
                    <form action={rejectFollowRequest}>
                      <input type="hidden" name="followerId" value={group.actorId!} />
                      <button type="submit" className="button buttonSecondary buttonSmall" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={group.rowIds[0]}
                href={group.href}
                className="profileLinkItem"
                data-nav-item
                data-nav-open
                style={{
                  justifyContent: "flex-start",
                  background: group.isUnread ? "var(--accent-soft)" : undefined,
                }}
              >
                <GroupDescription group={group} />
              </Link>
            );
          })}
        </div>
      </ListKeyNav>

      {nextCursor && (
        <Link
          href={`/notifications?cursor=${encodeURIComponent(nextCursor)}`}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
