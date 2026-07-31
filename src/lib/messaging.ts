import "server-only";
import { db } from "@/lib/db";
import { parseCursor, cursorWhere, paginate, POST_PAGE_SIZE, type PostCursor } from "@/lib/pagination";
import { decryptAtRestNullable } from "@/lib/message-crypto";

// phase-2 spec §5.3: "a number to confirm with product, not a hard
// architectural limit" — same treatment as Phase 1's link cap.
export const GROUP_PARTICIPANT_CAP = 250;

const participantUserInclude = { username: true, profile: true } as const;

export type MessageableCandidate = {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
};

// Shared candidate pool for "who can I start a conversation with" (used by
// both the new-DM and new-group pickers): accounts the viewer follows or
// that follow them, minus anyone in a blocking relationship — no global
// user search exists yet (ENGINEERING_ARCHITECTURE.md, a pre-existing
// Phase 1 gap), so this reuses the same Follow-graph source
// suggested-users.ts draws candidates from.
export async function getMessageableCandidates(viewerId: string): Promise<MessageableCandidate[]> {
  const [followingRows, followedByRows, blockedRows, blockedByRows] = await Promise.all([
    db.follow.findMany({ where: { followerId: viewerId }, select: { followeeId: true } }),
    db.follow.findMany({ where: { followeeId: viewerId }, select: { followerId: true } }),
    db.block.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } }),
    db.block.findMany({ where: { blockedId: viewerId }, select: { blockerId: true } }),
  ]);

  const excludeIds = new Set([
    viewerId,
    ...blockedRows.map((b) => b.blockedId),
    ...blockedByRows.map((b) => b.blockerId),
  ]);
  const candidateIds = [
    ...new Set([...followingRows.map((f) => f.followeeId), ...followedByRows.map((f) => f.followerId)]),
  ].filter((id) => !excludeIds.has(id));

  if (candidateIds.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: candidateIds } },
    include: participantUserInclude,
  });

  return users
    .filter((u) => u.profile)
    .map((u) => ({
      userId: u.id,
      handle: u.username?.handle ?? null,
      displayName: u.profile!.displayName,
      avatarUrl: u.profile!.avatarUrl,
    }));
}

const conversationListInclude = {
  participants: {
    include: {
      user: { include: participantUserInclude },
      // Selected here (not just in getUnreadConversationCount) so the inbox
      // row's per-conversation unread dot can reuse the exact same
      // isConversationUnreadFor() predicate without a second query.
      lastReadMessage: { select: { createdAt: true } },
    },
  },
  requestState: true,
} as const;

// Shared by getUnreadConversationCount (badge) and inbox row rendering (dot)
// so "is this conversation unread" can never drift between the two call
// sites — spec §5.5's derived-unread definition, applied in exactly one place.
export function isConversationUnreadFor(
  viewerId: string,
  conversation: { lastMessageAt: Date; lastMessageSenderId: string | null },
  myParticipant: { lastReadMessage: { createdAt: Date } | null } | undefined
): boolean {
  if (!conversation.lastMessageSenderId || conversation.lastMessageSenderId === viewerId) return false;
  const lastRead = myParticipant?.lastReadMessage;
  return !lastRead || lastRead.createdAt < conversation.lastMessageAt;
}

// Plain server-only lib, not a "use server" action file — same reasoning as
// blocks.ts: every export of a "use server" module becomes client-invokable,
// and these queries trust a bare conversationId/userId with no request-level
// auth of their own. Callers (Server Components, Server Actions) are already
// authenticated via requireVerifiedUser/getCurrentUser.

