import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCursor, paginate, POST_PAGE_SIZE } from "@/lib/pagination";
import { UserListItem } from "@/components/UserListItem";

const listedUserInclude = { username: true, profile: true } as const;

export default async function FollowingPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();
  const { cursor: rawCursor } = await searchParams;
  const cursor = parseCursor(rawCursor);

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username || !username.user.profile) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === username.userId;

  // Same private-account gate as followers/page.tsx — see that file's
  // comment; the following list is just as much a gated content surface.
  if (username.user.profile.isPrivate && !isOwner) {
    const viewerFollowRow = currentUser
      ? await db.follow.findUnique({
          where: { followerId_followeeId: { followerId: currentUser.id, followeeId: username.userId } },
          select: { status: true },
        })
      : null;
    if (viewerFollowRow?.status !== "accepted") {
      return (
        <div className="profileCard">
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>
            <Link href={`/${handle}`} className="mutedText" style={{ marginRight: "0.5rem" }}>
              ← @{handle}
            </Link>
            Following
          </h1>
          <p className="mutedText">This account is private. Follow @{handle} to see who they follow.</p>
        </div>
      );
    }
  }

  // Mirror of followers/page.tsx, filtered/tiebroken the other direction —
  // see that file's comment for why this can't reuse cursorWhere() as-is.
  // Only "accepted" rows are real follows — a "pending" request against a
  // private account isn't one yet.
  const rows = await db.follow.findMany({
    where: {
      followerId: username.userId,
      status: "accepted",
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, followeeId: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { followeeId: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { followee: { include: listedUserInclude } },
  });

  const { items, nextCursor } = paginate(rows.map((r) => ({ ...r, id: r.followeeId })));
  const listedUsers = items.map((r) => r.followee);

  const followingSet = currentUser
    ? new Set(
        (
          await db.follow.findMany({
            where: {
              followerId: currentUser.id,
              followeeId: { in: listedUsers.map((u) => u.id) },
              status: "accepted",
            },
            select: { followeeId: true },
          })
        ).map((f) => f.followeeId)
      )
    : new Set<string>();

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>
        <Link href={`/${handle}`} className="mutedText" style={{ marginRight: "0.5rem" }}>
          ← @{handle}
        </Link>
        Following
      </h1>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {listedUsers.length === 0 && <p className="mutedText">Not following anyone yet.</p>}
        {listedUsers.map((u) => (
          <UserListItem
            key={u.id}
            userId={u.id}
            handle={u.username?.handle ?? null}
            displayName={u.profile?.displayName ?? "Unknown"}
            avatarUrl={u.profile?.avatarUrl ?? null}
            isFollowing={followingSet.has(u.id)}
            isSelf={currentUser?.id === u.id}
            showFollowButton={Boolean(currentUser)}
          />
        ))}
      </div>
      {nextCursor && (
        <Link
          href={`/${handle}/following?cursor=${encodeURIComponent(nextCursor)}`}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
