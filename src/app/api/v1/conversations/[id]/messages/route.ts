import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import {
  getParticipant,
  getMessagesForConversation,
  otherParticipantIds,
  recordMessageAndNotify,
  resolveMessageAttachment,
} from "@/lib/messaging";
import { parseCursor } from "@/lib/pagination";
import { revalidatePath } from "next/cache";

// Newest-first, the same raw direction getMessagesForConversation and every
// cursor-paginated list in this codebase returns — the mobile client
// reverses this page for oldest-at-top chat display itself (same "view
// wants ascending, query returns descending" split actions/messages.ts's
// loadOlderMessages already makes, just done client-side here instead of
// server-side since there's no server-rendered initial page to match).
// Text-only for this first cut (no attachment upload) — mirrors POST
// /api/v1/posts's own "text/image now, richer types stay web-only until a
// mobile screen actually needs them" scoping decision.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "messages:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { id: conversationId } = await params;
  const cursor = parseCursor(new URL(request.url).searchParams.get("cursor") ?? undefined);
  // getMessagesForConversation itself re-enforces the participant check and
  // returns an empty page for a non-participant/unknown conversation rather
  // than a 404 — same "don't leak whether it exists" posture as the web
  // action's own comment.
  const { items, nextCursor } = await getMessagesForConversation(conversationId, ctx.userId, cursor);

  return Response.json(
    {
      items: items.map((m) => ({
        id: m.id,
        body: m.body,
        senderId: m.senderId,
        attachmentType: m.attachmentType,
        attachmentUrl: m.attachmentUrl,
        attachmentMimeType: m.attachmentMimeType,
        attachmentDurationS: m.attachmentDurationS,
        createdAt: m.createdAt,
        deletedAt: m.deletedAt,
      })),
      nextCursor,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

const RATE_LIMIT_ERROR = "You're sending messages too fast. Please slow down.";
const MAX_MESSAGE_LENGTH = 4000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "messages:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { id: conversationId } = await params;

  // Same dual JSON/multipart shape as PATCH /api/v1/users/me and POST
  // /api/v1/posts — an attachment (voice note or file) needs a real file
  // upload; a text-only message doesn't need to pay for a multipart
  // request. Mirrors actions/messages.ts's sendMessage exactly, including
  // spec §5.1's "body is nullable if attachment-only" rule.
  const isMultipart = (request.headers.get("content-type") ?? "").startsWith("multipart/form-data");
  let body = "";
  let attachmentResult: Awaited<ReturnType<typeof resolveMessageAttachment>> = { attachment: null };

  if (isMultipart) {
    const form = await request.formData().catch(() => null);
    if (!form) return apiError("Invalid form data.", 400);
    body = String(form.get("body") ?? "").trim();
    attachmentResult = await resolveMessageAttachment(form, ctx.userId);
  } else {
    const payload = await request.json().catch(() => null);
    body = typeof payload?.body === "string" ? payload.body.trim() : "";
  }

  if ("error" in attachmentResult) return apiError(attachmentResult.error, 400);
  const { attachment } = attachmentResult;

  if (body.length < 1 && !attachment) return apiError("Message can't be empty.", 400);
  if (body.length > MAX_MESSAGE_LENGTH) return apiError(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`, 400);
  if (!checkRateLimit(`message:send:user:${ctx.userId}`, { max: 60, windowMs: 5 * 60 * 1000 })) {
    return apiError(RATE_LIMIT_ERROR, 429);
  }

  const participant = await getParticipant(conversationId, ctx.userId);
  if (!participant) return apiError("Conversation not found.", 404);

  const conversation = await db.conversation.findUnique({ where: { id: conversationId }, include: { requestState: true } });
  if (!conversation) return apiError("Conversation not found.", 404);

  if (conversation.requestState) {
    const { status, initiatedBy } = conversation.requestState;
    if (status === "declined") return apiError("This conversation is no longer available.", 403);
    if (status === "pending" && initiatedBy !== ctx.userId) {
      return apiError("Accept this conversation request before replying.", 403);
    }
  }

  if (conversation.kind === "direct") {
    const others = await otherParticipantIds(conversationId, ctx.userId);
    if (others.length === 1 && (await isBlockedEitherWay(ctx.userId, others[0]))) {
      return apiError("You can't message this user.", 403);
    }
  }

  const message = await recordMessageAndNotify({
    conversationId,
    senderId: ctx.userId,
    body: body.length > 0 ? body : null,
    attachment,
  });
  revalidatePath("/messages");

  return Response.json(
    {
      id: message.id,
      body: message.body,
      senderId: message.senderId,
      attachmentType: message.attachmentType,
      attachmentUrl: message.attachmentUrl,
      attachmentMimeType: message.attachmentMimeType,
      attachmentDurationS: message.attachmentDurationS,
      createdAt: message.createdAt,
    },
    { status: 201, headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
