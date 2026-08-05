import "server-only";
import { db } from "@/lib/db";
import { createTrustSafetyCase, resolveSubjectOwnerId, applyReportEnforcement } from "@/lib/trust-safety";
import {
  notifyDmcaNoticeReceived,
  notifyDmcaContentRemoved,
  notifyDmcaCounterNoticeReceived,
  notifyDmcaContentRestored,
  notifyDmcaStrikeIssued,
} from "@/lib/notifications";

// phase-13 spec §4.3: a safe-harbor condition, not a discretionary T&S
// nicety — exact threshold is legal/policy's to set (§11 open question),
// this is an engineering default until that sign-off lands, same
// "flagged, not invented" posture the spec asks for.
const DEFAULT_REPEAT_INFRINGER_STRIKE_THRESHOLD = 3;

// phase-13 spec §9: this phase's own copyright-notice-regime lookup is the
// proving consumer of JurisdictionRule (§9.2's acceptance criterion).
// PLATFORM_DEFAULT_REGION stands in for real per-user jurisdiction
// detection, which nothing in this codebase computes today (User has no
// country/region field) — every notice resolves against the platform's
// primary operating jurisdiction until that exists.
const PLATFORM_DEFAULT_REGION = "US";
const DEFAULT_US_DMCA_WAITING_PERIOD_DAYS = 10; // 17 U.S.C. § 512(g)(2)(C) floor; legal to confirm exact count (§11)

type CopyrightNoticeRegimeParams = { regime: string; waitingPeriodDays: number };

// Lazily seeds the one regime this phase actually ships (§4.1's "DMCA
// first, fully statute-compliant") rather than a separate seed script —
// JurisdictionRule "does not need to be exhaustively populated at launch"
// (§9.1), it needs to exist as a real, queried extension point.
async function getCopyrightNoticeRegime(region: string): Promise<CopyrightNoticeRegimeParams> {
  const existing = await db.jurisdictionRule.findUnique({
    where: { region_ruleType: { region, ruleType: "copyright_notice_regime" } },
  });
  if (existing) return JSON.parse(existing.parametersJson) as CopyrightNoticeRegimeParams;

  const defaults: CopyrightNoticeRegimeParams = { regime: "us_dmca", waitingPeriodDays: DEFAULT_US_DMCA_WAITING_PERIOD_DAYS };
  await db.jurisdictionRule.create({
    data: { region, ruleType: "copyright_notice_regime", parametersJson: JSON.stringify(defaults) },
  });
  return defaults;
}

// phase-13 spec §4.4: the heavier, statute-shaped formal notice — distinct
// from Report(category=ip_infringement)'s casual flag. Always creates
// exactly one TrustSafetyCase, reusing Phase 12's queue directly (§4.1)
// rather than a parallel review surface.
export async function fileDmcaTakedownNotice(params: {
  complainantName: string;
  complainantContact: string;
  copyrightedWorkDescription: string;
  infringingContentSubjectType: string;
  infringingContentSubjectId: string;
  goodFaithStatementAccepted: boolean;
  accuracyPerjuryStatementAccepted: boolean;
  signature: string;
}): Promise<{ error?: string } & { noticeId?: string }> {
  if (!params.goodFaithStatementAccepted || !params.accuracyPerjuryStatementAccepted) {
    return { error: "Both statutory attestations are required to file a DMCA notice." };
  }
  if (!params.complainantName.trim() || !params.complainantContact.trim() || !params.signature.trim()) {
    return { error: "Complainant name, contact, and signature are required." };
  }
  if (!params.copyrightedWorkDescription.trim()) {
    return { error: "Describe the copyrighted work being infringed." };
  }

  const trustSafetyCase = await createTrustSafetyCase({
    caseType: "dmca_takedown",
    subjectType: params.infringingContentSubjectType,
    subjectId: params.infringingContentSubjectId,
    reason: "dmca_takedown",
  });

  const notice = await db.dMCATakedownNotice.create({
    data: {
      trustSafetyCaseId: trustSafetyCase.id,
      complainantName: params.complainantName.trim(),
      complainantContact: params.complainantContact.trim(),
      copyrightedWorkDescription: params.copyrightedWorkDescription.trim(),
      infringingContentSubjectType: params.infringingContentSubjectType,
      infringingContentSubjectId: params.infringingContentSubjectId,
      goodFaithStatementAccepted: params.goodFaithStatementAccepted,
      accuracyPerjuryStatementAccepted: params.accuracyPerjuryStatementAccepted,
      signature: params.signature.trim(),
    },
  });

  const ownerId = await resolveSubjectOwnerId(params.infringingContentSubjectType, params.infringingContentSubjectId);
  if (ownerId) await notifyDmcaNoticeReceived({ recipientId: ownerId, noticeId: notice.id });

  return { noticeId: notice.id };
}

// phase-13 spec §4.3: the repeat-infringer termination policy safe harbor
// is conditioned on — actually enforced (account suspension past the
// threshold), not merely tracked. Called from resolveTrustSafetyCase's
// dmca_takedown branch, once per valid, unrebutted notice upheld.
export async function issueDmcaStrike(userId: string, noticeId: string): Promise<void> {
  const user = await db.user.update({
    where: { id: userId },
    data: { dmcaStrikeCount: { increment: 1 } },
    select: { dmcaStrikeCount: true, status: true },
  });
  await notifyDmcaStrikeIssued({ recipientId: userId, noticeId });

  if (user.dmcaStrikeCount >= DEFAULT_REPEAT_INFRINGER_STRIKE_THRESHOLD && user.status === "active") {
    await db.user.update({ where: { id: userId }, data: { status: "suspended" } });
  }
}

