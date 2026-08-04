"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSafeUrl } from "@/lib/url-safety";
import { canManageCatalog } from "@/lib/businesses";
import type { ActionState } from "@/app/actions/auth";

// phase-4 gap-fill, spec §3.2: mirrors createLink/deleteLink/moveLink
// (src/app/actions/profile.ts) exactly — same validation, same 100-link
// cap, same swap-adjacent-position transaction — scoped to businessId +
// canManageCatalog tier instead of requireOwnProfile(). Kept as separate
// functions rather than generalizing the profile ones, same "additive,
// don't touch working code" reasoning the spec itself used for
// Post.businessAuthorId.

async function requireCatalogAccess(businessId: string, userId: string) {
  if (!(await canManageCatalog(businessId, userId))) return null;
  return db.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true } });
}

export async function createBusinessLink(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");

  const business = await requireCatalogAccess(businessId, user.id);
  if (!business) return { error: "You don't have permission to manage this business's links." };

  if (!checkRateLimit(`business-link:create:business:${businessId}`, { max: 20, windowMs: 10 * 60 * 1000 })) {
    return { error: "You're adding links too fast. Please slow down." };
  }

  const label = String(formData.get("label") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();

  if (label.length < 1 || label.length > 80) {
    return { error: "Label must be 1-80 characters." };
  }
  if (!isSafeUrl(url)) {
    return { error: "Enter a valid http:// or https:// URL." };
  }

  const linkCount = await db.link.count({ where: { businessId: business.id } });
  if (linkCount >= 100) {
    return { error: "You've reached the 100-link limit." };
  }

  await db.link.create({
    data: { businessId: business.id, label, url, position: linkCount },
  });

  revalidatePath(`/b/${business.slug}`);
  revalidatePath(`/b/${business.slug}/manage`);
  return undefined;
}

export async function deleteBusinessLink(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");
  const linkId = String(formData.get("linkId") ?? "");
  if (!businessId || !linkId) return;

  const business = await requireCatalogAccess(businessId, user.id);
  if (!business) return;

  await db.link.deleteMany({ where: { id: linkId, businessId: business.id } });

  revalidatePath(`/b/${business.slug}`);
  revalidatePath(`/b/${business.slug}/manage`);
}

export async function moveBusinessLink(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");
  const linkId = String(formData.get("linkId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!businessId || !linkId) return;

  const business = await requireCatalogAccess(businessId, user.id);
  if (!business) return;

  const links = await db.link.findMany({
    where: { businessId: business.id },
    orderBy: { position: "asc" },
  });

  const index = links.findIndex((l) => l.id === linkId);
  if (index === -1) return;

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= links.length) return;

  const current = links[index];
  const swapWith = links[swapIndex];

  await db.$transaction([
    db.link.update({ where: { id: current.id }, data: { position: swapWith.position } }),
    db.link.update({ where: { id: swapWith.id }, data: { position: current.position } }),
  ]);

  revalidatePath(`/b/${business.slug}/manage`);
}
