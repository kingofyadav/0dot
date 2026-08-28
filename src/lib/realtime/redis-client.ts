import "server-only";
import { Redis } from "@upstash/redis";

// The one @upstash/redis client the realtime layer shares — the pub/sub
// driver (driver-redis.ts) and the presence store (presence-store.ts) both
// talk to the same Upstash database, so they use the same client rather
// than each constructing their own.
//
// The "Upstash for Redis" Marketplace integration provisions the
// @vercel/kv-style env names (KV_REST_API_URL / KV_REST_API_TOKEN); the
// older UPSTASH_REDIS_REST_* names are accepted as a hand-set fallback.
// automaticDeserialization is off: the pub/sub layer moves opaque JSON
// strings and the presence store stores plain numbers/strings — neither
// wants Upstash JSON.parsing values on the way back.
//
// globalThis-guarded so Next's dev-mode module duplication / HMR can't
// leave two clients around — same reason db.ts does it.
//
// This module imports @upstash/redis at load, so it must only be imported
// from a lazily-`require`d driver module (driver-redis.ts,
// presence-store-redis.ts) — never from an eagerly-loaded one. Use
// realtimeRedisConfigured() from ./redis-config for the env check.

const g = globalThis as unknown as { realtimeRedis?: Redis };

export function getRealtimeRedis(): Redis {
  if (!g.realtimeRedis) {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error(
        "[realtime] Redis selected but KV_REST_API_URL / KV_REST_API_TOKEN are not set — " +
          "run `vercel integration add upstash/upstash-kv` (spec addendum-realtime-community.md §4.7)."
      );
    }
    g.realtimeRedis = new Redis({ url, token, automaticDeserialization: false });
  }
  return g.realtimeRedis;
}
