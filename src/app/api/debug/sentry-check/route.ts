import * as Sentry from "@sentry/nextjs";

// TEMPORARY — verifies the M1 Sentry pipeline end to end in production, then
// gets removed. `?probe=1` reports wiring state as JSON without throwing;
// a plain GET captures + flushes + throws.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("probe") === "1") {
    const client = Sentry.getClient();
    return Response.json({
      hasSentryDsnEnv: Boolean(process.env.SENTRY_DSN),
      hasPublicSentryDsnEnv: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
      sentryClientInitialized: Boolean(client),
      sentryClientDsn: client?.getDsn()?.host ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      nextRuntime: process.env.NEXT_RUNTIME ?? null,
    });
  }

  const err = new Error("M1 Sentry pipeline check — safe to ignore/resolve");
  const eventId = Sentry.captureException(err, { tags: { source: "sentry-check-route" } });
  await Sentry.flush(3000);
  return Response.json({ captured: true, eventId }, { status: 500 });
}
