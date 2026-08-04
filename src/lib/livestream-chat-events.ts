import "server-only";

// In-memory, single-process pub/sub for livestream chat SSE, same
// room-keyed (by livestreamId) shape as community-chat-events.ts — see
// that file's comment for why this is a separate module from
// message-events.ts's user-keyed bus and why it resets on restart.

export type LivestreamChatEvent = { type: "new-chat-message" } | { type: "chat-message-deleted" };

type Subscriber = (event: LivestreamChatEvent) => void;

const globalForLivestreamChatEvents = globalThis as unknown as {
  livestreamChatSubscribers: Map<string, Set<Subscriber>> | undefined;
};

const subscribers =
  globalForLivestreamChatEvents.livestreamChatSubscribers ?? new Map<string, Set<Subscriber>>();

if (process.env.NODE_ENV !== "production") {
  globalForLivestreamChatEvents.livestreamChatSubscribers = subscribers;
}

export function subscribeToLivestreamChat(livestreamId: string, callback: Subscriber): () => void {
  let set = subscribers.get(livestreamId);
  if (!set) {
    set = new Set();
    subscribers.set(livestreamId, set);
  }
  set.add(callback);

  return () => {
    set!.delete(callback);
    if (set!.size === 0) subscribers.delete(livestreamId);
  };
}

export function publishToLivestreamChat(livestreamId: string, event: LivestreamChatEvent): void {
  const set = subscribers.get(livestreamId);
  if (!set) return;
  for (const callback of set) callback(event);
}
