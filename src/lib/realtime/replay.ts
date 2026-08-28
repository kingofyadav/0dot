import "server-only";
import { realtimeRedisConfigured } from "./redis-config";

// `Last-Event-ID` replay for the realtime bus (spec
// addendum-realtime-community.md Phase C). Each buffered event on a channel
// gets a monotonic sequence number and lands in a short, self-expiring
// Redis list; an SSE client that reconnects with `Last-Event-ID: <seq>`
// gets exactly the events it missed replayed before the stream goes live,
// instead of refetching the whole page.
//
// Only community chat uses this today — it has append semantics where
// "replay the 2 you missed" clearly beats "refetch history". The messages
// stream stays on the simpler `resync` = refetch model (an inbox refetch
// is one query).
//
// Requires Redis: with the in-memory driver (single process) there's no
// cross-instance gap to bridge, and the SSE route simply emits no `id:`
// frames, so the client falls back to `resync`.

const BUFFER_SIZE = 50;
const TTL_SECONDS = 120; // comfortably longer than the 5-min maxDuration recycle is short — see below

function redisClient() {
  // Lazy — keeps @upstash/redis out of bundles/tests that don't configure
  // Redis, same pattern as bus.ts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("./redis-client") as typeof import("./redis-client")).getRealtimeRedis();
}

const seqKey = (channel: string) => `rt:seq:${channel}`;
const bufKey = (channel: string) => `rt:buf:${channel}`;

// Assigns the next sequence number for `channel`, hands it to `build` to
// produce the event object that gets published, records that object in the
// replay buffer, and returns it. Returns null when Redis isn't configured —
// the caller then publishes the un-sequenced event and the SSE route emits
// no `id:` frames.
export async function recordForReplay<E extends object>(
  channel: string,
  build: (seq: number) => E
): Promise<{ seq: number; event: E } | null> {
  if (!realtimeRedisConfigured()) return null;
  try {
    const redis = redisClient();
    const seq = await redis.incr(seqKey(channel));
    const event = build(seq);
    const json = JSON.stringify(event);
    await redis
      .pipeline()
      .lpush(bufKey(channel), `${seq}|${json}`)
      .ltrim(bufKey(channel), 0, BUFFER_SIZE - 1)
      .expire(bufKey(channel), TTL_SECONDS)
      .expire(seqKey(channel), TTL_SECONDS)
      .exec();
    return { seq, event };
  } catch (error) {
    console.error("[realtime] recordForReplay failed", error);
    return null;
  }
}

// The last sequence number assigned on `channel` (0 if none / no Redis).
// The SSE route sends this as a baseline `id:` on a fresh connection so the
// client has something to reconnect from.
export async function currentSeq(channel: string): Promise<number> {
  if (!realtimeRedisConfigured()) return 0;
  try {
    const value = await redisClient().get<number>(seqKey(channel));
    return typeof value === "number" ? value : Number(value) || 0;
  } catch {
    return 0;
  }
}

export type ReplayResult =
  // The buffer covers everything after `afterSeq` — replay these, no refetch.
  | { kind: "frames"; frames: { seq: number; json: string }[] }
  // The gap is bigger than the buffer (or the buffer expired) — tell the
  // client to do a full refetch instead.
  | { kind: "gap" };

// Reads the events on `channel` with seq > `afterSeq`. `gap` when the
// oldest buffered event is newer than afterSeq + 1 (we can't prove
// completeness) or the buffer is empty/unavailable.
export async function getReplayFrames(channel: string, afterSeq: number): Promise<ReplayResult> {
  if (!realtimeRedisConfigured() || !Number.isFinite(afterSeq)) return { kind: "gap" };
  try {
    const raw = await redisClient().lrange<string>(bufKey(channel), 0, -1); // newest-first
    const parsed = raw
      .map((entry) => {
        const i = entry.indexOf("|");
        return { seq: Number(entry.slice(0, i)), json: entry.slice(i + 1) };
      })
      .filter((f) => Number.isFinite(f.seq))
      .sort((a, b) => a.seq - b.seq); // oldest-first, ready to replay in order

    if (parsed.length === 0) return { kind: "gap" };
    if (parsed[0].seq > afterSeq + 1) return { kind: "gap" };

    return { kind: "frames", frames: parsed.filter((f) => f.seq > afterSeq) };
  } catch (error) {
    console.error("[realtime] getReplayFrames failed", error);
    return { kind: "gap" };
  }
}
