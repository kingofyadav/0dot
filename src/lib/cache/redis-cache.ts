import "server-only";
import { realtimeRedisConfigured } from "@/lib/realtime/redis-config";
import { logger } from "@/lib/logger";

// Short-TTL read cache for expensive, viewer-independent query results
// (trending, the anonymous-viewer /explore feed) — reuses the same Upstash
// Redis database the realtime layer already talks to
// (src/lib/realtime/redis-client.ts), via the same lazy-import pattern
// rate-limit.ts uses so this module never eagerly pulls in @upstash/redis.
//
// Only cache results that are identical for every caller sharing a cache
// key — do NOT use this for anything that depends on a specific viewer's
// blocks/follows/private-membership state (see callers for the reasoning
// on why each one is safe to share). A cache miss, an unconfigured Redis,
// or a Redis error all fall through to calling `fetcher` directly — this
// is a pure optimization, never a source of truth, so its failure modes
// must never surface as a broken page.
//
// automaticDeserialization is off on the shared client, so values round
// -trip through plain JSON here. JSON has no Date type — Prisma rows carry
// DateTime fields as real Date objects that downstream rendering code
// expects — so parse with a reviver that turns ISO-8601 strings back into
// Dates rather than requiring every caller to know which fields need it.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function reviveDates(_key: string, value: unknown) {
  return typeof value === "string" && ISO_DATE_RE.test(value) ? new Date(value) : value;
}

let warnedCacheDown = false;

export async function cached<T>(key: string, ttlSec: number, fetcher: () => Promise<T>): Promise<T> {
  if (!realtimeRedisConfigured()) return fetcher();

  try {
    const { getRealtimeRedis } = await import("@/lib/realtime/redis-client");
    const redis = getRealtimeRedis();
    const cacheKey = `cache:${key}`;

    const hit = await redis.get<string>(cacheKey);
    if (hit != null) return JSON.parse(hit, reviveDates) as T;

    const value = await fetcher();
    await redis.set(cacheKey, JSON.stringify(value), { ex: ttlSec });
    return value;
  } catch (err) {
    if (!warnedCacheDown) {
      warnedCacheDown = true;
      logger.warn("cached: Redis cache unavailable — falling through to uncached reads.", err);
    }
    return fetcher();
  }
}
