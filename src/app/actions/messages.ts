"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import {
  getParticipant,
  isConversationAdmin,
  getOrCreateDirectConversation,
  getMessagesForConversation,
  determineInitialRequestStatus,
  canReceiveDmFrom,
  markConversationRead,
  recordMessageAndNotify,
  resolveMessageAttachment,
  otherParticipantIds,
  buildMessagePreview,
  GROUP_PARTICIPANT_CAP,
  type SentMessage,
} from "@/lib/messaging";
import { publishToUsers } from "@/lib/message-events";
import { encryptAtRestNullable, decryptAtRestNullableSafe } from "@/lib/message-crypto";
import { parseCursor } from "@/lib/pagination";
import type { ActionState } from "@/app/actions/auth";

const RATE_LIMIT_ERROR = "You're sending messages too fast. Please slow down.";
const START_RATE_LIMIT_ERROR = "Too many new conversations started. Please slow down.";

// Mirrors the textarea's maxLength (NewMessageForm.tsx, ConversationView.tsx)
// — that's a UX hint, not enforcement, since a raw POST can skip the client
// entirely. This is the actual boundary: an oversized body shouldn't reach
// encryption, the DB, or every recipient's SSE fan-out.
const MAX_MESSAGE_LENGTH = 4000;

// New-thread starts are the real spam vector (unsolicited DMs to strangers),
// same reasoning follow.ts gives for rate-limiting follows more tightly than
// other actions. Replies within an existing conversation get a looser budget.
function checkStartConversationRateLimit(userId: string): boolean {
  return checkRateLimit(`message:start:user:${userId}`, { max: 10, windowMs: 5 * 60 * 1000 });
}
function checkSendMessageRateLimit(userId: string): boolean {
  return checkRateLimit(`message:send:user:${userId}`, { max: 60, windowMs: 5 * 60 * 1000 });
}

// Starts (or reuses) a direct conversation and sends the first message in
// one step — mirrors a "Message" button on a profile. Has a real <form> +
// useActionState on /messages/new, so it returns ActionState and redirects
// on success, unlike sendMessage below (which is called directly from a
// client component, not bound to a plain progressive-enhancement form).
export async function startDirectConversation(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const recipientId = String(formData.get("recipientId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!recipientId || recipientId === user.id) return { error: "Invalid recipient." };
  if (body.length < 1) return { error: "Message can't be empty." };
  if (body.length > MAX_MESSAGE_LENGTH) return { error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` };
  if (!checkStartConversationRateLimit(user.id)) return { error: START_RATE_LIMIT_ERROR };
  if (await isBlockedEitherWay(user.id, recipientId)) return { error: "You can't message this user." };
  if (!(await canReceiveDmFrom(user.id, recipientId))) return { error: "You can't message this user." };

  const recipient = await db.user.findUnique({ where: { id: recipientId }, select: { id: true } });
  if (!recipient) return { error: "User not found." };

  const { conversation, isNew } = await getOrCreateDirectConversation(user.id, recipientId);

  if (isNew) {
    const status = await determineInitialRequestStatus(user.id, recipientId);
    await db.messageRequestState.create({
      data: { conversationId: conversation.id, status, initiatedBy: user.id },
    });
  }

  await recordMessageAndNotify({ conversationId: conversation.id, senderId: user.id, body, attachment: null });

  revalidatePath("/messages");
  redirect(`/messages/${conversation.id}`);
}

export type SendMessageResult = { error: string } | { message: SentMessage };

// Called directly from ConversationView (a client component) with a
// FormData (not through a plain <form action>), so it can return the
// created row for optimistic-free local-state append — the sender's own
// view updates from this return value, other participants' open tabs
// update via the SSE publish below. FormData (not separate args) because
// an attachment File needs to travel alongside the text body.
export async function sendMessage(formData: FormData): Promise<SendMessageResult> {
  const user = await requireVerifiedUser();
  const conversationId = String(formData.get("conversationId") ?? "");
  const trimmedBody = String(formData.get("body") ?? "").trim();
  if (!conversationId) return { error: "Invalid conversation." };
  if (!checkSendMessageRateLimit(user.id)) return { error: RATE_LIMIT_ERROR };

  const attachmentResult = await resolveMessageAttachment(formData, user.id);
  if ("error" in attachmentResult) return { error: attachmentResult.error };
  const { attachment } = attachmentResult;

  // spec §5.1: body is "nullable if attachment-only" — an attachment alone
  // is a valid message, only reject when there's neither.
  if (trimmedBody.length < 1 && !attachment) return { error: "Message can't be empty." };
  if (trimmedBody.length > MAX_MESSAGE_LENGTH) {
    return { error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` };
  }

  const participant = await getParticipant(conversationId, user.id);
  if (!participant) return { error: "Conversation not found." }; // spec §5.7 query-layer check

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { requestState: true },
  });
  if (!conversation) return { error: "Conversation not found." };

  // Mirrors the same exclusion listInboxConversations/listMessageRequests
  // apply on read, so "who can send" and "what shows up" never drift apart.
  if (conversation.requestState) {
    const { status, initiatedBy } = conversation.requestState;
    if (status === "declined") return { error: "This conversation is no longer available." };
    if (status === "pending" && initiatedBy !== user.id) {
      return { error: "Accept this conversation request before replying." };
    }
  }

  if (conversation.kind === "direct") {
    const others = await otherParticipantIds(conversationId, user.id);
    if (others.length === 1 && (await isBlockedEitherWay(user.id, others[0]))) {
      return { error: "You can't message this user." };
    }
  }

  const message = await recordMessageAndNotify({
    conversationId,
    senderId: user.id,
    body: trimmedBody.length > 0 ? trimmedBody : null,
    attachment,
  });

  revalidatePath("/messages");
  return { message };
}

