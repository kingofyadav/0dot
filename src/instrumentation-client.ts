// Browser-side Sentry init. Next.js loads this automatically on the client.
// web-pro-upgrade addendum M1.
//
// MUST live at src/instrumentation-client.ts (this project uses a src/ dir) —
// a root-level file is ignored, same as instrumentation.ts.
//
// Uses NEXT_PUBLIC_SENTRY_DSN. next.config.ts fills that from SENTRY_DSN at
// build time (the DSN is not a secret), so there's no separate env var to
// set. Inert when unset.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    // Session Replay and browser tracing are billed and heavier — start with
    // plain error capture; turn these on deliberately if they're wanted.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// Required by Next.js for navigation instrumentation; a no-op when Sentry
// isn't initialized.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
