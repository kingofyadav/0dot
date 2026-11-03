import "server-only";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { settleCoinPurchase, type FeatureSettlement } from "@/lib/wallet/charge";
import { getAffiliateAttribution } from "@/lib/affiliate";
import { notifyAffiliateConversion } from "@/lib/notifications";

// The coin-purchase cores for marketplace listings, courses, and digital
// products, shared by the web server actions (marketplace.ts / courses.ts /
// digital-products.ts) and the bearer-token POST /api/v1/wallet/purchases —
// one implementation, not two, same reason wallet/purchases already wraps
// purchaseProfilePremiumWithCoins instead of re-deriving it. Lives in lib
// (not a "use server" file) because every export of a "use server" module
// is a client-callable action, and these take a caller-supplied userId.
// Callers authenticate and verify the user first.

export type PurchaseOutcome = { ok: true; free: boolean } | { error: string; alreadyOwned?: true };

function checkListingPurchaseRateLimit(userId: string): boolean {
  return checkRateLimit(`marketplace:purchase:user:${userId}`, { max: 20, windowMs: 15 * 60 * 1000 });
}

// Same convention as tips.ts's checkTipRateLimit for this class of action.
function checkCoursePurchaseRateLimit(userId: string): boolean {
  return checkRateLimit(`course-purchase:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

function checkProductPurchaseRateLimit(userId: string): boolean {
  return checkRateLimit(`product-purchase:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

// spec §4.3/§5.1: free (payload.price null) skips the payment backbone
// entirely, same nullable-price-means-free shape Offering/DigitalProduct/
// Ticket already use. A paid purchase is a coin charge through
// settleCoinPurchase (kind: "marketplace_purchase"), never a parallel ledger.
export async function purchaseListingForUser(userId: string, listingId: string): Promise<PurchaseOutcome> {
  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "active") return { error: "This listing isn't available for purchase." };

  const existing = await db.marketplacePurchase.findUnique({ where: { listingId_buyerId: { listingId, buyerId: userId } } });
  if (existing) return { error: "You already own this listing.", alreadyOwned: true };

  if (!checkListingPurchaseRateLimit(userId)) return { error: "You're purchasing too fast. Please slow down." };

  if (listing.price === null) {
    await db.$transaction([
      db.marketplacePurchase.create({ data: { listingId: listing.id, buyerId: userId } }),
      db.marketplaceListing.update({ where: { id: listing.id }, data: { purchaseCount: { increment: 1 } } }),
    ]);
    revalidatePath(`/m/${listing.id}`);
    return { ok: true, free: true };
  }

  // addendum-wallet-only-payments.md §3.2: synchronous coin settlement,
  // same shape as digital products — revenue lands in the seller's user
  // wallet or, for a business listing, the business wallet (coin-wallet v2
  // §6.5). No payout account required. The key is deterministic because a
  // listing is bought at most once per buyer; a failed charge rolls the
  // ledger back with it, so the key is only ever consumed by a success.
  if (listing.sellerUserId === userId) return { error: "You can't buy your own listing." };
  const result = await settleCoinPurchase({
    kind: "marketplace_purchase",
    payerId: userId,
    payeeUserId: listing.sellerBusinessId ? null : listing.sellerUserId,
    payeeBusinessId: listing.sellerBusinessId ?? null,
    amountUsd: listing.price,
    currency: listing.currency ?? "usd",
    relatedObjectType: "marketplace_listing",
    relatedObjectId: listing.id,
    idempotencyKey: `marketplace:coin:${userId}:${listing.id}`,
    metadata: { listingId: listing.id },
    createRows: createMarketplacePurchaseRows,
  });
  if ("error" in result) return { error: result.error };
  revalidatePath(`/m/${listing.id}`);
  return { ok: true, free: false };
}

// The purchase rows — one place, both rails (coin-wallet v2 §6.2).
async function createMarketplacePurchaseRows(tx: Prisma.TransactionClient, s: FeatureSettlement): Promise<void> {
  const listingId = s.metadata.listingId;
  await tx.marketplacePurchase.create({
    data: { listingId, buyerId: s.payerId, paymentTransactionId: s.paymentTransactionId },
  });
  await tx.marketplaceListing.update({ where: { id: listingId }, data: { purchaseCount: { increment: 1 } } });
}

// spec §11.1: mirrors purchaseProductForUser's shape (charge → ledger row +
// access-grant row in one transaction, kind: course_purchase). Only
// reachable when the course has a standalone price — a tier-only course
// has nothing to "buy" directly, matching parseAndValidateCourseFields'
// own requirement that at least one access path exists.
export async function purchaseCourseForUser(userId: string, courseId: string): Promise<PurchaseOutcome> {
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course || course.status !== "active") return { error: "This course isn't available." };
  if (course.price === null || course.currency === null) return { error: "This course isn't available for direct purchase." };
  if (course.creatorId === userId) return { error: "You can't buy your own course." };

  const existing = await db.courseAccessGrant.findUnique({ where: { courseId_userId: { courseId, userId } } });
  if (existing) return { error: "You already have access to this course.", alreadyOwned: true };

  if (!checkCoursePurchaseRateLimit(userId)) {
    return { error: "You're purchasing too fast. Please slow down." };
  }

  // addendum-coin-wallet-v2.md §6.3/§6.4: coins settle now, no creator
  // payout account required. An attributed affiliate earns a coin
  // commission out of the creator's share (addendum-wallet-only-payments.md
  // §8 #3).
  const affiliate = await getAffiliateAttribution("course", course.id, userId);
  const result = await settleCoinPurchase({
    kind: "course_purchase",
    payerId: userId,
    payeeUserId: course.creatorId,
    amountUsd: course.price,
    currency: course.currency,
    relatedObjectType: "course",
    relatedObjectId: course.id,
    idempotencyKey: `course:coin:${userId}:${course.id}`,
    metadata: { courseId: course.id },
    createRows: createCoursePurchaseRow,
    affiliate,
  });
  if ("error" in result) return { error: result.error };
  if (result.creditedAffiliateId) await notifyAffiliateConversion({ recipientId: result.creditedAffiliateId, actorId: userId });
  if (!result.alreadySettled) {
    const h = await db.username.findUnique({ where: { userId: course.creatorId }, select: { handle: true } });
    if (h) revalidatePath(`/${h.handle}/courses/${course.id}`);
  }
  return { ok: true, free: false };
}

