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

// Real ceiling of the WebRTC mesh approach (see schema comment on
// VoiceRoom): the current speaker's browser opens one outbound connection
// per listener, so their upload bandwidth scales with room size.
export const MAX_VOICE_ROOM_PARTICIPANTS = 30;

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
