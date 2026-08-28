import "server-only";
import { db } from "@/lib/db";
import { cursorWhere, paginate, POST_PAGE_SIZE, type PostCursor } from "@/lib/pagination";

const senderInclude = { username: true, profile: true } as const;

// The wire shape for a chat message — used by the /api/v1 chat routes and
// carried inline on the `new-chat-message` bus event (community-chat-events.ts)
// so a live client can append the message without a refetch-per-message
// storm. A `ChatMessageRow` is whatever getRecentChatMessages / a
// create-then-refetch produces (sender relation included).
export type ChatMessagePayload = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderHandle: string | null;
  senderName: string | null;
  senderAvatarUrl: string | null;
};

type ChatMessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  senderId: string;
  sender: {
    username: { handle: string } | null;
    profile: { displayName: string | null; avatarUrl: string | null } | null;
  };
};

export function serializeChatMessage(row: ChatMessageRow): ChatMessagePayload {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    senderId: row.senderId,
    senderHandle: row.sender.username?.handle ?? null,
    senderName: row.sender.profile?.displayName ?? null,
    senderAvatarUrl: row.sender.profile?.avatarUrl ?? null,
  };
}

// Cursor-paginated, most-recent-first — reuses pagination.ts's generic
// {createdAt, id} helpers as-is, same posture as messaging.ts's
// getMessagesForConversation. No per-user read state (spec §11.1: "it's a
// stream, not an inbox").
export async function getRecentChatMessages(communityId: string, cursor: PostCursor | null) {
  const rows = await db.communityChatMessage.findMany({
    where: { communityId, deletedAt: null, ...cursorWhere(cursor) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { sender: { include: senderInclude } },
  });
  return paginate(rows);
}
