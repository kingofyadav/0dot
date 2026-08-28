import { createEventStream, type EventStream } from "./eventStream";
import type { CommunityChatMessage } from "../api/types";

// Mirrors src/lib/community-chat-events.ts's CommunityChatEvent on the
// server, plus the client-only `resync` (see eventStream.ts). One
// connection per open chat screen — a per-community broadcast channel, not
// per-user, so there's nothing session-wide to hoist into a context the
// way the messages stream is.
export type CommunityChatStreamEvent =
  | { type: "new-chat-message"; message: CommunityChatMessage }
  | { type: "chat-message-deleted"; messageId: string }
  | { type: "typing"; userId: string; name: string | null }
  | { type: "resync" };

export function createCommunityChatStream(opts: {
  slug: string;
  accessToken: string;
  onEvent: (event: CommunityChatStreamEvent) => void;
}): EventStream {
  return createEventStream<CommunityChatStreamEvent>({
    path: `/api/v1/communities/${encodeURIComponent(opts.slug)}/chat/stream`,
    accessToken: opts.accessToken,
    onEvent: opts.onEvent,
  });
}
