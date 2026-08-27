import { assertCronAuthorized, runCronBucket } from "@/lib/cron";
import { syncGitRepositoryMetadata } from "@/lib/portfolio-sync";
import { syncExternalContent } from "@/lib/social-content-sync";
import { runApiUsageBillingSweepOnce } from "@/lib/api-usage-billing";

// Daily jobs. Scheduled at 03:23 UTC in vercel.json (web-pro-upgrade
// addendum M1). Formerly setInterval loops of 24 h (portfolio/content sync)
// and 6 h (api-usage settlement — over-frequent given month-long billing
// periods) in instrumentation.ts.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  return runCronBucket("daily", {
    "portfolio-sync": syncGitRepositoryMetadata,
    "social-content-sync": syncExternalContent,
    "api-usage-billing": runApiUsageBillingSweepOnce,
  });
}
