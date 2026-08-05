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
  determineInitialRequestStatus,
  markConversationRead,
  buildMessagePreview,
  GROUP_PARTICIPANT_CAP,
} from "@/lib/messaging";
import { notifyMessage } from "@/lib/notifications";
import { publishToUsers } from "@/lib/message-events";
import { saveMessageAttachment, type MessageAttachmentKind } from "@/lib/uploads";
import { encryptAtRestNullable, decryptAtRestNullable } from "@/lib/message-crypto";
import type { ActionState } from "@/app/actions/auth";

type ResolvedAttachment = {
  type: MessageAttachmentKind;
  url: string;
  mimeType: string;
  sizeBytes: number;
  durationS: number | null;
};

// Shared by startDirectConversation and sendMessage: pulls the optional
// "attachment" File + "attachmentKind" out of the submitted form, uploads
// it via saveMessageAttachment (spec §5.4), and returns a typed result the
// caller can branch on — {attachment: null} when no file was submitted at
// all, since that's not an error, just a text-only message.
async function resolveMessageAttachment(
  formData: FormData,
  uploadedById: string
): Promise<{ error: string } | { attachment: ResolvedAttachment | null }> {
  const file = formData.get("attachment");
  if (!(file instanceof File) || file.size === 0) return { attachment: null };

  const kindRaw = String(formData.get("attachmentKind") ?? "");
  if (kindRaw !== "voice_note" && kindRaw !== "file") return { error: "Invalid attachment type." };

  const result = await saveMessageAttachment(file, kindRaw, uploadedById);
  if ("error" in result) return { error: result.error };

  // Client-supplied, trusted for display only (spec §5.4) — not
  // re-measured server-side, same as the spec's own "client can render a
  // duration label without downloading the file" reasoning.
  const durationRaw = formData.get("attachmentDurationS");
  const durationS = kindRaw === "voice_note" && durationRaw ? Number(durationRaw) || null : null;

  return { attachment: { type: kindRaw, ...result, durationS } };
}

const RATE_LIMIT_ERROR = "You're sending messages too fast. Please slow down.";
const START_RATE_LIMIT_ERROR = "Too many new conversations started. Please slow down.";

// New-thread starts are the real spam vector (unsolicited DMs to strangers),
// same reasoning follow.ts gives for rate-limiting follows more tightly than
// other actions. Replies within an existing conversation get a looser budget.
function checkStartConversationRateLimit(userId: string): boolean {
  return checkRateLimit(`message:start:user:${userId}`, { max: 10, windowMs: 5 * 60 * 1000 });
}
function checkSendMessageRateLimit(userId: string): boolean {
  return checkRateLimit(`message:send:user:${userId}`, { max: 60, windowMs: 5 * 60 * 1000 });
}

async function otherParticipantIds(conversationId: string, excludeUserId: string): Promise<string[]> {
  const rows = await db.conversationParticipant.findMany({
    where: { conversationId, userId: { not: excludeUserId } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

const messageSelect = {
  id: true,
  body: true,
  createdAt: true,
  senderId: true,
  attachmentType: true,
  attachmentUrl: true,
  attachmentMimeType: true,
  attachmentSizeBytes: true,
  attachmentDurationS: true,
  deletedAt: true,
} as const;

export type SentMessage = {
  id: string;
  body: string | null;
  createdAt: Date;
  senderId: string;
  attachmentType: string | null;
  attachmentUrl: string | null;
  attachmentMimeType: string | null;
  attachmentSizeBytes: number | null;
  attachmentDurationS: number | null;
  deletedAt: Date | null;
};

// Shared by startDirectConversation and sendMessage: create the Message row,
// bump the conversation's denormalized inbox-display fields, fan out
// notifications, and push the live SSE event — the one place all of that
// happens, so the two send paths can't drift apart.
async function recordMessageAndNotify(args: {
  conversationId: string;
  senderId: string;
  body: string | null;
  attachment: ResolvedAttachment | null;
}): Promise<SentMessage> {
  // phase-2 spec §5.7: message content encrypted at rest. Encrypted just
  // before the write, decrypted just after every read (messaging.ts) — the
  // plaintext only ever exists in memory during a request, never in the DB
  // file itself. lastMessagePreview is encrypted too, since it's a literal
  // copy of message content living on the Conversation row — leaving that
  // one column in plaintext would defeat the point.
  const preview = buildMessagePreview(args.body, args.attachment?.type ?? null);

  const message = await db.message.create({
    data: {
      conversationId: args.conversationId,
      senderId: args.senderId,
      body: encryptAtRestNullable(args.body),
      attachmentType: args.attachment?.type ?? null,
      attachmentUrl: args.attachment?.url ?? null,
      attachmentMimeType: args.attachment?.mimeType ?? null,
      attachmentSizeBytes: args.attachment?.sizeBytes ?? null,
      attachmentDurationS: args.attachment?.durationS ?? null,
    },
    select: messageSelect,
  });
  await db.conversation.update({
    where: { id: args.conversationId },
    data: {
      lastMessageAt: message.createdAt,
      lastMessageSenderId: args.senderId,
      lastMessagePreview: encryptAtRestNullable(preview),
    },
  });

  const recipients = await otherParticipantIds(args.conversationId, args.senderId);
  await Promise.all(
    recipients.map((recipientId) =>
      notifyMessage({ recipientId, actorId: args.senderId, subjectId: args.conversationId })
    )
  );
  publishToUsers(recipients, { type: "new-message", conversationId: args.conversationId });

  // message.body from the DB is ciphertext — the caller (ConversationView's
  // optimistic append) needs the plaintext it already has in args.body, not
  // a second decrypt round-trip for a value already in hand.
  return { ...message, body: args.body };
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
  if (!checkStartConversationRateLimit(user.id)) return { error: START_RATE_LIMIT_ERROR };
  if (await isBlockedEitherWay(user.id, recipientId)) return { error: "You can't message this user." };

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
              buildMessagePreview(decryptAtRestNullable(newLatest.body), newLatest.attachmentType)
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
