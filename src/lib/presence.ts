import "server-only";

// In-memory "who has an open SSE tab right now" tracker — the source of
// truth for the messaging inbox's green online dot. Deliberately not
// DB-backed: an open EventSource (api/messages/stream/route.ts) already
// pings this on connect/disconnect, so there's no polling/heartbeat write
// to throttle. Same documented posture as message-events.ts's subscriber
// map (globalThis-backed to survive Next's dev-mode module duplication,
// resets on process restart, single-process only for now) — presence and
// live-event delivery are two views of the same underlying connection, so
// they share that posture rather than inventing a different one.
//
// Counted per user (not a boolean) because one account can have several
// open tabs/devices at once — only the last tab closing should flip them
// offline.
const globalForPresence = globalThis as unknown as {
  onlineConnectionCounts: Map<string, number> | undefined;
};

const onlineConnectionCounts = globalForPresence.onlineConnectionCounts ?? new Map<string, number>();

if (process.env.NODE_ENV !== "production") {
  globalForPresence.onlineConnectionCounts = onlineConnectionCounts;
}

export function markUserOnline(userId: string): void {
  onlineConnectionCounts.set(userId, (onlineConnectionCounts.get(userId) ?? 0) + 1);
}

// Returns the user's post-disconnect online state, so the caller knows
// whether this was the last open tab (and should persist lastActiveAt /
// broadcast a real offline transition) without a second lookup.
export function markUserOffline(userId: string): boolean {
  const count = onlineConnectionCounts.get(userId) ?? 0;
  if (count <= 1) {
    onlineConnectionCounts.delete(userId);
    return false;
  }
  onlineConnectionCounts.set(userId, count - 1);
  return true;
}

export function isUserOnline(userId: string): boolean {
  return (onlineConnectionCounts.get(userId) ?? 0) > 0;
}
