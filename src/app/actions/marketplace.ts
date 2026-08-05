"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
  validateListingPayload,
  resolveListingSeller,
  canManageListing,
  resolveInstaller,
  hasVerifiedListingAccess,
} from "@/lib/marketplace";
import { getPaymentProcessor, recordPaymentTransaction } from "@/lib/payments";
import { canManageCatalog } from "@/lib/businesses";
import { isCommunityStaff } from "@/lib/communities";
import { createTrustSafetyCase } from "@/lib/trust-safety";
import type { ActionState } from "@/app/actions/auth";

const CATEGORY_SET = new Set<string>(MARKETPLACE_CATEGORIES);

function checkListingRateLimit(userId: string): boolean {
  return checkRateLimit(`marketplace:listing:create:user:${userId}`, { max: 10, windowMs: 60 * 60 * 1000 });
}

function checkPurchaseRateLimit(userId: string): boolean {
  return checkRateLimit(`marketplace:purchase:user:${userId}`, { max: 20, windowMs: 15 * 60 * 1000 });
}

function checkInstallRateLimit(userId: string): boolean {
  return checkRateLimit(`marketplace:install:user:${userId}`, { max: 20, windowMs: 15 * 60 * 1000 });
}

function checkReviewRateLimit(userId: string): boolean {
  return checkRateLimit(`marketplace:review:user:${userId}`, { max: 5, windowMs: 15 * 60 * 1000 });
}

function parsePayloadJson(raw: string): { error: string } | { value: unknown } {
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { error: "Listing content must be valid JSON." };
  }
}

// spec §4.3/§4.5: created straight into pending_review — there is no
// direct-to-active creation path (§4.6's literal acceptance criterion),
// same "gate ships with creation" discipline Phase 4's business claim gate
// and Phase 3's restricted-community join both already apply.
export async function createMarketplaceListing(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  if (!checkListingRateLimit(user.id)) return { error: "You're creating listings too fast. Please slow down." };

  const sellerType = String(formData.get("sellerType") ?? "user");
  const sellerId = String(formData.get("sellerBusinessId") ?? "");
  const seller = await resolveListingSeller(user.id, sellerType, sellerId);
  if ("error" in seller) return { error: seller.error };

  const categoryRaw = String(formData.get("category") ?? "");
  if (!CATEGORY_SET.has(categoryRaw)) return { error: "Choose a valid category." };
  const category = categoryRaw as MarketplaceCategory;

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };
  if (description.length > 5000) return { error: "Description must be 5000 characters or fewer." };

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

  const payloadRaw = String(formData.get("payload") ?? "{}");
  const parsedJson = parsePayloadJson(payloadRaw);
  if ("error" in parsedJson) return parsedJson;
  const validated = validateListingPayload(category, parsedJson.value);
  if ("error" in validated) return validated;

  const listing = await db.marketplaceListing.create({
    data: {
      ...seller,
      category,
      title,
      description,
      price,
      currency,
      payload: JSON.stringify(validated.payload),
    },
  });

  // phase-12 spec §11 step 3: wires the listing review gate into the
  // unified queue — MarketplaceListing.status stays the source of truth
  // (§3.3), no reportedById since this is a gate-driven review, not a report.
  await createTrustSafetyCase({ caseType: "marketplace_listing_review", subjectType: "marketplace_listing", subjectId: listing.id });

  revalidatePath("/m");
  redirect(`/m/${listing.id}`);
}

// Seller-only. Per §4.5's review-gate discipline, any edit to a listing
// that's already been reviewed sends it back to pending_review rather than
// leaving an approved row editable in place — otherwise the gate could be
// bypassed by approving a benign listing, then editing its payload after
// the fact.
export async function updateMarketplaceListing(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const listingId = String(formData.get("listingId") ?? "");

  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing) return { error: "Listing not found." };
  if (!(await canManageListing(listing, user.id))) return { error: "You don't manage this listing." };
  if (listing.status === "archived") return { error: "This listing has been archived and can no longer be edited." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };
  if (description.length > 5000) return { error: "Description must be 5000 characters or fewer." };

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

  const payloadRaw = String(formData.get("payload") ?? "{}");
  const parsedJson = parsePayloadJson(payloadRaw);
  if ("error" in parsedJson) return parsedJson;
  const validated = validateListingPayload(listing.category as MarketplaceCategory, parsedJson.value);
  if ("error" in validated) return validated;

  await db.marketplaceListing.update({
    where: { id: listing.id },
    data: { title, description, price, currency, payload: JSON.stringify(validated.payload), status: "pending_review" },
  });
  await createTrustSafetyCase({ caseType: "marketplace_listing_review", subjectType: "marketplace_listing", subjectId: listing.id });

  revalidatePath(`/m/${listing.id}`);
  redirect(`/m/${listing.id}`);
}