// The access grant, created with the coin charge by settleCoinPurchase
// (addendum-coin-wallet-v2.md §6.2).
async function createCoursePurchaseRow(tx: Prisma.TransactionClient, s: FeatureSettlement): Promise<void> {
  await tx.courseAccessGrant.create({
    data: {
      courseId: s.metadata.courseId,
      userId: s.payerId,
      grantedVia: "purchase",
      paymentTransactionId: s.paymentTransactionId,
    },
  });
}

// spec §5: one-time purchase through the same payments backbone every
// other money-moving feature uses (kind: digital_purchase) — charge, then
// ledger row + purchase row in one transaction, only after a succeeded
// charge, same shape sendTip/subscribeToTier already established.
export async function purchaseProductForUser(userId: string, productId: string): Promise<PurchaseOutcome> {
  const product = await db.digitalProduct.findUnique({ where: { id: productId } });
  if (!product || product.status !== "active") return { error: "This product isn't available." };
  if (product.creatorId === userId) return { error: "You can't buy your own product." };

  const existing = await db.digitalProductPurchase.findFirst({ where: { productId: product.id, buyerId: userId } });
  if (existing) return { error: "You already own this product.", alreadyOwned: true };

  if (!checkProductPurchaseRateLimit(userId)) {
    return { error: "You're purchasing too fast. Please slow down." };
  }

  // addendum-coin-wallet-v2.md §6.3/§6.4: coin purchases settle synchronously
  // and need no payout account on the creator. An attributed affiliate earns
  // a coin commission out of the creator's share
  // (addendum-wallet-only-payments.md §8 #3).
  const affiliate = await getAffiliateAttribution("digital_product", product.id, userId);
  const result = await settleCoinPurchase({
    kind: "digital_purchase",
    payerId: userId,
    payeeUserId: product.creatorId,
    amountUsd: product.price,
    currency: product.currency,
    relatedObjectType: "digital_product",
    relatedObjectId: product.id,
    idempotencyKey: `digital:coin:${userId}:${product.id}`,
    metadata: { productId: product.id },
    createRows: createDigitalPurchaseRow,
    affiliate,
  });
  if ("error" in result) return { error: result.error };
  if (result.creditedAffiliateId) await notifyAffiliateConversion({ recipientId: result.creditedAffiliateId, actorId: userId });
  if (!result.alreadySettled) {
    const h = await db.username.findUnique({ where: { userId: product.creatorId }, select: { handle: true } });
    if (h) revalidatePath(`/${h.handle}`);
  }
  return { ok: true, free: false };
}

// The purchase row, created with the coin charge by settleCoinPurchase
// (addendum-coin-wallet-v2.md §6.2). @@unique([productId, buyerId]) makes
// a concurrent double purchase roll the whole charge back.
async function createDigitalPurchaseRow(tx: Prisma.TransactionClient, s: FeatureSettlement): Promise<void> {
  await tx.digitalProductPurchase.create({
    data: { productId: s.metadata.productId, buyerId: s.payerId, paymentTransactionId: s.paymentTransactionId },
  });
}
