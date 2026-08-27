import * as Sentry from "@sentry/nextjs";

// TEMPORARY — confirms src/instrumentation.ts now initializes Sentry in the
// production runtime (it was at the repo root before, silently ignored for a
// src/ project). Read-only: no captures, no init. Delete once verified.
export const dynamic = "force-dynamic";

export async function GET() {
  const client = Sentry.getClient();
  return Response.json({
    sentryClientInitialized: Boolean(client),
    clientDsnHost: client?.getDsn()?.host ?? null,
    hasSentryDsn: Boolean(process.env.SENTRY_DSN),
    hasNextPublicSentryDsn: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nextRuntime: process.env.NEXT_RUNTIME ?? null,
  });
}
