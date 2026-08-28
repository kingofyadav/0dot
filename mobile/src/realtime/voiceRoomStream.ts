import { createEventStream, type EventStream } from "./eventStream";

// Room-state SSE for a voice room — carries only `{type:"room-updated"}`
// (audio is on LiveKit), plus the client-only `resync` from eventStream on
// reconnect. The screen refetches the room detail on either.
export type VoiceRoomStreamEvent = { type: "room-updated" } | { type: "resync" };

export function createVoiceRoomStream(opts: {
  slug: string;
  roomId: string;
  accessToken: string;
  onEvent: (event: VoiceRoomStreamEvent) => void;
}): EventStream {
  return createEventStream<VoiceRoomStreamEvent>({
    path: `/api/v1/communities/${encodeURIComponent(opts.slug)}/voice/${encodeURIComponent(opts.roomId)}/stream`,
    accessToken: opts.accessToken,
    onEvent: opts.onEvent,
  });
}
