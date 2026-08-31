"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformRole } from "@/lib/auth-guards";
import { issuePromoGrant, adminAdjust } from "@/lib/wallet/grants";
import type { ActionState } from "@/app/actions/auth";

// addendum-coin-wallet-v2.md §13.3 — the admin grant tool. Caps + required
// reason + hard ceiling live in grants.ts (guardIssuance); this resolves
// the target and records who acted.
export async function grantCoinsAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { user: admin } = await requirePlatformRole("admin");

  const mode = String(formData.get("mode") ?? "promo_grant"); // promo_grant | admin_adjustment
  const targetKind = String(formData.get("targetKind") ?? "user"); // user | business
  const targetHandle = String(formData.get("targetHandle") ?? "").trim().toLowerCase();
  const targetSlug = String(formData.get("targetSlug") ?? "").trim().toLowerCase();
  const coins = Number(formData.get("coins"));
  const reason = String(formData.get("reason") ?? "").trim();
  const expiresInDays = formData.get("expiresInDays") ? Number(formData.get("expiresInDays")) : null;

  let targetUserId: string | undefined;
  let targetBusinessId: string | undefined;
  if (targetKind === "business") {
    const business = await db.business.findUnique({ where: { slug: targetSlug }, select: { id: true } });
    if (!business) return { error: "No business with that slug." };
    targetBusinessId = business.id;
  } else {
    const username = await db.username.findUnique({ where: { handle: targetHandle }, select: { userId: true } });
    if (!username) return { error: "No user with that username." };
    targetUserId = username.userId;
  }

  const result =
    mode === "admin_adjustment"
      ? await adminAdjust({ actorAdminId: admin.id, targetUserId, targetBusinessId, coins, reason })
      : await issuePromoGrant({ actorAdminId: admin.id, targetUserId, targetBusinessId, coins, reason, expiresInDays });

  if ("error" in result) return { error: result.error };

  revalidatePath("/admin/wallet");
  return { success: true };
}
