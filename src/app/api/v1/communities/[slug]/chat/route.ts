import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getCommunityMember } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";
import { getRecentChatMessages, serializeChatMessage } from "@/lib/community-chat";
import { publishToCommunityChat } from "@/lib/community-chat-events";
import { parseCursor } from "@/lib/pagination";

// Realtime addendum (docs/specs/addendum-realtime-community.md) Phase C —
// the bearer-token counterpart to the web's cookie-session community chat
// (src/app/actions/community-chat.ts + src/app/c/[slug]/chat). Follows the
// established /api/v1 shape: resolveApiRequest → requireScope →
// checkApiRateLimit → apiError, cursor pagination via pagination.ts.
//
// GET (history) and the live stream (./stream/route.ts) follow the same
// visibility rule as the web chat page — public/restricted chat is readable
// by anyone who can see the community, private only by active members.
// POST (send) additionally requires an *active* membership and a verified
// account, and uses the durable enforceRateLimit tier (memory
// `project_rate_limit_two_tier`) since it's a user-facing write path.

const SEND_MAX = 30;
const SEND_WINDOW_MS = 5 * 60 * 1000;

async function resolveCommunity(slug: string) {
  return db.community.findUnique({
    where: { slug: decodeURIComponent(slug).toLowerCase() },
    select: { id: true, slug: true, visibility: true, restrictedToOrganizationId: true },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { slug } = await params;
  const community = await resolveCommunity(slug);
  if (!community) return apiError("Not found.", 404);

  const membership = await getCommunityMember(community.id, ctx.userId);
  const isActiveMember = membership?.status === "active" || membership?.status === "muted";
  if (isGatedFromCommunityContent(community, isActiveMember)) {
    return apiError("Join this community to view its chat.", 403);
  }

  const cursor = parseCursor(new URL(request.url).searchParams.get("cursor") ?? undefined);
  const { items, nextCursor } = await getRecentChatMessages(community.id, cursor);

  return Response.json(
    {
      // Most-recent-first from the query (matches the DM history endpoint),
      // so an inverted FlatList on the client renders newest at the bottom.
      items: items.map(serializeChatMessage),
      nextCursor,
      canSend: membership?.status === "active",
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { slug } = await params;
  const community = await resolveCommunity(slug);
  if (!community) return apiError("Not found.", 404);

  const payload = await request.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (body.length < 1 || body.length > 500) return apiError("Message must be 1-500 characters.", 400);

  const membership = await getCommunityMember(community.id, ctx.userId);
  if (membership?.status !== "active") {
    // A muted member reads as active-adjacent for *viewing* (above) but
    // can't send — same server-side rejection the web action makes.
    return apiError("You don't have permission to send messages here.", 403);
  }

  // Durable, cross-instance flood guard — keyed per user per community so a
  // chatty community can't burn the user's budget everywhere else.
  const withinLimit = await enforceRateLimit(`community-chat:send:${ctx.userId}:${community.id}`, {
    max: SEND_MAX,
    windowMs: SEND_WINDOW_MS,
  });
  if (!withinLimit) return apiError("You're sending messages too fast. Please slow down.", 429);

  const created = await db.communityChatMessage.create({
    data: { communityId: community.id, senderId: ctx.userId, body },
    include: { sender: { include: { username: true, profile: true } } },
  });
  const message = serializeChatMessage(created);
  await publishToCommunityChat(community.id, { type: "new-chat-message", message });

  return Response.json(message, {
    status: 201,
    headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) },
  });
}
