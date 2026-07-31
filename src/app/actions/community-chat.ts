"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCommunityMember, isCommunityStaff, logModAction } from "@/lib/communities";
import { publishToCommunityChat } from "@/lib/community-chat-events";

// Flood guard, same shape as messages.ts's checkSendMessageRateLimit —
// keyed per user per community so one chatty community can't burn a
// user's budget in every other community's chat.
function checkChatRateLimit(userId: string, communityId: string): boolean {
  return checkRateLimit(`community-chat:send:${userId}:${communityId}`, { max: 30, windowMs: 5 * 60 * 1000 });
}

// spec §11.2: chat messages from a muted member are rejected server-side —
// the literal acceptance criterion this action exists to satisfy.
export async function sendChatMessage(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!communityId || body.length < 1 || body.length > 500) return;

  if (!checkChatRateLimit(user.id, communityId)) return;

  const membership = await getCommunityMember(communityId, user.id);
  if (!membership || membership.status !== "active") return;

  await db.communityChatMessage.create({ data: { communityId, senderId: user.id, body } });
  publishToCommunityChat(communityId, { type: "new-chat-message" });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}/chat`);
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
  if (!(await isCommunityStaff(communityId, user.id))) return;

  const message = await db.communityChatMessage.findFirst({
    where: { id: messageId, communityId, deletedAt: null },
  });
  if (!message) return;

  await db.communityChatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
  await logModAction({
    communityId,
    moderatorId: user.id,
    action: "remove_chat_message",
    targetType: "chat_message",
    targetId: messageId,
  });
  publishToCommunityChat(communityId, { type: "chat-message-deleted" });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}/chat`);
}
