import type { ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { followUser, unfollowUser } from "@/app/actions/follow";
import { Avatar } from "@/components/Avatar";

// Shared row for any "list of users" surface (followers, following,
// suggested users) — avatar/name/handle + an inline follow toggle, same
// <form action={...}> pattern as PostCard's like button, no client JS.
export function UserListItem({
  userId,
  handle,
  displayName,
  avatarUrl,
  isFollowing,
  isSelf,
  showFollowButton,
  showHandle = true,
  trailing,
}: {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  isFollowing: boolean;
  isSelf: boolean;
  showFollowButton: boolean;
  // Compact rail contexts (ContextualRail's "Suggested for you") drop the
  // "0dot.in/handle" line — not enough width for avatar + name + handle +
  // Follow button on one row, and the badge already covers "view profile".
  showHandle?: boolean;
  // addendum §5: an arbitrary trailing control (e.g. blocked/page.tsx's
  // unblock form) that takes over the row's trailing slot instead of the
  // follow button below — settings-context lists (blocked users) don't want
  // a follow toggle at all, unlike every other UserListItem caller.
  trailing?: ReactNode;
}) {
  return (
    <div className="profileLinkItem" style={{ justifyContent: "space-between" }}>
      <Link
        href={handle ? `/${handle}` : "#"}
        style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}
      >
        <Avatar src={avatarUrl} alt="" size={40} />
        <span style={{ minWidth: 0, overflow: "hidden" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <span
              style={{
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {displayName}
            </span>
            {/* Blue tick badge, same treatment as PostCard's AuthorLine and
                ConversationListItem — not a separate link here since the
                whole row is already a Link to this same profile. Sibling of
                the name (not inline inside it) so it can't wrap onto its
                own line when the name is close to the available width. */}
            {handle && (
              <span
                className="verifiedBadge"
                style={{ marginLeft: 0, flexShrink: 0 }}
                aria-label="View public profile"
                title="View public profile"
              >
                <BadgeCheck size={14} aria-hidden="true" />
              </span>
            )}
          </span>
          {showHandle && handle && (
            <span
              className="mutedText"
              style={{
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <span className="brandUrl">0dot.in</span>/{handle}
            </span>
          )}
        </span>
      </Link>
      {trailing ??
        (showFollowButton && !isSelf && (
          <form action={isFollowing ? unfollowUser : followUser}>
            <input type="hidden" name="followeeId" value={userId} />
            <button
              type="submit"
              className={`button${isFollowing ? " buttonSecondary" : ""}`}
              aria-pressed={isFollowing}
              style={{ padding: "0.4rem 0.85rem", fontSize: "0.85rem", flexShrink: 0 }}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          </form>
        ))}
    </div>
  );
}
