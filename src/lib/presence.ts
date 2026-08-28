import "server-only";
import { randomUUID } from "node:crypto";
import { presenceStore } from "@/lib/realtime/presence-store";

// The messaging inbox's green online dot. "Online" = the user has at least
// one live SSE stream open (api/messages/stream + its v1 twin call
// markUserOnline on connect / markUserOffline on disconnect / refreshPresence
// on each heartbeat).
//
// The actual connection tracking moved to src/lib/realtime/presence-store.ts
// (memory or Redis, mirroring the realtime bus) so presence is correct
// across Vercel instances — see docs/specs/addendum-realtime-community.md
// §4.4. This module is the thin policy layer on top: it owns the
// connection-id lifecycle and the "don't flap the dot on a reconnect"
// grace period.

// A disconnect is usually just an SSE stream being recycled (Vercel's
// maxDuration ceiling, a heartbeat proxy timeout, a brief network blip) —
// the client's EventSource auto-reconnects within a couple seconds. Without
// this grace period, every recycle would broadcast "offline" and then
// "online" again moments later, flickering the dot for every conversation
// partner on every reconnect.
const PRESENCE_OFFLINE_GRACE_MS = 15_000;

// Opens a presence connection for this SSE stream and returns its id — the
// caller passes that id back to refreshPresence (on each heartbeat) and
// markUserOffline (on disconnect).
export function markUserOnline(userId: string): string {
  const connectionId = randomUUID();
  presenceStore.connect(userId, connectionId);
  return connectionId;
}

// Called from the SSE heartbeat so the Redis store can push this
// connection's expiry forward; a no-op for the in-memory store.
export function refreshPresence(userId: string, connectionId: string): void {
  presenceStore.heartbeat(userId, connectionId);
}

// Closes this connection. If onConfirmedOffline is given, it fires after the
// grace period *only if* the user still has no live connection by then —
// i.e. it wasn't just a reconnect. Best-effort: on Vercel the instance may
// be recycled before the timer fires, in which case the partner sees the
// offline state on their next fetch instead.
export function markUserOffline(
  userId: string,
  connectionId: string,
  onConfirmedOffline?: () => void
): void {
  presenceStore.disconnect(userId, connectionId);
  if (!onConfirmedOffline) return;
  setTimeout(() => {
    presenceStore
      .isOnline(userId)
      .then((online) => {
        if (!online) onConfirmedOffline();
      })
      .catch(() => {});
  }, PRESENCE_OFFLINE_GRACE_MS);
}

export function isUserOnline(userId: string): Promise<boolean> {
  return presenceStore.isOnline(userId);
}

// Batched lookup for a list view — one round trip for a whole page of
// conversations instead of an await per row.
export function getOnlineUserIds(userIds: string[]): Promise<Set<string>> {
  return presenceStore.getOnline(userIds);
}
