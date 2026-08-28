import "server-only";
import { createChannel } from "@/lib/realtime/bus";
import { realtimeRedisConfigured } from "@/lib/realtime/redis-config";

// Realtime addendum Phase E (docs/specs/addendum-realtime-community.md §8):
// a live "N people viewing" count for a business, shown only to the owner
// on their own /b/[slug] view. Viewers ping a beacon every ~30s (cheap, no
// held connection); the owner holds one SSE (they have the dashboard open)
// that pushes a fresh count whenever the viewer set changes.
//
// Self-healing sorted set per business (same shape as presence-store):
// `bizview:z:<businessId>`, member = a per-tab viewer key, score = expiry.
// A viewer who closes their tab without a final beacon just ages out.
// Memory fallback (single process) when Redis isn't configured.

const VIEWER_TTL_MS = 45_000; // ~1.5 missed 30s beacons
const KEY_TTL_S = 90;

const key = (businessId: string) => `bizview:z:${businessId}`;
const channel = createChannel<{ type: "viewers" }>("bizview");

export function subscribeToBusinessViewers(businessId: string, cb: (e: { type: "viewers" }) => void): () => void {
  return channel.subscribe(businessId, cb);
}

function broadcast(businessId: string): void {
  channel.publish(businessId, { type: "viewers" });
}

// ── memory store ───────────────────────────────────────────────────────
const g = globalThis as unknown as { businessViewers?: Map<string, Map<string, number>> };
const memViewers = g.businessViewers ?? new Map<string, Map<string, number>>();
if (process.env.NODE_ENV !== "production") g.businessViewers = memViewers;

function redis() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy, keeps @upstash/redis out of builds without Redis
  return (require("@/lib/realtime/redis-client") as typeof import("@/lib/realtime/redis-client")).getRealtimeRedis();
}

// A viewer opened / is still on the page. Broadcasts only when the set
// actually grew (a new viewer) — a re-ping from an existing viewer is a
// no-op for the owner's stream.
export async function recordViewer(businessId: string, viewerKey: string): Promise<void> {
  const expiry = Date.now() + VIEWER_TTL_MS;
  if (realtimeRedisConfigured()) {
    try {
      const added = await redis()
        .pipeline()
        .zadd(key(businessId), { score: expiry, member: viewerKey })
        .expire(key(businessId), KEY_TTL_S)
        .exec<[number | null, number]>();
      if (added[0]) broadcast(businessId);
      return;
    } catch (error) {
      console.error("[business-viewers] recordViewer failed", error);
      return;
    }
  }
  let set = memViewers.get(businessId);
  if (!set) {
    set = new Map();
    memViewers.set(businessId, set);
  }
  const isNew = !set.has(viewerKey);
  set.set(viewerKey, expiry);
  if (isNew) broadcast(businessId);
}

export async function dropViewer(businessId: string, viewerKey: string): Promise<void> {
  if (realtimeRedisConfigured()) {
    try {
      const removed = await redis().zrem(key(businessId), viewerKey);
      if (removed) broadcast(businessId);
    } catch (error) {
      console.error("[business-viewers] dropViewer failed", error);
    }
    return;
  }
  const set = memViewers.get(businessId);
  if (set?.delete(viewerKey)) {
    if (set.size === 0) memViewers.delete(businessId);
    broadcast(businessId);
  }
}

export async function countViewers(businessId: string): Promise<number> {
  const now = Date.now();
  if (realtimeRedisConfigured()) {
    try {
      const [, card] = await redis()
        .pipeline()
        .zremrangebyscore(key(businessId), 0, now)
        .zcard(key(businessId))
        .exec<[number, number]>();
      return card;
    } catch (error) {
      console.error("[business-viewers] countViewers failed", error);
      return 0;
    }
  }
  const set = memViewers.get(businessId);
  if (!set) return 0;
  let count = 0;
  for (const [viewerKey, expiry] of set) {
    if (expiry <= now) set.delete(viewerKey);
    else count++;
  }
  return count;
}
