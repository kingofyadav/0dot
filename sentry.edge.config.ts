// Edge-runtime Sentry init (proxy.ts / any edge route). Same env-gating as
// sentry.server.config.ts — see that file. web-pro-upgrade addendum M1.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
