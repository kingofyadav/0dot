import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
// Pure env check — no @upstash/redis import, safe to pull into this
// widely-imported module. The client itself is lazily `import()`ed inside
// enforceRateLimit only when this returns true (redis-client.ts's own
// header rule: never import it from an eagerly-loaded module).
import { realtimeRedisConfigured } from "@/lib/realtime/redis-config";

type Bucket = { count: number; resetAt: number };

// In-memory, single-process, fixed-window limiter. Resets on restart and
// doesn't share state across instances — on Vercel every cold function
// instance starts with an empty map. That's acceptable for "stop one user
// spamming posts / follows / reactions": the ceiling is per-instance and
// leaky, but the abuse it guards is self-limiting and caught downstream by
// moderation. It is NOT acceptable for guarding a credential check — a
// brute force simply spreads across instances. Those callers use
// enforceRateLimit() below instead.
const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so `buckets` doesn't grow unbounded over a long
// uptime — no timers (avoids stacking under dev/HMR), just a random sweep
// on a small fraction of calls.
function sweepExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  { max, windowMs }: { max: number; windowMs: number }
): boolean {
  const now = Date.now();
  if (Math.random() < 0.01) sweepExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= max) return false;

  bucket.count += 1;
  return true;
}

// Durable, cross-instance fixed-window limiter. Use this — not
// checkRateLimit — for anything a determined attacker would pay to bypass:
// login, 2FA verification, password reset, signup, the OAuth token
// endpoint, wallet transfers, and account-security changes
// (password/email/phone/2FA/lifecycle). Returns true if the request is
// allowed.
//
// Three tiers, each a strict fallback for the one before:
//   1. Upstash Redis (when KV_REST_API_* is set) — INCR + PEXPIRE, 1–2
//      round trips. This is the same Upstash DB the realtime layer uses.
//   2. RateLimitCounter in Turso — the historical implementation, 3
//      sequential writes to a single-writer DB. Still correct, just the
//      slowest option on the hottest security paths, so it's now the
//      fallback rather than the default.
//   3. In-memory (checkRateLimit) — per-instance and leaky, but still *a*
//      ceiling, and never takes login down with the datastore.
let warnedRedisRateLimitDown = false;

export async function enforceRateLimit(
  key: string,
  opts: { max: number; windowMs: number }
): Promise<boolean> {
  if (realtimeRedisConfigured()) {
    try {
      const { getRealtimeRedis } = await import("@/lib/realtime/redis-client");
      const redis = getRealtimeRedis();
      const redisKey = `rl:${key}`;
      // Fixed window: the first request of a window creates the key and
      // sets its TTL; every request increments. `count` is the running
      // total for the window, so `count <= max` is the ceiling check. N
      // concurrent INCRs across N instances each get a distinct return
      // value, so they can't all read "under the limit" at once.
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.pexpire(redisKey, opts.windowMs);
      return count <= opts.max;
    } catch (err) {
      if (!warnedRedisRateLimitDown) {
        warnedRedisRateLimitDown = true;
        logger.warn("enforceRateLimit: Redis tier unavailable — falling back to the RateLimitCounter (Turso) tier.", err);
      }
      // fall through to the DB tier
    }
  }
  return enforceRateLimitViaDb(key, opts);
}

async function enforceRateLimitViaDb(
  key: string,
  { max, windowMs }: { max: number; windowMs: number }
): Promise<boolean> {
  const now = Date.now();
  const expiresAt = new Date(now + windowMs);

  try {
    // Roll a stale window over to a fresh one atomically. Matches nothing
    // when the row is absent or the window is still live — a no-op then.
    await db.rateLimitCounter.updateMany({
      where: { key, expiresAt: { lte: new Date(now) } },
      data: { count: 0, expiresAt },
    });

    // Make sure a row exists for this key without disturbing a live window.
    await db.rateLimitCounter.upsert({
      where: { key },
      create: { key, count: 0, expiresAt },
      update: {},
    });

    // Atomic conditional consume: increments only while under the ceiling.
    // count 0 back means the row was already at `max`.
    const consumed = await db.rateLimitCounter.updateMany({
      where: { key, count: { lt: max } },
      data: { count: { increment: 1 } },
    });
    return consumed.count > 0;
  } catch (err) {
    console.error(`enforceRateLimit: backing store unavailable for "${key}" — falling back to in-memory limiter.`, err);
    return checkRateLimit(key, { max, windowMs });
  }
}

// Called from the daily cron (src/app/api/cron/daily) — the rows are
// self-expiring in effect (an expired window is reset on next use), but
// keys that go quiet forever would otherwise linger. Cheap: one indexed
// range delete.
export async function sweepExpiredRateLimitCounters(): Promise<void> {
  await db.rateLimitCounter.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

// Best-effort client identifier from proxy headers. Falls back to a shared
// "unknown" bucket (rather than throwing) when nothing is set, e.g. local
// dev without a reverse proxy — degrades to a single global IP-bucket
// rather than disabling the limiter entirely.
//
// Deployment assumption: exactly one trusted reverse proxy sits in front of
// this app and appends (never lets the client overwrite) the real client IP
// as the last hop of X-Forwarded-For. The *first* hop is attacker-controlled
// — a client can send any value it wants as the start of that header — so
// taking it would let per-IP limits be trivially spoofed by sending a fresh
// X-Forwarded-For value per request. The last hop is the one the proxy
// itself appended and is the only hop this app can trust. If self-hosting
// behind a different proxy topology (multiple hops, a CDN that doesn't
// strip client-supplied values), this assumption must be re-verified.
//
// If BOTH headers are missing on a deployed (Vercel) request, every caller
// collapses into one shared "unknown" bucket — a global lockout or an
// effectively-disabled per-IP limiter, with no other signal. Warn once per
// instance so a proxy misconfiguration surfaces before it becomes an
// incident. (Local dev with no reverse proxy is expected and stays quiet.)
let warnedMissingClientIp = false;

export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",").pop()!.trim();

  const realIp = headersList.get("x-real-ip");
  if (realIp) return realIp;

  if (process.env.VERCEL && !warnedMissingClientIp) {
    warnedMissingClientIp = true;
    logger.warn(
      "getClientIp: no x-forwarded-for or x-real-ip on a Vercel request — every client is now sharing one rate-limit bucket. Check the reverse-proxy configuration."
    );
  }
  return "unknown";
}
