import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  listInboxConversations,
  getConversationDisplayInfo,
  isConversationUnreadFor,
  parseConversationCursor,
} from "@/lib/messaging";
import { getOnlineUserIds } from "@/lib/presence";
import { ConversationListItem } from "@/components/ConversationListItem";
import { ListKeyNav } from "@/components/ListKeyNav";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = { title: "Messages" };

// Primary inbox (phase-2 spec §5.5: "list conversations, cursor-paginated,
// most recent activity first"). Unsolicited requests live at
// /messages/requests instead — see listInboxConversations's exclusion of
// pending-not-mine conversations.
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { cursor: rawCursor } = await searchParams;
  const cursor = parseConversationCursor(rawCursor);

  const { items: conversations, nextCursor } = await listInboxConversations(currentUser.id, cursor);

  const displays = conversations.map((c) => getConversationDisplayInfo(c, currentUser.id));
  const onlineIds = await getOnlineUserIds(
    displays.map((d) => d.otherUserId).filter((id): id is string => id != null)
  );

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Messages</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link href="/messages/requests" className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            Requests
          </Link>
          <Link href="/messages/new" className="button" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            New message
          </Link>
        </div>
      </div>

      <ListKeyNav helpTitle="Messages">
        <div className="conversationList">
          {conversations.length === 0 && <EmptyState message="No conversations yet." />}
          {conversations.map((conversation, i) => {
            const display = displays[i];
            const myParticipant = conversation.participants.find((p) => p.userId === currentUser.id);
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
                isUnread={isConversationUnreadFor(currentUser.id, conversation, myParticipant)}
                isOnline={display.otherUserId ? onlineIds.has(display.otherUserId) : false}
                showMenu
              />
            );
          })}
        </div>
      </ListKeyNav>

      {nextCursor && (
        <Link
          href={`/messages?cursor=${encodeURIComponent(nextCursor)}`}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
