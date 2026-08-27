import "server-only";
import { logger } from "@/lib/logger";

// Shared plumbing for the platform-cron Route Handlers under
// src/app/api/cron/* (web-pro-upgrade addendum M1).
//
// Background: this app was built as a single long-lived `next start` process
// and started ~12 recurring jobs via setInterval in instrumentation.ts. On
// Vercel Fluid Compute every warm instance booted every one of those
// against a single-writer libSQL database — a thundering herd that returned
// 503s under load. On Vercel the schedulers no longer run (see
// instrumentation.ts); a platform cron hits these routes instead. Locally
// and on a self-hosted single process, the in-process schedulers still run
// and these routes are just a manual trigger.

// Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when the
// CRON_SECRET env var is set. Reject anything else — an unauthenticated
// caller must never be able to trigger account deletion or billing sweeps.
export function assertCronAuthorized(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("cron: CRON_SECRET is not set — refusing to run");
    return new Response("cron not configured", { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}

type JobResult = { ok: boolean; ms: number; error?: string };

// Runs every job in the map, isolating failures so one bad job never
// prevents the rest — same posture as instrumentation.ts's runStartupTask.
export async function runCronBucket(
  bucket: string,
  jobs: Record<string, () => Promise<unknown>>,
): Promise<Response> {
  const results: Record<string, JobResult> = {};
  for (const [name, job] of Object.entries(jobs)) {
    const startedAt = Date.now();
    try {
      await job();
      results[name] = { ok: true, ms: Date.now() - startedAt };
    } catch (err) {
      results[name] = {
        ok: false,
        ms: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      };
      logger.error(`cron.${bucket}.${name} failed`, err);
    }
  }
  const anyFailed = Object.values(results).some((r) => !r.ok);
  return Response.json({ bucket, results }, { status: anyFailed ? 500 : 200 });
}