// The query-layer enforcement spec §5.7 requires: every message/conversation
// read or write must verify the requesting user is a current participant.
// Returns null (not a throw) so callers choose the right failure mode — a
// page redirects/404s, an action just returns silently like follow.ts/block.ts.
export function getParticipant(conversationId: string, userId: string) {
  return db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

export async function isConversationAdmin(conversationId: string, userId: string): Promise<boolean> {
  const participant = await getParticipant(conversationId, userId);
  return participant?.role === "admin";
}

// Idempotent lookup across existing direct conversations between exactly
// these two users before creating a new one — prevents duplicate DM threads
// from accumulating every time either user starts a fresh conversation.
export async function getOrCreateDirectConversation(userAId: string, userBId: string) {
  const existing = await db.conversation.findFirst({
    where: {
      kind: "direct",
      AND: [
        { participants: { some: { userId: userAId } } },
        { participants: { some: { userId: userBId } } },
      ],
    },
  });
  if (existing) return { conversation: existing, isNew: false };

  const conversation = await db.conversation.create({
    data: {
      kind: "direct",
      createdBy: userAId,
      participants: { create: [{ userId: userAId }, { userId: userBId }] },
    },
  });
  return { conversation, isNew: true };
}

// phase-2 spec §5.2: a DM starts accepted when either side already follows
// the other (mutual or one-directional), pending otherwise.
export async function determineInitialRequestStatus(
  senderId: string,
  recipientId: string
): Promise<"accepted" | "pending"> {
  const follow = await db.follow.findFirst({
    where: {
      OR: [
        { followerId: senderId, followeeId: recipientId },
        { followerId: recipientId, followeeId: senderId },
      ],
    },
    select: { followerId: true },
  });
  return follow ? "accepted" : "pending";
}

export type ConversationCursor = { lastMessageAt: Date; id: string };

// Reuses parseCursor's field-agnostic "<iso>~<id>" parsing (pagination.ts)
// rather than duplicating it — only the field name differs (lastMessageAt,
// not createdAt), so the raw string format and parsing logic are identical.
export function parseConversationCursor(raw: string | undefined): ConversationCursor | null {
  const parsed = parseCursor(raw);
  return parsed ? { lastMessageAt: parsed.createdAt, id: parsed.id } : null;
}

function conversationCursorWhere(cursor: ConversationCursor | null) {
  if (!cursor) return {};
  return {
    OR: [
      { lastMessageAt: { lt: cursor.lastMessageAt } },
      { lastMessageAt: cursor.lastMessageAt, id: { lt: cursor.id } },
    ],
  };
}

function encodeConversationCursor(row: { lastMessageAt: Date; id: string }): string {
  return `${row.lastMessageAt.toISOString()}~${row.id}`;
}

// Mirrors pagination.ts's paginate() but keyed on lastMessageAt instead of
// createdAt — can't reuse that helper directly since it assumes the
// createdAt field name; the "fetch one extra, trim, report nextCursor"
// shape is intentionally identical.
function paginateConversations<T extends { lastMessageAt: Date; id: string }>(
  rows: T[]
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > POST_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, POST_PAGE_SIZE) : rows;
  const nextCursor = hasMore ? encodeConversationCursor(items[items.length - 1]) : null;
  return { items, nextCursor };
}

// lastMessagePreview is encrypted at rest (spec §5.7 — it's a literal copy
// of message content, so it gets the same treatment as Message.body).
// Decrypted only on the trimmed page actually being returned, not the
// discarded "+1" row paginateConversations peeks at.
function decryptPreviews<T extends { lastMessagePreview: string | null }>(items: T[]): T[] {
  return items.map((item) => ({ ...item, lastMessagePreview: decryptAtRestNullable(item.lastMessagePreview) }));
}

