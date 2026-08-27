import * as Sentry from "@sentry/nextjs";

// TEMPORARY — M1 Sentry pipeline diagnostics. Removed once resolved.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");

  if (mode === "probe") {
    return Response.json({
      hasSentryDsnEnv: Boolean(process.env.SENTRY_DSN),
      dsnPrefix: process.env.SENTRY_DSN?.slice(0, 24) ?? null,
      clientBeforeInit: Boolean(Sentry.getClient()),
    });
  }

  if (mode === "selfinit") {
    // Init right here in the route's own module context.
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV,
      debug: true,
    });
    const client = Sentry.getClient();
    const eventId = Sentry.captureException(new Error("M1 sentry selfinit check"));
    await Sentry.flush(3000);
    return Response.json({
      clientAfterSelfInit: Boolean(client),
      clientDsnHost: client?.getDsn()?.host ?? null,
      eventId,
    });
  }

  // default: rely on instrumentation.ts having initialized Sentry
  const eventId = Sentry.captureException(new Error("M1 sentry default check"));
  await Sentry.flush(3000);
  return Response.json({ eventId, clientPresent: Boolean(Sentry.getClient()) }, { status: 500 });
}
