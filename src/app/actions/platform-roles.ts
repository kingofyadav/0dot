"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformRole } from "@/lib/auth-guards";
import type { ActionState } from "@/app/actions/auth";

const ROLE_VALUES = new Set(["support", "admin", "super_admin"]);

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
  if (roleRaw !== "super_admin") {
    const target = await db.platformRole.findUnique({ where: { userId: targetUserId } });
    if (target?.role === "super_admin") {
      const superAdminCount = await db.platformRole.count({ where: { role: "super_admin" } });
      if (superAdminCount <= 1) return;
    }
  }

  await db.platformRole.update({
    where: { userId: targetUserId },
    data: { role: roleRaw, grantedBy: user.id, grantedAt: new Date() },
  });

  revalidatePath("/admin/platform-roles");
}

// super_admin-only. Revokes a platform role entirely. Same last-super_admin
// guard as updatePlatformRole.
export async function revokePlatformRole(formData: FormData): Promise<void> {
  await requirePlatformRole("super_admin");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!targetUserId) return;

  const target = await db.platformRole.findUnique({ where: { userId: targetUserId } });
  if (!target) return;
  if (target.role === "super_admin") {
    const superAdminCount = await db.platformRole.count({ where: { role: "super_admin" } });
    if (superAdminCount <= 1) return;
  }

  await db.platformRole.delete({ where: { userId: targetUserId } });

  revalidatePath("/admin/platform-roles");
}