// Primary inbox: conversations with no request state (group chats), an
// accepted request, or a still-pending request I sent myself (spec §5.2 —
// the sender never sees their own outgoing message as a "request").
// Declined conversations never match any branch here, on purpose.
export async function listInboxConversations(userId: string, cursor: ConversationCursor | null) {
  const rows = await db.conversation.findMany({
    where: {
      AND: [
        { participants: { some: { userId, hiddenAt: null } } },
        {
          OR: [
            { requestState: { is: null } },
            { requestState: { status: "accepted" } },
            { requestState: { status: "pending", initiatedBy: userId } },
          ],
        },
        conversationCursorWhere(cursor),
      ],
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: conversationListInclude,
  });
  const { items, nextCursor } = paginateConversations(rows);
  return { items: decryptPreviews(items), nextCursor };
}

// Requests tab: pending, and I'm the recipient (not the initiator) — spec §5.2.
export async function listMessageRequests(userId: string, cursor: ConversationCursor | null) {
  const rows = await db.conversation.findMany({
    where: {
      AND: [
        { participants: { some: { userId, hiddenAt: null } } },
        { requestState: { status: "pending", initiatedBy: { not: userId } } },
        conversationCursorWhere(cursor),
      ],
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: conversationListInclude,
  });
  const { items, nextCursor } = paginateConversations(rows);
  return { items: decryptPreviews(items), nextCursor };
}

// Full participant + request-state detail for the conversation header/admin
// panel — same include shape as the list views, exported so the
// conversation page doesn't have to duplicate it.
//
// The participant check is enforced *inside* this function (not just at
// call sites) — spec §5.7/§2's "enforced at the query layer" requirement,
// literally: a caller that forgets its own guard still gets nothing back.
export async function getConversationWithParticipants(conversationId: string, viewerId: string) {
  const participant = await getParticipant(conversationId, viewerId);
  if (!participant) return null;
  return db.conversation.findUnique({
    where: { id: conversationId },
    include: conversationListInclude,
  });
}

// Message pages reuse pagination.ts's generic helpers as-is — Message rows
// already have the {createdAt, id} shape those were built for. Newest-first,
// same as every other cursor-paginated list here; the conversation view
// reverses this page for oldest-at-top chat display.
//
// Same query-layer enforcement as getConversationWithParticipants above.
// viewerId also drives a per-viewer content filter: messages from anyone
// the viewer has blocked are dropped from their own view (one-directional —
// being blocked *by* someone gives the viewer no reason to lose their own
// view of that person's content). This is what makes blocking meaningful
// inside a shared group chat, not just a direct conversation: blocking
// doesn't remove anyone or break the group for other members, it just
// changes what the blocker personally sees (phase-2 spec §5.6 only defines
// this for direct conversations; group behavior wasn't specified, so this
// extends it in the least disruptive way rather than leaving it undefined).
export async function getMessagesForConversation(
  conversationId: string,
  viewerId: string,
  cursor: PostCursor | null
) {
  const participant = await getParticipant(conversationId, viewerId);
  if (!participant) return { items: [], nextCursor: null };

  const blockedRows = await db.block.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } });
  const blockedSenderIds = new Set(blockedRows.map((b) => b.blockedId));

  const rows = await db.message.findMany({
    where: { conversationId, ...cursorWhere(cursor) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { sender: { include: participantUserInclude } },
  });
  const { items, nextCursor } = paginate(rows);
  // Decrypted here (spec §5.7), on the trimmed page only — same posture as
  // decryptPreviews above. Filtering happens after decrypt/trim so a
  // blocked sender's messages simply never reach the caller.
  const visible = items.filter((m) => !blockedSenderIds.has(m.senderId));
  return { items: visible.map((m) => ({ ...m, body: decryptAtRestNullable(m.body) })), nextCursor };
}

// spec §5.5: "unread badge on the inbox is a count of conversations with
// unread messages" — not a per-message count. Derived from the denormalized
// (lastMessageAt, lastMessageSenderId) pair on Conversation plus each
// participant's lastReadMessage, all fetched in one query (no per-row
// subquery/join needed beyond the include Prisma already batches).
export async function getUnreadConversationCount(userId: string): Promise<number> {
  const participants = await db.conversationParticipant.findMany({
    where: { userId, hiddenAt: null },
    select: {
      conversation: { select: { lastMessageAt: true, lastMessageSenderId: true } },
      lastReadMessage: { select: { createdAt: true } },
    },
  });

  let unread = 0;
  for (const p of participants) {
    if (isConversationUnreadFor(userId, p.conversation, p)) unread += 1;
  }
  return unread;
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const latest = await db.message.findFirst({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (!latest) return;

  await db.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadMessageId: latest.id },
  });
}

type ParticipantForDisplay = {
  userId: string;
  user: {
    username: { handle: string } | null;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
};

// Shared by the inbox, requests, and conversation-header views so "what do
// we call this conversation" is computed in exactly one place. Direct
// conversations display the *other* participant; groups display their
// title (or a participant-count fallback for an untitled group).
export function getConversationDisplayInfo(
  conversation: { kind: string; title: string | null; participants: ParticipantForDisplay[] },
  viewerId: string
): { title: string; handle: string | null; avatarUrl: string | null } {
  if (conversation.kind === "group") {
    return {
      title: conversation.title ?? `Group (${conversation.participants.length})`,
      handle: null,
      avatarUrl: null,
    };
  }

  const other = conversation.participants.find((p) => p.userId !== viewerId);
  return {
    title: other?.user.profile?.displayName ?? "Unknown user",
    handle: other?.user.username?.handle ?? null,
    avatarUrl: other?.user.profile?.avatarUrl ?? null,
  };
}

// Truncated for the inbox row / notification-free preview — no attachment
// means a plain text snippet, attachment-only means a short type label,
// matching how a real chat app labels a photo/voice message with no caption.
export function buildMessagePreview(body: string | null, attachmentType: string | null): string {
  if (body && body.trim().length > 0) {
    return body.length > 140 ? `${body.slice(0, 140)}…` : body;
  }
  if (attachmentType === "voice_note") return "🎤 Voice note";
  if (attachmentType === "file") return "📎 Attachment";
  return "";
}
