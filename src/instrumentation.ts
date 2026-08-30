// Runs once when a new Next.js server instance starts, before it serves
// requests (see node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/instrumentation.md).
//
// MUST live at src/instrumentation.ts, not the repo root. This project uses a
// src/ directory, so Next resolves the instrumentation hook relative to
// src/app/.. (= src/) — a root-level instrumentation.ts is silently ignored
// in the production build (hasInstrumentationHook === false), which is what
// left Sentry, onRequestError, and the boot tasks below dead on Vercel until
// 2026-08-27. Same convention level as src/proxy.ts.
//
// register() does two things: (1) initialize Sentry for the node and edge
// runtimes (web-pro-upgrade addendum M1); (2) on the node runtime only, start
// the boot tasks — ensureFirstPartyApps() plus, off Vercel, the recurring
// schedulers. The trending recompute (src/lib/trending.ts, phase-2 §6.2), the
// daily GitRepository metadata sync (src/lib/portfolio-sync.ts, phase-6
// §5.2), and the AI accessibility captioning job (src/lib/ai-accessibility.ts,
// phase-11 §6.3) all follow the same "never synchronously during a request"
// principle. The schedulers are node-only: the edge runtime has no long-lived
// process for a setInterval to live in.
//
// Each boot-time task below is independent — one throwing must never
// prevent the rest from starting. Previously this function was one flat
// `await` chain: an exception from any task aborted every task after it,
// including ensureFirstPartyApps() (see below), for the lifetime of that
// server instance. Logged and swallowed here instead, same "never left to
// manual follow-through" posture the individual jobs already document.
async function runStartupTask(name: string, task: () => void | Promise<void>): Promise<void> {
  try {
    await task();
  } catch (err) {
    console.error(`[instrumentation] startup task "${name}" failed`, err);
  }
}

