"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getCommunityMember, isCommunityStaff, logModAction } from "@/lib/communities";
import { isFloorFree, getSpeakQueue, MAX_VOICE_ROOM_PARTICIPANTS } from "@/lib/voice-rooms";
import { broadcastRoomUpdate, sendSignal } from "@/lib/voice-signal-events";
import type { ActionState } from "@/app/actions/auth";

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

// joinVoiceRoom/requestToSpeak are the only places a user *enters* a role
// (listener/queued), so they're the only ones that originally re-checked
// community membership — every action below that only *transitions* an
// existing role (take the floor, release it, cancel a request, signal a
// peer) trusted the participant row alone. That leaves a gap: a member who
// requested to speak (or already holds the floor) and then gets banned
// keeps every one of those powers, since their VoiceRoomParticipant row is
// untouched by banMember (communities.ts) — this closes that gap by having
// every state-transition action re-verify active membership too, not just
// entry points. Not folded into requireParticipant itself since some
// callers (e.g. leaveVoiceRoom) deliberately let a banned/departed member
// still tear down their own row.
async function isActiveCommunityMember(communityId: string, userId: string): Promise<boolean> {
  const membership = await getCommunityMember(communityId, userId);
  return !!membership && membership.status === "active";
}

// Any active community member may start a room — spec §12.2 doesn't
// restrict creation to staff, and a walkie-talkie session is closer to
// "hey, let's talk" than a moderator-scheduled broadcast.
export async function createVoiceRoom(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();

  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const membership = await getCommunityMember(communityId, user.id);
  if (!membership || membership.status !== "active") {
    return { error: "You must be an active member to start a room." };
  }

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (!community) return { error: "Community not found." };

  const startsAt = startsAtRaw ? new Date(startsAtRaw) : new Date();
  if (Number.isNaN(startsAt.getTime())) return { error: "Invalid start time." };
  const status = startsAt.getTime() <= Date.now() ? "live" : "scheduled";

  const room = await db.voiceRoom.create({
    data: {
      communityId,
      title,
      startsAt,
      status,
      createdBy: user.id,
      // Creator auto-joins as the first participant when the room starts
      // live immediately — a scheduled-for-later room has no participants
      // until someone actually shows up (startVoiceRoom joins the creator then).
      participants: status === "live" ? { create: [{ userId: user.id, role: "listener" }] } : undefined,
    },
  });

  revalidatePath(`/c/${community.slug}/voice`);
  redirect(`/c/${community.slug}/voice/${room.id}`);
}

export async function startVoiceRoom(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const roomId = String(formData.get("voiceRoomId") ?? "");
  if (!roomId) return;

  const room = await requireRoom(roomId);
  if (!room || room.createdBy !== user.id || room.status !== "scheduled") return;

  await db.voiceRoom.update({ where: { id: roomId }, data: { status: "live" } });
  await db.voiceRoomParticipant.upsert({
    where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: user.id } },
    create: { voiceRoomId: roomId, userId: user.id, role: "listener" },
    update: {},
  });

  broadcastRoomUpdate(roomId);
  revalidatePath(`/c/${room.community.slug}/voice/${roomId}`);
}

// Creator can end their own room freely; a staff member ending someone
// else's room is a moderation action, logged. Clears the floor too — an
// ended room has no active speaker by definition.
export async function endVoiceRoom(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const roomId = String(formData.get("voiceRoomId") ?? "");
  if (!roomId) return;

  const room = await requireRoom(roomId);
  if (!room || room.status === "ended") return;

  const isCreator = room.createdBy === user.id;
  if (!isCreator && !(await isCommunityStaff(room.communityId, user.id))) return;

  await db.voiceRoom.update({
    where: { id: roomId },
    data: { status: "ended", endedAt: new Date(), currentSpeakerId: null, currentSpeakerSince: null },
  });

  if (!isCreator) {
    await logModAction({
      communityId: room.communityId,
      moderatorId: user.id,
      action: "end_voice_room",
      targetType: "voice_room",
      targetId: roomId,
    });
  }

  broadcastRoomUpdate(roomId);
  revalidatePath(`/c/${room.community.slug}/voice`);
  revalidatePath(`/c/${room.community.slug}/voice/${roomId}`);
}

