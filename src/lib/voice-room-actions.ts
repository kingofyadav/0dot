import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCommunityMember, isCommunityStaff, logModAction } from "@/lib/communities";
import { revalidatePath } from "next/cache";
import {
  isFloorFree,
  holdsFreshFloor,
  getSpeakQueue,
  MAX_VOICE_ROOM_PARTICIPANTS,
  MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY,
} from "@/lib/voice-rooms";
import { broadcastRoomUpdate } from "@/lib/voice-room-events";
import { ensureVoiceRoom, closeVoiceRoom, setVoicePublish, mintVoiceRoomToken } from "@/lib/voice-livekit";

// The voice-room floor transitions, extracted so both the cookie-session
// Server Actions (src/app/actions/voice-rooms.ts) and the bearer-token
// mobile route (api/v1/.../voice/[roomId]/action) run the identical logic
// with an identical set of guards — same "one implementation, two entry
// points" split notifications.ts uses. Every function takes an
// already-authenticated userId (the caller does requireVerifiedUser /
// resolveApiRequest) and returns a plain result, never throws for a
// business-rule failure.
//
// Phase D (docs/specs/addendum-voice-rooms-livekit.md). See voice-rooms.ts
// for the design of the FIFO floor and each guard's reasoning — the
// comments there aren't repeated in full here.

export type VoiceActionResult = { ok: true } | { error: string };

const OK: VoiceActionResult = { ok: true };

function requireRoom(roomId: string) {
  return db.voiceRoom.findUnique({
    where: { id: roomId },
    include: { community: { select: { id: true, slug: true } } },
  });
}

function requireParticipant(roomId: string, userId: string) {
  return db.voiceRoomParticipant.findUnique({
    where: { voiceRoomId_userId: { voiceRoomId: roomId, userId } },
  });
}

async function isActiveMember(communityId: string, userId: string): Promise<boolean> {
  const m = await getCommunityMember(communityId, userId);
  return !!m && m.status === "active";
}

// ── Room lifecycle ─────────────────────────────────────────────────────

// Create a room that starts live immediately (the mobile flow — the web
// form additionally supports scheduling). Returns the new room id.
export async function createLiveVoiceRoom(
  userId: string,
  communityId: string,
  title: string
): Promise<{ id: string } | { error: string }> {
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > 120) return { error: "Title must be 1-120 characters." };

  if (!(await isActiveMember(communityId, userId))) return { error: "You must be an active member to start a room." };

  const liveCount = await db.voiceRoom.count({ where: { communityId, status: "live" } });
  if (liveCount >= MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY) {
    return { error: `This community already has ${MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY} live rooms. End one first.` };
  }

  const room = await db.voiceRoom.create({
    data: {
      communityId,
      title: trimmed,
      startsAt: new Date(),
      status: "live",
      createdBy: userId,
      participants: { create: [{ userId, role: "listener" }] },
    },
    select: { id: true, community: { select: { slug: true } } },
  });
  await ensureVoiceRoom(room.id);
  revalidatePath(`/c/${room.community.slug}/voice`);
  return { id: room.id };
}

export async function startVoiceRoom(userId: string, roomId: string): Promise<VoiceActionResult> {
  const room = await requireRoom(roomId);
  if (!room || room.createdBy !== userId || room.status !== "scheduled") return { error: "Can't start this room." };

  const liveCount = await db.voiceRoom.count({ where: { communityId: room.communityId, status: "live" } });
  if (liveCount >= MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY) {
    return { error: `This community already has ${MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY} live rooms.` };
  }

  await db.voiceRoom.update({ where: { id: roomId }, data: { status: "live" } });
  await db.voiceRoomParticipant.upsert({
    where: { voiceRoomId_userId: { voiceRoomId: roomId, userId } },
    create: { voiceRoomId: roomId, userId, role: "listener" },
    update: {},
  });
  await ensureVoiceRoom(roomId);

  broadcastRoomUpdate(roomId);
  revalidatePath(`/c/${room.community.slug}/voice/${roomId}`);
  return OK;
}

