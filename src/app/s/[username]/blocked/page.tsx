import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCursor, paginate, POST_PAGE_SIZE } from "@/lib/pagination";
import { unblockUser } from "@/app/actions/block";
import { UserListItem } from "@/components/UserListItem";

export const metadata: Metadata = { title: "Blocked users" };

const listedUserInclude = { username: true, profile: true } as const;

// addendum §5: same cursor-pagination shape as [username]/followers/page.tsx
// — Block's composite PK ([blockerId, blockedId], no standalone id) means
// it can't reuse cursorWhere() as-is either, same relabel-to-id trick.
export default async function BlockedUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { cursor: rawCursor } = await searchParams;
  const cursor = parseCursor(rawCursor);

  const rows = await db.block.findMany({
    where: {
      blockerId: currentUser.id,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, blockedId: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { blockedId: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { blocked: { include: listedUserInclude } },
  });

  const { items, nextCursor } = paginate(rows.map((r) => ({ ...r, id: r.blockedId })));

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Blocked users</h2>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        Accounts you&apos;ve blocked can&apos;t follow you, message you, or see your posts.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {items.length === 0 && <p className="mutedText">You haven&apos;t blocked anyone.</p>}
        {items.map((r) => (
          <UserListItem
            key={r.blockedId}
            userId={r.blocked.id}
            handle={r.blocked.username?.handle ?? null}
            displayName={r.blocked.profile?.displayName ?? "Unknown"}
            avatarUrl={r.blocked.profile?.avatarUrl ?? null}
            isFollowing={false}
            isSelf={false}
            showFollowButton={false}
            trailing={
              <form action={unblockUser}>
                <input type="hidden" name="blockedId" value={r.blockedId} />
                <button type="submit" className="button buttonSecondary buttonSmall">
                  Unblock
                </button>
              </form>
            }
          />
        ))}
      </div>

      {nextCursor && (
        <Link
          href={`/s/${currentUser.username?.handle}/blocked?cursor=${encodeURIComponent(nextCursor)}`}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