export async function register() {
  // Sentry (web-pro-upgrade addendum M1). Initialized directly here rather
  // than via a sentry.*.config.ts import — one file, and this project builds
  // with Turbopack, which doesn't run @sentry/nextjs's webpack route-handler
  // wrapping anyway; register() + the onRequestError hook below carry error
  // capture. No-op when no DSN is configured.
  const sentryDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (sentryDsn && (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge")) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.1 : 1.0,
      sendDefaultPii: false,
      debug: process.env.SENTRY_DEBUG === "1",
    });
    if (process.env.SENTRY_DEBUG === "1") {
      console.log(`[instrumentation] Sentry initialized (runtime=${process.env.NEXT_RUNTIME}, client=${Boolean(Sentry.getClient())})`);
    }

    if (process.env.NEXT_RUNTIME === "nodejs") {
      const { registerLogSink } = await import("@/lib/logger");
      registerLogSink((level, message, error, context) => {
        if (error !== undefined) {
          Sentry.captureException(error, { level, extra: { message, ...context } });
        } else {
          Sentry.captureMessage(message, { level, extra: context });
        }
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Phase-15 spec §3.1/§9 step 1: the platform-owned account + first-party
    // DeveloperApp registrations must exist before any client can authorize
    // through them — idempotent, same "ensure the fixed catalog exists"
    // idiom as seedOAuthScopes. Run first, on its own: this gates sign-in
    // itself, unlike every scheduler below, so it can't be left stranded
    // behind another task's failure the way it previously was. (oauth/
    // authorize/page.tsx also self-heals this lazily as a second safety net.)
    await runStartupTask("ensureFirstPartyApps", async () => {
      const { ensureFirstPartyApps } = await import("@/lib/first-party-apps");
      await ensureFirstPartyApps();
    });

    // Config guard, not a scheduler — runs on Vercel too (before the early
    // return below). /api/stripe/webhook-v2 consumes Stripe's v2 "thin"
    // events (Accounts v2 capability-status changes) and refuses every
    // request unless STRIPE_THIN_WEBHOOK_SECRET is set. If Stripe is wired
    // up (STRIPE_SECRET_KEY present) but that secret isn't, the v2
    // destination was never created — and CreatorPayoutAccount rows stay
    // stuck at "onboarding" forever even after a creator finishes Stripe
    // onboarding, so no tip/membership/course payout ever unlocks. That's
    // the exact bug webhook-v2 exists to fix, so make its absence loud
    // (logger.warn → Sentry when a DSN is configured) instead of leaving it
    // to a code comment.
    await runStartupTask("stripe-webhook-config-check", async () => {
      if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_THIN_WEBHOOK_SECRET) {
        const { logger } = await import("@/lib/logger");
        logger.warn(
          "STRIPE_THIN_WEBHOOK_SECRET is not set — /api/stripe/webhook-v2 rejects all events, so Stripe Connect capability-status changes (creator payout onboarding → active) are never recorded. Create a v2 thin-event Event Destination and set the secret. See src/app/api/stripe/webhook-v2/route.ts.",
        );
      }
    });

    // web-pro-upgrade addendum M1: on Vercel the recurring jobs below run as
    // platform cron (vercel.json → /api/cron/*), NOT as in-process
    // setInterval loops — every warm Fluid Compute instance booting all 12
    // against a single-writer DB was the thundering herd behind the 503
    // bursts. Locally and on a self-hosted single `next start` process
    // (no VERCEL env), keep the in-process schedulers: no external cron to
    // rely on, and one process can carry them fine.
    if (process.env.VERCEL) {
      return;
    }

    await runStartupTask("trending", async () => {
      const { startTrendingScheduler } = await import("@/lib/trending");
      startTrendingScheduler();
    });
    await runStartupTask("portfolio-sync", async () => {
      const { startPortfolioSyncScheduler } = await import("@/lib/portfolio-sync");
      startPortfolioSyncScheduler();
    });
    await runStartupTask("ai-accessibility", async () => {
      const { startAccessibilityScheduler } = await import("@/lib/ai-accessibility");
      startAccessibilityScheduler();
    });
    await runStartupTask("ai-moderation", async () => {
      const { startModerationScheduler } = await import("@/lib/ai-moderation");
      startModerationScheduler();
    });
    // Phase-13 spec §4.5: automatic DMCA counter-notice restoration once
    // the statutory waiting period elapses, not left to manual staff
    // follow-through — same scheduler posture as the three jobs above.
    await runStartupTask("dmca-restoration", async () => {
      const { startDmcaRestorationScheduler } = await import("@/lib/dmca");
      startDmcaRestorationScheduler();
    });
    // account-settings-hardening addendum §7: sweeps deactivated accounts
    // whose 30-day grace window has passed, same "never left to manual
    // follow-through" posture as the DMCA restoration scheduler above.
    await runStartupTask("account-deletion", async () => {
      const { startAccountDeletionScheduler } = await import("@/lib/account-deletion");
      startAccountDeletionScheduler();
    });
    await runStartupTask("watermarking", async () => {
      const { startWatermarkScheduler } = await import("@/lib/watermarking");
      startWatermarkScheduler();
    });
    // Cross-post: publishes ScheduledCrossPost rows once their scheduledFor
    // arrives and retries failed CrossPostTargets on their backoff window —
    // same "never synchronously during a request" posture as the schedulers
    // above.
    await runStartupTask("social-publish", async () => {
      const { startSocialPublishScheduler } = await import("@/lib/social-publish");
      startSocialPublishScheduler();
    });
    // Connected content: the reverse direction of the scheduler above —
    // pulls each connected account's content in and caches it for the
    // public profile's "Connected content" section (social-content-sync.ts).
    await runStartupTask("social-content-sync", async () => {
      const { startSocialContentSyncScheduler } = await import("@/lib/social-content-sync");
      startSocialContentSyncScheduler();
    });
    // Direct-to-platform billing addendum: link-cap/analytics-window
    // reconciliation on PlatformSubscription lapse/resume (premium-profiles
    // addendum §5), custom-domain routing polling + takeover-hardening
    // sweeps (custom-domains addendum §5/§8/§10), and API usage-billing
    // settlement (§4) — same "never synchronously during a request" posture
    // as every scheduler above.
    await runStartupTask("platform-billing", async () => {
      const { startPlatformBillingScheduler } = await import("@/lib/platform-billing");
      startPlatformBillingScheduler();
    });
    await runStartupTask("custom-domains", async () => {
      const { startCustomDomainScheduler } = await import("@/lib/custom-domains");
      startCustomDomainScheduler();
    });
    await runStartupTask("api-usage-billing", async () => {
      const { startApiUsageBillingScheduler } = await import("@/lib/api-usage-billing");
      startApiUsageBillingScheduler();
    });
  }
}

// Next.js calls this for every uncaught error in a Server Component, Route
// Handler, or Server Action — the capture path the web app never had (the
// mobile app has had Sentry since its M8). A no-op when Sentry has no DSN.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
