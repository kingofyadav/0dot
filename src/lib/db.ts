import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import type { Config } from "@libsql/client";
import { logger } from "@/lib/logger";
import { wrapLibsqlExecutor } from "@/lib/db-resilience";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

// DATABASE_URL is external config with no compile-time guarantee it's
// right — a malformed or wrong-but-valid-looking value here has twice
// silently pointed the app at an empty/wrong database instead of failing
// loudly. Fail fast and log which host we're actually using so this is
// visible in runtime logs instead of only discoverable by hand.
if (!url.startsWith("file:") && !url.startsWith("libsql:")) {
  throw new Error(
    `DATABASE_URL is not a valid file: or libsql: URL (got ${JSON.stringify(url)}). ` +
      `Check the Production environment variable in Vercel.`
  );
}
if (url.startsWith("libsql:") && !authToken) {
  throw new Error("DATABASE_URL is a remote libsql: URL but DATABASE_AUTH_TOKEN is not set.");
}

// Beyond the scheme-prefix check above, confirm url is actually a parseable
// URI before it can reach libsql's native binding as `syncUrl` (used below
// when embedded-replica mode is on). Found live: a syncUrl that merely
// *starts with* "libsql:" but doesn't parse — e.g. `env pull`'s
// "[SENSITIVE]" placeholder for a Sensitive-type env var happening to get
// used here — makes libsql's Rust URI parser `.unwrap()` an Err and *panic*,
// aborting the whole process (SIGABRT), not throwing a catchable JS error.
// Failing here with a normal Error is the only way to keep a malformed
// DATABASE_URL from taking down the entire function instance instead of
// just this one request.
let remoteHost: string | undefined;
if (url.startsWith("libsql:")) {
  try {
    remoteHost = new URL(url).host;
  } catch (err) {
    throw new Error(`DATABASE_URL starts with "libsql:" but isn't a parseable URI: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Opt-in (unset by default) — see docs/BUGS.md "DB cross-region latency
// breaks Sign in with 0dot" for why this exists: this project's Vercel plan
// is Hobby, which silently ignores vercel.json's `regions: ["bom1"]` and
// auto-routes each function invocation to whatever region is nearest the
// *request*, while Turso only has a primary in ap-south-1 — every query from
// a non-bom1 instance pays a real network round trip, and under that
// region's connectivity blips (db-resilience.ts's retry target) sometimes
// several of them in a row. Turso's platform-level multi-region replicas
// (`turso group locations add`) are deprecated and unavailable on this
// account's plan — this is the remaining lever.
//
// Turning this on changes every read in the app from "current as of this
// statement" to "current as of the last sync, at most
// EMBEDDED_REPLICA_MAX_STALENESS_MS old" (writes are unaffected — they still
// go straight to the ap-south-1 primary, same as today). Fine for
// session/app-lookup/catalog-style reads; a real behavior change for
// anything that expects to see another request's write immediately (e.g. a
// second open tab polling a feed). Verify in Preview before enabling in
// Production — this is a deliberate opt-in, not something to flip on
// app-wide without testing.
const useEmbeddedReplica = process.env.DATABASE_EMBEDDED_REPLICA === "1" && url.startsWith("libsql:");

// Vercel Functions get a writable, ephemeral-per-cold-start /tmp. "Ephemeral"
// is exactly what makes the warm-up sync below mandatory (a fresh instance's
// local file starts empty), but it's also persisted across the many requests
// a single warm Fluid Compute instance goes on to serve — which is the whole
// point: one full sync paid once per instance, near-free local reads after
// that instead of a round trip to the primary on every single statement.
const EMBEDDED_REPLICA_PATH = "/tmp/0dot-embedded-replica.db";
const EMBEDDED_REPLICA_MAX_STALENESS_MS = 5_000;

logger.info("db: connecting", undefined, {
  target: remoteHost ?? url,
  embeddedReplica: useEmbeddedReplica,
});

const adapterConfig: Config = useEmbeddedReplica ? { url: `file:${EMBEDDED_REPLICA_PATH}`, syncUrl: url, authToken } : { url, authToken };

// Bounds how stale the local replica may get before a statement has to wait
// on a fresh `.sync()`, rather than either (a) syncing before literally every
// statement, which would put every query straight back on the ap-south-1
// round trip this whole path exists to avoid, or (b) leaning on libsql's own
// background `syncInterval` timer — that doesn't run while a serverless
// instance is frozen between requests anyway, and would otherwise bill
// Active CPU time for a timer ticking with nothing to do in the meantime.
// `lastSyncedAt`/`syncInFlight` close over one `Client`, so this cost is paid
// once per *instance* (via the globalForPrisma cache below keeping that
// client alive across a warm instance's requests), not once per request.
function createSyncGate(client: { sync(): Promise<unknown> }): () => Promise<void> {
  let lastSyncedAt = 0;
  let syncInFlight: Promise<void> | null = null;
  return () => {
    if (Date.now() - lastSyncedAt < EMBEDDED_REPLICA_MAX_STALENESS_MS) return Promise.resolve();
    if (!syncInFlight) {
      syncInFlight = client
        .sync()
        .then(() => {
          lastSyncedAt = Date.now();
        })
        .finally(() => {
          syncInFlight = null;
        });
    }
    return syncInFlight;
  };
}

// Subclassed (rather than wrapping the PrismaLibSql instance itself) because
// PrismaClient calls `createClient()` once per pooled connection it opens —
// wrapping only the adapter-factory's own methods would miss every
// connection the pool creates after the first. Overriding this one override
// point covers all of them, including the shadow-DB client migrations use.
class ResilientPrismaLibSql extends PrismaLibSql {
  override createClient(config: Parameters<PrismaLibSql["createClient"]>[0]) {
    const client = super.createClient(config);
    // config.syncUrl only ever comes from adapterConfig above, so this is
    // true for the main pool connection whenever useEmbeddedReplica is on.
    // Prisma's shadow-DB path (migrate/diff tooling, never used at app
    // runtime) copies {...config, url: ":memory:"} and inherits it too —
    // harmless there since nothing imports this module at migration time
    // expecting a persistent store.
    if (!config.syncUrl) return wrapLibsqlExecutor(client);
    return wrapLibsqlExecutor(client, createSyncGate(client));
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new ResilientPrismaLibSql(adapterConfig);

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

// Cache the client (and its libSQL connection) on globalThis in every
// environment, production included. In dev this is the standard guard
// against `next dev` HMR spawning a new pool on every reload. In production
// on Vercel Fluid Compute a single instance serves many requests over its
// lifetime and modules can be re-evaluated within it — without this, each
// re-eval built a fresh PrismaClient and reconnected to Turso (visible as
// repeated "[db] connecting to …" lines in the runtime logs). One client
// per instance instead.
globalForPrisma.prisma = db;
