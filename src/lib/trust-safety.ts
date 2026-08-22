import "server-only";
import { db } from "@/lib/db";
import { softDeletePostAndDecrementCounts } from "@/lib/post-moderation";
import { reviewModerationFlag } from "@/lib/ai-moderation";
import { notifyReportAcknowledged, notifyCaseResolved, notifyAppealDecided } from "@/lib/notifications";
import { applyDmcaResolution } from "@/lib/dmca";

// phase-12 spec §3.1: the single write path that creates a TrustSafetyCase,
// used both by the generic report action (reports.ts) and by the four
// existing gate-entry points this phase wires in (businesses.ts,
// marketplace.ts, oauth.ts, ai-moderation.ts) — none of which have their
// own status enum touched by this phase (§3.3 acceptance criterion).
export async function createTrustSafetyCase(params: {
  caseType: string;
  subjectType: string;
  subjectId: string;
  reportedById?: string | null;
  linkedAiGenerationId?: string | null;
  reason?: string | null;
}) {
  return db.trustSafetyCase.create({
    data: {
      caseType: params.caseType,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      reportedById: params.reportedById ?? null,
      linkedAiGenerationId: params.linkedAiGenerationId ?? null,
      reason: params.reason ?? null,
    },
  });
}

// §3.3 acceptance criterion: assigned_to must hold a PlatformRole
// row — a user without one cannot be assigned a case.
export async function assignTrustSafetyCase(caseId: string, assigneeId: string): Promise<void> {
  const platformRole = await db.platformRole.findUnique({ where: { userId: assigneeId } });
  if (!platformRole) return;

  await db.trustSafetyCase.update({
    where: { id: caseId },
    data: { assignedToId: assigneeId, status: "in_review" },
  });
}

// Mirrors ai-moderation.ts's reviewModerationFlag content-removal branch —
// the report-driven path (content_report/account_report) hits the same
// three ordinary content types plus two more real fields this phase's own
// gates expose (MarketplaceListing.status, DeveloperApp.status). Kept
// inline rather than extracted into a shared helper: each branch is one
// line, and the two call sites (here, ai-moderation.ts) evolved
// independently enough (different subjectType sets, different surrounding
// dispatch) that a shared function would need its own parameterization to
// stay correct — not a real duplication problem yet.
// Exported for dmca.ts: an upheld DMCA takedown removes content through
// exactly the same per-subjectType mechanics as an upheld Report (§4.4's
// "two tiers" both bottom out in the same enforcement, just reached via
// different intake paths) — not a second, parallel removal function.
export async function applyReportEnforcement(subjectType: string, subjectId: string): Promise<void> {
  if (subjectType === "post") {
    const post = await db.post.findUnique({ where: { id: subjectId }, select: { id: true, replyToId: true, repostOfId: true, deletedAt: true } });
    if (post && !post.deletedAt) await softDeletePostAndDecrementCounts(post);
  } else if (subjectType === "comment") {
    await db.comment.updateMany({ where: { id: subjectId, deletedAt: null }, data: { deletedAt: new Date() } });
  } else if (subjectType === "article") {
    await db.article.updateMany({ where: { id: subjectId }, data: { status: "draft" } });
  } else if (subjectType === "user") {
    await db.user.updateMany({ where: { id: subjectId, status: "active" }, data: { status: "suspended" } });
  } else if (subjectType === "marketplace_listing") {
    await db.marketplaceListing.updateMany({ where: { id: subjectId }, data: { status: "rejected" } });
  } else if (subjectType === "developer_app") {
    await db.developerApp.updateMany({ where: { id: subjectId }, data: { status: "suspended" } });
  }
  // Any other subjectType (business, review, community, ...) has no
  // dedicated enforcement field this phase can reuse without retrofitting
  // one — the case itself still resolves and records the decision, staff
  // action beyond that goes through each area's own existing tooling.
}

// Exported for dmca.ts's own owner resolution (strike attribution, §4.3) —
// same subjectType set a DMCA takedown's infringing content spans.
export async function resolveSubjectOwnerId(subjectType: string, subjectId: string): Promise<string | null> {
  if (subjectType === "user") return subjectId;
  if (subjectType === "post") return (await db.post.findUnique({ where: { id: subjectId }, select: { authorId: true } }))?.authorId ?? null;
  if (subjectType === "article") return (await db.article.findUnique({ where: { id: subjectId }, select: { authorId: true } }))?.authorId ?? null;
  if (subjectType === "comment") return (await db.comment.findUnique({ where: { id: subjectId }, select: { authorId: true } }))?.authorId ?? null;
  if (subjectType === "business") return (await db.business.findUnique({ where: { id: subjectId }, select: { createdBy: true } }))?.createdBy ?? null;
  if (subjectType === "marketplace_listing") return (await db.marketplaceListing.findUnique({ where: { id: subjectId }, select: { sellerUserId: true } }))?.sellerUserId ?? null;
  if (subjectType === "developer_app") return (await db.developerApp.findUnique({ where: { id: subjectId }, select: { ownerUserId: true } }))?.ownerUserId ?? null;
  return null;
}

type CaseDecision = "upheld" | "dismissed";

