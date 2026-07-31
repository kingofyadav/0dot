import Link from "next/link";
import { Logo } from "@/components/Logo";

type ConversationListItemProps = {
  conversationId: string;
  title: string;
  handle: string | null; // direct conversations only — no profile link for a group
  avatarUrl: string | null;
  preview: string; // caller decides the exact wording — differs between inbox and requests views
  timestamp: Date;
  isUnread: boolean;
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
}: ConversationListItemProps) {
  return (
    <Link
      href={`/messages/${conversationId}`}
      className="profileLinkItem conversationListItem"
      style={{ justifyContent: "space-between", background: isUnread ? "var(--accent-soft)" : undefined }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
          <img
            src={avatarUrl}
            alt=""
            width={40}
            height={40}
            style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <span style={{ display: "inline-flex", borderRadius: "50%", flexShrink: 0 }}>
            <Logo size={40} />
          </span>
        )}
        <span style={{ minWidth: 0, overflow: "hidden" }}>
          <span style={{ fontWeight: isUnread ? 700 : 600, display: "block" }}>
            {title}
            {handle && <span className="mutedText"> · 0dot.in/{handle}</span>}
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
  );
}
