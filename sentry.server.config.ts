// Server-side Sentry init (Node runtime). Imported from instrumentation.ts's
// register(). web-pro-upgrade addendum M1.
//
// Env-gated exactly like the mobile app's Sentry (addendum-mobile-pro-upgrade
// M8): if no DSN is configured, Sentry.init is never called and this is inert
// — local dev, CI, and any environment without the Vercel↔Sentry integration
// connected all run with zero Sentry overhead and no noise. The DSN is
// injected by the Vercel Sentry integration once its resource is connected to
// this project.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Traces are billed; keep sampling conservative until there's a reason
    // to raise it. Errors are always captured regardless of this.
    tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.1 : 1.0,
    // The DSN is the only required config; PII scrubbing defaults are on.
    sendDefaultPii: false,
  });
}
