"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { saveUploadedImage } from "@/lib/uploads";
import { canManageOfferingOwner, isOfferingOwnerStaff, resolveOfferingOwner } from "@/lib/offerings";
import { getPaymentProcessor, recordPaymentTransaction } from "@/lib/payments";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const KIND_VALUES = new Set(["product", "service"]);
const STATUS_VALUES = new Set(["draft", "active", "archived"]);
const STOCK_STATUS_VALUES = new Set(["in_stock", "out_of_stock", "made_to_order"]);
const PURCHASE_STATUS_VALUES = new Set(["pending", "fulfilled", "refunded"]);

function checkOfferingPurchaseRateLimit(userId: string): boolean {
  return checkRateLimit(`offering:purchase:user:${userId}`, { max: 20, windowMs: 15 * 60 * 1000 });
}

type OfferingFields = {
  kind: string;
  name: string;
  description: string;
  price: number | null;
  currency: string | null;
  paymentLinkUrl: string | null;
  status: string;
  sku: string | null;
  stockStatus: string | null;
  isBookable: boolean | null;
  durationMinutes: number | null;
};

// Shared by updateOffering/archiveOffering/purchaseOffering/
// updateOfferingPurchaseStatus — resolves the manage-catalog path for
// either owner kind, same "resolve once, reuse for revalidate and
// redirect" shape createOffering uses inline. Looks the owner row up
// itself rather than trusting a caller-preloaded relation, so every call
// site can pass the bare owner columns.
async function offeringManagePath(offering: { businessId: string | null; sellerUserId: string | null }): Promise<string> {
  if (offering.businessId) {
    const business = await db.business.findUnique({ where: { id: offering.businessId }, select: { slug: true } });
    return `/b/${business!.slug}/catalog`;
  }
  const username = await db.username.findUnique({ where: { userId: offering.sellerUserId! }, select: { handle: true } });
  return `/s/${username!.handle}/monetization/services`;
}

