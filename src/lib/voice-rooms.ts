import "server-only";
import { db } from "@/lib/db";

// Plain server-only lib, not a "use server" action file — same reasoning as
// communities.ts/blocks.ts: these queries trust a bare id with no
// request-level auth of their own.

// Auto-release-after-timeout for a stuck/dropped-connection speaker — a
// lazy staleness check evaluated wherever "is the floor free" matters, not
// a background job (same posture as trending.ts's recompute guard). The
// client self-releases at the same threshold in normal operation; this is
// the server-side fallback for a speaker who never sends stopSpeaking
// (e.g. their tab crashed).
export const MAX_FLOOR_HOLD_MS = 60_000;

// Phase D (docs/specs/addendum-voice-rooms-livekit.md): the audio moved to
// a LiveKit SFU, so the mesh bandwidth ceiling (was 30 — one outbound
// connection per listener from the speaker's browser) no longer applies.
// This is now just a product cap, matched by the LiveKit room's own
// maxParticipants.
export const MAX_VOICE_ROOM_PARTICIPANTS = 100;

// Cost guard — a community can't stand up an unbounded number of concurrent
// LiveKit rooms (each is real SFU capacity). Checked in createVoiceRoom /
// startVoiceRoom against the count of status:"live" rooms.
export const MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY = 3;

const participantUserInclude = { username: true, profile: true } as const;

const roomInclude = {
  creator: { include: participantUserInclude },
  currentSpeaker: { include: participantUserInclude },
  participants: { include: { user: { include: participantUserInclude } } },
} as const;

export function getVoiceRoom(id: string) {
  return db.voiceRoom.findUnique({ where: { id }, include: roomInclude });
}

export function listVoiceRooms(communityId: string) {
  return db.voiceRoom.findMany({
    where: { communityId, status: { not: "ended" } },
    orderBy: { createdAt: "desc" },
    include: { creator: { include: participantUserInclude } },
  });
}

export function isFloorFree(room: { currentSpeakerId: string | null; currentSpeakerSince: Date | null }): boolean {
  if (!room.currentSpeakerId) return true;
  if (!room.currentSpeakerSince) return true; // defensive — shouldn't happen if currentSpeakerId is set
  return Date.now() - room.currentSpeakerSince.getTime() > MAX_FLOOR_HOLD_MS;
}

// "This user holds the floor right now, and it hasn't gone stale" — the
// LiveKit token's canPublish value (Phase D). A stale floor
// (isFloorFree true despite currentSpeakerId set) grants nothing; the next
// speaker's startSpeaking will take it.
export function holdsFreshFloor(
  room: { currentSpeakerId: string | null; currentSpeakerSince: Date | null },
  userId: string
): boolean {
  return room.currentSpeakerId === userId && !isFloorFree(room);
}

export type VoiceRoomParticipantRow = {
  userId: string;
  role: string;
  requestedToSpeakAt: Date | null;
};

// FIFO — earliest request first. Only ever meaningful for role =
// requesting_to_speak; callers filter first.
export function getSpeakQueue<T extends VoiceRoomParticipantRow>(participants: T[]): T[] {
  return participants
    .filter((p) => p.role === "requesting_to_speak" && p.requestedToSpeakAt !== null)
    .sort((a, b) => a.requestedToSpeakAt!.getTime() - b.requestedToSpeakAt!.getTime());
}
