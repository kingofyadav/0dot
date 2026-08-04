"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import type { ActionState } from "@/app/actions/auth";

const OFFERING_TYPES = new Set(["membership_tier", "digital_product", "course"]);

// spec §7.1: creates a program on the caller's own offering — ownership is
// re-verified per offering type here (each type has its own creatorId
// column, no shared "offering" table to check once) rather than trusted
// from the form.
async function ownsOffering(userId: string, offeringType: string, offeringId: string): Promise<boolean> {
  if (offeringType === "membership_tier") {
    const tier = await db.membershipTier.findUnique({ where: { id: offeringId }, select: { creatorId: true } });
    return tier?.creatorId === userId;
  }
  if (offeringType === "digital_product") {
    const product = await db.digitalProduct.findUnique({ where: { id: offeringId }, select: { creatorId: true } });
    return product?.creatorId === userId;
  }
  if (offeringType === "course") {
    const course = await db.course.findUnique({ where: { id: offeringId }, select: { creatorId: true } });
    return course?.creatorId === userId;
  }
  return false;
}

export async function createAffiliateProgram(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  const offeringType = String(formData.get("offeringType") ?? "");
  if (!OFFERING_TYPES.has(offeringType)) return { error: "Choose an offering type." };

  const offeringId = String(formData.get("offeringId") ?? "");
  if (!offeringId) return { error: "Choose an offering." };
  if (!(await ownsOffering(user.id, offeringType, offeringId))) {
    return { error: "You don't have permission to promote that offering." };
  }

  const commissionPercent = Number(formData.get("commissionPercent"));
  if (!Number.isFinite(commissionPercent) || commissionPercent <= 0 || commissionPercent > 100) {
    return { error: "Commission must be between 0 and 100 percent." };
  }

  await db.affiliateProgram.create({ data: { creatorId: user.id, offeringType, offeringId, commissionPercent } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

export async function toggleProgramStatus(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const programId = String(formData.get("programId") ?? "");
  if (!programId) return;

  const program = await db.affiliateProgram.findUnique({ where: { id: programId } });
  if (!program || program.creatorId !== user.id) return;

  await db.affiliateProgram.update({
    where: { id: program.id },
    data: { status: program.status === "active" ? "paused" : "active" },
  });
  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}

// spec §7.1: any 0dot user can become an affiliate for an active program —
// no approval step in this build (not specified either way; a paused
// program simply can't accept new links, checked here rather than only at
// click/conversion time).
export async function createAffiliateLink(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const programId = String(formData.get("programId") ?? "");

  const program = await db.affiliateProgram.findUnique({ where: { id: programId } });
  if (!program || program.status !== "active") return { error: "This affiliate program isn't available." };
  if (program.creatorId === user.id) return { error: "You can't be an affiliate for your own offering." };

  const existing = await db.affiliateLink.findFirst({ where: { programId, affiliateId: user.id } });
  if (existing) return { error: "You already have a link for this program." };

  await db.affiliateLink.create({
    data: { programId, affiliateId: user.id, code: randomBytes(6).toString("hex") },
  });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}
