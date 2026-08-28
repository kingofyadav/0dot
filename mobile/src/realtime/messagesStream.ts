import { createEventStream, type EventStream } from "./eventStream";

// Mirrors src/lib/message-events.ts's MessageEvent union on the server —
// the mobile side rarely needs to branch on which event arrived (see the
// server route's comment: payload content mostly doesn't matter to the
// client), just that *something* did, and refetch. `resync` is client-only
// (see eventStream.ts).
export type MessageStreamEvent =
  | { type: "new-message"; conversationId: string }
  | { type: "conversation-updated"; conversationId: string }
  | { type: "notification" }
  | { type: "presence"; userId: string; online: boolean }
  | { type: "resync" };

export type MessagesStream = EventStream;

// One connection to GET /api/v1/messages/stream (M10) — owned by
// MessagesStreamContext (one per signed-in session); a screen that opened
// its own would just be a second subscription to the same per-user event
// set.
export function createMessagesStream(opts: {
  accessToken: string;
  onEvent: (event: MessageStreamEvent) => void;
}): MessagesStream {
  return createEventStream<MessageStreamEvent>({ path: "/api/v1/messages/stream", ...opts });
}
