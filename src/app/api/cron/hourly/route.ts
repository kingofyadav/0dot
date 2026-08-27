import { assertCronAuthorized, runCronBucket } from "@/lib/cron";
import { runDmcaRestorationOnce } from "@/lib/dmca";
import { runAccountDeletionSweepOnce } from "@/lib/account-deletion";
import { runPlatformBillingSweepOnce } from "@/lib/platform-billing";
import { runCustomDomainSweepOnce } from "@/lib/custom-domains";

// Hourly-ish maintenance sweeps. Triggered at :17 past the hour by
// .github/workflows/cron.yml (Hobby plan can't do sub-daily Vercel crons —
// web-pro-upgrade addendum M1). Formerly setInterval loops of
// 15–60 min in instrumentation.ts. Note platform-billing's original loop
// was 15 min — folded to hourly here; a lapsed link cap staying visible for
// up to an hour is an acceptable tradeoff for not running a fourth cron.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request): Promise<Response> {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  return runCronBucket("hourly", {
    "dmca-restoration": runDmcaRestorationOnce,
    "account-deletion": runAccountDeletionSweepOnce,
    "platform-billing": runPlatformBillingSweepOnce,
    "custom-domains": runCustomDomainSweepOnce,
  });
}
