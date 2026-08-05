import Link from "next/link";
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
  isVerified,
  isFollowing,
  isSelf,
  showFollowButton,
}: {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  isFollowing: boolean;
  isSelf: boolean;
  showFollowButton: boolean;
}) {
  return (
    <div className="profileLinkItem" style={{ justifyContent: "space-between" }}>
      <Link
        href={handle ? `/${handle}` : "#"}
        style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}
      >
        <Avatar src={avatarUrl} alt="" size={40} />
        <span style={{ minWidth: 0, overflow: "hidden" }}>
          <span style={{ fontWeight: 600, display: "block" }}>
            {displayName}
            {isVerified && (
              <span className="verifiedBadge" title="Verified" aria-label="Verified">
                ✓
              </span>
            )}
          </span>
          {handle && (
            <span className="mutedText" style={{ display: "block" }}>
              0dot.in/{handle}
            </span>
          )}
        </span>
      </Link>
      {showFollowButton && !isSelf && (
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
      )}
    </div>
  );
}
