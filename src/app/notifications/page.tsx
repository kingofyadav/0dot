import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCursor, cursorWhere, POST_PAGE_SIZE } from "@/lib/pagination";
import { getNotificationVerb, getNotificationHref, AGGREGATION_WINDOW_MS } from "@/lib/notifications";
import { markAllNotificationsRead } from "@/app/actions/notifications";

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
  actorNames: string[];
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
      actorNames: [row.actor?.profile?.displayName ?? "Someone"],
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

function GroupDescription({ group }: { group: DisplayGroup }) {
  const verb = getNotificationVerb(group.type);
  const [first, ...rest] = group.actorNames;
  return (
    <>
      {first}
      {group.firstActorVerified && (
        <span className="verifiedBadge" title="Verified" aria-label="Verified">
          ✓
        </span>
      )}
      {rest.length > 0 && ` and ${rest.length} other${rest.length === 1 ? "" : "s"}`}
      {` ${verb}`}
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
  if (unreadIds.length > 0) {
    await db.notification.updateMany({
      where: { id: { in: unreadIds } },
      data: { readAt: new Date() },
    });
  }

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Notifications</h1>
        <form action={markAllNotificationsRead}>
          <button
            type="submit"
            className="button buttonSecondary"
            style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}
          >
            Mark all read
          </button>
        </form>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {groups.length === 0 && <p className="mutedText">No notifications yet.</p>}
        {groups.map((group) => (
          <Link
            key={group.rowIds[0]}
            href={group.href}
            className="profileLinkItem"
            style={{
              justifyContent: "flex-start",
              background: group.isUnread ? "var(--accent-soft)" : undefined,
            }}
          >
            <GroupDescription group={group} />
          </Link>
        ))}
      </div>

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
