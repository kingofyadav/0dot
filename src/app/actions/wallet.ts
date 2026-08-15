"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser, requirePlatformAdmin, requireOwnProfile } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { purchaseProfilePremiumWithCoins } from "@/lib/platform-billing";
import type { ActionState } from "@/app/actions/auth";

const BILLING_INTERVAL_VALUES = new Set(["monthly", "yearly"]);

// Admin has manually cross-checked the UTR against the platform's own
// UPI/bank statement outside the app. Crediting coinBalance and marking the
// request approved happen together so a crash between the two can't leave
// coins credited without a matching "approved" row (or vice versa).
export async function approveTopUpRequest(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const requestId = String(formData.get("requestId") ?? "");

  await db.$transaction(async (tx) => {
    // Gate the status flip itself on still being "submitted" — two admins
    // (or one double-clicking) approving the same request concurrently must
    // only ever credit coinBalance once. A plain findUnique-then-update
    // outside the transaction would read "submitted" twice before either
    // write lands and double-credit.
    const claimed = await tx.coinTopUpRequest.updateMany({
      where: { id: requestId, status: "submitted" },
      data: { status: "approved", reviewedAt: new Date(), reviewedByUserId: admin.id },
    });
    if (claimed.count === 0) return;

    const request = await tx.coinTopUpRequest.findUniqueOrThrow({ where: { id: requestId } });
    await tx.user.update({
      where: { id: request.userId },
      data: { coinBalance: { increment: request.coinAmount } },
    });
  });

  revalidatePath("/admin/wallet/topups");
}

export async function rejectTopUpRequest(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim() || undefined;

  await db.coinTopUpRequest.updateMany({
    where: { id: requestId, status: "submitted" },
    data: { status: "rejected", reviewedAt: new Date(), reviewedByUserId: admin.id, reviewNote },
  });

  revalidatePath("/admin/wallet/topups");
}

// Admin has manually sent the money via UPI to the request's snapshotted
// vpa, outside the app, and is recording whatever reference their own UPI
// app gave them as proof it went out — same "an admin's word is the only
// record" posture as approveTopUpRequest, mirrored in the opposite
// direction. Gated on an atomic "pending" claim for the same double-click/
// two-admin reason.
export async function markPayoutPaid(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const paidReference = String(formData.get("paidReference") ?? "").trim();

  if (!paidReference) return;

  await db.coinPayoutRequest.updateMany({
    where: { id: requestId, status: "pending" },
    data: { status: "paid", paidReference, reviewedAt: new Date(), reviewedByUserId: admin.id },
  });

  revalidatePath("/admin/wallet/payouts");
}

// Rejects a pending payout (e.g. an invalid/unreachable vpa) and credits
// the escrowed coins straight back — status flip and the refund happen in
// one transaction, atomically gated on "pending" so a request can't be
// rejected twice and refunded twice.
export async function rejectPayoutRequest(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim() || undefined;

  await db.$transaction(async (tx) => {
    const claimed = await tx.coinPayoutRequest.updateMany({
      where: { id: requestId, status: "pending" },
      data: { status: "rejected", reviewedAt: new Date(), reviewedByUserId: admin.id, reviewNote },
    });
    if (claimed.count === 0) return;

    const request = await tx.coinPayoutRequest.findUniqueOrThrow({ where: { id: requestId } });
    await tx.user.update({
      where: { id: request.userId },
      data: { coinBalance: { increment: request.coinAmount } },
    });
  });

  revalidatePath("/admin/wallet/payouts");
}

// Same abuse-resistance posture as MIN/MAX_TOPUP_COINS — coins aren't real
// money right now, but a per-transfer ceiling still stops one account from
// dumping its whole balance into another in a single click.
const MAX_TRANSFER_COINS = 20;

function checkTransferRateLimit(userId: string): boolean {
  return checkRateLimit(`wallet-transfer:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

// Moves coins from the caller straight to another platform user's balance,
// no admin/gateway step in between (unlike top-up/payout, there's nothing
// external to confirm). Debit, credit, and the CoinTransfer ledger row all
// land in one transaction — same "can't crash halfway" posture as
// purchaseProfilePremiumWithCoins — gated on coinBalance staying >= amount
// so two concurrent transfers can't overdraft the same balance.
export async function transferCoinsAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const handle = String(formData.get("handle") ?? "").trim().toLowerCase();

  const rawAmount = Number(formData.get("coinAmount"));
  const coinAmount = Math.round(rawAmount);
  if (!Number.isFinite(coinAmount) || coinAmount < 1 || coinAmount > MAX_TRANSFER_COINS) {
    return { error: `Amount must be between 1 and ${MAX_TRANSFER_COINS} coins.` };
  }

  if (!checkTransferRateLimit(user.id)) {
    return { error: "You're sending coins too fast. Please slow down." };
  }

  const recipientUsername = await db.username.findUnique({ where: { handle }, select: { userId: true } });
  if (!recipientUsername) return { error: "No user with that username." };
  if (recipientUsername.userId === user.id) return { error: "You can't send coins to yourself." };

  let insufficientBalance = false;
  await db.$transaction(async (tx) => {
    const debited = await tx.user.updateMany({
      where: { id: user.id, coinBalance: { gte: coinAmount } },
      data: { coinBalance: { decrement: coinAmount } },
    });
    if (debited.count === 0) {
      insufficientBalance = true;
      return;
    }
    await tx.user.update({
      where: { id: recipientUsername.userId },
      data: { coinBalance: { increment: coinAmount } },
    });
    await tx.coinTransfer.create({
      data: { fromUserId: user.id, toUserId: recipientUsername.userId, amount: coinAmount },
    });
  });

  if (insufficientBalance) return { error: `You only have ${user.coinBalance} coins.` };

  revalidatePath("/wallet");
  return { success: true };
}

function checkVipPurchaseRateLimit(userId: string): boolean {
  return checkRateLimit(`wallet-vip:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

// The first real spend of coinBalance — everything above this line only
// ever adds to it. Reuses the platform's actual Premium Profile perks
// (linkCapFor/isProfilePremium/etc. in platform-billing.ts) via a
// coin-funded PlatformSubscription row instead of inventing a separate
// "VIP" gate, so there's exactly one definition of what premium unlocks
// regardless of whether it was paid for with a card or with coins.
export async function purchaseVipAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const billingInterval = String(formData.get("billingInterval") ?? "monthly");
  if (!BILLING_INTERVAL_VALUES.has(billingInterval)) return { error: "Choose a billing interval." };

  if (!checkVipPurchaseRateLimit(user.id)) {
    return { error: "You're purchasing too fast. Please slow down." };
  }

  const result = await purchaseProfilePremiumWithCoins(user.id, user.profile!.id, billingInterval);
  if (result.error) return { error: result.error };

  revalidatePath("/wallet");
  if (user.username) {
    revalidatePath(`/${user.username.handle}`);
    revalidatePath(`/s/${user.username.handle}`);
  }
  return { success: true };
}
