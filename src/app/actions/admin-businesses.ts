"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth-guards";

// /admin/businesses — the minimal review queue from build plan decision #1.
// Only `pending` businesses ever land here (an `active` one already cleared
// the weak-signal gate or was approved once already).
export async function approveBusiness(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) return;

  const business = await db.business.findUnique({ where: { id: businessId } });
  if (!business || business.status !== "pending") return;

  await db.business.update({ where: { id: businessId }, data: { status: "active" } });
  revalidatePath("/admin/businesses");
}

// A rejected business is deleted outright rather than tracked in a third
// status — spec §3.3's core concern is impersonation/trademark risk, and a
// business that failed manual review has no legitimate reason to keep
// existing in any form (unlike a ban, which needs to keep the record around
// for accountability).
export async function rejectBusiness(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) return;

  const business = await db.business.findUnique({ where: { id: businessId } });
  if (!business || business.status !== "pending") return;

  await db.business.delete({ where: { id: businessId } });
  revalidatePath("/admin/businesses");
}
