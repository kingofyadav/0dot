import "server-only";
import { createChannel } from "@/lib/realtime/bus";

// Per-user event fan-out for the app's SSE stream
// (src/app/api/messages/stream/route.ts and its bearer-token twin
// src/app/api/v1/messages/stream/route.ts). Originally messaging-only, now
// also carries general notification events (like/comment/mention/
// new_follower — src/lib/notifications.ts) since MessagingProvider already
// refreshes the whole route tree, including NotificationBell, on any event
// regardless of payload — no second transport needed.
//
// The subscriber storage moved to the shared realtime bus
// (src/lib/realtime/bus.ts) so a publish on one Vercel instance reaches an
// SSE subscriber on another — see docs/specs/addendum-realtime-community.md.
// This module keeps its exact public API (subscribeToUser / publishToUsers);
// nothing that imports it changed.

export type MessageEvent =
  | { type: "new-message"; conversationId: string }
  | { type: "conversation-updated"; conversationId: string }
  | { type: "notification" }
  // Fired on SSE connect/disconnect (api/messages/stream/route.ts) to
  // whoever shares a conversation with userId, so an open inbox/conversation
  // repaints its green dot live — MessagingProvider refreshes on any event
  // regardless of payload, this just needs to exist to trigger that.
  | { type: "presence"; userId: string; online: boolean };

const channel = createChannel<MessageEvent>("msg");

export function subscribeToUser(userId: string, callback: (event: MessageEvent) => void): () => void {
  return channel.subscribe(userId, callback);
}

// Fire-and-forget: a recipient with no open tab simply gets nothing (they'll
// see the update on next page load/navigation, same as before this feature
// existed) — this is a live-update enhancement, not the source of truth.
export function publishToUsers(userIds: string[], event: MessageEvent): void {
  for (const userId of userIds) channel.publish(userId, event);
}
