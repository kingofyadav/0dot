"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser, requirePlatformAdmin, requireOwnProfile } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { coinsToInr } from "@/lib/upi";
import { purchaseProfilePremiumWithCoins } from "@/lib/platform-billing";
import type { ActionState } from "@/app/actions/auth";

const BILLING_INTERVAL_VALUES = new Set(["monthly", "yearly"]);

// No payment gateway in this build. At $1/coin, same posture as the min/max
// ceilings on tips.ts's MAX_TIP_AMOUNT: abuse-resistance, not a spec
// requirement.
const MIN_TOPUP_COINS = 10;
const MAX_TOPUP_COINS = 1_000;

function generateReferenceCode(): string {
  return `0DOT-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function checkTopUpRateLimit(userId: string): boolean {
  return checkRateLimit(`wallet-topup:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

// Starts a top-up: creates the row up front so the UPI deep link/QR can
// embed referenceCode as the "tn" note, then sends the user to the page
// that renders it and collects the UTR once they've paid.
export async function createTopUpRequest(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  const rawAmount = Number(formData.get("coinAmount"));
  const coinAmount = Math.round(rawAmount);
  if (!Number.isFinite(coinAmount) || coinAmount < MIN_TOPUP_COINS || coinAmount > MAX_TOPUP_COINS) {
    return { error: `Amount must be between ${MIN_TOPUP_COINS} and ${MAX_TOPUP_COINS} coins.` };
  }

  if (!checkTopUpRateLimit(user.id)) {
    return { error: "You're creating top-up requests too fast. Please slow down." };
  }

  const request = await db.coinTopUpRequest.create({
    data: {
      userId: user.id,
      coinAmount,
      amountInr: coinsToInr(coinAmount),
      referenceCode: generateReferenceCode(),
    },
  });

  redirect(`/wallet/topup/${request.id}`);
}

// Owner submits the UTR/reference number their UPI app gave them after
// paying — this is the only "proof" in this flow, since there's no gateway
// to confirm the payment automatically. An admin still has to manually
// cross-check it (approveTopUpRequest) before any coins are credited.
export async function submitTopUpUtr(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const requestId = String(formData.get("requestId") ?? "");
  const utr = String(formData.get("utr") ?? "").trim();

  if (!/^[A-Za-z0-9]{6,24}$/.test(utr)) {
    return { error: "Enter the UPI transaction/reference number (UTR) from your payment app." };
  }

  const request = await db.coinTopUpRequest.findUnique({ where: { id: requestId } });
  if (!request || request.userId !== user.id) return { error: "Top-up request not found." };
  if (request.status !== "pending_payment") {
    return { error: "This request has already been submitted or reviewed." };
  }

  await db.coinTopUpRequest.update({
    where: { id: requestId },
    data: { utr, submittedAt: new Date(), status: "submitted" },
  });

  revalidatePath(`/wallet/topup/${requestId}`);
  return { success: true };
}

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

const VPA_PATTERN = /^[\w.-]{2,256}@[a-zA-Z]{2,64}$/;

// Just records where a future coin-to-cash payout would go — no payout
// execution exists yet (no gateway to send money through), this only gets
// the VPA on file. The submitted value may have come from the user typing
// it directly or from client-side-decoding a photo of their own UPI QR
// code (SavePayoutVpaForm.tsx) — either way it arrives here as plain text.
export async function savePayoutVpa(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const vpa = String(formData.get("vpa") ?? "").trim();

  if (!VPA_PATTERN.test(vpa)) {
    return { error: "Enter a valid UPI address, e.g. name@bank." };
  }

  await db.user.update({ where: { id: user.id }, data: { payoutUpiVpa: vpa } });

  revalidatePath("/wallet");
  return { success: true };
}

// Same abuse-resistance posture as MIN/MAX_TOPUP_COINS — a floor so a
// payout is worth an admin's time to hand-execute, not a finance decision.
const MIN_PAYOUT_COINS = 50;

function checkPayoutRateLimit(userId: string): boolean {
  return checkRateLimit(`wallet-payout:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

// Reverse of createTopUpRequest: debits coinBalance up front (escrow-style,
// at request time rather than at payment time) so the same coins can't also
// be spent on Premium while a payout is pending, then creates the request
// row in the same transaction so a crash between the two can't leave coins
// debited with no request to show for it. vpa is snapshotted from the
// user's on-file payoutUpiVpa rather than read live later, so a subsequent
// address change can't retroactively change where this payout is
// understood to have gone.
export async function requestCoinPayout(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();

  if (!user.payoutUpiVpa) {
    return { error: "Save a UPI payout address first." };
  }

  const rawAmount = Number(formData.get("coinAmount"));
  const coinAmount = Math.round(rawAmount);
  if (!Number.isFinite(coinAmount) || coinAmount < MIN_PAYOUT_COINS) {
    return { error: `Amount must be at least ${MIN_PAYOUT_COINS} coins.` };
  }

  if (!checkPayoutRateLimit(user.id)) {
    return { error: "You're requesting payouts too fast. Please slow down." };
  }

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
    await tx.coinPayoutRequest.create({
      data: {
        userId: user.id,
        coinAmount,
        amountInr: coinsToInr(coinAmount),
        vpa: user.payoutUpiVpa!,
      },
    });
  });

  if (insufficientBalance) return { error: `You only have ${user.coinBalance} coins.` };

  revalidatePath("/wallet");
  return { success: true };
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
