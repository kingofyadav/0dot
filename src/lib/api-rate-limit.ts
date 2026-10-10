import "server-only";
import { db } from "@/lib/db";

// spec §5.3: aggregated per-hour counters per DeveloperApp, not a
// per-request log — windowStart is always truncated to the top of the
// hour so concurrent requests within the same hour race-safely converge on
// one row (upsert + increment) instead of creating duplicates.
function currentHourWindow(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
}

// Trust tiering, same "trust level gates capability" pattern as business
// verification (Phase 4) and marketplace-listing review (Phase 9 §4.5): an
// app that has never cleared the high-sensitivity scope review gate (§4.3)
// is treated as unreviewed and gets the lower default limit. Exact numbers
// are an infra-tuning detail per spec §13, not fixed here — these are a
// reasonable starting default.
const UNREVIEWED_LIMIT_PER_HOUR = 100;
const REVIEWED_LIMIT_PER_HOUR = 2000;

// trust:read sits at "high" sensitivity for a different reason than every
// other scope in that bucket (oauth.ts) — it discloses moderation standing,
// not an account-mutating/financial/messaging capability — so admin review
// of it alone isn't the "this app can be trusted with real stakes" signal
// the elevated throughput tier is meant to reward. Without this exclusion,
// an app could clear the (comparatively easy) trust:read review and get the
// same 20x rate-limit bump intended for apps reviewed for payments:write/
// messages:write/account:write.
const HIGH_SENSITIVITY_SCOPES_EXCLUDED_FROM_REVIEWED_TIER = ["trust:read"];

// billing addendum §4.2's acceptance criterion: a free-plan app exceeding
// its included usage is rate-limited (the tiering above, unchanged) rather
// than silently over-billed. pay_as_you_go/committed apps opted into being
// billed for usage instead — the hard cap no longer applies to them, and
// api-usage-billing.ts's periodic settlement is what prices what they used,
// not this function.
export async function checkApiRateLimit(appId: string): Promise<{ allowed: boolean; limit: number; remaining: number }> {
  const [app, hasApprovedHighSensitivityScope] = await Promise.all([
    db.developerApp.findUnique({ where: { id: appId }, select: { billingPlan: true } }),
    db.developerAppScope.findFirst({
      where: {
        appId,
        status: "approved",
        scope: { sensitivity: "high" },
        scopeKey: { notIn: HIGH_SENSITIVITY_SCOPES_EXCLUDED_FROM_REVIEWED_TIER },
      },
      select: { appId: true },
    }),
  ]);
  const limit = hasApprovedHighSensitivityScope ? REVIEWED_LIMIT_PER_HOUR : UNREVIEWED_LIMIT_PER_HOUR;
  const windowStart = currentHourWindow();

  const counter = await db.apiUsageCounter.upsert({
    where: { appId_windowStart: { appId, windowStart } },
    create: { appId, windowStart, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
  });

  if (app?.billingPlan === "pay_as_you_go" || app?.billingPlan === "committed") {
    return { allowed: true, limit, remaining: Math.max(0, limit - counter.requestCount) };
  }
  return { allowed: counter.requestCount <= limit, limit, remaining: Math.max(0, limit - counter.requestCount) };
}
