import "server-only";
import { memoryDriver } from "./driver-memory";
import { realtimeRedisConfigured } from "./redis-config";

// The shared realtime backplane. Every SSE surface in the app — DMs,
// notifications, presence broadcasts, community live chat, livestream chat,
// voice-room state — publishes and subscribes through this one primitive
// instead of each keeping its own globalThis Map (which only ever worked
// within a single process — see driver-memory.ts).
//
// See docs/specs/addendum-realtime-community.md §4.
//
// The bus is intentionally untyped — it moves opaque JSON strings on
// namespaced string channels. Each event module keeps its own typed event
// union and does JSON.parse/stringify at its edge (createChannel below wraps
// that). At-most-once, no ordering, no durability — which is all the
// current consumers need, since every one of them treats an event as "something
// changed, refetch" rather than as data. Replay/catch-up is a separate,
// opt-in concern (spec Phase B).

export interface RealtimeDriver {
  /** Fire-and-forget. Never throws; a dead backend drops the message. */
  publish(channel: string, message: string): void;
  /** Returns an unsubscribe function. */
  subscribe(channel: string, callback: (message: string) => void): () => void;
}

// Lazily resolved on first use, never at module load — a preview/CI build
// with no Redis env must still compile and boot, and must not pull
// @upstash/redis into a bundle that never uses it (memory
// `project_next_build_eager_secret_gotcha`). Logged once at selection, the
// same way db.ts logs which database host it connected to.
//
// KV_REST_API_URL is what the Upstash for Redis Marketplace integration
// provisions (spec §4.7); UPSTASH_REDIS_REST_URL is accepted too for a
// hand-set env. With neither, the in-memory driver runs and the app
// behaves exactly as it did before this abstraction existed.
let driver: RealtimeDriver | undefined;

function resolveDriver(): RealtimeDriver {
  if (driver) return driver;

  if (realtimeRedisConfigured()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: keeps @upstash/redis out of builds/tests that don't configure Redis
    driver = (require("./driver-redis") as typeof import("./driver-redis")).redisDriver;
    console.log("[realtime] using Redis driver (cross-instance)");
  } else {
    driver = memoryDriver;
    console.log("[realtime] using in-memory driver (single-process)");
  }

  return driver;
}

export const bus: RealtimeDriver = {
  publish: (channel, message) => resolveDriver().publish(channel, message),
  subscribe: (channel, callback) => resolveDriver().subscribe(channel, callback),
};

// Typed convenience wrapper — turns the string bus into a per-domain
// channel with a typed event, so message-events.ts et al. stay one-liners
// and the JSON.parse/stringify (and the "ignore a malformed payload, the
// connection is still fine" rule the mobile client already follows) live in
// exactly one place.
export function createChannel<E>(prefix: string) {
  return {
    publish(key: string, event: E): void {
      bus.publish(`${prefix}:${key}`, JSON.stringify(event));
    },
    subscribe(key: string, callback: (event: E) => void): () => void {
      return bus.subscribe(`${prefix}:${key}`, (raw) => {
        let parsed: E;
        try {
          parsed = JSON.parse(raw) as E;
        } catch {
          return; // malformed single event — connection itself is fine
        }
        callback(parsed);
      });
    },
  };
}
