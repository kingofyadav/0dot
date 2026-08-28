import "server-only";
import type { PresenceStore } from "./presence-store";
import { getRealtimeRedis } from "./redis-client";

// Redis-backed presence (spec §4.4). Lazily `require`d by presence-store.ts
// only when Redis is configured, so @upstash/redis stays out of builds that
// don't use it.
//
// One sorted set per user: `presence:z:<userId>`, member = connectionId,
// score = the epoch-ms this connection's presence expires. This
// self-heals: a hard-killed instance that never ran its SSE `cancel()`
// leaves a member behind, but that member has a score in the near future
// and every read drops expired members first (ZREMRANGEBYSCORE 0 <now>).
// The SSE heartbeat re-ADDs the member with a fresh score, so a live
// connection stays present as long as it heartbeats.
//
// SSE heartbeat is 20s (HEARTBEAT_MS in the stream routes); a 45s expiry
// tolerates two missed beats before a live user reads as offline. A 60s
// key-level TTL is the backstop that reaps the whole set once nobody's
// left.

const KEY_PREFIX = "presence:z:";
const CONNECTION_TTL_MS = 45_000;
const KEY_TTL_SECONDS = 60;

const key = (userId: string) => `${KEY_PREFIX}${userId}`;

async function cardAfterPrune(userId: string): Promise<number> {
  const redis = getRealtimeRedis();
  const now = Date.now();
  const [, card] = await redis
    .pipeline()
    .zremrangebyscore(key(userId), 0, now)
    .zcard(key(userId))
    .exec<[number, number]>();
  return card;
}

export const redisPresenceStore: PresenceStore = {
  connect(userId, connectionId) {
    void addConnection(userId, connectionId);
  },
  heartbeat(userId, connectionId) {
    // Same op as connect — ZADD updates the score of an existing member.
    void addConnection(userId, connectionId);
  },
  disconnect(userId, connectionId) {
    getRealtimeRedis()
      .zrem(key(userId), connectionId)
      .catch((error) => console.error("[realtime] presence disconnect failed", error));
  },

  async isOnline(userId) {
    try {
      return (await cardAfterPrune(userId)) > 0;
    } catch (error) {
      // A read failure shouldn't blank out an inbox — fall back to "unknown
      // = show nothing" (false), same as a user with no presence key.
      console.error("[realtime] presence isOnline failed", error);
      return false;
    }
  },

  async getOnline(userIds) {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Set();
    try {
      const now = Date.now();
      const pipeline = getRealtimeRedis().pipeline();
      for (const id of unique) {
        pipeline.zremrangebyscore(key(id), 0, now);
        pipeline.zcard(key(id));
      }
      const results = (await pipeline.exec()) as number[];
      const online = new Set<string>();
      unique.forEach((id, i) => {
        // results are [prune, card, prune, card, ...] — card is the odd index
        if ((results[i * 2 + 1] ?? 0) > 0) online.add(id);
      });
      return online;
    } catch (error) {
      console.error("[realtime] presence getOnline failed", error);
      return new Set();
    }
  },
};

async function addConnection(userId: string, connectionId: string): Promise<void> {
  try {
    await getRealtimeRedis()
      .pipeline()
      .zadd(key(userId), { score: Date.now() + CONNECTION_TTL_MS, member: connectionId })
      .expire(key(userId), KEY_TTL_SECONDS)
      .exec();
  } catch (error) {
    console.error("[realtime] presence connect/heartbeat failed", error);
  }
}
