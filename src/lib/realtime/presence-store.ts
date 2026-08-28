import "server-only";
import { realtimeRedisConfigured } from "./redis-config";

// Cross-instance presence — "does this user have at least one live SSE
// connection open right now", the source of truth for the messaging
// inbox's green dot. Presence is not pub/sub (that's bus.ts) so it gets its
// own store, with the same memory/Redis split.
//
// Spec addendum-realtime-community.md §4.4. Best-effort by design: a
// missed disconnect or a dropped Redis call at worst shows a stale dot for
// a few seconds, never breaks messaging.

export interface PresenceStore {
  /** A new SSE connection opened. Fire-and-forget. */
  connect(userId: string, connectionId: string): void;
  /** Called on the SSE heartbeat so the Redis store can refresh this
   *  connection's expiry — a no-op for the in-memory store. */
  heartbeat(userId: string, connectionId: string): void;
  /** An SSE connection closed. Fire-and-forget. */
  disconnect(userId: string, connectionId: string): void;
  isOnline(userId: string): Promise<boolean>;
  /** Batched — one Redis round-trip for a whole page of conversations,
   *  instead of an await per row. */
  getOnline(userIds: string[]): Promise<Set<string>>;
}

// ── In-memory store (default / single-process) ──────────────────────────
// A set of live connection ids per user. Counted per-connection (not a
// bool) because one account can have several tabs/devices open — only the
// last one closing flips them offline. globalThis-guarded for the same
// reason the other realtime modules are (Next dev-mode module dup / HMR).
// heartbeat is a no-op: an in-process Set doesn't expire, and a process
// crash loses the whole map anyway — same posture as before this store
// existed.
const g = globalThis as unknown as { presenceConnections?: Map<string, Set<string>> };
const connections = g.presenceConnections ?? new Map<string, Set<string>>();
if (process.env.NODE_ENV !== "production") g.presenceConnections = connections;

const memoryStore: PresenceStore = {
  connect(userId, connectionId) {
    let set = connections.get(userId);
    if (!set) {
      set = new Set();
      connections.set(userId, set);
    }
    set.add(connectionId);
  },
  heartbeat() {
    // no-op — see comment above
  },
  disconnect(userId, connectionId) {
    const set = connections.get(userId);
    if (!set) return;
    set.delete(connectionId);
    if (set.size === 0) connections.delete(userId);
  },
  async isOnline(userId) {
    return (connections.get(userId)?.size ?? 0) > 0;
  },
  async getOnline(userIds) {
    const online = new Set<string>();
    for (const id of userIds) {
      if ((connections.get(id)?.size ?? 0) > 0) online.add(id);
    }
    return online;
  },
};

// ── Driver selection ───────────────────────────────────────────────────
let store: PresenceStore | undefined;

function resolve(): PresenceStore {
  if (store) return store;
  if (realtimeRedisConfigured()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: keeps @upstash/redis out of builds/tests without Redis
    store = (require("./presence-store-redis") as typeof import("./presence-store-redis")).redisPresenceStore;
    console.log("[realtime] presence: Redis store");
  } else {
    store = memoryStore;
    console.log("[realtime] presence: in-memory store (single-process)");
  }
  return store;
}

export const presenceStore: PresenceStore = {
  connect: (u, c) => resolve().connect(u, c),
  heartbeat: (u, c) => resolve().heartbeat(u, c),
  disconnect: (u, c) => resolve().disconnect(u, c),
  isOnline: (u) => resolve().isOnline(u),
  getOnline: (u) => resolve().getOnline(u),
};
