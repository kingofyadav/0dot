import "server-only";

// In-memory, single-process pub/sub for the app's per-user SSE stream
// (src/app/api/messages/stream/route.ts). Originally messaging-only, now
// also carries general notification events (like/comment/mention/
// new_follower — src/lib/notifications.ts) since MessagingProvider already
// refreshes the whole route tree, including NotificationBell, on any event
// regardless of payload — no second transport needed. Same documented
// posture as rate-limit.ts: resets on restart, doesn't share state across
// multiple server instances — fine for the current single-process
// deployment, revisit alongside the SQLite→Postgres decision if this ever
// runs multi-instance. No new dependency (no ws/Pusher/Redis).

export type MessageEvent =
  | { type: "new-message"; conversationId: string }
  | { type: "conversation-updated"; conversationId: string }
  | { type: "notification" };

type Subscriber = (event: MessageEvent) => void;

// globalThis-backed, same reasoning as db.ts's PrismaClient singleton: in
// dev mode, the Route Handler (api/messages/stream) and the Server Action
// (app/actions/messages.ts) can each get their own instantiation of this
// module from Next.js's bundler, which would silently give them two
// different Maps — publishToUsers writing to one, subscribeToUser reading
// from the other, so no event ever arrives. globalThis is process-wide
// regardless of which module registry loaded this file, so it's the one
// thing guaranteed to be shared.
const globalForMessageEvents = globalThis as unknown as {
  messageSubscribers: Map<string, Set<Subscriber>> | undefined;
};

const subscribers = globalForMessageEvents.messageSubscribers ?? new Map<string, Set<Subscriber>>();

if (process.env.NODE_ENV !== "production") {
  globalForMessageEvents.messageSubscribers = subscribers;
}

export function subscribeToUser(userId: string, callback: Subscriber): () => void {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(callback);

  return () => {
    set!.delete(callback);
    if (set!.size === 0) subscribers.delete(userId);
  };
}

// Fire-and-forget: a recipient with no open tab simply gets nothing (they'll
// see the update on next page load/navigation, same as before this feature
// existed) — this is a live-update enhancement, not the source of truth.
export function publishToUsers(userIds: string[], event: MessageEvent): void {
  for (const userId of userIds) {
    const set = subscribers.get(userId);
    if (!set) continue;
    for (const callback of set) callback(event);
  }
}