export type LoadOlderMessagesResult = { error: string } | { items: SentMessage[]; nextCursor: string | null };

// ConversationView only ever renders the most recent POST_PAGE_SIZE messages
// from the server-rendered initial page — anything older needs this to be
// reachable at all. getMessagesForConversation re-enforces the participant
// check itself (same query-layer posture as every other read here), so an
// invalid/foreign cursor or conversation just yields an empty page rather
// than leaking whether either exists.
export async function loadOlderMessages(formData: FormData): Promise<LoadOlderMessagesResult> {
  const user = await requireVerifiedUser();
  const conversationId = String(formData.get("conversationId") ?? "");
  const cursor = parseCursor(String(formData.get("cursor") ?? ""));
  if (!conversationId || !cursor) return { error: "Invalid request." };

  const { items, nextCursor } = await getMessagesForConversation(conversationId, user.id, cursor);
  // getMessagesForConversation returns newest-first (its own pagination
  // direction); the view wants oldest-first so an older page can be
  // prepended directly onto the top of the already-ascending list.
  return { items: [...items].reverse(), nextCursor };
}

// spec §5.1: sender-only soft delete. Clears content columns immediately
// (true tombstone, not just a flag) rather than deferring to a retention
// window — spec §7 leaves that policy open, so this sidesteps guessing at
// one rather than silently building partial support for it.
export async function deleteMessage(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const messageId = String(formData.get("messageId") ?? "");
  if (!messageId) return;

  const message = await db.message.findUnique({ where: { id: messageId } });
  if (!message || message.senderId !== user.id || message.deletedAt !== null) return;

  const participant = await getParticipant(message.conversationId, user.id);
  if (!participant) return; // spec §5.7 query-layer check

  // Same tie-break ordering as every other "latest message" lookup in this
  // codebase (markConversationRead, getMessagesForConversation) — deciding
  // whether the denormalized inbox preview needs to move to a different
  // message.
  const currentLatest = await db.message.findFirst({
    where: { conversationId: message.conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  const wasLatest = currentLatest?.id === messageId;

  await db.message.update({
    where: { id: messageId },
    data: {
      body: null,
      attachmentType: null,
      attachmentUrl: null,
      attachmentMimeType: null,
      attachmentSizeBytes: null,
      attachmentDurationS: null,
      deletedAt: new Date(),
    },
  });

  if (wasLatest) {
    const newLatest = await db.message.findFirst({
      where: { conversationId: message.conversationId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    await db.conversation.update({
      where: { id: message.conversationId },
      data: newLatest
        ? {
            lastMessageAt: newLatest.createdAt,
            lastMessageSenderId: newLatest.senderId,
            lastMessagePreview: encryptAtRestNullable(
              buildMessagePreview(decryptAtRestNullableSafe(newLatest.body), newLatest.attachmentType)
            ),
          }
        : { lastMessageSenderId: null, lastMessagePreview: null },
    });
  }

  const recipients = await otherParticipantIds(message.conversationId, user.id);
  publishToUsers(recipients, { type: "conversation-updated", conversationId: message.conversationId });

  revalidatePath("/messages");
  revalidatePath(`/messages/${message.conversationId}`);
}

// spec §5.2/§5.8: only the recipient (not the initiator) can accept/decline,
// and only while still pending — an already-accepted or already-declined
// request is a no-op, not an error, same idempotent-action posture as
// followUser/blockUser.
async function requirePendingRequestAsRecipient(conversationId: string, userId: string) {
  const requestState = await db.messageRequestState.findUnique({ where: { conversationId } });
  if (!requestState || requestState.status !== "pending" || requestState.initiatedBy === userId) return null;
  return requestState;
}

export async function acceptMessageRequest(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) return;

  const participant = await getParticipant(conversationId, user.id);
  if (!participant) return;

  const requestState = await requirePendingRequestAsRecipient(conversationId, user.id);
  if (!requestState) return;

  await db.messageRequestState.update({ where: { conversationId }, data: { status: "accepted" } });

  revalidatePath("/messages");
  revalidatePath("/messages/requests");
  revalidatePath(`/messages/${conversationId}`);
}

// spec §5.8: "declining hides it from the recipient without notifying the
// sender" — just flips status, no notification fan-out, no message to the
// sender. The sender's own view is unaffected by design (see messaging.ts's
// listInboxConversations comment on why declined never matches any branch).
export async function declineMessageRequest(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) return;

  const participant = await getParticipant(conversationId, user.id);
  if (!participant) return;

  const requestState = await requirePendingRequestAsRecipient(conversationId, user.id);
  if (!requestState) return;

  await db.messageRequestState.update({ where: { conversationId }, data: { status: "declined" } });

  revalidatePath("/messages");
  revalidatePath("/messages/requests");
}

export async function markConversationReadAction(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) return;

  const participant = await getParticipant(conversationId, user.id);
  if (!participant) return;

  await markConversationRead(conversationId, user.id);
  revalidatePath("/messages");
}

// spec §5.3: creator is admin by default, cap 250 (soft cap, "a number to
// confirm with product, not a hard architectural limit" — same reasoning as
// Phase 1's link cap). No initial message required — an empty group is a
// valid starting state, same empty state ConversationView already renders
// ("No messages yet — say hello.").
export async function createGroupConversation(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const title = String(formData.get("title") ?? "").trim() || null;
  const requestedIds = [...new Set(formData.getAll("participantIds").map(String))].filter(
    (id) => id && id !== user.id
  );

  if (requestedIds.length === 0) return { error: "Select at least one person to add." };
  if (!checkRateLimit(`message:group:create:user:${user.id}`, { max: 10, windowMs: 15 * 60 * 1000 })) {
    return { error: "Too many groups created. Please slow down." };
  }

  const validIds: string[] = [];
  for (const id of requestedIds) {
    if (!(await isBlockedEitherWay(user.id, id))) validIds.push(id);
  }
  if (validIds.length === 0) return { error: "Couldn't add any of the selected people." };
  if (1 + validIds.length > GROUP_PARTICIPANT_CAP) {
    return { error: `Groups are limited to ${GROUP_PARTICIPANT_CAP} participants.` };
  }

  const existingUsers = await db.user.findMany({ where: { id: { in: validIds } }, select: { id: true } });
  if (existingUsers.length === 0) return { error: "Couldn't add any of the selected people." };

  const conversation = await db.conversation.create({
    data: {
      kind: "group",
      title,
      createdBy: user.id,
      participants: {
        create: [
          { userId: user.id, role: "admin" },
          ...existingUsers.map((u) => ({ userId: u.id, role: "member" })),
        ],
      },
    },
  });

  revalidatePath("/messages");
  redirect(`/messages/${conversation.id}`);
}

// spec §5.3: "any member can add participants" — no admin check here,
// unlike remove/rename below.
export async function addGroupParticipants(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) return;

  const participant = await getParticipant(conversationId, user.id);
  if (!participant) return;

  const conversation = await db.conversation.findUnique({ where: { id: conversationId }, select: { kind: true } });
  if (!conversation || conversation.kind !== "group") return;

  const requestedIds = [...new Set(formData.getAll("participantIds").map(String))].filter(Boolean);
  if (requestedIds.length === 0) return;

  const existing = await db.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((p) => p.userId));
  const toAdd: string[] = [];
  for (const id of requestedIds) {
    if (existingIds.has(id)) continue;
    if (await isBlockedEitherWay(user.id, id)) continue;
    toAdd.push(id);
  }
  if (toAdd.length === 0) return;
  if (existing.length + toAdd.length > GROUP_PARTICIPANT_CAP) return; // quiet no-op, same posture as moveLink/toggleFeatured's caps

  const validUsers = await db.user.findMany({ where: { id: { in: toAdd } }, select: { id: true } });
  if (validUsers.length === 0) return;

  await db.conversationParticipant.createMany({
    data: validUsers.map((u) => ({ conversationId, userId: u.id, role: "member" })),
  });

  revalidatePath(`/messages/${conversationId}`);
}

// spec §5.3/§5.8: admin-only, rejected at the action layer (not just hidden
// in the UI) — isConversationAdmin re-checks role server-side regardless of
// what the client sent. Self-removal goes through leaveConversation instead,
// so this never has to decide what "the admin removes themself" means.
export async function removeGroupParticipant(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const conversationId = String(formData.get("conversationId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!conversationId || !targetUserId || targetUserId === user.id) return;

  if (!(await isConversationAdmin(conversationId, user.id))) return;

  await db.conversationParticipant.deleteMany({ where: { conversationId, userId: targetUserId } });
  revalidatePath(`/messages/${conversationId}`);
}

// spec §5.3/§5.8: admin-only, same rejection posture as removeGroupParticipant.
export async function renameGroupConversation(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const conversationId = String(formData.get("conversationId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!conversationId || !title) return;

  if (!(await isConversationAdmin(conversationId, user.id))) return;

  await db.conversation.update({ where: { id: conversationId }, data: { title } });
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
}

// spec §5.3: "removes the participant row but does not delete the
// conversation or its message history for remaining members." Group-only —
// a direct conversation's "always exactly 2 participants" invariant (relied
// on by otherParticipantIds/getConversationDisplayInfo) would break if one
// side could unilaterally remove themselves from a DM.
export async function leaveConversation(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) return;

  const conversation = await db.conversation.findUnique({ where: { id: conversationId }, select: { kind: true } });
  if (!conversation || conversation.kind !== "group") return;

  const participant = await getParticipant(conversationId, user.id);
  if (!participant) return;

  await db.conversationParticipant.deleteMany({ where: { conversationId, userId: user.id } });
  revalidatePath("/messages");
  redirect("/messages");
}

// "Delete chat" — per-participant soft hide via the ConversationParticipant.
// hiddenAt column listInboxConversations/listMessageRequests/
// getUnreadConversationCount already filter on. Unlike leaveConversation,
// this works for direct conversations too (it doesn't touch the
// participant row itself, so the "a direct conversation always has exactly
// 2 participants" invariant that rules out leaveConversation for DMs never
// applies here): the conversation and its history are untouched for the
// other participant, and reappear for this one the moment a new message
// arrives (recordMessageAndNotify clears hiddenAt on send).
export async function deleteConversation(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) return;

  const participant = await getParticipant(conversationId, user.id);
  if (!participant) return; // spec §5.7 query-layer check

  await db.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { hiddenAt: new Date() },
  });

  revalidatePath("/messages");
  redirect("/messages");
}
