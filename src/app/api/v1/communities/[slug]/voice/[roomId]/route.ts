import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getCommunityMember, isCommunityStaff } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";
import { getVoiceRoom, getSpeakQueue, isFloorFree } from "@/lib/voice-rooms";

// Realtime addendum Phase D3 — the full voice-room snapshot the mobile
// screen renders (mirrors what src/app/c/[slug]/voice/[roomId]/page.tsx
// computes for the web view). The client polls-on-`room-updated` from the
// stream rather than re-deriving state itself.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; roomId: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "communities:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { slug, roomId } = await params;
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

  const room = await getVoiceRoom(roomId);
  if (!room || room.communityId !== community.id) return apiError("Not found.", 404);

  const me = room.participants.find((p) => p.userId === ctx.userId) ?? null;
  const queue = getSpeakQueue(room.participants);
  const myQueueIndex = me?.role === "requesting_to_speak" ? queue.findIndex((p) => p.userId === ctx.userId) : -1;
  const isStaff = await isCommunityStaff(community.id, ctx.userId);

  return Response.json({
    id: room.id,
    title: room.title,
    status: room.status,
    isCreator: room.createdBy === ctx.userId,
    isStaff,
    canSpeak: membership?.status === "active",
    myRole: me?.role ?? null,
    isParticipant: me !== null,
    currentSpeakerId: room.currentSpeakerId,
    currentSpeakerName: room.currentSpeaker
      ? room.currentSpeaker.profile?.displayName ?? room.currentSpeaker.username?.handle ?? null
      : null,
    floorFree: isFloorFree(room),
    queuePosition: myQueueIndex >= 0 ? myQueueIndex + 1 : null,
    isMyTurnNext: myQueueIndex === 0 && isFloorFree(room),
    participants: room.participants.map((p) => ({
      userId: p.userId,
      role: p.role,
      displayName: p.user.profile?.displayName ?? p.user.username?.handle ?? "Member",
      avatarUrl: p.user.profile?.avatarUrl ?? null,
    })),
  });
}