export async function endVoiceRoom(userId: string, roomId: string): Promise<VoiceActionResult> {
  const room = await requireRoom(roomId);
  if (!room || room.status === "ended") return { error: "This room isn't running." };

  const isCreator = room.createdBy === userId;
  if (!isCreator && !(await isCommunityStaff(room.communityId, userId))) return { error: "You can't end this room." };

  await db.voiceRoom.update({
    where: { id: roomId },
    data: { status: "ended", endedAt: new Date(), currentSpeakerId: null, currentSpeakerSince: null },
  });
  await closeVoiceRoom(roomId);

  if (!isCreator) {
    await logModAction({
      communityId: room.communityId,
      moderatorId: userId,
      action: "end_voice_room",
      targetType: "voice_room",
      targetId: roomId,
    });
  }

  broadcastRoomUpdate(roomId);
  revalidatePath(`/c/${room.community.slug}/voice`);
  revalidatePath(`/c/${room.community.slug}/voice/${roomId}`);
  return OK;
}

// ── Presence ───────────────────────────────────────────────────────────

export async function joinVoiceRoom(userId: string, roomId: string): Promise<VoiceActionResult> {
  const room = await requireRoom(roomId);
  if (!room || room.status !== "live") return { error: "This room isn't live." };
  if (!(await isActiveMember(room.communityId, userId))) return { error: "Join this community first." };

  let outcome: "joined" | "already-joined" | "full";
  try {
    outcome = await db.$transaction(async (tx) => {
      const existing = await tx.voiceRoomParticipant.findUnique({
        where: { voiceRoomId_userId: { voiceRoomId: roomId, userId } },
      });
      if (existing) return "already-joined";
      const count = await tx.voiceRoomParticipant.count({ where: { voiceRoomId: roomId } });
      if (count >= MAX_VOICE_ROOM_PARTICIPANTS) return "full";
      await tx.voiceRoomParticipant.create({ data: { voiceRoomId: roomId, userId, role: "listener" } });
      return "joined";
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return OK; // idempotent double-submit
    throw err;
  }
  if (outcome === "full") return { error: "This room is full." };
  if (outcome === "joined") {
    broadcastRoomUpdate(roomId);
    revalidatePath(`/c/${room.community.slug}/voice/${roomId}`);
  }
  return OK;
}

export async function leaveVoiceRoom(userId: string, roomId: string): Promise<VoiceActionResult> {
  const room = await requireRoom(roomId);
  if (!room) return { error: "Room not found." };

  const participant = await requireParticipant(roomId, userId);
  if (!participant) return OK; // already gone — idempotent

  await db.voiceRoomParticipant.delete({ where: { voiceRoomId_userId: { voiceRoomId: roomId, userId } } });
  if (room.currentSpeakerId === userId) {
    await db.voiceRoom.update({ where: { id: roomId }, data: { currentSpeakerId: null, currentSpeakerSince: null } });
    await setVoicePublish(roomId, userId, false);
  }

  broadcastRoomUpdate(roomId);
  revalidatePath(`/c/${room.community.slug}/voice/${roomId}`);
  return OK;
}

// ── Floor / speak queue ────────────────────────────────────────────────

export async function requestToSpeak(userId: string, roomId: string): Promise<VoiceActionResult> {
  const room = await requireRoom(roomId);
  if (!room || room.status !== "live") return { error: "This room isn't live." };
  if (!(await isActiveMember(room.communityId, userId))) return { error: "You're not an active member." };

  const participant = await requireParticipant(roomId, userId);
  if (!participant || participant.role !== "listener") return { error: "You can't request the floor right now." };

  await db.voiceRoomParticipant.update({
    where: { voiceRoomId_userId: { voiceRoomId: roomId, userId } },
    data: { role: "requesting_to_speak", requestedToSpeakAt: new Date() },
  });
  broadcastRoomUpdate(roomId);
  return OK;
}

export async function cancelSpeakRequest(userId: string, roomId: string): Promise<VoiceActionResult> {
  const room = await requireRoom(roomId);
  if (!room || !(await isActiveMember(room.communityId, userId))) return { error: "Can't do that." };

  const participant = await requireParticipant(roomId, userId);
  if (!participant || participant.role !== "requesting_to_speak") return OK;

  await db.voiceRoomParticipant.update({
    where: { voiceRoomId_userId: { voiceRoomId: roomId, userId } },
    data: { role: "listener", requestedToSpeakAt: null },
  });
  broadcastRoomUpdate(roomId);
  return OK;
}

export async function startSpeaking(userId: string, roomId: string): Promise<VoiceActionResult> {
  const room = await requireRoom(roomId);
  if (!room || room.status !== "live" || !isFloorFree(room)) return { error: "The floor isn't free." };
  if (!(await isActiveMember(room.communityId, userId))) return { error: "You're not an active member." };

  const participants = await db.voiceRoomParticipant.findMany({ where: { voiceRoomId: roomId } });
  const me = participants.find((p) => p.userId === userId);
  if (!me || me.role !== "requesting_to_speak") return { error: "You haven't requested the floor." };

  const queue = getSpeakQueue(participants);
  if (queue[0]?.userId !== userId) return { error: "It's not your turn yet." };

  await db.$transaction([
    db.voiceRoom.update({ where: { id: roomId }, data: { currentSpeakerId: userId, currentSpeakerSince: new Date() } }),
    db.voiceRoomParticipant.update({
      where: { voiceRoomId_userId: { voiceRoomId: roomId, userId } },
      data: { role: "speaker", requestedToSpeakAt: null },
    }),
    ...(room.currentSpeakerId && room.currentSpeakerId !== userId
      ? [
          db.voiceRoomParticipant.update({
            where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: room.currentSpeakerId } },
            data: { role: "listener" },
          }),
        ]
      : []),
  ]);

  if (room.currentSpeakerId && room.currentSpeakerId !== userId) {
    await setVoicePublish(roomId, room.currentSpeakerId, false);
  }
  await setVoicePublish(roomId, userId, true);

  broadcastRoomUpdate(roomId);
  return OK;
}

