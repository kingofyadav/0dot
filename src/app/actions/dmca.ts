"use server";

import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { fileDmcaTakedownNotice, fileDmcaCounterNotice } from "@/lib/dmca";
import type { ActionState } from "@/app/actions/auth";

// phase-13 spec §4.1: filing a formal DMCA notice requires an authenticated,
// verified account — same posture as every other write action in this
// codebase (fileReport, createPost, ...). Real-world complainants without a
// platform account are out of scope for this build; the statutory
// attestation/contact fields still get recorded exactly as filed.
export async function fileDmcaTakedownNoticeAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireVerifiedUser();

  const result = await fileDmcaTakedownNotice({
    complainantName: String(formData.get("complainantName") ?? ""),
    complainantContact: String(formData.get("complainantContact") ?? ""),
    copyrightedWorkDescription: String(formData.get("copyrightedWorkDescription") ?? ""),
    infringingContentSubjectType: String(formData.get("infringingContentSubjectType") ?? ""),
    infringingContentSubjectId: String(formData.get("infringingContentSubjectId") ?? ""),
    goodFaithStatementAccepted: formData.get("goodFaithStatementAccepted") === "on",
    accuracyPerjuryStatementAccepted: formData.get("accuracyPerjuryStatementAccepted") === "on",
    signature: String(formData.get("signature") ?? ""),
  });
  if (result.error) return { error: result.error };

  revalidatePath("/admin/trust-safety");
  return undefined;
}

// phase-13 spec §4.2/§4.5: filed by the alleged infringer against a notice
// that already removed their content — fileDmcaCounterNotice itself
// enforces that the filer actually owns that content.
export async function fileDmcaCounterNoticeAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  const result = await fileDmcaCounterNotice({
    originalNoticeId: String(formData.get("originalNoticeId") ?? ""),
    subjectUserId: user.id,
    goodFaithStatementAccepted: formData.get("goodFaithStatementAccepted") === "on",
    consentToJurisdiction: formData.get("consentToJurisdiction") === "on",
    signature: String(formData.get("signature") ?? ""),
  });
  if (result.error) return { error: result.error };

  revalidatePath("/dmca");
  return undefined;
}
