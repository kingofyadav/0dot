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
// A disconnect is often just an SSE stream getting recycled (heartbeat
// proxy timeout, Vercel's function maxDuration, a brief network blip) —
// the client's EventSource auto-reconnects within a few seconds. Without
// this grace period, every recycle synchronously broadcast "offline" and
// then "online" again moments later, flickering the green dot for every
// conversation partner on every reconnect cycle.
const PRESENCE_OFFLINE_GRACE_MS = 15_000;

const globalForPresence = globalThis as unknown as {
  onlineConnectionCounts: Map<string, number> | undefined;
  offlineTimers: Map<string, ReturnType<typeof setTimeout>> | undefined;
};

const onlineConnectionCounts = globalForPresence.onlineConnectionCounts ?? new Map<string, number>();
const offlineTimers = globalForPresence.offlineTimers ?? new Map<string, ReturnType<typeof setTimeout>>();

if (process.env.NODE_ENV !== "production") {
  globalForPresence.onlineConnectionCounts = onlineConnectionCounts;
  globalForPresence.offlineTimers = offlineTimers;
}

export function markUserOnline(userId: string): void {
  onlineConnectionCounts.set(userId, (onlineConnectionCounts.get(userId) ?? 0) + 1);
  // A reconnect within the grace window cancels the pending "gone offline"
  // broadcast below — isUserOnline never actually read false in between,
  // since the count-based check stayed >0 throughout.
  const pendingTimer = offlineTimers.get(userId);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    offlineTimers.delete(userId);
  }
}

// Decrements the connection count immediately — isUserOnline's synchronous
// read is unaffected by the grace period below. Returns the post-disconnect
// online state right away (unchanged meaning/timing for callers that only
// care about that, e.g. the lastActiveAt write). If onConfirmedOffline is
// given and this was the last connection, it's invoked after
// PRESENCE_OFFLINE_GRACE_MS *only if* no reconnect happened in the
// meantime — that's the actual "broadcast offline to other users" trigger.
export function markUserOffline(userId: string, onConfirmedOffline?: () => void): boolean {
  const count = onlineConnectionCounts.get(userId) ?? 0;
  if (count <= 1) {
    onlineConnectionCounts.delete(userId);
    if (onConfirmedOffline) {
      const timer = setTimeout(() => {
        offlineTimers.delete(userId);
        if (!onlineConnectionCounts.has(userId)) onConfirmedOffline();
      }, PRESENCE_OFFLINE_GRACE_MS);
      offlineTimers.set(userId, timer);
    }
    return false;
  }
  onlineConnectionCounts.set(userId, count - 1);
  return true;
}

export function isUserOnline(userId: string): boolean {
  return (onlineConnectionCounts.get(userId) ?? 0) > 0;
}
