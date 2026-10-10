// Browser-side Sentry init. Next.js loads this module after the HTML is
// parsed but before React hydration begins (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md).
// web-pro-upgrade addendum M1.
//
// MUST live at src/instrumentation-client.ts (this project uses a src/ dir) —
// a root-level file is ignored, same as instrumentation.ts.
//
// @sentry/browser, not @sentry/nextjs: this file only does plain error
// capture (tracesSampleRate/replay*SampleRate are all 0 below, and the
// Next.js router-transition hook this file used to export was pure dead
// weight at a 0 trace rate). @sentry/nextjs's browser entry carries its
// Next-specific router instrumentation regardless, and — same as
// instrumentation.ts and api/monitoring/route.ts hand-rolling their own
// Sentry wiring — none of it can be stripped via withSentryConfig's
// bundleSizeOptimizations under Turbopack, since that only runs through
// Sentry's webpack plugin. Swapping to @sentry/browser cut the lazy-loaded
// chunk from ~250KB parsed to ~34KB (measured via a prod build + manual
// chunk diff, 2026-10-10) for the exact same error-capture behavior.
//
// The SDK is still loaded lazily, after the first user interaction (see the
// bottom of the `if (dsn)` block) rather than imported statically — even at
// this smaller size, eager-parsing it would land inside the hydration-
// critical chunk and compete with first paint/interactivity on every page.
// A small synchronous buffer captures errors thrown in the gap before it's
// ready and replays them once it initializes, so deferring the import loses
// no reports.
import type * as SentryNS from "@sentry/browser";

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
    import("@sentry/browser")
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
          // These fire from code we don't control (browser extensions, page
          // translators, the browser itself) and were burying real
          // application errors in the same issue stream. Filtered by
          // message/origin, not silenced globally — anything not matching
          // stays reported.
          ignoreErrors: [
            // Benign browser quirk, not an app bug: fires when a
            // ResizeObserver callback doesn't finish within one frame.
            /ResizeObserver loop/,
            // Google Translate / Chrome's built-in translate (and similar
            // DOM-rewriting extensions) wrap text nodes in <font> tags,
            // detaching elements React still holds refs to. React's own
            // unmount cleanup then throws trying to remove/reinsert an
            // already-orphaned node — not something app code caused or can
            // fix. See node removal investigation, 2026-09-05.
            /Failed to execute 'removeChild' on 'Node'/,
            /Failed to execute 'insertBefore' on 'Node'/,
            // Thrown by non-Error values (e.g. a plain string or a
            // third-party script rejecting with no Error object) — Sentry
            // can't attach a useful stack trace to these regardless.
            "Non-Error promise rejection captured",
          ],
          // Extension-injected scripts run in the page's context and can
          // throw errors Sentry would otherwise attribute to our own bundle.
          denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-extension:\/\//],
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

  // Even on an idle main thread, parsing/executing the SDK (a ~300ms long
  // task on a throttled mobile CPU) lands inside the page-load window and
  // counts against Total Blocking Time / Time to Interactive. Wait for the
  // first real user interaction instead — the buffer above holds any errors
  // thrown in the meantime — with a long idle fallback so a visitor who
  // never touches the page still gets monitored.
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    for (const evt of INTERACTION_EVENTS) window.removeEventListener(evt, start);
    clearTimeout(fallbackTimer);
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(loadSentry, { timeout: 2000 });
    } else {
      setTimeout(loadSentry, 0);
    }
  };
  const INTERACTION_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
  for (const evt of INTERACTION_EVENTS) window.addEventListener(evt, start, { once: true, passive: true });
  const fallbackTimer = setTimeout(start, 20_000);
}
