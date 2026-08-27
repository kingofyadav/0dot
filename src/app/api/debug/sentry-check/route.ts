import * as Sentry from "@sentry/nextjs";
import { randomBytes } from "node:crypto";

// TEMPORARY — M1 Sentry pipeline diagnostics. Removed once delivery is proven.
// GET /api/debug/sentry-check runs the full matrix:
//   - did instrumentation.ts init the SDK for this isolate?
//   - can this function reach Sentry ingest at all (raw fetch, no SDK)?
//   - does an SDK capture + flush actually deliver?
export const dynamic = "force-dynamic";

function parseDsn(dsn: string | undefined) {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, "");
    return {
      publicKey: u.username,
      host: u.host,
      projectId,
      envelopeUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const clientBeforeInit = Boolean(Sentry.getClient());
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  const parsed = parseDsn(dsn);

  // 1. Raw egress test — bypass the SDK entirely, POST a minimal envelope
  //    straight to the ingest endpoint and report the HTTP status.
  let rawFetch: Record<string, unknown> = { attempted: false };
  if (parsed) {
    const eventId = randomBytes(16).toString("hex");
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn }),
      JSON.stringify({ type: "event" }),
      JSON.stringify({
        event_id: eventId,
        level: "error",
        platform: "node",
        message: "M1 raw-fetch ingest probe (safe to resolve)",
        tags: { source: "sentry-check-raw" },
      }),
    ].join("\n");
    const startedAt = Date.now();
    try {
      const res = await fetch(parsed.envelopeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-sentry-envelope",
          "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=raw-fetch/1.0`,
        },
        body,
      });
      rawFetch = {
        attempted: true,
        ok: res.ok,
        status: res.status,
        ms: Date.now() - startedAt,
        responseBody: (await res.text()).slice(0, 200),
        eventId,
      };
    } catch (err) {
      rawFetch = {
        attempted: true,
        ok: false,
        ms: Date.now() - startedAt,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  // 2. SDK path — capture through whatever client instrumentation.ts left us
  //    (or self-init if there is none), then measure whether flush drains it.
  let selfInited = false;
  if (!Sentry.getClient() && dsn) {
    Sentry.init({ dsn, environment: process.env.VERCEL_ENV, debug: true });
    selfInited = true;
  }
  const sdkEventId = Sentry.captureException(new Error("M1 SDK ingest probe (safe to resolve)"), {
    tags: { source: "sentry-check-sdk" },
  });
  const flushStartedAt = Date.now();
  const flushed = await Sentry.flush(5000);

  return Response.json({
    env: {
      hasSentryDsn: Boolean(process.env.SENTRY_DSN),
      hasNextPublicSentryDsn: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
      dsnHost: parsed?.host ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      nextRuntime: process.env.NEXT_RUNTIME ?? null,
      sentryDebug: process.env.SENTRY_DEBUG ?? null,
    },
    instrumentation: {
      clientBeforeInit,
      selfInitedInRoute: selfInited,
      clientDsnHost: Sentry.getClient()?.getDsn()?.host ?? null,
    },
    rawFetch,
    sdk: {
      eventId: sdkEventId,
      flushReturned: flushed,
      flushMs: Date.now() - flushStartedAt,
    },
  });
}