export async function stopSpeaking(userId: string, roomId: string): Promise<VoiceActionResult> {
  const room = await requireRoom(roomId);
  if (!room || room.currentSpeakerId !== userId) return OK; // already not speaking

  await db.$transaction([
    db.voiceRoom.update({ where: { id: roomId }, data: { currentSpeakerId: null, currentSpeakerSince: null } }),
    db.voiceRoomParticipant.update({
      where: { voiceRoomId_userId: { voiceRoomId: roomId, userId } },
      data: { role: "listener" },
    }),
  ]);
  await setVoicePublish(roomId, userId, false);
  broadcastRoomUpdate(roomId);
  return OK;
}

export async function forceStopSpeaker(userId: string, roomId: string): Promise<VoiceActionResult> {
  const room = await requireRoom(roomId);
  if (!room || !room.currentSpeakerId) return { error: "Nobody's speaking." };
  if (!(await isCommunityStaff(room.communityId, userId))) return { error: "You're not a moderator." };

  const speakerId = room.currentSpeakerId;
  await db.$transaction([
    db.voiceRoom.update({ where: { id: roomId }, data: { currentSpeakerId: null, currentSpeakerSince: null } }),
    db.voiceRoomParticipant.update({
      where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: speakerId } },
      data: { role: "listener" },
    }),
  ]);
  await setVoicePublish(roomId, speakerId, false);
  await logModAction({
    communityId: room.communityId,
    moderatorId: userId,
    action: "force_stop_speaker",
    targetType: "voice_room",
    targetId: roomId,
  });
  broadcastRoomUpdate(roomId);
  return OK;
}

// ── Token ──────────────────────────────────────────────────────────────

export async function mintTokenForParticipant(
  userId: string,
  roomId: string
): Promise<{ token: string; url: string } | { error: string }> {
  const [room, participant] = await Promise.all([requireRoom(roomId), requireParticipant(roomId, userId)]);
  if (!room || room.status !== "live") return { error: "This room isn't live." };
  if (!participant) return { error: "Join the room first." };
  if (!(await isActiveMember(room.communityId, userId))) return { error: "You're not an active member of this community." };

  const withName = await db.user.findUnique({ where: { id: userId }, select: { username: { select: { handle: true } } } });
  const result = await mintVoiceRoomToken({
    roomId,
    userId,
    name: withName?.username?.handle,
    canPublish: holdsFreshFloor(room, userId),
  });
  return result ?? { error: "Voice isn't configured for this deployment yet." };
}
