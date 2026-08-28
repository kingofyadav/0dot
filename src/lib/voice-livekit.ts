import "server-only";
import { RoomServiceClient } from "livekit-server-sdk";
import { createLiveKitToken } from "@/lib/livestream-provider";

// LiveKit lifecycle + permission sync for community voice rooms
// (docs/specs/addendum-voice-rooms-livekit.md — Realtime Phase D). The
// audio transport is a LiveKit SFU room per VoiceRoom; the FIFO floor model
// (src/lib/voice-rooms.ts) is untouched. `createLiveKitToken`
// (livestream-provider.ts) is the shared token path — this module only adds
// what's voice-specific: room create/close, and the publish grant that
// follows the floor.
//
// Every export is best-effort and no-ops without LIVEKIT_* configured —
// voice rooms then just have no working audio, never a thrown request.
// Read lazily (not at module load) so a build/preview without the creds
// still compiles (memory `project_next_build_eager_secret_gotcha`).

const MAX_PARTICIPANTS = 100; // SFU — the old mesh cap (30) reason is gone
const EMPTY_TIMEOUT_S = 300; // LiveKit auto-closes the room 5 min after the last leave
const DEPARTURE_TIMEOUT_S = 20; // grace for a brief speaker disconnect/reconnect

function lkConfig(): { url: string; apiKey: string; apiSecret: string } | null {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  return { url: LIVEKIT_URL, apiKey: LIVEKIT_API_KEY, apiSecret: LIVEKIT_API_SECRET };
}

function roomService(): RoomServiceClient | null {
  const cfg = lkConfig();
  return cfg ? new RoomServiceClient(cfg.url, cfg.apiKey, cfg.apiSecret) : null;
}

export function voiceRoomLkName(roomId: string): string {
  return `voiceroom_${roomId}`;
}

export function isLiveKitVoiceConfigured(): boolean {
  return lkConfig() !== null;
}

// Idempotent — LiveKit's createRoom is a no-op if the room already exists.
export async function ensureVoiceRoom(roomId: string): Promise<void> {
  const svc = roomService();
  if (!svc) return;
  try {
    await svc.createRoom({
      name: voiceRoomLkName(roomId),
      emptyTimeout: EMPTY_TIMEOUT_S,
      departureTimeout: DEPARTURE_TIMEOUT_S,
      maxParticipants: MAX_PARTICIPANTS,
    });
  } catch (error) {
    console.error("[voice-livekit] ensureVoiceRoom failed", error);
  }
}

export async function closeVoiceRoom(roomId: string): Promise<void> {
  const svc = roomService();
  if (!svc) return;
  try {
    await svc.deleteRoom(voiceRoomLkName(roomId));
  } catch (error) {
    // deleteRoom on an already-gone room is fine (empty-timeout beat us).
    console.error("[voice-livekit] closeVoiceRoom failed (may be already closed)", error);
  }
}

// Grant/revoke mic-publish for one participant, live. permissions are
// updated atomically (LiveKit requires the full desired set), so canPublish
// goes alongside canSubscribe:true / canPublishData:false every time.
// Throws a not-found when the user holds the floor but isn't connected to
// LiveKit — swallowed: their minted token already gates them, and the 60s
// floor timeout (voice-rooms.ts MAX_FLOOR_HOLD_MS) is the backstop.
export async function setVoicePublish(roomId: string, userId: string, canPublish: boolean): Promise<void> {
  const svc = roomService();
  if (!svc) return;
  try {
    await svc.updateParticipant(voiceRoomLkName(roomId), userId, {
      permission: { canPublish, canSubscribe: true, canPublishData: false },
    });
  } catch (error) {
    console.error(`[voice-livekit] setVoicePublish(${canPublish}) failed for ${userId}`, error);
  }
}

// Ban path — remove the participant from the LiveKit room entirely (their
// VoiceRoomParticipant row is deleted separately by
// evictBannedUserFromVoiceRooms).
export async function kickFromVoiceRoom(roomId: string, userId: string): Promise<void> {
  const svc = roomService();
  if (!svc) return;
  try {
    await svc.removeParticipant(voiceRoomLkName(roomId), userId);
  } catch (error) {
    console.error("[voice-livekit] kickFromVoiceRoom failed", error);
  }
}

// Per-participant join token. `canPublish` is "does this user hold a fresh
// floor right now" — the token reflects current floor state so a mid-turn
// reconnect keeps publishing, and setVoicePublish handles the live
// transitions on top. Returns null without creds (caller shows "voice isn't
// configured").
export async function mintVoiceRoomToken(params: {
  roomId: string;
  userId: string;
  name?: string;
  canPublish: boolean;
}): Promise<{ token: string; url: string } | null> {
  return createLiveKitToken({
    roomName: voiceRoomLkName(params.roomId),
    identity: params.userId,
    name: params.name,
    canPublish: params.canPublish,
  });
}
