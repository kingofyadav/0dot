"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { canManageCatalog } from "@/lib/businesses";
import type { ActionState } from "@/app/actions/auth";

// Same day-key set as the public render (/b/[slug]/page.tsx's DAY_ORDER).
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// phase-4 gap-fill, spec §3.1/§6: BusinessLocation's hoursJson already has
// a read path (parseBusinessHours in src/lib/businesses.ts) — this is the
// write path that never existed. Scoped to one open/close range per day
// (a reasonable, honestly-scoped subset of the {day: [{opens,closes}]}
// shape) — storage stays forward-compatible with multiple ranges even
// though this form only ever writes one.
function buildHoursJson(formData: FormData): string | null {
  const hours: Record<string, { opens: string; closes: string }[]> = {};
  for (const day of DAYS) {
    if (formData.get(`open_${day}`) !== "true") continue;
    const opens = String(formData.get(`opens_${day}`) ?? "");
    const closes = String(formData.get(`closes_${day}`) ?? "");
    if (TIME_PATTERN.test(opens) && TIME_PATTERN.test(closes) && opens < closes) {
      hours[day] = [{ opens, closes }];
    }
  }
  return Object.keys(hours).length > 0 ? JSON.stringify(hours) : null;
}

async function requireCatalogBusiness(businessId: string, userId: string) {
  if (!(await canManageCatalog(businessId, userId))) return null;
  return db.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true } });
}

export async function addLocation(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const businessId = String(formData.get("businessId") ?? "");

  const business = await requireCatalogBusiness(businessId, user.id);
  if (!business) return { error: "You don't have permission to manage this business's locations." };

  const label = String(formData.get("label") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (label.length < 1 || label.length > 100) return { error: "Label must be 1-100 characters." };
  if (address.length < 1 || address.length > 300) return { error: "Address must be 1-300 characters." };

  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const latitude = latitudeRaw ? Number(latitudeRaw) : null;
  const longitude = longitudeRaw ? Number(longitudeRaw) : null;
  if (latitude !== null && !Number.isFinite(latitude)) return { error: "Latitude must be a number." };
  if (longitude !== null && !Number.isFinite(longitude)) return { error: "Longitude must be a number." };

  await db.businessLocation.create({
    data: { businessId: business.id, label, address, latitude, longitude, hoursJson: buildHoursJson(formData) },
  });

  revalidatePath(`/b/${business.slug}`);
  revalidatePath(`/b/${business.slug}/manage`);
  return undefined;
}

export async function updateLocation(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const locationId = String(formData.get("locationId") ?? "");

  const location = await db.businessLocation.findUnique({ where: { id: locationId }, include: { business: true } });
  if (!location) return { error: "Location not found." };
  if (!(await canManageCatalog(location.businessId, user.id))) {
    return { error: "You don't have permission to manage this business's locations." };
  }

  const label = String(formData.get("label") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (label.length < 1 || label.length > 100) return { error: "Label must be 1-100 characters." };
  if (address.length < 1 || address.length > 300) return { error: "Address must be 1-300 characters." };

  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const latitude = latitudeRaw ? Number(latitudeRaw) : null;
  const longitude = longitudeRaw ? Number(longitudeRaw) : null;
  if (latitude !== null && !Number.isFinite(latitude)) return { error: "Latitude must be a number." };
  if (longitude !== null && !Number.isFinite(longitude)) return { error: "Longitude must be a number." };

  await db.businessLocation.update({
    where: { id: locationId },
    data: { label, address, latitude, longitude, hoursJson: buildHoursJson(formData) },
  });

  revalidatePath(`/b/${location.business.slug}`);
  revalidatePath(`/b/${location.business.slug}/manage`);
  return undefined;
}

export async function deleteLocation(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const locationId = String(formData.get("locationId") ?? "");
  if (!locationId) return;

  const location = await db.businessLocation.findUnique({ where: { id: locationId }, include: { business: true } });
  if (!location) return;
  if (!(await canManageCatalog(location.businessId, user.id))) return;

  await db.businessLocation.delete({ where: { id: locationId } });

  revalidatePath(`/b/${location.business.slug}`);
  revalidatePath(`/b/${location.business.slug}/manage`);
}
