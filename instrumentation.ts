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
    const { startWatermarkScheduler } = await import("@/lib/watermarking");
    startWatermarkScheduler();
  }
}
