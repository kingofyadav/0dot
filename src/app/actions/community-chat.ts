"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCommunityMember, isCommunityStaff, logModAction } from "@/lib/communities";
import { publishToCommunityChat } from "@/lib/community-chat-events";
import { serializeChatMessage } from "@/lib/community-chat";
import type { ActionState } from "@/app/actions/auth";

// Flood guard, same shape as messages.ts's checkSendMessageRateLimit —
// keyed per user per community so one chatty community can't burn a
// user's budget in every other community's chat.
function checkChatRateLimit(userId: string, communityId: string): boolean {
  return checkRateLimit(`community-chat:send:${userId}:${communityId}`, { max: 30, windowMs: 5 * 60 * 1000 });
}

// spec §11.2: chat messages from a muted member are rejected server-side —
// the literal acceptance criterion this action exists to satisfy. Returns
// ActionState (not void) so a rejection — rate limit, mute/ban, message too
// long — reaches CommunityChatView instead of the composer silently
// swallowing it: with a void return, the caller couldn't tell "sent" apart
// from "rejected" and always cleared the input either way.
export async function sendChatMessage(formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!communityId) return { error: "Invalid request." };
  if (body.length < 1 || body.length > 500) return { error: "Message must be 1-500 characters." };

  if (!checkChatRateLimit(user.id, communityId)) {
    return { error: "You're sending messages too fast. Please slow down." };
  }

  const membership = await getCommunityMember(communityId, user.id);
  if (!membership || membership.status !== "active") {
    return { error: "You don't have permission to send messages here." };
  }

  const created = await db.communityChatMessage.create({
    data: { communityId, senderId: user.id, body },
    include: { sender: { include: { username: true, profile: true } } },
  });
  await publishToCommunityChat(communityId, { type: "new-chat-message", message: serializeChatMessage(created) });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}/chat`);
  return undefined;
}

// spec §11.2: moderator-deleted messages are removed from the live view
// for all clients and don't reappear on reconnect/history fetch — the
// publish below plus getRecentChatMessages simply never selecting a
// deletedAt row (deletedAt filter added there) together satisfy this.
export async function deleteChatMessage(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  if (!communityId || !messageId) return;

  const message = await db.communityChatMessage.findFirst({
    where: { id: messageId, communityId, deletedAt: null },
  });
  if (!message) return;

  // Realtime addendum Phase C: an author can delete their own line
  // (not moderation — not logged); staff can delete anyone's (logged).
  const isAuthor = message.senderId === user.id;
  const isStaff = isAuthor ? false : await isCommunityStaff(communityId, user.id);
  if (!isAuthor && !isStaff) return;

  await db.communityChatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
  if (isStaff) {
    await logModAction({
      communityId,
      moderatorId: user.id,
      action: "remove_chat_message",
      targetType: "chat_message",
      targetId: messageId,
    });
  }
  await publishToCommunityChat(communityId, { type: "chat-message-deleted", messageId });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}/chat`);
}
