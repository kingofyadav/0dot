import { assertCronAuthorized, runCronBucket } from "@/lib/cron";
import { runTrendingRecomputeOnce } from "@/lib/trending";
import { runModerationJobsOnce } from "@/lib/ai-moderation";
import { runAccessibilityJobsOnce } from "@/lib/ai-accessibility";
import { runWatermarkJobsOnce } from "@/lib/watermarking";
import { publishDueCrossPosts } from "@/lib/social-publish";

// Responsiveness-sensitive recurring jobs. Triggered every 5 min by
// .github/workflows/cron.yml (Hobby plan can't do sub-daily Vercel crons —
// web-pro-upgrade addendum M1). Formerly setInterval loops of 1–5 min in
// instrumentation.ts.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  return runCronBucket("frequent", {
    trending: runTrendingRecomputeOnce,
    moderation: runModerationJobsOnce,
    accessibility: runAccessibilityJobsOnce,
    watermarking: runWatermarkJobsOnce,
    "social-publish": () => publishDueCrossPosts(new Date()),
  });
}
