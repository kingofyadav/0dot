// Browser-side Sentry init. Next.js loads this automatically on the client.
// web-pro-upgrade addendum M1.
//
// Uses NEXT_PUBLIC_SENTRY_DSN only (the server-only SENTRY_DSN isn't exposed
// to the browser bundle). Inert when unset — see sentry.server.config.ts.
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
