import "server-only";

// Pure env check — no @upstash/redis import, so this is safe to import from
// eagerly-loaded modules (bus.ts, presence-store.ts) that must still
// compile and bundle without the Redis client when Redis isn't configured
// (memory `project_next_build_eager_secret_gotcha`). The actual client
// lives in redis-client.ts, which is only ever imported from a
// lazily-`require`d driver module.
//
// KV_REST_API_URL is what the "Upstash for Redis" Marketplace integration
// provisions; UPSTASH_REDIS_REST_URL is a hand-set fallback.
export function realtimeRedisConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
}
