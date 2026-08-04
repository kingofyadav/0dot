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

export async function checkApiRateLimit(appId: string): Promise<{ allowed: boolean; limit: number; remaining: number }> {
  const hasApprovedHighSensitivityScope = await db.developerAppScope.findFirst({
    where: { appId, status: "approved", scope: { sensitivity: "high" } },
    select: { appId: true },
  });
  const limit = hasApprovedHighSensitivityScope ? REVIEWED_LIMIT_PER_HOUR : UNREVIEWED_LIMIT_PER_HOUR;
  const windowStart = currentHourWindow();

  const counter = await db.apiUsageCounter.upsert({
    where: { appId_windowStart: { appId, windowStart } },
    create: { appId, windowStart, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
  });

  return { allowed: counter.requestCount <= limit, limit, remaining: Math.max(0, limit - counter.requestCount) };
}
