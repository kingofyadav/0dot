// Runs once when a new Next.js server instance starts, before it serves
// requests (see node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/instrumentation.md). Used here to start the trending
// score background scheduler (src/lib/trending.ts) — phase-2 spec §6.2
// requires recompute to happen periodically, not synchronously inside a
// request — and, per phase-6 spec §5.2, the daily GitRepository public-
// metadata sync (src/lib/portfolio-sync.ts), same reasoning. Phase-11 §6.3
// adds the AI accessibility captioning job (src/lib/ai-accessibility.ts),
// same "never synchronously during a request" principle applied to alt-text
// generation. Node-runtime only: the edge runtime has no long-lived process
// for a setInterval to live in, and this app doesn't deploy there.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTrendingScheduler } = await import("@/lib/trending");
    startTrendingScheduler();
    const { startPortfolioSyncScheduler } = await import("@/lib/portfolio-sync");
    startPortfolioSyncScheduler();
    const { startAccessibilityScheduler } = await import("@/lib/ai-accessibility");
    startAccessibilityScheduler();
    const { startModerationScheduler } = await import("@/lib/ai-moderation");
    startModerationScheduler();
    // Phase-13 spec §4.5: automatic DMCA counter-notice restoration once
    // the statutory waiting period elapses, not left to manual staff
    // follow-through — same scheduler posture as the three jobs above.
    const { startDmcaRestorationScheduler } = await import("@/lib/dmca");
    startDmcaRestorationScheduler();
    // account-settings-hardening addendum §7: sweeps deactivated accounts
    // whose 30-day grace window has passed, same "never left to manual
    // follow-through" posture as the DMCA restoration scheduler above.
    const { startAccountDeletionScheduler } = await import("@/lib/account-deletion");
    startAccountDeletionScheduler();
    const { startWatermarkScheduler } = await import("@/lib/watermarking");
    startWatermarkScheduler();
    // Phase-15 spec §3.1/§9 step 1: the platform-owned account + first-party
    // DeveloperApp registrations must exist before any client can authorize
    // through them — idempotent, same "ensure the fixed catalog exists"
    // idiom as seedOAuthScopes, run once at boot rather than lazily from a
    // page render since nothing here is user-specific.
    const { ensureFirstPartyApps } = await import("@/lib/first-party-apps");
    await ensureFirstPartyApps();
    // Cross-post: publishes ScheduledCrossPost rows once their scheduledFor
    // arrives and retries failed CrossPostTargets on their backoff window —
    // same "never synchronously during a request" posture as the schedulers
    // above.
    const { startSocialPublishScheduler } = await import("@/lib/social-publish");
    startSocialPublishScheduler();
    // Connected content: the reverse direction of the scheduler above —
    // pulls each connected account's content in and caches it for the
    // public profile's "Connected content" section (social-content-sync.ts).
    const { startSocialContentSyncScheduler } = await import("@/lib/social-content-sync");
    startSocialContentSyncScheduler();
    // Direct-to-platform billing addendum: link-cap/analytics-window
    // reconciliation on PlatformSubscription lapse/resume (premium-profiles
    // addendum §5), custom-domain routing polling + takeover-hardening
    // sweeps (custom-domains addendum §5/§8/§10), and API usage-billing
    // settlement (§4) — same "never synchronously during a request" posture
    // as every scheduler above.
    const { startPlatformBillingScheduler } = await import("@/lib/platform-billing");
    startPlatformBillingScheduler();
    const { startCustomDomainScheduler } = await import("@/lib/custom-domains");
    startCustomDomainScheduler();
    const { startApiUsageBillingScheduler } = await import("@/lib/api-usage-billing");
    startApiUsageBillingScheduler();
  }
}
