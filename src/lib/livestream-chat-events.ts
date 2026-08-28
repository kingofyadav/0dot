import "server-only";
import { createChannel } from "@/lib/realtime/bus";

// Room-keyed (by livestreamId) event fan-out for livestream chat SSE, same
// broadcast shape as community-chat-events.ts. Storage moved to the shared
// realtime bus (src/lib/realtime/bus.ts) so it works across Vercel
// instances — see docs/specs/addendum-realtime-community.md. Public API
// unchanged.

export type LivestreamChatEvent = { type: "new-chat-message" } | { type: "chat-message-deleted" };

const channel = createChannel<LivestreamChatEvent>("lchat");

export function subscribeToLivestreamChat(
  livestreamId: string,
  callback: (event: LivestreamChatEvent) => void
): () => void {
  return channel.subscribe(livestreamId, callback);
}

export function publishToLivestreamChat(livestreamId: string, event: LivestreamChatEvent): void {
  channel.publish(livestreamId, event);
}
