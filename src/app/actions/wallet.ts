"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser, requireOwnProfile } from "@/lib/auth-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { purchaseProfilePremiumWithCoins } from "@/lib/platform-billing";
import { WALLET_LIMITS } from "@/lib/wallet/limits";
import { transferCoinsCore } from "@/lib/wallet/transfer";
import type { ActionState } from "@/app/actions/auth";

const BILLING_INTERVAL_VALUES = new Set(["monthly", "yearly"]);

const MAX_TRANSFER_COINS = WALLET_LIMITS.TRANSFER_MAX_COINS_PER_TX;

function checkTransferRateLimit(userId: string): Promise<boolean> {
  return enforceRateLimit(`wallet-transfer:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

// Moves coins from the caller's SPENDABLE bucket straight to another user's
// spendable bucket — no admin/gateway step (nothing external to confirm).
// transferCoinsCore does the eligibility/velocity checks and the
// single-transaction double-entry post + CoinTransfer row, and enforces
// that the promo (restricted) bucket is never a transfer source
// (addendum-coin-wallet-v2.md §5.2, §8).
export async function transferCoinsAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const handle = String(formData.get("handle") ?? "").trim().toLowerCase();

  const rawAmount = Number(formData.get("coinAmount"));
  const coinAmount = Math.round(rawAmount);
  if (!Number.isFinite(coinAmount) || coinAmount < WALLET_LIMITS.TRANSFER_MIN_COINS || coinAmount > MAX_TRANSFER_COINS) {
    return { error: `Amount must be between ${WALLET_LIMITS.TRANSFER_MIN_COINS} and ${MAX_TRANSFER_COINS} coins.` };
  }

  if (!(await checkTransferRateLimit(user.id))) {
    return { error: "You're sending coins too fast. Please slow down." };
  }

  const recipientUsername = await db.username.findUnique({ where: { handle }, select: { userId: true } });
  if (!recipientUsername) return { error: "No user with that username." };
  if (recipientUsername.userId === user.id) return { error: "You can't send coins to yourself." };

  const result = await transferCoinsCore({
    fromUserId: user.id,
    toUserId: recipientUsername.userId,
    coins: coinAmount,
    idempotencyKey: `transfer:${randomUUID()}`,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/wallet");
  return { success: true };
}

function checkVipPurchaseRateLimit(userId: string): Promise<boolean> {
  return enforceRateLimit(`wallet-vip:${userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
}

// Spends coins on Premium. Reuses the platform's actual Premium Profile perks
// (linkCapFor/isProfilePremium/etc. in platform-billing.ts) via a
// coin-funded PlatformSubscription row instead of inventing a separate
// "VIP" gate, so there's exactly one definition of what premium unlocks
// regardless of whether it was paid for with a card or with coins.
export async function purchaseVipAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireOwnProfile();

  const billingInterval = String(formData.get("billingInterval") ?? "monthly");
  if (!BILLING_INTERVAL_VALUES.has(billingInterval)) return { error: "Choose a billing interval." };

  if (!(await checkVipPurchaseRateLimit(user.id))) {
    return { error: "You're purchasing too fast. Please slow down." };
  }

  const result = await purchaseProfilePremiumWithCoins(user.id, user.profile!.id, billingInterval, formData.get("idempotencyKey"));
  if (result.error) return { error: result.error };

  revalidatePath("/wallet");
  if (user.username) {
    revalidatePath(`/${user.username.handle}`);
    revalidatePath(`/s/${user.username.handle}`);
  }
  return { success: true };
}
