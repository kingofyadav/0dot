"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformRole } from "@/lib/auth-guards";
import { notifyBusinessApproved, notifyBusinessRejected } from "@/lib/notifications";

// admin+ platform role — same bar as /admin/trust-safety/appeals (a real
// go-live decision, not a support-tier action). Approve flips status to
// active, the exact outcome /b/[slug]'s "a platform admin approves it"
// message promises (spec §3.3).
export async function approveBusinessAction(formData: FormData): Promise<void> {
  await requirePlatformRole("admin");
  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) return;

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { status: true, slug: true, createdBy: true },
  });
  if (!business || business.status !== "pending") return;

  await db.business.update({ where: { id: businessId }, data: { status: "active" } });
  await notifyBusinessApproved({ recipientId: business.createdBy, businessSlug: business.slug });

  revalidatePath("/admin/businesses");
  revalidatePath(`/b/${business.slug}`);
}

// Deletes the business outright rather than introducing a third status —
// a pending business has never been live, indexed, or visible to anyone
// outside its own team (see /b/[slug]'s notFound gate), so there's no
// public record to preserve. Every FK cascades the same way deleteBusiness
// (the owner-initiated equivalent, src/app/actions/businesses.ts) already
// relies on.
export async function rejectBusinessAction(formData: FormData): Promise<void> {
  await requirePlatformRole("admin");
  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) return;

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { status: true, name: true, createdBy: true },
  });
  if (!business || business.status !== "pending") return;

  await db.business.delete({ where: { id: businessId } });
  await notifyBusinessRejected({ recipientId: business.createdBy, businessName: business.name });

  revalidatePath("/admin/businesses");
}
