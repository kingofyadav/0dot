import * as Sentry from "@sentry/nextjs";

// TEMPORARY — confirms src/instrumentation.ts now initializes Sentry in the
// production runtime and that uncaught route errors reach Sentry via the
// onRequestError hook. Delete once verified. `?throw=1` raises an uncaught
// error on purpose; a plain GET is a read-only probe.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const client = Sentry.getClient();

  if (new URL(request.url).searchParams.get("throw") === "1") {
    throw new Error("M1 onRequestError probe — uncaught route error (safe to resolve)");
  }

  return Response.json({
    sentryClientInitialized: Boolean(client),
    clientDsnHost: client?.getDsn()?.host ?? null,
    hasSentryDsn: Boolean(process.env.SENTRY_DSN),
    hasNextPublicSentryDsn: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nextRuntime: process.env.NEXT_RUNTIME ?? null,
  });
}
