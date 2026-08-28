import "server-only";
import { createChannel } from "@/lib/realtime/bus";

// Room-state fan-out for voice-room SSE
// (src/app/api/c/[slug]/voice/[roomId]/stream and its v1 twin) — carries
// only `{type:"room-updated"}`, a content-free "the participant list /
// queue / current speaker / mod state changed, refetch" ping, on the
// shared realtime bus channel `voice:<roomId>` (Phase A made it
// cross-instance-safe).
//
// Phase D (docs/specs/addendum-voice-rooms-livekit.md): the audio and its
// WebRTC signaling moved to LiveKit, so the old targeted
// `voice:<roomId>:<userId>` signal channel and `sendSignal` are gone — this
// module is now purely room state. (File renamed from voice-signal-events.ts.)

export type VoiceRoomEvent = { type: "room-updated" };

const channel = createChannel<VoiceRoomEvent>("voice");

export function subscribeToVoiceRoom(roomId: string, callback: (event: VoiceRoomEvent) => void): () => void {
  return channel.subscribe(roomId, callback);
}

// Fire-and-forget, same posture as the other event modules — a client with
// no open room tab simply gets nothing (it sees fresh state on next load).
export function broadcastRoomUpdate(roomId: string): void {
  channel.publish(roomId, { type: "room-updated" });
}
