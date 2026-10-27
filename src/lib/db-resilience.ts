import "server-only";
import { logger } from "@/lib/logger";

// See docs/BUGS.md "DB-connection-burst-503": Turso's HTTP endpoint for a
// libsql: database enforces a per-database concurrent-request ceiling. A warm
// Vercel Fluid Compute instance serving several requests at once — most
// visibly, Next's own RSC-prefetch firing for every visible nav link in the
// same burst — can exceed it, and the client surfaces that as a
// `LibsqlError` (code "SERVER_ERROR") wrapping the original 5xx from Turso's
// edge (see @libsql/client's `mapHranaErrorCode`/`HttpServerError`), which
// previously propagated straight up into a 503 response. The only mitigation
// so far was disabling Next's `prefetch` at specific burst-prone call sites
// (NavLinks.tsx, ContextualRail.tsx, etc.) one at a time — that only reduces
// how often the ceiling gets hit, not what happens when it still does.
//
// `wrapLibsqlExecutor` (used from src/lib/db.ts, below Prisma's own type
// layer so PrismaClient's generated types are completely unaffected) makes
// every statement sent to Turso go through `runWithDbResilience`: a global
// in-process semaphore caps how many statements are in flight at once
// (the rest queue instead of firing together), and a transient SERVER_ERROR
// is retried a few times with backoff instead of failing the request. A
// SERVER_ERROR from Turso's HTTP layer is a pre-execution rejection — the
// statement never reached SQLite — so retrying is safe even for a write
// inside an open transaction: there's nothing already applied to duplicate.
const MAX_CONCURRENT_QUERIES = Number(process.env.DATABASE_MAX_CONCURRENT_QUERIES ?? 8);
// Raised from 3 (2026-10-27, see docs/BUGS.md "Production signup
// intermittently fails"): on Vercel Hobby a function instance can land
// thousands of km from the ap-south-1 Turso primary (region pinning is
// silently ignored — see db.ts), so a run of back-to-back ETIMEDOUT/
// UND_ERR_SOCKET blips on one connection is more likely than from a
// co-located instance. 3 attempts sometimes wasn't enough to clear a burst;
// 5 gives real headroom under the platform's much larger maxDuration
// ceiling without meaningfully changing latency on the common case (most
// requests still resolve on attempt 0).
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 120;

let activeQueries = 0;
const waitQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeQueries < MAX_CONCURRENT_QUERIES) {
    activeQueries++;
    return;
  }
  await new Promise<void>((resolve) => waitQueue.push(resolve));
  activeQueries++;
}

function releaseSlot(): void {
  activeQueries--;
  waitQueue.shift()?.();
}

// Connection-level failures below Turso's own HTTP layer — undici's fetch
// throws a generic `TypeError: fetch failed` wrapping one of these as
// `.cause`, so unlike SERVER_ERROR above there's no libsql error code to
// check, only the underlying socket error's own `code`. Seen in production
// runtime logs (connect ETIMEDOUT, "other side closed" / UND_ERR_SOCKET,
// write ETIMEDOUT) as a week-long pattern of startup tasks like
// ensureFirstPartyApps (first-party-apps.ts) failing outright on a transient
// network blip to Turso's ap-south-1 endpoint — previously left unretried,
// which for a fire-and-forget boot task meant the failure stuck until the
// next cold start, rather than just slowing one request down.
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export function isTransientLibsqlError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  if (code === "SERVER_ERROR" || code === "HRANA_WEBSOCKET_ERROR" || code === "HRANA_CLOSED_ERROR") return true;
  if (code && TRANSIENT_NETWORK_ERROR_CODES.has(code)) return true;
  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return false;
  const causeCode = (cause as { code?: string }).code;
  if (causeCode && TRANSIENT_NETWORK_ERROR_CODES.has(causeCode)) return true;
  const status = (cause as { status?: number }).status;
  return typeof status === "number" && status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWithDbResilience<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await acquireSlot();
    try {
      return await run();
    } catch (error) {
      if (attempt < MAX_RETRIES && isTransientLibsqlError(error)) {
        const delay = BASE_RETRY_DELAY_MS * 2 ** attempt + Math.random() * 100;
        logger.warn("db: transient error, retrying", error, { attempt, delay: Math.round(delay) });
        await sleep(delay);
        continue;
      }
      throw error;
    } finally {
      releaseSlot();
    }
  }
}

// Transparent wrapper around a @libsql/client `Client` (or the `Transaction`
// object its own `.transaction()` returns — same `execute`/`batch` shape).
// Every other method/getter is passed through unchanged but still bound to
// the real target, not the Proxy — required because the client's internal
// implementation uses private class fields, which throw if ever accessed
// with `this` set to a Proxy rather than the real instance.
//
// `beforeStatement`, when given, runs before every execute/batch/transaction
// call — used by db.ts's embedded-replica config to gate statements on a
// fresh-enough `.sync()` (see EMBEDDED_REPLICA_MAX_STALENESS_MS there) without
// duplicating this Proxy's shape. It runs *inside* runWithDbResilience's
// retried closure for execute/batch, so a transient failure mid-sync gets the
// same backoff-and-retry treatment as any other transient libsql error.
export function wrapLibsqlExecutor<T extends object>(target: T, beforeStatement?: () => Promise<void>): T {
  return new Proxy(target, {
    get(obj, prop, _receiver) {
      // Pass `obj` (not the Proxy) as the receiver so a getter's internal
      // `this` sees the real instance too.
      const value = Reflect.get(obj, prop, obj);
      if (typeof value !== "function") return value;

      if (prop === "execute" || prop === "batch") {
        return (...args: unknown[]) =>
          runWithDbResilience(async () => {
            if (beforeStatement) await beforeStatement();
            return (value as (...a: unknown[]) => Promise<unknown>).apply(obj, args);
          });
      }
      if (prop === "transaction") {
        return async (...args: unknown[]) => {
          if (beforeStatement) await beforeStatement();
          return wrapLibsqlExecutor((await (value as (...a: unknown[]) => Promise<object>).apply(obj, args)) as object, beforeStatement);
        };
      }
      return value.bind(obj);
    },
  }) as T;
}
