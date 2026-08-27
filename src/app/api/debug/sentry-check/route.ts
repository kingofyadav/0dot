import * as Sentry from "@sentry/nextjs";

// TEMPORARY — verifies the M1 Sentry pipeline end to end in production, then
// gets removed (same "add temporary internal endpoint / remove it" pattern
// this repo used for the migration-runner routes). Tests both paths:
// an explicit captureException AND the thrown error that Next.js routes to
// instrumentation.ts's onRequestError hook. No side effects — it only errors.
export const dynamic = "force-dynamic";

export function GET() {
  const err = new Error("M1 Sentry pipeline check — safe to ignore/resolve");
  Sentry.captureException(err, { tags: { source: "sentry-check-route" } });
  throw err;
}