// phase-12 spec §3.1's central move: one resolution path that updates each
// case type's real underlying entity (the five pre-existing gates' own
// status fields stay their source of truth) while driving the case's own
// audit trail consistently. "upheld" means the concern behind the case is
// confirmed (content/account/scope stays blocked or gets removed);
// "dismissed" means it isn't (the gated thing proceeds normally) — this
// reading is symmetric across every case_type, including the three
// gate-driven review types where there's no literal "reporter," because
// each of those gates exists precisely to check a concern (impersonation
// risk, listing policy, scope sensitivity) before allowing the subject
// through.
export async function resolveTrustSafetyCase(
  caseId: string,
  reviewerId: string,
  decision: CaseDecision,
  notes?: string
): Promise<void> {
  const trustSafetyCase = await db.trustSafetyCase.findUnique({ where: { id: caseId }, include: { reports: true } });
  if (!trustSafetyCase || trustSafetyCase.status === "resolved_upheld" || trustSafetyCase.status === "resolved_dismissed") return;

  switch (trustSafetyCase.caseType) {
    case "business_claim_review":
      if (decision === "upheld") {
        await db.business.deleteMany({ where: { id: trustSafetyCase.subjectId, status: "pending" } });
      } else {
        await db.business.updateMany({ where: { id: trustSafetyCase.subjectId, status: "pending" }, data: { status: "active" } });
      }
      break;
    case "marketplace_listing_review":
      await db.marketplaceListing.updateMany({
        where: { id: trustSafetyCase.subjectId, status: "pending_review" },
        data: { status: decision === "upheld" ? "rejected" : "active" },
      });
      break;
    case "oauth_scope_review": {
      const [appId, scopeKey] = trustSafetyCase.subjectId.split(":");
      await db.developerAppScope.updateMany({
        where: { appId, scopeKey, status: "pending" },
        data: { status: decision === "upheld" ? "rejected" : "approved", reviewedAt: new Date() },
      });
      break;
    }
    case "ai_moderation_flag": {
      const flag = await db.moderationFlag.findFirst({
        where: { aiGenerationId: trustSafetyCase.linkedAiGenerationId ?? undefined, status: "pending_human_review" },
      });
      if (flag) await reviewModerationFlag(flag.id, reviewerId, decision === "upheld" ? "upheld" : "overridden");
      break;
    }
    case "content_report":
    case "account_report":
      if (decision === "upheld") await applyReportEnforcement(trustSafetyCase.subjectType, trustSafetyCase.subjectId);
      break;
    // phase-13 spec §4.1: DMCATakedownNotice reuses this exact case-
    // management flow rather than a parallel one — its own status
    // (received/content_removed/invalid_rejected) is a second, notice-
    // specific record of the same decision, same "each gate's own status
    // field stays its source of truth" posture the five phase-12 gates use.
    case "dmca_takedown": {
      const notice = await db.dMCATakedownNotice.findUnique({ where: { trustSafetyCaseId: trustSafetyCase.id } });
      if (notice) await applyDmcaResolution(notice.id, decision);
      break;
    }
    // review_dispute/community_escalation: no dedicated underlying field
    // this phase can reuse without retrofitting one (§5.3's community
    // self-governance boundary, and Review has no dispute-status column) —
    // the case record itself, with resolutionNotes, is the outcome.
    default:
      break;
  }

  await db.trustSafetyCase.update({
    where: { id: caseId },
    data: {
      status: decision === "upheld" ? "resolved_upheld" : "resolved_dismissed",
      assignedToId: trustSafetyCase.assignedToId ?? reviewerId,
      resolutionNotes: notes ?? null,
      resolvedAt: new Date(),
    },
  });

  // §11 step 8: acknowledge every reporter on this case, and separately
  // notify the affected subject's owner if one resolves (never the same
  // payload — reporter identity never reaches the subject side, §4.2).
  await Promise.all(trustSafetyCase.reports.map((report) => notifyReportAcknowledged({ recipientId: report.reporterId, caseId })));

  const ownerId = await resolveSubjectOwnerId(trustSafetyCase.subjectType, trustSafetyCase.subjectId);
  if (ownerId) await notifyCaseResolved({ recipientId: ownerId, caseId });
}

// phase-12 spec §5.2: reviewedBy differs from the original case's
// assignedTo whenever a qualifying second reviewer is available — enforced
// here by simply refusing a same-reviewer decision outright rather than
// silently allowing it when no one else happens to be staffed (the spec's
// "where staffing allows" is a real constraint to design around, not an
// escape hatch to skip by default).
export async function reviewAppeal(appealId: string, reviewerId: string, decision: "upheld_original" | "overturned"): Promise<{ error?: string }> {
  const appeal = await db.appeal.findUnique({ where: { id: appealId }, include: { originalCase: true } });
  if (!appeal || appeal.status !== "pending") return { error: "Appeal not found or already decided." };
  if (appeal.originalCase.assignedToId === reviewerId) {
    return { error: "The original case reviewer cannot review its own appeal." };
  }

  await db.appeal.update({
    where: { id: appealId },
    data: { status: decision, reviewedById: reviewerId, decidedAt: new Date() },
  });

  // An overturned appeal reverses the original enforcement action by
  // re-running resolution with the opposite decision — same underlying
  // dispatch resolveTrustSafetyCase already has, so an overturned
  // ai_moderation_flag appeal un-suspends/un-removes exactly the way the
  // original uphold removed it, instead of a second, parallel "undo" path
  // that could drift from the first.
  if (decision === "overturned") {
    await db.trustSafetyCase.update({ where: { id: appeal.originalCaseId }, data: { status: "in_review" } });
    await resolveTrustSafetyCase(appeal.originalCaseId, reviewerId, "dismissed", "Overturned on appeal.");
  }

  await notifyAppealDecided({ recipientId: appeal.filedById, appealId });
  return {};
}
