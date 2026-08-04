// Runs once when a new Next.js server instance starts, before it serves
// requests (see node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/instrumentation.md). Used here to start the trending
// score background scheduler (src/lib/trending.ts) — phase-2 spec §6.2
// requires recompute to happen periodically, not synchronously inside a
// request — and, per phase-6 spec §5.2, the daily GitRepository public-
// metadata sync (src/lib/portfolio-sync.ts), same reasoning. Node-runtime
// only: the edge runtime has no long-lived process for a setInterval to
// live in, and this app doesn't deploy there.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTrendingScheduler } = await import("@/lib/trending");
    startTrendingScheduler();
    const { startPortfolioSyncScheduler } = await import("@/lib/portfolio-sync");
    startPortfolioSyncScheduler();
  }
}
