import "server-only";
import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };

// In-memory, single-process, fixed-window limiter. Resets on restart and
// doesn't share state across multiple server instances — fine for the
// current single-process deployment; revisit with a shared store (Redis,
// etc.) before running more than one instance. Good enough to stop casual
// brute-force/credential-stuffing and signup spam, which is what phase-1
// spec §7.2 asks for on login/signup/post/link creation.
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
export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",").pop()!.trim();
  return headersList.get("x-real-ip") ?? "unknown";
}
