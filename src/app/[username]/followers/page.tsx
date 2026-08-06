import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCursor, paginate, POST_PAGE_SIZE } from "@/lib/pagination";
import { UserListItem } from "@/components/UserListItem";

const listedUserInclude = { username: true, profile: true } as const;

export default async function FollowersPage({
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

  // Same private-account gate as the main profile page (canViewFullProfile,
  // [username]/page.tsx) — the follower list is exactly the kind of content
  // surface that gate is meant to cover, so it can't be left reachable
  // directly by URL for a private account's non-followers.
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
            Followers
          </h1>
          <p className="mutedText">This account is private. Follow @{handle} to see their followers.</p>
        </div>
      );
    }
  }

  // Follow's composite PK ([followerId, followeeId], no standalone `id`)
  // means it can't reuse cursorWhere() as-is (hardcoded to an `id` field) —
  // same situation src/app/bookmarks/page.tsx already solved: inline the
  // OR-clause against the real tiebreaker column, then relabel to `id`
  // before calling paginate(). Only "accepted" rows are real followers —
  // a "pending" request against a private account isn't one yet.
  const rows = await db.follow.findMany({
    where: {
      followeeId: username.userId,
      status: "accepted",
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, followerId: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { followerId: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { follower: { include: listedUserInclude } },
  });

  const { items, nextCursor } = paginate(rows.map((r) => ({ ...r, id: r.followerId })));
  const listedUsers = items.map((r) => r.follower);

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
        Followers
      </h1>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {listedUsers.length === 0 && <p className="mutedText">No followers yet.</p>}
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
          href={`/${handle}/followers?cursor=${encodeURIComponent(nextCursor)}`}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
