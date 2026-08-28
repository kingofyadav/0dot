import "server-only";
import type { Redis } from "@upstash/redis";
import type { RealtimeDriver } from "./bus";
import { getRealtimeRedis } from "./redis-client";

// @upstash/redis doesn't export the Subscriber class, only its instances
// (via redis.psubscribe). Recover the type from the method.
type Subscriber = ReturnType<Redis["psubscribe"]>;

// The cross-instance realtime driver (spec addendum-realtime-community.md
// §4.3). Selected by bus.ts whenever KV_REST_API_URL is set — the Upstash
// for Redis integration provisions that plus KV_REST_API_TOKEN (the
// @vercel/kv-style names; the older UPSTASH_REDIS_REST_* names are also
// accepted as a fallback for a hand-set env).
//
// Design:
//   publish  → redis.publish() over REST — stateless, fire-and-forget, works
//              from anywhere including a short Server Action invocation.
//   subscribe → ONE process-wide `PSUBSCRIBE rt:*` connection, with a local
//              Map doing the in-process fan-out. One upstream connection per
//              instance regardless of how many users/rooms it's serving —
//              the pattern subscribe is what keeps this off Upstash's
//              per-connection limits.
//
// Every message round-trips through Redis (an instance receives its own
// publishes back via its own psubscribe), so there's a single delivery
// path and no "is this the local instance?" branching. The ~30-50ms that
// adds to same-instance delivery is irrelevant for events that only mean
// "something changed, refetch".

const CHANNEL_PREFIX = "rt:";

// globalThis-guarded so Next's dev-mode module duplication (and HMR) can't
// leave two subscriber connections / two local maps disagreeing — same
// reason db.ts and driver-memory.ts do it.
const g = globalThis as unknown as {
  realtimeRedisSubscriber?: Subscriber;
  realtimeRedisLocal?: Map<string, Set<(message: string) => void>>;
};

function localMap(): Map<string, Set<(message: string) => void>> {
  if (!g.realtimeRedisLocal) g.realtimeRedisLocal = new Map();
  return g.realtimeRedisLocal;
}

function ensureSubscriber(): void {
  if (g.realtimeRedisSubscriber) return;

  const subscriber = getRealtimeRedis().psubscribe<string>(`${CHANNEL_PREFIX}*`);

  subscriber.on("pmessage", ({ channel, message }) => {
    const busChannel = channel.startsWith(CHANNEL_PREFIX)
      ? channel.slice(CHANNEL_PREFIX.length)
      : channel;
    const set = localMap().get(busChannel);
    if (!set) return;
    const text = typeof message === "string" ? message : JSON.stringify(message);
    // Copy before iterating — a callback that unsubscribes itself (the SSE
    // disconnect case) would otherwise mutate the Set mid-iteration.
    for (const callback of [...set]) callback(text);
  });

  subscriber.on("error", (error) => {
    // The upstream SSE connection dropped or Upstash returned an error.
    // @upstash/redis reconnects the pattern subscription on its own; log so
    // a persistent failure is visible rather than silent.
    console.error("[realtime] redis subscriber error", error);
  });

  g.realtimeRedisSubscriber = subscriber;
}

export const redisDriver: RealtimeDriver = {
  publish(channel, message) {
    getRealtimeRedis()
      .publish(`${CHANNEL_PREFIX}${channel}`, message)
      .catch((error) => {
        // Fire-and-forget, same posture as the in-memory driver — a failed
        // publish means subscribers miss this one event and pick it up on
        // their next refetch. Not worth propagating to the caller.
        console.error("[realtime] redis publish failed", error);
      });
  },

  subscribe(channel, callback) {
    ensureSubscriber();
    const map = localMap();
    let set = map.get(channel);
    if (!set) {
      set = new Set();
      map.set(channel, set);
    }
    set.add(callback);

    return () => {
      set.delete(callback);
      if (set.size === 0) map.delete(channel);
      // The single `PSUBSCRIBE rt:*` connection is left open for the
      // process lifetime — it costs one idle connection, and tearing it
      // down on the last local unsubscribe just to reopen it on the next
      // subscribe would churn on every SSE reconnect.
    };
  },
};
