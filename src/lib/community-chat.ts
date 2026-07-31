import "server-only";
import { db } from "@/lib/db";
import { cursorWhere, paginate, POST_PAGE_SIZE, type PostCursor } from "@/lib/pagination";

const senderInclude = { username: true, profile: true } as const;

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
