import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isCommunityStaff, logModAction } from "@/lib/communities";
import { publishToCommunityChat } from "@/lib/community-chat-events";

// Realtime addendum Phase C — delete one chat message. Allowed for a
// community moderator/owner (logged as a mod action) or the message's own
// author (not logged — deleting your own line isn't moderation). Soft
// delete + a `chat-message-deleted` broadcast, so it's removed from every
// live client and never comes back on a history fetch (getRecentChatMessages
// filters deletedAt).
export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; messageId: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { slug, messageId } = await params;
  const community = await db.community.findUnique({
    where: { slug: decodeURIComponent(slug).toLowerCase() },
    select: { id: true },
  });
  if (!community) return apiError("Not found.", 404);

  const message = await db.communityChatMessage.findFirst({
    where: { id: messageId, communityId: community.id, deletedAt: null },
    select: { id: true, senderId: true },
  });
  if (!message) return apiError("Message not found.", 404);

  const isAuthor = message.senderId === ctx.userId;
  const isStaff = isAuthor ? false : await isCommunityStaff(community.id, ctx.userId);
  if (!isAuthor && !isStaff) return apiError("You can't delete this message.", 403);

  await db.communityChatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
  if (isStaff) {
    await logModAction({
      communityId: community.id,
      moderatorId: ctx.userId,
      action: "remove_chat_message",
      targetType: "chat_message",
      targetId: messageId,
    });
  }
  await publishToCommunityChat(community.id, { type: "chat-message-deleted", messageId });

  return Response.json({ ok: true });
}