export async function joinVoiceRoom(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const roomId = String(formData.get("voiceRoomId") ?? "");
  if (!roomId) return;

  const room = await requireRoom(roomId);
  if (!room || room.status !== "live") return;

  const membership = await getCommunityMember(room.communityId, user.id);
  if (!membership || membership.status !== "active") return;

  // The existing-check, capacity count, and create are one transaction, not
  // three separate round-trips — a plain check-then-act here (like the
  // *soft*, product-number caps elsewhere, e.g. GROUP_PARTICIPANT_CAP) would
  // let two concurrent joins both read a stale count/absence before either
  // write commits. MAX_VOICE_ROOM_PARTICIPANTS is a real ceiling (mesh
  // WebRTC bandwidth, see voice-rooms.ts), not a soft one, so it's worth the
  // extra transaction here. The P2002 catch below is defense-in-depth for a
  // true double-submit slipping past the in-transaction check (e.g. on a
  // database where writer transactions aren't fully serialized).
  let outcome: "joined" | "already-joined" | "full";
  try {
    outcome = await db.$transaction(async (tx) => {
      const existing = await tx.voiceRoomParticipant.findUnique({
        where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: user.id } },
      });
      if (existing) return "already-joined";

      const count = await tx.voiceRoomParticipant.count({ where: { voiceRoomId: roomId } });
      if (count >= MAX_VOICE_ROOM_PARTICIPANTS) return "full";

      await tx.voiceRoomParticipant.create({ data: { voiceRoomId: roomId, userId: user.id, role: "listener" } });
      return "joined";
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return; // idempotent double-submit
    throw err;
  }
  if (outcome !== "joined") return; // "already-joined": idempotent. "full": quiet no-op, real ceiling of the mesh approach.

  broadcastRoomUpdate(roomId);
  revalidatePath(`/c/${room.community.slug}/voice/${roomId}`);
}

export async function leaveVoiceRoom(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const roomId = String(formData.get("voiceRoomId") ?? "");
  if (!roomId) return;

  const room = await requireRoom(roomId);
  if (!room) return;

  const participant = await requireParticipant(roomId, user.id);
  if (!participant) return;

  await db.voiceRoomParticipant.delete({ where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: user.id } } });

  // Leaving while holding the floor releases it immediately, not after the
  // MAX_FLOOR_HOLD_MS timeout — that timeout is a fallback for a dropped
  // connection, not the primary release path.
  if (room.currentSpeakerId === user.id) {
    await db.voiceRoom.update({ where: { id: roomId }, data: { currentSpeakerId: null, currentSpeakerSince: null } });
  }

  broadcastRoomUpdate(roomId);
  revalidatePath(`/c/${room.community.slug}/voice/${roomId}`);
}

// spec: speaking requires active community membership regardless of the
// community's visibility — same view-vs-write split sendChatMessage
// (src/app/actions/community-chat.ts) already established for chat.
export async function requestToSpeak(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const roomId = String(formData.get("voiceRoomId") ?? "");
  if (!roomId) return;

  const room = await requireRoom(roomId);
  if (!room || room.status !== "live") return;

  const membership = await getCommunityMember(room.communityId, user.id);
  if (!membership || membership.status !== "active") return;

  const participant = await requireParticipant(roomId, user.id);
  if (!participant || participant.role !== "listener") return;

  await db.voiceRoomParticipant.update({
    where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: user.id } },
    data: { role: "requesting_to_speak", requestedToSpeakAt: new Date() },
  });

  broadcastRoomUpdate(roomId);
}

export async function cancelSpeakRequest(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const roomId = String(formData.get("voiceRoomId") ?? "");
  if (!roomId) return;

  const room = await requireRoom(roomId);
  if (!room || !(await isActiveCommunityMember(room.communityId, user.id))) return;

  const participant = await requireParticipant(roomId, user.id);
  if (!participant || participant.role !== "requesting_to_speak") return;

  await db.voiceRoomParticipant.update({
    where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: user.id } },
    data: { role: "listener", requestedToSpeakAt: null },
  });

  broadcastRoomUpdate(roomId);
}

// "Wait for your time, press the button" — the core floor-taking action.
// Silent no-op (not an error) if the floor isn't actually free or it's not
// your turn yet, same posture as this codebase's other quiet-no-op actions
// (moveLink, toggleFeatured) — the UI only enables the button when the
// server-rendered state already says it's your turn, so a legitimate user
// should never hit the no-op path; it's a defense against a stale client.
export async function startSpeaking(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const roomId = String(formData.get("voiceRoomId") ?? "");
  if (!roomId) return;

  const room = await requireRoom(roomId);
  if (!room || room.status !== "live" || !isFloorFree(room)) return;
  if (!(await isActiveCommunityMember(room.communityId, user.id))) return;

  const participants = await db.voiceRoomParticipant.findMany({ where: { voiceRoomId: roomId } });
  const me = participants.find((p) => p.userId === user.id);
  if (!me || me.role !== "requesting_to_speak") return;

  const queue = getSpeakQueue(participants);
  if (queue[0]?.userId !== user.id) return; // strict FIFO — not your turn yet

  await db.$transaction([
    db.voiceRoom.update({
      where: { id: roomId },
      data: { currentSpeakerId: user.id, currentSpeakerSince: new Date() },
    }),
    db.voiceRoomParticipant.update({
      where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: user.id } },
      data: { role: "speaker", requestedToSpeakAt: null },
    }),
    // A speaker who lost the floor to MAX_FLOOR_HOLD_MS timing out (rather
    // than calling stopSpeaking themselves) would otherwise stay stuck at
    // role "speaker" forever — their own later stopSpeaking becomes a
    // silent no-op since room.currentSpeakerId no longer points at them.
    ...(room.currentSpeakerId && room.currentSpeakerId !== user.id
      ? [
          db.voiceRoomParticipant.update({
            where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: room.currentSpeakerId } },
            data: { role: "listener" },
          }),
        ]
      : []),
  ]);

  broadcastRoomUpdate(roomId);
}

