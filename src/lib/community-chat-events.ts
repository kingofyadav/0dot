import "server-only";

// In-memory, single-process pub/sub for community live chat SSE
// (src/app/api/c/[slug]/chat/stream/route.ts) — room-keyed (by
// communityId), not user-keyed like message-events.ts. Deliberately a
// separate module: Phase 2's messaging bus is keyed by userId (right for
// DMs/notifications), but spec §11.1 describes chat as "a single broadcast
// channel with potentially thousands of members" — fanning a
// publishToUsers-style call out to every member on every chat message
// doesn't scale and isn't the right shape for a public stream. Same
// globalThis-guarded, dev-HMR-safe pattern as message-events.ts otherwise;
// see that file's comment for why the guard exists and why this resets on
// restart / doesn't share state across multiple instances.

export type CommunityChatEvent =
  | { type: "new-chat-message" }
  | { type: "chat-message-deleted" };

type Subscriber = (event: CommunityChatEvent) => void;

const globalForCommunityChatEvents = globalThis as unknown as {
  communityChatSubscribers: Map<string, Set<Subscriber>> | undefined;
};

const subscribers =
  globalForCommunityChatEvents.communityChatSubscribers ?? new Map<string, Set<Subscriber>>();

if (process.env.NODE_ENV !== "production") {
  globalForCommunityChatEvents.communityChatSubscribers = subscribers;
}

export function subscribeToCommunityChat(communityId: string, callback: Subscriber): () => void {
  let set = subscribers.get(communityId);
  if (!set) {
    set = new Set();
    subscribers.set(communityId, set);
  }
  set.add(callback);

  return () => {
    set!.delete(callback);
    if (set!.size === 0) subscribers.delete(communityId);
  };
}

// Fire-and-forget, same posture as message-events.ts's publishToUsers — a
// viewer with no open chat tab simply gets nothing (they'll see the
// message on next load), this is a live-update enhancement, not the
// source of truth.
export function publishToCommunityChat(communityId: string, event: CommunityChatEvent): void {
  const set = subscribers.get(communityId);
  if (!set) return;
  for (const callback of set) callback(event);
}
