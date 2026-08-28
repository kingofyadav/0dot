import "server-only";
import { createChannel } from "@/lib/realtime/bus";
import { recordForReplay } from "@/lib/realtime/replay";
import type { ChatMessagePayload } from "@/lib/community-chat";

// Room-keyed (by communityId) event fan-out for community live chat SSE
// (src/app/api/c/[slug]/chat/stream and its bearer-token v1 twin) — a
// single broadcast channel per community, not per-member (spec §11.1:
// "potentially thousands of members" — fanning a per-user publish out to
// every member on every message is the wrong shape for a public stream).
//
// Storage moved to the shared realtime bus (src/lib/realtime/bus.ts) so
// this works across Vercel instances — see
// docs/specs/addendum-realtime-community.md.
//
// Phase C: the events now carry a payload — the full message on
// `new-chat-message`, the id on `chat-message-deleted` — so a mobile
// client can append/remove one message instead of refetching the whole
// recent page on every event. The web CommunityChatView is payload-
// agnostic (it router.refresh()es on any event) and is unaffected.
// `typing` is ephemeral: never persisted, never pushed, 5s client-side expiry.

// `seq` is present on the replay-buffered events (new-chat-message,
// chat-message-deleted) — assigned by recordForReplay at publish time, and
// what the SSE route emits as the `id:` field so a reconnecting client can
// ask for "everything after N". `typing` is ephemeral and never buffered,
// so it has no seq. The web CommunityChatView ignores it; the mobile client
// reads the id off the SSE frame, not the payload.
export type CommunityChatEvent =
  | { type: "new-chat-message"; message: ChatMessagePayload; seq?: number }
  | { type: "chat-message-deleted"; messageId: string; seq?: number }
  | { type: "typing"; userId: string; name: string | null };

const channel = createChannel<CommunityChatEvent>("cchat");
const replayChannel = (communityId: string) => `cchat:${communityId}`;

export function subscribeToCommunityChat(
  communityId: string,
  callback: (event: CommunityChatEvent) => void
): () => void {
  return channel.subscribe(communityId, callback);
}

// Fire-and-forget delivery, same posture as message-events.ts's
// publishToUsers — a viewer with no open chat tab simply gets nothing
// (they'll see the message on next load). For the two durable event types
// it also records a sequenced copy in the Redis replay buffer (a no-op
// without Redis); `typing` skips that entirely.
//
// Async now (the buffer write is one Redis pipeline) — callers await it,
// but it's still best-effort: the message row is already committed, and a
// slow/failed publish just means live clients refetch on their next event.
export async function publishToCommunityChat(communityId: string, event: CommunityChatEvent): Promise<void> {
  if (event.type === "typing") {
    channel.publish(communityId, event);
    return;
  }
  const recorded = await recordForReplay(replayChannel(communityId), (seq) => ({ ...event, seq }));
  channel.publish(communityId, recorded?.event ?? event);
}
