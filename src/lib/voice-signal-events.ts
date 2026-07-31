import "server-only";

// In-memory, single-process pub/sub for voice-room SSE
// (src/app/api/c/[slug]/voice/[roomId]/stream/route.ts). Distinct from
// both message-events.ts (user-keyed) and community-chat-events.ts
// (room-keyed, broadcast-to-everyone): WebRTC signaling needs *targeted*
// delivery — an ICE candidate reveals network info and should only reach
// the intended peer, not the whole room — so subscribers here are keyed
// two levels deep, roomId -> userId -> callbacks. Room-state changes
// (participant list/queue/current speaker) still broadcast to everyone in
// the room via broadcastRoomUpdate. Same globalThis-guarded, dev-HMR-safe
// pattern as the other two event modules — see message-events.ts's
// comment for why the guard exists.

export type VoiceRoomEvent =
  | { type: "room-updated" }
  | { type: "signal"; from: string; payload: unknown };

type Subscriber = (event: VoiceRoomEvent) => void;

const globalForVoiceSignalEvents = globalThis as unknown as {
  voiceRoomSubscribers: Map<string, Map<string, Set<Subscriber>>> | undefined;
};

const subscribers =
  globalForVoiceSignalEvents.voiceRoomSubscribers ?? new Map<string, Map<string, Set<Subscriber>>>();

if (process.env.NODE_ENV !== "production") {
  globalForVoiceSignalEvents.voiceRoomSubscribers = subscribers;
}

export function subscribeToVoiceRoom(roomId: string, userId: string, callback: Subscriber): () => void {
  let byUser = subscribers.get(roomId);
  if (!byUser) {
    byUser = new Map();
    subscribers.set(roomId, byUser);
  }
  let set = byUser.get(userId);
  if (!set) {
    set = new Set();
    byUser.set(userId, set);
  }
  set.add(callback);

  return () => {
    set!.delete(callback);
    if (set!.size === 0) byUser!.delete(userId);
    if (byUser!.size === 0) subscribers.delete(roomId);
  };
}

// Fire-and-forget, same posture as the other two event modules — a
// disconnected participant simply gets nothing (they'll see fresh state on
// next load), this is a live-update enhancement, not the source of truth.
export function broadcastRoomUpdate(roomId: string): void {
  const byUser = subscribers.get(roomId);
  if (!byUser) return;
  for (const set of byUser.values()) {
    for (const callback of set) callback({ type: "room-updated" });
  }
}

export function sendSignal(roomId: string, targetUserId: string, from: string, payload: unknown): void {
  const set = subscribers.get(roomId)?.get(targetUserId);
  if (!set) return;
  for (const callback of set) callback({ type: "signal", from, payload });
}