export async function archiveMarketplaceListing(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;

  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing) return;
  if (!(await canManageListing(listing, user.id))) return;

  await db.marketplaceListing.update({ where: { id: listing.id }, data: { status: "archived" } });
  revalidatePath(`/m/${listing.id}`);
  revalidatePath("/m");
}

// phase-10 spec §8: opts an existing `app`-category listing into the real
// OAuth-integrated install flow. The seller's DeveloperApp must already
// have this platform's own /m/install-callback registered as one of its
// redirect URIs (§3.2's exact-match allowlist applies here too, no
// exception for first-party) — checked here rather than assumed, since a
// missing registration would otherwise fail silently at install time.
export async function linkDeveloperAppToListing(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const listingId = String(formData.get("listingId") ?? "");
  const appId = String(formData.get("appId") ?? "");

  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing) return { error: "Listing not found." };
  if (!(await canManageListing(listing, user.id))) return { error: "You don't manage this listing." };
  if (listing.category !== "app") return { error: "Only app listings can link a developer app." };

  const { requireOwnedDeveloperApp } = await import("@/lib/developer-apps");
  const app = await requireOwnedDeveloperApp(appId, user.id);
  if (!app) return { error: "App not found." };

  const redirectUris: string[] = JSON.parse(app.redirectUrisJson);
  const expectedCallbackPath = "/m/install-callback";
  if (!redirectUris.some((uri) => uri.endsWith(expectedCallbackPath))) {
    return { error: `Add https://<your-domain>${expectedCallbackPath} to this app's redirect URIs first.` };
  }

  await db.marketplaceListing.update({ where: { id: listingId }, data: { developerAppId: appId } });
  revalidatePath(`/m/${listingId}`);
  return undefined;
}

// spec §4.3/§5.1: free (payload.price null) skips the payment backbone
// entirely, same nullable-price-means-free shape Offering/DigitalProduct/
// Ticket already use. A paid purchase reuses recordPaymentTransaction
// exactly (kind: "marketplace_purchase"), never a parallel ledger.
export async function purchaseMarketplaceListing(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const listingId = String(formData.get("listingId") ?? "");

  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "active") return { error: "This listing isn't available for purchase." };

  const existing = await db.marketplacePurchase.findUnique({ where: { listingId_buyerId: { listingId, buyerId: user.id } } });
  if (existing) return { error: "You already own this listing." };

  if (!checkPurchaseRateLimit(user.id)) return { error: "You're purchasing too fast. Please slow down." };

  if (listing.price === null) {
    await db.$transaction([
      db.marketplacePurchase.create({ data: { listingId: listing.id, buyerId: user.id } }),
      db.marketplaceListing.update({ where: { id: listing.id }, data: { purchaseCount: { increment: 1 } } }),
    ]);
    revalidatePath(`/m/${listing.id}`);
    return undefined;
  }

  let payeeId: string | null = null;
  let payeeBusinessId: string | null = null;
  if (listing.sellerBusinessId) {
    const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { businessId: listing.sellerBusinessId } });
    if (!payoutAccount || payoutAccount.status !== "active") return { error: "This seller hasn't enabled payouts yet." };
    payeeBusinessId = listing.sellerBusinessId;
  } else {
    const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { userId: listing.sellerUserId! } });
    if (!payoutAccount || payoutAccount.status !== "active") return { error: "This seller hasn't enabled payouts yet." };
    payeeId = listing.sellerUserId;
  }

  const charge = await getPaymentProcessor().charge({
    amount: listing.price,
    currency: listing.currency ?? "usd",
    payerId: user.id,
    payeeId: payeeId ?? payeeBusinessId ?? "",
  });
  if (charge.status !== "succeeded") return { error: "The charge failed. Please try again." };

  await db.$transaction(async (tx) => {
    const transaction = await recordPaymentTransaction(tx, {
      kind: "marketplace_purchase",
      payerId: user.id,
      payeeId,
      payeeBusinessId,
      amount: listing.price!,
      currency: listing.currency ?? "usd",
      processorReference: charge.processorReference,
      status: "succeeded",
      relatedObjectType: "marketplace_listing",
      relatedObjectId: listing.id,
    });
    await tx.marketplacePurchase.create({
      data: { listingId: listing.id, buyerId: user.id, paymentTransactionId: transaction.id },
    });
    await tx.marketplaceListing.update({ where: { id: listing.id }, data: { purchaseCount: { increment: 1 } } });
  });

  revalidatePath(`/m/${listing.id}`);
  return undefined;
}

