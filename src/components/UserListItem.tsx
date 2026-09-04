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
  compact = false,
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
  // Redesign Phase 2 (D10): the 320px rail column truncated names mid-word
  // ("Harpreet …"). `compact` trims the avatar, drops the verified badge
  // (the whole row already links to the profile), and shrinks the Follow
  // button — enough width back for the name.
  compact?: boolean;
  // addendum §5: an arbitrary trailing control (e.g. blocked/page.tsx's
  // unblock form) that takes over the row's trailing slot instead of the
  // follow button below — settings-context lists (blocked users) don't want
  // a follow toggle at all, unlike every other UserListItem caller.
  trailing?: ReactNode;
}) {
  return (
    <div className="profileLinkItem" style={{ justifyContent: "space-between" }}>
      {/* prefetch={false}: every "list of users" surface renders several of
          these rows at once (ContextualRail's "Suggested for you"/"Who to
          follow", follower/following lists) — same DB-connection-burst-503
          fix as PostCard.tsx's Links. */}
      <Link
        href={handle ? `/${handle}` : "#"}
        prefetch={false}
        style={{ display: "flex", alignItems: "center", gap: compact ? "0.5rem" : "0.6rem", minWidth: 0 }}
      >
        <Avatar src={avatarUrl} alt="" size={compact ? 36 : 40} />
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
            {handle && !compact && (
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
              className={`button${isFollowing ? " buttonSecondary" : ""}${compact ? " buttonSmall" : ""}`}
              aria-pressed={isFollowing}
              style={compact ? { flexShrink: 0 } : { padding: "0.4rem 0.85rem", fontSize: "0.85rem", flexShrink: 0 }}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          </form>
        ))}
    </div>
  );
}
