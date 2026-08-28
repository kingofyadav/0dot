"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getCommunityMember } from "@/lib/communities";
import { MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY } from "@/lib/voice-rooms";
import { broadcastRoomUpdate } from "@/lib/voice-room-events";
import { ensureVoiceRoom, setVoicePublish, kickFromVoiceRoom } from "@/lib/voice-livekit";
import * as voice from "@/lib/voice-room-actions";
import type { ActionState } from "@/app/actions/auth";

// Cookie-session Server Actions for the web voice-room view. The floor
// logic itself lives in src/lib/voice-room-actions.ts so the bearer-token
// mobile route (api/v1/.../voice/[roomId]/action) runs the identical
// guards — these are thin (requireVerifiedUser → delegate) wrappers.
// createVoiceRoom and evictBannedUserFromVoiceRooms stay here: the first
// has a redirect(), the second is called internally by banMember with a
// (communityId, userId) shape, neither fits the (userId, roomId) split.

function roomId(formData: FormData): string {
  return String(formData.get("voiceRoomId") ?? "");
}

// Any active community member may start a room — spec §12.2 doesn't
// restrict creation to staff, and a walkie-talkie session is closer to
// "hey, let's talk" than a moderator-scheduled broadcast.
export async function createVoiceRoom(_prevState: ActionState, formData: FormData): Promise<ActionState> {
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

  // Cost guard (spec §3.4) — a community can't stand up an unbounded number
  // of concurrent LiveKit rooms. Only counts rooms starting live now; a
  // scheduled-for-later room is checked again in startVoiceRoom.
  if (status === "live") {
    const liveCount = await db.voiceRoom.count({ where: { communityId, status: "live" } });
    if (liveCount >= MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY) {
      return { error: `This community already has ${MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY} live rooms. End one first.` };
    }
  }

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

  if (status === "live") await ensureVoiceRoom(room.id);

  revalidatePath(`/c/${community.slug}/voice`);
  redirect(`/c/${community.slug}/voice/${room.id}`);
}

export async function startVoiceRoom(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  await voice.startVoiceRoom(user.id, roomId(formData));
}

export async function endVoiceRoom(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  await voice.endVoiceRoom(user.id, roomId(formData));
}

export async function joinVoiceRoom(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  await voice.joinVoiceRoom(user.id, roomId(formData));
}

export async function leaveVoiceRoom(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  await voice.leaveVoiceRoom(user.id, roomId(formData));
}

export async function requestToSpeak(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  await voice.requestToSpeak(user.id, roomId(formData));
}

export async function cancelSpeakRequest(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  await voice.cancelSpeakRequest(user.id, roomId(formData));
}

export async function startSpeaking(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  await voice.startSpeaking(user.id, roomId(formData));
}

export async function stopSpeaking(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  await voice.stopSpeaking(user.id, roomId(formData));
}

export async function forceStopSpeaker(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  await voice.forceStopSpeaker(user.id, roomId(formData));
}

// Phase D — the LiveKit join token for a room the user is already a
// participant of (VoiceRoomView calls this once it's rendered the
// participant branch).
export async function requestVoiceRoomToken(
  id: string
): Promise<{ token: string; url: string } | { error: string }> {
  const user = await requireVerifiedUser();
  return voice.mintTokenForParticipant(user.id, id);
}

// Called from banMember (communities.ts) right after a ban takes effect —
// removes a banned user's parked participant row (stuck at the front of the
// speak queue, or broadcasting as speaker) from every live room, releases
// the floor where they held it, and kicks them from the LiveKit SFU.
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

  await Promise.all(
    rooms.flatMap((room) => [
      kickFromVoiceRoom(room.id, userId),
      ...(room.currentSpeakerId === userId ? [setVoicePublish(room.id, userId, false)] : []),
    ])
  );

  for (const room of rooms) broadcastRoomUpdate(room.id);
}