// phase-13 spec §4.2: the alleged infringer files this against a notice
// that already resulted in content removal — subjectUserId must actually
// own the removed content, so a counter-notice can't be filed by anyone
// else. restorationEligibleAt is computed from JurisdictionRule (§9),
// proving the extension point works for the case that motivated it.
export async function fileDmcaCounterNotice(params: {
  originalNoticeId: string;
  subjectUserId: string;
  goodFaithStatementAccepted: boolean;
  consentToJurisdiction: boolean;
  signature: string;
}): Promise<{ error?: string }> {
  if (!params.goodFaithStatementAccepted || !params.consentToJurisdiction) {
    return { error: "Both statutory statements are required to file a counter-notice." };
  }
  if (!params.signature.trim()) return { error: "Signature is required." };

  const notice = await db.dMCATakedownNotice.findUnique({
    where: { id: params.originalNoticeId },
    include: { counterNotice: true },
  });
  if (!notice || notice.status !== "content_removed") {
    return { error: "This notice isn't eligible for a counter-notice." };
  }
  if (notice.counterNotice) return { error: "A counter-notice has already been filed for this notice." };

  const ownerId = await resolveSubjectOwnerId(notice.infringingContentSubjectType, notice.infringingContentSubjectId);
  if (ownerId !== params.subjectUserId) {
    return { error: "Only the owner of the removed content can file a counter-notice." };
  }

  const regime = await getCopyrightNoticeRegime(PLATFORM_DEFAULT_REGION);
  const submittedAt = new Date();
  const restorationEligibleAt = new Date(submittedAt.getTime() + regime.waitingPeriodDays * 24 * 60 * 60 * 1000);

  const counterNotice = await db.dMCACounterNotice.create({
    data: {
      originalNoticeId: notice.id,
      subjectUserId: params.subjectUserId,
      goodFaithStatementAccepted: params.goodFaithStatementAccepted,
      consentToJurisdiction: params.consentToJurisdiction,
      signature: params.signature.trim(),
      submittedAt,
      restorationEligibleAt,
    },
  });

  await notifyDmcaCounterNoticeReceived({ recipientId: params.subjectUserId, counterNoticeId: counterNotice.id });
  return {};
}

// Reverses applyReportEnforcement's removal for exactly the subjectTypes a
// DMCA takedown can target — the counterpart action a restoration needs,
// same paired-function shape as trust-safety.ts's own
// applyReportEnforcement/resolveTrustSafetyCase split.
async function restoreContent(subjectType: string, subjectId: string): Promise<void> {
  if (subjectType === "post") {
    await db.post.updateMany({ where: { id: subjectId }, data: { deletedAt: null } });
  } else if (subjectType === "comment") {
    await db.comment.updateMany({ where: { id: subjectId }, data: { deletedAt: null } });
  } else if (subjectType === "article") {
    await db.article.updateMany({ where: { id: subjectId, status: "draft" }, data: { status: "published" } });
  } else if (subjectType === "marketplace_listing") {
    await db.marketplaceListing.updateMany({ where: { id: subjectId, status: "rejected" }, data: { status: "active" } });
  }
}

// phase-13 spec §4.5's literal acceptance criterion: restoration_eligible_at
// triggers automatic restoration, not manual staff follow-through — same
// module-scope setInterval scheduler posture as trending.ts/
// ai-moderation.ts, guarded on globalThis against dev-mode re-registration.
async function restoreEligibleCounterNotices(): Promise<void> {
  const eligible = await db.dMCACounterNotice.findMany({
    where: { status: "received", restorationEligibleAt: { lte: new Date() } },
    include: { originalNotice: true },
  });

  for (const counterNotice of eligible) {
    await restoreContent(
      counterNotice.originalNotice.infringingContentSubjectType,
      counterNotice.originalNotice.infringingContentSubjectId
    );
    await db.dMCACounterNotice.update({ where: { id: counterNotice.id }, data: { status: "content_restored" } });
    await notifyDmcaContentRestored({ recipientId: counterNotice.subjectUserId, counterNoticeId: counterNotice.id });
  }
}

const RESTORATION_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly is plenty for a multi-day statutory waiting period

const globalForDmca = globalThis as unknown as { dmcaRestorationSchedulerStarted?: boolean };

export function startDmcaRestorationScheduler(): void {
  if (globalForDmca.dmcaRestorationSchedulerStarted) return;
  globalForDmca.dmcaRestorationSchedulerStarted = true;

  const tick = () => void restoreEligibleCounterNotices();
  tick();
  setInterval(tick, RESTORATION_CHECK_INTERVAL_MS);
}

// Called from trust-safety.ts's resolveTrustSafetyCase for the
// dmca_takedown case type — upheld removes content + issues a strike;
// dismissed marks the notice invalid with no enforcement.
export async function applyDmcaResolution(noticeId: string, decision: "upheld" | "dismissed"): Promise<void> {
  const notice = await db.dMCATakedownNotice.findUnique({ where: { id: noticeId } });
  if (!notice || notice.status !== "received") return;

  if (decision === "upheld") {
    await applyReportEnforcement(notice.infringingContentSubjectType, notice.infringingContentSubjectId);
    await db.dMCATakedownNotice.update({ where: { id: notice.id }, data: { status: "content_removed" } });

    const ownerId = await resolveSubjectOwnerId(notice.infringingContentSubjectType, notice.infringingContentSubjectId);
    if (ownerId) {
      await notifyDmcaContentRemoved({ recipientId: ownerId, noticeId: notice.id });
      await issueDmcaStrike(ownerId, notice.id);
    }
  } else {
    await db.dMCATakedownNotice.update({ where: { id: notice.id }, data: { status: "invalid_rejected" } });
  }
}
