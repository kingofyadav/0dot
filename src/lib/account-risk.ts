import "server-only";
import { db } from "@/lib/db";
import { createTrustSafetyCase } from "@/lib/trust-safety";

// phase-12 spec §6.1: account/behavioral-level signal, distinct from
// phase-11's ModerationFlag which classifies individual content. Every
// detector below writes exactly one AccountRiskSignal row regardless of
// what (if anything) it triggers — the row is the audit record, not a
// side effect of the response.
async function recordAccountRiskSignal(userId: string, signalType: string, score: number): Promise<void> {
  await db.accountRiskSignal.create({ data: { userId, signalType, score } });
}

// spec §6.2's reversible/low-harm tier: a very-high-confidence, well-
// understood pattern (mass-follow in a short window) gets an automated
// response with no TrustSafetyCase and no human pre-approval — but the
// "automated response" here is simply the rate limit follow.ts already
// enforces (checkFollowRateLimit), which is itself trivially reversible
// (it lifts on its own once the window rolls over). This function only
// adds the audit trail phase-11's AIGeneration-reuse precedent (§6.4)
// established for ML-derived signals doesn't apply to here (no model
// involved, so aiGenerationId stays null) — a plain rule-based detector.
export async function recordFollowVelocityAnomaly(userId: string): Promise<void> {
  await recordAccountRiskSignal(userId, "velocity_anomaly", 1.0);
}

// spec §6.2's irreversible/high-harm tier: duplicate-content posting is a
// real spam signal but not so unambiguous that a permanent, irreversible
// action (content removal, suspension) should ever be automated straight
// from it — this always routes through a TrustSafetyCase for human
// decision, same "no automated shortcut" rule §4.1 already set for
// ordinary content categories. account_report (not a new case_type) since
// this is functionally a system-filed report on the account, just with no
// human reporter behind it (reportedById stays null).
export async function checkDuplicatePostPattern(userId: string, body: string): Promise<void> {
  if (body.length < 10) return; // too short for a meaningful duplicate signal (e.g. "lol")

  const recentDuplicates = await db.post.count({
    where: { authorId: userId, body, deletedAt: null, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
  });
  if (recentDuplicates < 3) return;

  await recordAccountRiskSignal(userId, "duplicate_content", Math.min(1, recentDuplicates / 5));

  const alreadyFlagged = await db.trustSafetyCase.findFirst({
    where: { caseType: "account_report", subjectType: "user", subjectId: userId, status: { in: ["open", "in_review", "escalated"] } },
  });
  if (alreadyFlagged) return; // one open case per account at a time, not one per duplicate post

  await createTrustSafetyCase({
    caseType: "account_report",
    subjectType: "user",
    subjectId: userId,
    reason: "duplicate_content",
  });
}
