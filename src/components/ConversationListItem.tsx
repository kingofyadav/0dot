import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { PresenceDot } from "@/components/PresenceDot";
import { ConversationRowMenu } from "@/components/ConversationRowMenu";

type ConversationListItemProps = {
  conversationId: string;
  title: string;
  handle: string | null; // direct conversations only — no profile link for a group
  avatarUrl: string | null;
  preview: string; // caller decides the exact wording — differs between inbox and requests views
  timestamp: Date;
  isUnread: boolean;
  isOnline?: boolean; // direct conversations only, omitted/false for groups
  showMenu?: boolean; // false in read-only contexts like the header preview popover
};

// Shared row for both /messages (inbox) and /messages/requests — same
// avatar/title/preview/timestamp shape as UserListItem's row pattern, just
// linking to a conversation instead of a profile.
export function ConversationListItem({
  conversationId,
  title,
  handle,
  avatarUrl,
  preview,
  timestamp,
  isUnread,
  isOnline = false,
  showMenu = false,
}: ConversationListItemProps) {
  return (
    <div style={{ position: "relative" }}>
      <Link
        href={`/messages/${conversationId}`}
        className="profileLinkItem conversationListItem"
        style={{
          justifyContent: "space-between",
          paddingInlineEnd: showMenu ? "2.75rem" : undefined,
          background: isUnread ? "var(--accent-soft)" : undefined,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
          <span style={{ position: "relative", flexShrink: 0, display: "inline-flex" }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
              <img
                src={avatarUrl}
                alt=""
                width={40}
                height={40}
                style={{ borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ display: "inline-flex", borderRadius: "50%" }}>
                <Logo size={40} />
              </span>
            )}
            <PresenceDot online={isOnline} />
          </span>
          <span style={{ minWidth: 0, overflow: "hidden" }}>
            <span style={{ fontWeight: isUnread ? 700 : 600, display: "block" }}>
              {title}
              {/* Blue tick badge, same visual as PostCard's — not a separate
                  link here since the whole row is already a Link to the
                  conversation (nesting an <a> inside an <a> is invalid);
                  the conversation header's own badge is the clickable one. */}
              {handle && (
                <span className="verifiedBadge" aria-label="View public profile" title="View public profile">
                  <BadgeCheck size={14} aria-hidden="true" />
                </span>
              )}
            </span>
            <span
              className="mutedText"
              style={{
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {preview}
            </span>
          </span>
        </span>
        <span className="mutedText" style={{ fontSize: "0.8rem", flexShrink: 0 }}>
          {timestamp.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </Link>
      {showMenu && (
        <span style={{ position: "absolute", insetInlineEnd: "0.5rem", top: "50%", transform: "translateY(-50%)" }}>
          <ConversationRowMenu conversationId={conversationId} compact />
        </span>
      )}
    </div>
  );
}
