import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getCommunityMember } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";
import { listVoiceRooms, isFloorFree } from "@/lib/voice-rooms";
import { createLiveVoiceRoom } from "@/lib/voice-room-actions";

// Realtime addendum Phase D3 — the community's non-ended voice rooms, for
// the mobile Voice tab. Same visibility gate as chat.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { slug } = await params;
  const community = await db.community.findUnique({
    where: { slug: decodeURIComponent(slug).toLowerCase() },
    select: { id: true, visibility: true, restrictedToOrganizationId: true },
  });
  if (!community) return apiError("Not found.", 404);

  const membership = await getCommunityMember(community.id, ctx.userId);
  const isActiveMember = membership?.status === "active" || membership?.status === "muted";
  if (isGatedFromCommunityContent(community, isActiveMember)) {
    return apiError("Join this community to see its voice rooms.", 403);
  }

  const rooms = await listVoiceRooms(community.id);

  return Response.json(
    {
      items: rooms.map((room) => ({
        id: room.id,
        title: room.title,
        status: room.status,
        startsAt: room.startsAt.toISOString(),
        createdBy: room.createdBy,
        creatorName: room.creator.profile?.displayName ?? room.creator.username?.handle ?? null,
        floorFree: isFloorFree(room),
      })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { slug } = await params;
  const community = await db.community.findUnique({
    where: { slug: decodeURIComponent(slug).toLowerCase() },
    select: { id: true },
  });
  if (!community) return apiError("Not found.", 404);

  const payload = await request.json().catch(() => null);
  const title = typeof payload?.title === "string" ? payload.title : "";

  const result = await createLiveVoiceRoom(ctx.userId, community.id, title);
  if ("error" in result) return apiError(result.error, 400);
  return Response.json(result, { status: 201 });
}
