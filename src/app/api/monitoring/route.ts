import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Same-origin Sentry tunnel (web-pro-upgrade addendum M1). The browser
// Sentry SDK (src/instrumentation-client.ts, `tunnel: "/api/monitoring"`)
// POSTs its envelopes here; this route forwards them server-side to
// o4511982878982144.ingest.us.sentry.io. Why a hand-written tunnel rather
// than allowlisting the ingest host in proxy.ts's connect-src:
//
//   1. Ad/tracker blockers (uBlock, Brave, Pi-hole, corporate proxies)
//      drop *every* request to a *.sentry.io host, so a direct browser
//      connection silently loses client-side errors from a real slice of
//      users. A first-party path is on no blocklist.
//   2. @sentry/nextjs ships a `tunnelRoute` option, but it's materialized
//      by the Sentry *webpack* plugin — which this Turbopack build never
//      runs (same reason server init is hand-rolled in
//      src/instrumentation.ts). So the route is written out here.
//
// CSP needs no change: `connect-src 'self'` in proxy.ts already covers it,
// and proxy.ts's matcher excludes `api/` so no rewrite touches this path.
//
// Hardened so it can't be used as an open forward-proxy / SSRF gadget: the
// envelope's own header line carries its destination DSN, and we relay only
// when that DSN's host + project id match this deployment's SENTRY_DSN.
// Anything else is dropped. Best-effort IP rate limit caps abuse volume.

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // every call must egress; never cache

function configuredTarget(): { host: string; projectId: string } | null {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, "");
    if (!u.host || !projectId) return null;
    return { host: u.host, projectId };
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const target = configuredTarget();
  if (!target) return new NextResponse(null, { status: 404 }); // Sentry not configured here

  const ip = await getClientIp();
  // One browser SDK sends a handful of envelopes per page; 240/min/IP is
  // generous headroom for a real user and still bounds a flood.
  if (!checkRateLimit(`sentry-tunnel:ip:${ip}`, { max: 240, windowMs: 60 * 1000 })) {
    return new NextResponse(null, { status: 429 });
  }

  const body = await request.text();
  const nl = body.indexOf("\n");
  if (nl === -1) return new NextResponse(null, { status: 400 });

  let dsnUrl: URL;
  try {
    const header = JSON.parse(body.slice(0, nl)) as { dsn?: string };
    if (!header.dsn) return new NextResponse(null, { status: 400 });
    dsnUrl = new URL(header.dsn);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const projectId = dsnUrl.pathname.replace(/^\/+/, "");
  if (dsnUrl.host !== target.host || projectId !== target.projectId) {
    return new NextResponse(null, { status: 403 }); // not our project — refuse to relay
  }

  let upstream: Response;
  try {
    upstream = await fetch(`https://${target.host}/api/${target.projectId}/envelope/`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-sentry-envelope" },
      // Don't let a slow Sentry edge hold a function instance open.
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}
