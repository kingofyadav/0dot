"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth-guards";

// /admin/marketplace — spec §4.5/§4.6's review gate: no MarketplaceListing
// reaches `active` without passing through `pending_review` first. Only
// `pending_review` listings are actionable here, same "only the actionable
// status lands in the queue" shape as /admin/businesses.
export async function approveMarketplaceListing(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;

  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "pending_review") return;

  await db.marketplaceListing.update({ where: { id: listingId }, data: { status: "active" } });
  revalidatePath("/admin/marketplace");
  revalidatePath(`/m/${listingId}`);
  revalidatePath("/m");
}

// Rejected listings keep their row (status: rejected) rather than being
// deleted outright, unlike a rejected business claim (admin-businesses.ts)
// — a business's core concern is impersonation, where the row has no
// legitimate reason to persist; a rejected listing may have gone through
// purchase/review activity already (e.g. re-submitted after an edit, spec
// §4.5's update-sends-back-to-pending_review path) and rejecting it is a
// moderation outcome worth keeping a record of, not a deletion.
export async function rejectMarketplaceListing(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;

  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "pending_review") return;

  await db.marketplaceListing.update({ where: { id: listingId }, data: { status: "rejected" } });
  revalidatePath("/admin/marketplace");
  revalidatePath(`/m/${listingId}`);
  revalidatePath("/m");
}