export async function stopSpeaking(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const roomId = String(formData.get("voiceRoomId") ?? "");
  if (!roomId) return;

  const room = await requireRoom(roomId);
  if (!room || room.currentSpeakerId !== user.id) return;

  await db.$transaction([
    db.voiceRoom.update({ where: { id: roomId }, data: { currentSpeakerId: null, currentSpeakerSince: null } }),
    db.voiceRoomParticipant.update({
      where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: user.id } },
      data: { role: "listener" },
    }),
  ]);

  broadcastRoomUpdate(roomId);
}

// Staff-only moderation override — ends a stuck/abusive turn. Deliberately
// NOT a "promote someone else now" mechanism: that would let staff skip
// the FIFO queue, which is the entire point of "wait for time" — the only
// staff power here is ending the current turn, never choosing the next one.
export async function forceStopSpeaker(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const roomId = String(formData.get("voiceRoomId") ?? "");
  if (!roomId) return;

  const room = await requireRoom(roomId);
  if (!room || !room.currentSpeakerId) return;
  if (!(await isCommunityStaff(room.communityId, user.id))) return;

  const speakerId = room.currentSpeakerId;
  await db.$transaction([
    db.voiceRoom.update({ where: { id: roomId }, data: { currentSpeakerId: null, currentSpeakerSince: null } }),
    db.voiceRoomParticipant.update({
      where: { voiceRoomId_userId: { voiceRoomId: roomId, userId: speakerId } },
      data: { role: "listener" },
    }),
  ]);
  await logModAction({
    communityId: room.communityId,
    moderatorId: user.id,
    action: "force_stop_speaker",
    targetType: "voice_room",
    targetId: roomId,
  });

  broadcastRoomUpdate(roomId);
}

// Called from banMember (communities.ts) right after a ban takes effect.
// The membership re-checks above close the security hole (a banned member
// can no longer take/keep the floor or signal), but on their own they'd
// leave a banned user's participant row parked in the room forever —
// stuck at the front of the speak queue (blocking everyone behind them,
// since startSpeaking's FIFO check never advances past a queue entry that
// can't pass its own membership check) if they were queued, or stuck
// broadcasting as speaker until someone force-stops them if they already
// had the floor. Removing the row outright (and releasing the floor if
// they held it) is what actually ends their presence, not just their
// ability to act.
export async function evictBannedUserFromVoiceRooms(communityId: string, userId: string): Promise<void> {
  const rooms = await db.voiceRoom.findMany({
    where: { communityId, status: "live", participants: { some: { userId } } },
    select: { id: true, currentSpeakerId: true },
  });
  if (rooms.length === 0) return;

  await db.voiceRoomParticipant.deleteMany({
    where: { voiceRoomId: { in: rooms.map((r) => r.id) }, userId },
  });

  const roomsWhereSpeaking = rooms.filter((r) => r.currentSpeakerId === userId).map((r) => r.id);
  if (roomsWhereSpeaking.length > 0) {
    await db.voiceRoom.updateMany({
      where: { id: { in: roomsWhereSpeaking } },
      data: { currentSpeakerId: null, currentSpeakerSince: null },
    });
  }

  for (const room of rooms) broadcastRoomUpdate(room.id);
}

// Relays a WebRTC offer/answer/ICE-candidate payload to one specific peer
// (src/lib/voice-signal-events.ts's sendSignal) — verifies both ends are
// current room participants first, so signaling can't be used to probe or
// spam users outside the room. Called directly from VoiceRoomView.tsx
// (not a plain <form>), same "FormData even when programmatically
// invoked" convention as messages.ts's sendMessage, for consistency.
export async function sendVoiceSignal(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const roomId = String(formData.get("voiceRoomId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const payloadRaw = String(formData.get("payload") ?? "");
  if (!roomId || !targetUserId || !payloadRaw) return;

  const [room, me, target] = await Promise.all([
    requireRoom(roomId),
    requireParticipant(roomId, user.id),
    requireParticipant(roomId, targetUserId),
  ]);
  if (!room || !me || !target) return;
  if (!(await isActiveCommunityMember(room.communityId, user.id))) return;

  let payload: unknown;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return;
  }

  sendSignal(roomId, targetUserId, user.id, payload);
}
