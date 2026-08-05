import { getCurrentUser } from "@/lib/session";
import {
  getUnreadConversationCount,
  listInboxConversations,
  getConversationDisplayInfo,
  isConversationUnreadFor,
} from "@/lib/messaging";
import { isUserOnline } from "@/lib/presence";
import { ConversationListItem } from "./ConversationListItem";
import { PreviewPopover } from "./PreviewPopover";

const PREVIEW_COUNT = 5;

// Same popover-preview treatment as NotificationBell, reusing exactly the
// data (listInboxConversations) and row component (ConversationListItem)
// /messages itself uses — no new query or row markup, just capped to the
// first page's first few rows for a header preview.
export async function MessagesBadge() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [count, { items: conversations }] = await Promise.all([
    getUnreadConversationCount(user.id),
    listInboxConversations(user.id, null),
  ]);
  const label = count > 0 ? `Messages, ${count} unread` : "Messages";
  const preview = conversations.slice(0, PREVIEW_COUNT);

  return (
    <PreviewPopover
      trigger={
        <button type="button" className="notificationBell" aria-label={label}>
          <span aria-hidden="true">✉️</span>
          {count > 0 && (
            <span className="notificationBellBadge" aria-hidden="true">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      }
      title="Messages"
      viewAllHref="/messages"
      isEmpty={preview.length === 0}
      emptyLabel="No conversations yet."
    >
      {preview.map((conversation) => {
        const display = getConversationDisplayInfo(conversation, user.id);
        const myParticipant = conversation.participants.find((p) => p.userId === user.id);
        const pendingMine = conversation.requestState?.status === "pending";
        return (
          <ConversationListItem
            key={conversation.id}
            conversationId={conversation.id}
            title={display.title}
            handle={display.handle}
            avatarUrl={display.avatarUrl}
            preview={pendingMine ? "Request sent — waiting for a reply" : conversation.lastMessagePreview ?? ""}
            timestamp={conversation.lastMessageAt}
            isUnread={isConversationUnreadFor(user.id, conversation, myParticipant)}
            isOnline={display.otherUserId ? isUserOnline(display.otherUserId) : false}
          />
        );
      })}
    </PreviewPopover>
  );
}