// spec §4.3: config is accepted as opaque JSON here — the app's own
// declared payload (provider/embedUrl for the embed case) is what actually
// renders; config is the installer's own settings within that, capped by
// size the same way listing payloads are.
export async function installApp(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const listingId = String(formData.get("listingId") ?? "");
  const installerType = String(formData.get("installerType") ?? "user");
  const installerId = String(formData.get("installerId") ?? "");
  const configRaw = String(formData.get("config") ?? "").trim();

  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "active" || listing.category !== "app") {
    return { error: "This app isn't available to install." };
  }
  if (listing.price !== null) {
    const owns = await db.marketplacePurchase.findUnique({ where: { listingId_buyerId: { listingId, buyerId: user.id } } });
    if (!owns) return { error: "Purchase this app before installing it." };
  }

  if (configRaw.length > 4000) return { error: "Config is too large." };
  if (configRaw) {
    try {
      JSON.parse(configRaw);
    } catch {
      return { error: "Config must be valid JSON." };
    }
  }

  const installer = await resolveInstaller(user.id, installerType, installerId);
  if ("error" in installer) return { error: installer.error };

  const existingInstall = await db.installedApp.findFirst({
    where: {
      listingId: listing.id,
      installerUserId: installer.installerUserId,
      installerBusinessId: installer.installerBusinessId,
      installerCommunityId: installer.installerCommunityId,
    },
  });
  if (existingInstall) return { error: "Already installed here." };

  if (!checkInstallRateLimit(user.id)) return { error: "You're installing too fast. Please slow down." };

  await db.installedApp.create({
    data: { listingId: listing.id, ...installer, config: configRaw || null },
  });

  revalidatePath(`/m/${listing.id}`);
  return undefined;
}

export async function uninstallApp(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const installId = String(formData.get("installId") ?? "");
  if (!installId) return;

  const install = await db.installedApp.findUnique({ where: { id: installId } });
  if (!install) return;

  let authorized = false;
  if (install.installerBusinessId) {
    authorized = await canManageCatalog(install.installerBusinessId, user.id);
  } else if (install.installerCommunityId) {
    authorized = await isCommunityStaff(install.installerCommunityId, user.id);
  } else if (install.installerUserId) {
    const profile = await db.profile.findUnique({ where: { id: install.installerUserId }, select: { userId: true } });
    authorized = profile?.userId === user.id;
  }
  if (!authorized) return;

  await db.installedApp.delete({ where: { id: installId } });
  revalidatePath(`/m/${install.listingId}`);
}

async function recomputeListingRatingAggregates(tx: Prisma.TransactionClient, listingId: string): Promise<void> {
  const agg = await tx.marketplaceListingReview.aggregate({ where: { listingId }, _avg: { rating: true }, _count: true });
  await tx.marketplaceListing.update({
    where: { id: listingId },
    data: { averageRating: agg._avg.rating ?? 0, reviewCount: agg._count },
  });
}

export async function createOrUpdateListingReview(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const listingId = String(formData.get("listingId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId }, select: { id: true } });
  if (!listing) return { error: "Listing not found." };

  if (!(await hasVerifiedListingAccess(listingId, user.id))) {
    return { error: "You need to own or have installed this listing before reviewing it." };
  }

  if (!checkReviewRateLimit(user.id)) return { error: "You're submitting reviews too fast. Please slow down." };

  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Rating must be 1-5." };
  if (body.length > 2000) return { error: "Review must be 2000 characters or fewer." };

  await db.$transaction(async (tx) => {
    await tx.marketplaceListingReview.upsert({
      where: { listingId_authorId: { listingId, authorId: user.id } },
      create: { listingId, authorId: user.id, rating, body },
      update: { rating, body },
    });
    await recomputeListingRatingAggregates(tx, listingId);
  });

  revalidatePath(`/m/${listingId}`);
  return undefined;
}

export async function deleteListingReview(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const reviewId = String(formData.get("reviewId") ?? "");
  if (!reviewId) return;

  const review = await db.marketplaceListingReview.findUnique({ where: { id: reviewId } });
  if (!review || review.authorId !== user.id) return;

  await db.$transaction(async (tx) => {
    await tx.marketplaceListingReview.delete({ where: { id: reviewId } });
    await recomputeListingRatingAggregates(tx, review.listingId);
  });

  revalidatePath(`/m/${review.listingId}`);
}

export async function respondToListingReview(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const reviewId = String(formData.get("reviewId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!reviewId || body.length < 1 || body.length > 2000) return;

  const review = await db.marketplaceListingReview.findUnique({ where: { id: reviewId }, include: { listing: true } });
  if (!review) return;
  if (!(await canManageListing(review.listing, user.id))) return;

  await db.marketplaceListingReviewResponse.upsert({
    where: { reviewId },
    create: { reviewId, responderId: user.id, body },
    update: { body },
  });

  revalidatePath(`/m/${review.listingId}`);
}
