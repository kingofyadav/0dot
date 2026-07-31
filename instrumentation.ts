// Runs once when a new Next.js server instance starts, before it serves
// requests (see node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/instrumentation.md). Used here to start the trending
// score background scheduler (src/lib/trending.ts) — phase-2 spec §6.2
// requires recompute to happen periodically, not synchronously inside a
// request. Node-runtime only: the edge runtime has no long-lived process
// for a setInterval to live in, and this app doesn't deploy there.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTrendingScheduler } = await import("@/lib/trending");
    startTrendingScheduler();
  }
}
