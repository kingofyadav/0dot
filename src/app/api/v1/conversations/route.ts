import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import { isUserOnline } from "@/lib/presence";
import {
  listInboxConversations,
  parseConversationCursor,
  getConversationDisplayInfo,
  isConversationUnreadFor,
  getUnreadConversationCount,
  getOrCreateDirectConversation,
  determineInitialRequestStatus,
  canReceiveDmFrom,
  recordMessageAndNotify,
} from "@/lib/messaging";
import { revalidatePath } from "next/cache";

// Mobile pro-upgrade addendum, sub-phase M3. No live socket — per the
// addendum's architecture decision, mobile polls this (and the messages
// route below) and relies on push notifications (already the third
// delivery channel on this same "message" event, phase-15 spec §4) to
// prompt a refresh, rather than a new bearer-token-aware SSE mechanism
// alongside the existing cookie-session-only one (message-events.ts).
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "messages:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const cursor = parseConversationCursor(new URL(request.url).searchParams.get("cursor") ?? undefined);
  const [{ items, nextCursor }, unreadCount] = await Promise.all([
    listInboxConversations(ctx.userId, cursor),
    getUnreadConversationCount(ctx.userId),
  ]);

  return Response.json(
    {
      unreadCount,
      items: items.map((conversation) => {
        const display = getConversationDisplayInfo(conversation, ctx.userId);
        const myParticipant = conversation.participants.find((p) => p.userId === ctx.userId);
        return {
          id: conversation.id,
          kind: conversation.kind,
          title: display.title,
          handle: display.handle,
          avatarUrl: display.avatarUrl,
          otherUserId: display.otherUserId,
          // Same two raw ingredients the web inbox/conversation header
          // combine for the green dot / "Active Xm ago" line
          // (getConversationDisplayInfo's own comment) — isUserOnline is
          // the in-memory SSE-connection tracker (presence.ts), read
          // synchronously per row here the same way the web page reads it
          // per conversation.
          isOnline: display.otherUserId ? isUserOnline(display.otherUserId) : false,
          otherLastActiveAt: display.otherLastActiveAt,
          lastMessageAt: conversation.lastMessageAt,
          lastMessagePreview: conversation.lastMessagePreview,
          isUnread: isConversationUnreadFor(ctx.userId, conversation, myParticipant),
          isRequest: conversation.requestState?.status === "pending" && conversation.requestState.initiatedBy !== ctx.userId,
        };
      }),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

const START_RATE_LIMIT_ERROR = "Too many new conversations started. Please slow down.";
// Mirrors actions/messages.ts's own MAX_MESSAGE_LENGTH/checkStartConversationRateLimit
// key — duplicated rather than imported for the same "use server" boundary
// reason POST /api/v1/posts's own comment gives.
const MAX_MESSAGE_LENGTH = 4000;

// Starts (or reuses, for a pair with an existing direct conversation) a
// direct conversation and sends its first message in one step — the
// mobile equivalent of actions/messages.ts's startDirectConversation,
// returning JSON instead of redirecting (meaningless outside a page
// render).
export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "messages:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const payload = await request.json().catch(() => null);
  const recipientId = typeof payload?.recipientId === "string" ? payload.recipientId : "";
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";

  if (!recipientId || recipientId === ctx.userId) return apiError("Invalid recipient.", 400);
  if (body.length < 1) return apiError("Message can't be empty.", 400);
  if (body.length > MAX_MESSAGE_LENGTH) return apiError(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`, 400);
  if (!checkRateLimit(`message:start:user:${ctx.userId}`, { max: 10, windowMs: 5 * 60 * 1000 })) {
    return apiError(START_RATE_LIMIT_ERROR, 429);
  }
  if (await isBlockedEitherWay(ctx.userId, recipientId)) return apiError("You can't message this user.", 403);
  if (!(await canReceiveDmFrom(ctx.userId, recipientId))) return apiError("You can't message this user.", 403);

  const recipient = await db.user.findUnique({ where: { id: recipientId }, select: { id: true } });
  if (!recipient) return apiError("User not found.", 404);

  const { conversation, isNew } = await getOrCreateDirectConversation(ctx.userId, recipientId);
  if (isNew) {
    const status = await determineInitialRequestStatus(ctx.userId, recipientId);
    await db.messageRequestState.create({ data: { conversationId: conversation.id, status, initiatedBy: ctx.userId } });
  }

  const message = await recordMessageAndNotify({ conversationId: conversation.id, senderId: ctx.userId, body, attachment: null });
  revalidatePath("/messages");

  return Response.json(
    { conversationId: conversation.id, message: { id: message.id, body: message.body, createdAt: message.createdAt, senderId: message.senderId } },
    { status: 201, headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
