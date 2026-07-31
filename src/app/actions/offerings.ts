"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { saveUploadedImage } from "@/lib/uploads";
import { canManageCatalog } from "@/lib/businesses";
import type { ActionState } from "@/app/actions/auth";

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const KIND_VALUES = new Set(["product", "service"]);
const STATUS_VALUES = new Set(["draft", "active", "archived"]);
const STOCK_STATUS_VALUES = new Set(["in_stock", "out_of_stock", "made_to_order"]);

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

export async function createOffering(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");

  const business = await db.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true } });
  if (!business) return { error: "Business not found." };
  if (!(await canManageCatalog(business.id, user.id))) {
    return { error: "You don't have permission to manage this business's catalog." };
  }

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
      businessId: business.id,
      ...fields,
      imagesJson: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
    },
  });

  revalidatePath(`/b/${business.slug}/catalog`);
  redirect(`/b/${business.slug}/catalog`);
}

export async function updateOffering(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const offeringId = String(formData.get("offeringId") ?? "");

  const offering = await db.offering.findUnique({ where: { id: offeringId }, include: { business: { select: { slug: true } } } });
  if (!offering) return { error: "Offering not found." };
  if (!(await canManageCatalog(offering.businessId, user.id))) {
    return { error: "You don't have permission to manage this business's catalog." };
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

  revalidatePath(`/b/${offering.business.slug}/catalog`);
  redirect(`/b/${offering.business.slug}/catalog`);
}

export async function archiveOffering(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const offeringId = String(formData.get("offeringId") ?? "");
  if (!offeringId) return;

  const offering = await db.offering.findUnique({ where: { id: offeringId }, include: { business: { select: { slug: true } } } });
  if (!offering) return;
  if (!(await canManageCatalog(offering.businessId, user.id))) return;

  await db.offering.update({ where: { id: offering.id }, data: { status: "archived" } });
  revalidatePath(`/b/${offering.business.slug}/catalog`);
}
