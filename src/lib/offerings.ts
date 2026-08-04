import "server-only";
import { canManageCatalog, isBusinessStaff } from "@/lib/businesses";

// phase-9 spec §3.2: the two-way owner XOR shared by
// Offering/AvailabilityRule/Appointment now that an individual seller is a
// second owner kind alongside Business — same "resolve once, reuse
// everywhere" shape resolveHost (events.ts) already established for
// Event's three-way host XOR.
export type OfferingOwner = { businessId: string | null; sellerUserId: string | null };

// createOffering/createAvailabilityRule tier: canManageCatalog (owner|
// admin|editor) for a business, exactly the seller themself for an
// individual — an individual freelancer has no team to delegate catalog
// management to.
export async function canManageOfferingOwner(owner: OfferingOwner, userId: string): Promise<boolean> {
  if (owner.businessId) return canManageCatalog(owner.businessId, userId);
  if (owner.sellerUserId) return owner.sellerUserId === userId;
  return false;
}

// confirmAppointment/cancelAppointment tier: isBusinessStaff (owner|admin)
// for a business, the seller themself for an individual — mirrors
// canManageOfferingOwner's shape at the stricter staff tier.
export async function isOfferingOwnerStaff(owner: OfferingOwner, userId: string): Promise<boolean> {
  if (owner.businessId) return isBusinessStaff(owner.businessId, userId);
  if (owner.sellerUserId) return owner.sellerUserId === userId;
  return false;
}

// Resolves raw form input (ownerType/ownerId) into the columns to write, or
// an error — same "returns the column values to write, or an error" shape
// resolveHost (events.ts) uses for Event's three-way host XOR.
export async function resolveOfferingOwner(
  userId: string,
  ownerType: string,
  ownerId: string
): Promise<OfferingOwner | { error: string }> {
  if (ownerType === "self") {
    return { businessId: null, sellerUserId: userId };
  }
  if (ownerType === "business") {
    if (!ownerId || !(await canManageCatalog(ownerId, userId))) {
      return { error: "You don't manage that business's catalog." };
    }
    return { businessId: ownerId, sellerUserId: null };
  }
  return { error: "Choose who's selling this." };
}