// Shared by createOffering/updateOffering — spec §7.2's two literal
// acceptance criteria, validated at write time so neither create nor edit
// can produce a row that violates them.
function parseAndValidateFields(formData: FormData): { error: string } | OfferingFields {
  const kindRaw = String(formData.get("kind") ?? "");
  if (!KIND_VALUES.has(kindRaw)) return { error: "Choose a kind." };
  const kind = kindRaw;

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (name.length < 1 || name.length > 120) return { error: "Name must be 1-120 characters." };
  if (description.length > 2000) return { error: "Description must be 2000 characters or fewer." };

  const statusRaw = String(formData.get("status") ?? "draft");
  const status = STATUS_VALUES.has(statusRaw) ? statusRaw : "draft";

  const priceRaw = String(formData.get("price") ?? "").trim();
  const currencyRaw = String(formData.get("currency") ?? "").trim().toUpperCase();
  let price: number | null = null;
  let currency: string | null = null;
  if (priceRaw) {
    const parsedPrice = Number(priceRaw);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return { error: "Price must be a positive number." };
    if (!currencyRaw) return { error: "Currency is required when a price is set." };
    price = parsedPrice;
    currency = currencyRaw;
  } else if (currencyRaw) {
    return { error: "Remove the currency, or add a price — they're both required or both empty." };
  }

  // Store step 5: only meaningful when price is set, but not enforced —
  // an offering can go live with "contact for pricing" and no link at all.
  const paymentLinkRaw = String(formData.get("paymentLinkUrl") ?? "").trim();
  let paymentLinkUrl: string | null = null;
  if (paymentLinkRaw) {
    if (!/^https?:\/\//i.test(paymentLinkRaw)) return { error: "Payment link must start with http:// or https://." };
    paymentLinkUrl = paymentLinkRaw.slice(0, 500);
  }

  let sku: string | null = null;
  let stockStatus: string | null = null;
  let isBookable: boolean | null = null;
  let durationMinutes: number | null = null;

  if (kind === "product") {
    sku = String(formData.get("sku") ?? "").trim() || null;
    const stockStatusRaw = String(formData.get("stockStatus") ?? "");
    stockStatus = STOCK_STATUS_VALUES.has(stockStatusRaw) ? stockStatusRaw : null;
  } else {
    isBookable = formData.get("isBookable") === "true";
    const durationRaw = String(formData.get("durationMinutes") ?? "").trim();
    durationMinutes = durationRaw ? Number(durationRaw) : null;
    if (isBookable && (!durationMinutes || !Number.isFinite(durationMinutes) || durationMinutes <= 0)) {
      return { error: "Bookable services need a duration (in minutes)." };
    }
    if (!isBookable) durationMinutes = null;
  }

  return { kind, name, description, price, currency, paymentLinkUrl, status, sku, stockStatus, isBookable, durationMinutes };
}

// phase-9 spec §3.2: ownerType "business" (unchanged, businessId required)
// or "self" (an individual freelancer listing their own service/product,
// no business at all) — resolveOfferingOwner enforces the same
// canManageCatalog tier for a business, or "must be yourself" for "self."
export async function createOffering(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const ownerType = String(formData.get("ownerType") ?? "business");
  const ownerId = String(formData.get("businessId") ?? "");

  const owner = await resolveOfferingOwner(user.id, ownerType, ownerId);
  if ("error" in owner) return { error: owner.error };

  const fields = parseAndValidateFields(formData);
  if ("error" in fields) return fields;

  const imageFiles = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
    .slice(0, MAX_IMAGES);
  const imageUrls: string[] = [];
  for (const file of imageFiles) {
    const result = await saveUploadedImage(file, { maxBytes: MAX_IMAGE_BYTES });
    if ("error" in result) return { error: result.error };
    imageUrls.push(result.url);
  }

  await db.offering.create({
    data: {
      ...owner,
      ...fields,
      imagesJson: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
    },
  });

  if (owner.businessId) {
    const business = await db.business.findUnique({ where: { id: owner.businessId }, select: { slug: true } });
    revalidatePath(`/b/${business!.slug}/catalog`);
    redirect(`/b/${business!.slug}/catalog`);
  }
  const username = await db.username.findUnique({ where: { userId: user.id }, select: { handle: true } });
  revalidatePath(`/s/${username!.handle}/monetization/services`);
  redirect(`/s/${username!.handle}/monetization/services`);
}

export async function updateOffering(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const offeringId = String(formData.get("offeringId") ?? "");

  const offering = await db.offering.findUnique({ where: { id: offeringId } });
  if (!offering) return { error: "Offering not found." };
  if (!(await canManageOfferingOwner(offering, user.id))) {
    return { error: "You don't have permission to manage this catalog." };
  }

  const fields = parseAndValidateFields(formData);
  if ("error" in fields) return fields;

  // Only replaces the image set when new files are submitted — same
  // "optional replace" posture as avatar/cover uploads elsewhere
  // (ManageBusinessForm etc.), not a per-image add/remove UI.
  const imageFiles = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
    .slice(0, MAX_IMAGES);
  let imagesJson = offering.imagesJson;
  if (imageFiles.length > 0) {
    const imageUrls: string[] = [];
    for (const file of imageFiles) {
      const result = await saveUploadedImage(file, { maxBytes: MAX_IMAGE_BYTES });
      if ("error" in result) return { error: result.error };
      imageUrls.push(result.url);
    }
    imagesJson = JSON.stringify(imageUrls);
  }

  await db.offering.update({
    where: { id: offering.id },
    data: { ...fields, imagesJson },
  });

  const managePath = await offeringManagePath(offering);
  revalidatePath(managePath);
  redirect(managePath);
}

export async function archiveOffering(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const offeringId = String(formData.get("offeringId") ?? "");
  if (!offeringId) return;

  const offering = await db.offering.findUnique({ where: { id: offeringId } });
  if (!offering) return;
  if (!(await canManageOfferingOwner(offering, user.id))) return;

  await db.offering.update({ where: { id: offering.id }, data: { status: "archived" } });
  revalidatePath(await offeringManagePath(offering));
}

// phase-9 spec §3.1: resolves the Phase 4/5-flagged Store checkout
// deferral — native in-app checkout for a priced Offering, reusing the
// Phase 5 payment ledger exactly (recordPaymentTransaction), same shape
// purchaseTicket (events.ts) already established for a business/individual
// payee split. paymentLinkUrl (external checkout) stays available and
// untouched — this is an additional path, not a replacement.
export async function purchaseOffering(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const offeringId = String(formData.get("offeringId") ?? "");
  const quantityRaw = String(formData.get("quantity") ?? "1").trim();

  const offering = await db.offering.findUnique({ where: { id: offeringId } });
  if (!offering || offering.status !== "active" || offering.price === null) {
    return { error: "This offering isn't available for purchase." };
  }

  const quantity = Number.parseInt(quantityRaw, 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return { error: "Quantity must be between 1 and 20." };

  if (!checkOfferingPurchaseRateLimit(user.id)) return { error: "You're purchasing too fast. Please slow down." };

  let payeeId: string | null = null;
  let payeeBusinessId: string | null = null;
  if (offering.businessId) {
    const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { businessId: offering.businessId } });
    if (!payoutAccount || payoutAccount.status !== "active") return { error: "This seller hasn't enabled payouts yet." };
    payeeBusinessId = offering.businessId;
  } else {
    const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { userId: offering.sellerUserId! } });
    if (!payoutAccount || payoutAccount.status !== "active") return { error: "This seller hasn't enabled payouts yet." };
    payeeId = offering.sellerUserId;
  }

  const amount = Math.round(offering.price * quantity * 100) / 100;
  const currency = offering.currency ?? "usd";

  const charge = await getPaymentProcessor().charge({
    amount,
    currency,
    payerId: user.id,
    payeeId: payeeId ?? payeeBusinessId ?? "",
  });
  if (charge.status !== "succeeded") return { error: "The charge failed. Please try again." };

  await db.$transaction(async (tx) => {
    const transaction = await recordPaymentTransaction(tx, {
      kind: offering.businessId ? "business_purchase" : "freelance_purchase",
      payerId: user.id,
      payeeId,
      payeeBusinessId,
      amount,
      currency,
      processorReference: charge.processorReference,
      status: "succeeded",
      relatedObjectType: "offering",
      relatedObjectId: offering.id,
    });
    await tx.offeringPurchase.create({
      data: { offeringId: offering.id, buyerId: user.id, paymentTransactionId: transaction.id, quantity },
    });
  });

  revalidatePath(await offeringManagePath(offering));
  return undefined;
}

// Seller-only, per spec §3.1's "a status enum the seller updates
// manually, not a shipping/logistics system" — fulfillment tracking is
// deliberately this minimal.
export async function updateOfferingPurchaseStatus(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const purchaseId = String(formData.get("purchaseId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!purchaseId || !PURCHASE_STATUS_VALUES.has(status)) return;

  const purchase = await db.offeringPurchase.findUnique({ where: { id: purchaseId }, include: { offering: true } });
  if (!purchase) return;
  if (!(await isOfferingOwnerStaff(purchase.offering, user.id))) return;

  await db.offeringPurchase.update({ where: { id: purchaseId }, data: { status } });
  revalidatePath(await offeringManagePath(purchase.offering));
}
