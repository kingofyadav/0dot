import { createEventStream, type EventStream } from "./eventStream";

// livestream-chat-events.ts's events carry no payload or seq (unlike
// community-chat-events.ts's Phase-C-upgraded ones) — signal-only, so the
// screen refetches via getLivestreamChat on any of these, same as the web
// LivestreamChatView's router.refresh().
export type LivestreamChatStreamEvent =
  | { type: "new-chat-message" }
  | { type: "chat-message-deleted" }
  | { type: "resync" };

export function createLivestreamChatStream(opts: {
  livestreamId: string;
  accessToken: string;
  onEvent: (event: LivestreamChatStreamEvent) => void;
}): EventStream {
  return createEventStream<LivestreamChatStreamEvent>({
    path: `/api/v1/live/${encodeURIComponent(opts.livestreamId)}/chat/stream`,
    accessToken: opts.accessToken,
    onEvent: opts.onEvent,
  });
}
