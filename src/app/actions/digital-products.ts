"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { saveProtectedFile, issueDownloadToken } from "@/lib/protected-storage";
import { getPaymentProcessor, recordPaymentTransaction } from "@/lib/payments";
import { getAttributedAffiliateLink, creditAffiliateConversion } from "@/lib/affiliate";
import { notifyAffiliateConversion } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions/auth";

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const STATUS_VALUES = new Set(["draft", "active", "archived"]);

// Same convention as tips.ts's checkTipRateLimit for this class of action.
function checkPurchaseRateLimit(userId: string): boolean {
  return checkRateLimit(`product-purchase:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

type ProductFields = { title: string; description: string; price: number; currency: string; status: string };

function parseAndValidateProductFields(formData: FormData): { error: string } | ProductFields {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 2000) return { error: "Description must be 2000 characters or fewer." };

  const price = Number(formData.get("price"));
  if (!Number.isFinite(price) || price <= 0) return { error: "Price must be a positive number." };

  const currency = String(formData.get("currency") ?? "usd").trim().toLowerCase() || "usd";

  const statusRaw = String(formData.get("status") ?? "draft");
  const status = STATUS_VALUES.has(statusRaw) ? statusRaw : "draft";

  return { title, description, price, currency, status };
}

// spec §5: owner-only CRUD, same shape as offerings.ts. A product's file is
// stored via saveProtectedFile (src/lib/protected-storage.ts), never the
// public saveUploadedImage pipeline — spec §5.3's whole point is that this
// file is never reachable by a plain URL.
export async function createProduct(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const fields = parseAndValidateProductFields(formData);
  if ("error" in fields) return fields;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to sell." };
  const saved = await saveProtectedFile(file, { maxBytes: MAX_FILE_BYTES });
  if ("error" in saved) return saved;

  await db.digitalProduct.create({
    data: { creatorId: user.id, ...fields, fileKey: saved.key, fileMimeType: saved.mimeType, fileSizeBytes: saved.sizeBytes },
  });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

export async function updateProduct(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const productId = String(formData.get("productId") ?? "");

  const product = await db.digitalProduct.findUnique({ where: { id: productId } });
  if (!product) return { error: "Product not found." };
  if (product.creatorId !== user.id) return { error: "You don't have permission to manage this product." };

  const fields = parseAndValidateProductFields(formData);
  if ("error" in fields) return fields;

  // Optional replace — same "only replaces when a new file is submitted"
  // posture as offerings.ts's image handling. Existing buyers simply get
  // the new file on their next download; there's no spec requirement to
  // version files per purchase.
  let fileData = { fileKey: product.fileKey, fileMimeType: product.fileMimeType, fileSizeBytes: product.fileSizeBytes };
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const saved = await saveProtectedFile(file, { maxBytes: MAX_FILE_BYTES });
    if ("error" in saved) return saved;
    fileData = { fileKey: saved.key, fileMimeType: saved.mimeType, fileSizeBytes: saved.sizeBytes };
  }

  await db.digitalProduct.update({ where: { id: product.id }, data: { ...fields, ...fileData } });

  if (user.username) revalidatePath(`/s/${user.username.handle}`);
  return undefined;
}

export async function archiveProduct(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;

  const product = await db.digitalProduct.findUnique({ where: { id: productId } });
  if (!product || product.creatorId !== user.id) return;

  await db.digitalProduct.update({ where: { id: product.id }, data: { status: "archived" } });
  if (user.username) revalidatePath(`/s/${user.username.handle}`);
}

// spec §5: one-time purchase through the same payments backbone every
// other money-moving feature uses (kind: digital_purchase) — charge, then
// ledger row + purchase row in one transaction, only after a succeeded
// charge, same shape sendTip/subscribeToTier already established.
export async function purchaseProduct(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const productId = String(formData.get("productId") ?? "");

  const product = await db.digitalProduct.findUnique({ where: { id: productId } });
  if (!product || product.status !== "active") return { error: "This product isn't available." };
  if (product.creatorId === user.id) return { error: "You can't buy your own product." };

  const existing = await db.digitalProductPurchase.findFirst({ where: { productId: product.id, buyerId: user.id } });
  if (existing) return { error: "You already own this product." };

  const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { userId: product.creatorId } });
  if (!payoutAccount || payoutAccount.status !== "active") {
    return { error: "This creator hasn't enabled payouts yet." };
  }

  if (!checkPurchaseRateLimit(user.id)) {
    return { error: "You're purchasing too fast. Please slow down." };
  }

  const charge = await getPaymentProcessor().charge({
    amount: product.price,
    currency: product.currency,
    payerId: user.id,
    payeeId: product.creatorId,
  });
  if (charge.status !== "succeeded") return { error: "The charge failed. Please try again." };

  // spec §7.3: attribution is resolved before the transaction (it's just a
  // cookie + read query) so the credit write below can happen in the same
  // db.$transaction as the sale's own ledger row — commission is only ever
  // credited alongside a successful PaymentTransaction, never separately.
  const affiliateLink = await getAttributedAffiliateLink("digital_product", product.id, user.id);

  // The `existing` check above is check-then-act, not atomic — two
  // concurrent purchase submits can both pass it before either commits.
  // @@unique([productId, buyerId]) on DigitalProductPurchase is the DB-level
  // backstop; catch its violation here rather than letting it surface as an
  // unhandled 500, same convention as auth.ts's signup race handling.
  let creditedAffiliate;
  try {
    creditedAffiliate = await db.$transaction(async (tx) => {
      const transaction = await recordPaymentTransaction(tx, {
        kind: "digital_purchase",
        payerId: user.id,
        payeeId: product.creatorId,
        amount: product.price,
        currency: product.currency,
        processorReference: charge.processorReference,
        status: "succeeded",
        relatedObjectType: "digital_product",
        relatedObjectId: product.id,
      });
      await tx.digitalProductPurchase.create({
        data: { productId: product.id, buyerId: user.id, paymentTransactionId: transaction.id },
      });

      if (!affiliateLink) return null;
      return creditAffiliateConversion(tx, {
        affiliateLink,
        saleAmount: product.price,
        currency: product.currency,
        saleProcessorReference: charge.processorReference,
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "You already own this product." };
    }
    throw err;
  }
  if (creditedAffiliate) await notifyAffiliateConversion({ recipientId: creditedAffiliate.affiliateId, actorId: user.id });

  const creatorUsername = await db.username.findUnique({ where: { userId: product.creatorId }, select: { handle: true } });
  if (creatorUsername) revalidatePath(`/${creatorUsername.handle}`);
  return undefined;
}

// spec §5.3/§5.4: not a "use server" action wired to a <form>'s action prop
// (ActionState's {error?: string} shape has no room for a success payload)
// — called directly from a client component's onClick, same as any other
// exported async function in a "use server" file. Re-verifies ownership and
// refund status at request time, then issues a short-lived, buyer-scoped
// token — the actual file bytes are only ever reachable by resolving that
// token at /api/downloads/[token], never a stored public URL.
export async function requestDownloadUrl(productId: string): Promise<{ url: string } | { error: string }> {
  const user = await requireVerifiedUser();

  const purchase = await db.digitalProductPurchase.findFirst({
    where: { productId, buyerId: user.id },
    include: { paymentTransaction: { select: { status: true } } },
  });
  if (!purchase) return { error: "You don't own this product." };
  if (purchase.paymentTransaction.status === "refunded") return { error: "This purchase was refunded." };

  const token = issueDownloadToken({ resourceType: "digital_product", resourceId: productId, userId: user.id });
  return { url: `/api/downloads/${token}` };
}
