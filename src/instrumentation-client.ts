// Browser-side Sentry init. Next.js loads this module after the HTML is
// parsed but before React hydration begins (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md).
// web-pro-upgrade addendum M1.
//
// MUST live at src/instrumentation-client.ts (this project uses a src/ dir) —
// a root-level file is ignored, same as instrumentation.ts.
//
// The @sentry/nextjs browser SDK is ~150KB gzip / ~475KB parsed. Under this
// project's Turbopack build it CANNOT be slimmed via withSentryConfig's
// bundleSizeOptimizations — that only takes effect through Sentry's webpack
// plugin, which Turbopack never runs (same reason instrumentation.ts and
// api/monitoring/route.ts hand-roll their Sentry wiring). Importing it
// statically here dropped the entire SDK into the hydration-critical chunk,
// where it competed with first paint and interactivity on every page.
//
// Instead the SDK is loaded lazily once the main thread goes idle. A small
// synchronous buffer captures errors thrown in the gap before it's ready and
// replays them once it initializes, so deferring the import loses no reports.
import type * as SentryNS from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

const MAX_BUFFERED_ERRORS = 20;
const bufferedErrors: unknown[] = [];
let sentry: typeof SentryNS | null = null;

function bufferEarlyError(event: ErrorEvent | PromiseRejectionEvent) {
  // Once the SDK is live its own global handlers take over.
  if (sentry || bufferedErrors.length >= MAX_BUFFERED_ERRORS) return;
  bufferedErrors.push(
    "reason" in event ? event.reason : (event.error ?? event.message),
  );
}

if (dsn) {
  window.addEventListener("error", bufferEarlyError);
  window.addEventListener("unhandledrejection", bufferEarlyError);

  const loadSentry = () => {
    import("@sentry/nextjs")
      .then((Sentry) => {
        sentry = Sentry;
        Sentry.init({
          dsn,
          // Route envelopes through our own origin (src/app/api/monitoring/route.ts)
          // instead of straight to *.ingest.sentry.io: keeps the browser
          // request on `connect-src 'self'` (proxy.ts never needs a Sentry
          // host) and slips past ad/tracker blockers that would otherwise
          // drop client-side errors.
          tunnel: "/api/monitoring",
          environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
          // Session Replay and browser tracing are billed and heavier — plain
          // error capture only. (Under Turbopack the tracing code can't be
          // tree-shaken out, but a 0 rate keeps it inert at runtime.)
          tracesSampleRate: 0,
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
        });
        window.removeEventListener("error", bufferEarlyError);
        window.removeEventListener("unhandledrejection", bufferEarlyError);
        for (const err of bufferedErrors) Sentry.captureException(err);
        bufferedErrors.length = 0;
      })
      .catch(() => {
        // Monitoring is best-effort: a failed chunk fetch (offline, blocked)
        // must never surface to the user or break the page.
      });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(loadSentry, { timeout: 5000 });
  } else {
    setTimeout(loadSentry, 2000);
  }
}

// Required by Next.js for navigation instrumentation. Forwards to Sentry once
// the SDK has loaded; a no-op before then — navigation tracing is disabled
// anyway (tracesSampleRate: 0), so the early window costs nothing.
export function onRouterTransitionStart(href: string, navigationType: string): void {
  sentry?.captureRouterTransitionStart(href, navigationType);
}
