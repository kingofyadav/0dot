"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requirePlatformRole } from "@/lib/auth-guards";
import { ROLE_VALUES } from "@/lib/platform-roles";
import type { ActionState } from "@/app/actions/auth";

// True if this change would leave zero super_admins — the target currently
// holds super_admin and is losing it, and no one else holds it. Must run
// inside the same transaction as the write that acts on it: a plain
// findUnique-then-count outside a transaction is a check-then-act race
// where two concurrent demotions of two different (of exactly two)
// remaining super_admins can both read count===2 and both proceed.
async function wouldOrphanSuperAdmins(
  tx: Prisma.TransactionClient,
  targetUserId: string,
  keepsSuperAdmin: boolean,
): Promise<boolean> {
  if (keepsSuperAdmin) return false;
  const target = await tx.platformRole.findUnique({ where: { userId: targetUserId } });
  if (target?.role !== "super_admin") return false;
  const superAdminCount = await tx.platformRole.count({ where: { role: "super_admin" } });
  return superAdminCount <= 1;
}

// super_admin-only. Grants an *existing* 0dot user a platform role by
// email — the first in-app path this ever had; before this every grant
// (including the very first super_admin) required direct DB access.
export async function grantPlatformRole(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requirePlatformRole("super_admin");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleRaw = String(formData.get("role") ?? "");

  if (!ROLE_VALUES.has(roleRaw)) return { error: "Choose a role." };

  const targetUser = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!targetUser) return { error: "No 0dot account exists with that email yet." };

  await db.platformRole.upsert({
    where: { userId: targetUser.id },
    create: { userId: targetUser.id, role: roleRaw, grantedBy: user.id },
    update: { role: roleRaw, grantedBy: user.id, grantedAt: new Date() },
  });

  revalidatePath("/admin/platform-roles");
  return {};
}

// super_admin-only. Changes an existing row's role — rejects an invalid
// value outright rather than silently falling back to a default, since
// there's no safe "downgrade to member" equivalent here.
export async function updatePlatformRole(formData: FormData): Promise<void> {
  const { user } = await requirePlatformRole("super_admin");
  const targetUserId = String(formData.get("userId") ?? "");
  const roleRaw = String(formData.get("role") ?? "");
  if (!targetUserId || !ROLE_VALUES.has(roleRaw)) return;

  // Guard against demoting the last super_admin, mirroring the "can't
  // remove the last owner" guard businesses.ts/organizations.ts already
  // use for their own top role.
  await db.$transaction(async (tx) => {
    if (await wouldOrphanSuperAdmins(tx, targetUserId, roleRaw === "super_admin")) return;
    await tx.platformRole.updateMany({
      where: { userId: targetUserId },
      data: { role: roleRaw, grantedBy: user.id, grantedAt: new Date() },
    });
  });

  revalidatePath("/admin/platform-roles");
}

// super_admin-only. Revokes a platform role entirely. Same last-super_admin
// guard as updatePlatformRole.
export async function revokePlatformRole(formData: FormData): Promise<void> {
  await requirePlatformRole("super_admin");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!targetUserId) return;

  await db.$transaction(async (tx) => {
    if (await wouldOrphanSuperAdmins(tx, targetUserId, false)) return;
    await tx.platformRole.deleteMany({ where: { userId: targetUserId } });
  });

  revalidatePath("/admin/platform-roles");
}
