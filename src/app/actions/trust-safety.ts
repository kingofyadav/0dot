"use server";

import { revalidatePath } from "next/cache";
import { requireTrustSafetyStaff, requireVerifiedUser } from "@/lib/auth-guards";
import { resolveTrustSafetyCase, reviewAppeal, resolveSubjectOwnerId } from "@/lib/trust-safety";
import { db } from "@/lib/db";

// phase-12 spec §11 step 3: the single resolve action behind the unified
// /admin/trust-safety queue — every one of the five wired-in gates plus
// the report-driven case types goes through this one form action instead
// of five separate approve/reject action files (the old
// admin-businesses.ts/admin-marketplace.ts/admin-developer.ts/
// admin-moderation.ts, retired by this phase).
export async function resolveCaseAction(formData: FormData): Promise<void> {
  const { user } = await requireTrustSafetyStaff("reviewer");
  const caseId = String(formData.get("caseId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  if (!caseId || (decision !== "upheld" && decision !== "dismissed")) return;

  await resolveTrustSafetyCase(caseId, user.id, decision, notes);
  revalidatePath("/admin/trust-safety");
}

// §5.2: appeal review requires senior_reviewer+ (auth-guards.ts) and a
// different reviewer than the original case's assignee (enforced inside
// reviewAppeal itself, not just here).
export async function reviewAppealAction(formData: FormData): Promise<void> {
  const { user } = await requireTrustSafetyStaff("senior_reviewer");
  const appealId = String(formData.get("appealId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!appealId || (decision !== "upheld_original" && decision !== "overturned")) return;

  await reviewAppeal(appealId, user.id, decision);
  revalidatePath("/admin/trust-safety/appeals");
}

// phase-12 spec §5: filed by the affected party against a resolved,
// adverse case — restricted to platform-level enforcement, not routine
// community moderation (§5.3's scope boundary is enforced by
// community_escalation being its own case_type communities can't file a
// plain Appeal against directly).
export async function fileAppealAction(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const caseId = String(formData.get("caseId") ?? "");
  const statement = String(formData.get("statement") ?? "").trim();
  if (statement.length < 1 || statement.length > 2000) return;

  const trustSafetyCase = await db.trustSafetyCase.findUnique({ where: { id: caseId } });
  if (!trustSafetyCase) return;
  if (trustSafetyCase.status !== "resolved_upheld" && trustSafetyCase.status !== "resolved_dismissed") return;
  // §5.3's scope boundary: routine community moderation stays with each
  // community's own governance, not a platform appeal.
  if (trustSafetyCase.caseType === "community_escalation") return;

  // "filed by the affected party" (this function's own header comment)
  // wasn't actually enforced — any verified user could appeal any case.
  // resolveSubjectOwnerId is the same helper resolveTrustSafetyCase already
  // uses to notify the affected party on resolution, so this is the same
  // notion of "affected party" the rest of this module already relies on.
  const ownerId = await resolveSubjectOwnerId(trustSafetyCase.subjectType, trustSafetyCase.subjectId);
  if (ownerId !== user.id) return;

  const existing = await db.appeal.findFirst({ where: { originalCaseId: caseId, filedById: user.id } });
  if (existing) return;

  await db.appeal.create({ data: { originalCaseId: caseId, filedById: user.id, statement } });
  revalidatePath("/trust-safety");
  revalidatePath("/admin/trust-safety/appeals");
}
