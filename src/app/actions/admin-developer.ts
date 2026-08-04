"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth-guards";

// spec §4.3: the review gate for high-sensitivity OAuth scopes — the
// fourth review-gate instance this series has built (restricted-community
// joins, business claims, marketplace listings, now this), same
// "pending_review is the only actionable status" shape as admin-marketplace.ts.
export async function approveDeveloperAppScope(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const appId = String(formData.get("appId") ?? "");
  const scopeKey = String(formData.get("scopeKey") ?? "");
  if (!appId || !scopeKey) return;

  const row = await db.developerAppScope.findUnique({ where: { appId_scopeKey: { appId, scopeKey } } });
  if (!row || row.status !== "pending") return;

  await db.developerAppScope.update({ where: { appId_scopeKey: { appId, scopeKey } }, data: { status: "approved", reviewedAt: new Date() } });
  revalidatePath("/admin/developer-scopes");
}

export async function rejectDeveloperAppScope(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const appId = String(formData.get("appId") ?? "");
  const scopeKey = String(formData.get("scopeKey") ?? "");
  if (!appId || !scopeKey) return;

  const row = await db.developerAppScope.findUnique({ where: { appId_scopeKey: { appId, scopeKey } } });
  if (!row || row.status !== "pending") return;

  await db.developerAppScope.update({ where: { appId_scopeKey: { appId, scopeKey } }, data: { status: "rejected", reviewedAt: new Date() } });
  revalidatePath("/admin/developer-scopes");
}
