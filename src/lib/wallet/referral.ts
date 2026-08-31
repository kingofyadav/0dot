import "server-only";
import { randomBytes } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { postTransaction } from "@/lib/wallet/ledger";
import { ensureUserAccounts, SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";
import { WALLET_LIMITS, coinsToUnits } from "@/lib/wallet/limits";
import { notifyCoinsReceived } from "@/lib/notifications";

// addendum-coin-wallet-v2.md §7.5 — referral rewards. Distinct from
// AffiliateLink (a % on a specific offering's sales); this rewards bringing
// a brand-new person onto the platform, paid only once the invitee shows
// real intent (verified email + one meaningful action).

export const REFERRAL_COOKIE = "ref";

function mintCode(): string {
  return randomBytes(9).toString("base64url").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
}

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await db.referralCode.findUnique({ where: { userId } });
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await db.referralCode.create({ data: { userId, code: mintCode() } });
      return created.code;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const now = await db.referralCode.findUnique({ where: { userId } });
        if (now) return now.code; // lost a userId race
        continue; // code collision — retry
      }
      throw err;
    }
  }
  throw new Error(`getOrCreateReferralCode: could not mint a unique code for ${userId}`);
}

export async function resolveReferralCode(
  client: Pick<Prisma.TransactionClient, "referralCode">,
  code: string | null | undefined,
): Promise<string | null> {
  const trimmed = code?.trim().toLowerCase();
  if (!trimmed) return null;
  const row = await client.referralCode.findUnique({ where: { code: trimmed }, select: { userId: true } });
  return row?.userId ?? null;
}

// Called from auth.ts signup, inside the user-creation transaction. Writes
// referredByUserId once; a self-referral or an unknown code is a silent
// no-op.
export async function recordReferralAttribution(
  tx: Prisma.TransactionClient,
  newUserId: string,
  refCode: string | null,
): Promise<void> {
  const inviterId = await resolveReferralCode(tx, refCode);
  if (!inviterId || inviterId === newUserId) return;
  await tx.user.update({ where: { id: newUserId }, data: { referredByUserId: inviterId } });
}

async function inviteeCompletedAction(userId: string): Promise<boolean> {
  const [posts, links, purchases] = await Promise.all([
    db.post.count({ where: { authorId: userId } }),
    db.link.count({ where: { profile: { userId } } }),
    db.paymentTransaction.count({ where: { payerId: userId } }),
  ]);
  return posts + links + purchases > 0;
}

// The earned-not-automatic payout. Idempotent on
// `referral_reward:${inviteeUserId}` — safe to call from the verify route,
// from feature actions, and from the daily sweep.
export async function maybeGrantReferralReward(
  inviteeUserId: string,
): Promise<{ granted: boolean; reason?: string }> {
  const invitee = await db.user.findUnique({
    where: { id: inviteeUserId },
    select: { referredByUserId: true, emailVerifiedAt: true },
  });
  if (!invitee?.referredByUserId) return { granted: false, reason: "no_referrer" };
  if (!invitee.emailVerifiedAt) return { granted: false, reason: "unverified" };

  const already = await db.ledgerTransaction.findUnique({
    where: { idempotencyKey: `referral_reward:${inviteeUserId}` },
  });
  if (already) return { granted: false, reason: "already_rewarded" };

  if (!(await inviteeCompletedAction(inviteeUserId))) return { granted: false, reason: "no_action" };

  const inviterId = invitee.referredByUserId;
  const inviter = await db.user.findUnique({
    where: { id: inviterId },
    select: { emailVerifiedAt: true, createdAt: true, status: true },
  });
  if (!inviter || inviter.status !== "active" || !inviter.emailVerifiedAt) {
    return { granted: false, reason: "inviter_ineligible" };
  }
  const inviterAgeHours = (Date.now() - inviter.createdAt.getTime()) / (60 * 60 * 1000);
  if (inviterAgeHours < WALLET_LIMITS.TRANSFER_MIN_ACCOUNT_AGE_HOURS) {
    return { granted: false, reason: "inviter_too_new" };
  }

  const rewardedCount = await db.ledgerTransaction.count({
    where: { kind: "referral_reward", actorUserId: inviterId },
  });
  if (rewardedCount >= WALLET_LIMITS.REFERRAL_MAX_REWARDED_INVITES_PER_INVITER) {
    logger.warn("referral: inviter at lifetime cap", undefined, { inviterId, rewardedCount });
    return { granted: false, reason: "inviter_capped" };
  }

  const inviterUnits = coinsToUnits(WALLET_LIMITS.REFERRAL_REWARD_INVITER_COINS);
  const inviteeUnits = coinsToUnits(WALLET_LIMITS.REFERRAL_REWARD_INVITEE_COINS);
  const expiresAt = new Date(Date.now() + WALLET_LIMITS.REFERRAL_REWARD_TTL_DAYS * 24 * 60 * 60 * 1000);

  const { created } = await db.$transaction(async (tx) => {
    const inviterPromo = (await ensureUserAccounts(tx, inviterId)).promoId;
    const inviteePromo = (await ensureUserAccounts(tx, inviteeUserId)).promoId;
    return postTransaction(tx, {
      kind: "referral_reward",
      idempotencyKey: `referral_reward:${inviteeUserId}`,
      actorUserId: inviterId,
      memo: "referral",
      relatedObjectType: "user",
      relatedObjectId: inviteeUserId,
      expiresAt,
      postings: [
        { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: -(inviterUnits + inviteeUnits) },
        { accountId: inviterPromo, amount: inviterUnits },
        { accountId: inviteePromo, amount: inviteeUnits },
      ],
    });
  });

  // Lost a race with a concurrent call (eager /verify vs. the daily sweep):
  // the coins moved once, but skip the second pair of notifications.
  if (!created) return { granted: false, reason: "already_rewarded" };

  await notifyCoinsReceived({ recipientId: inviterId, actorId: inviteeUserId });
  await notifyCoinsReceived({ recipientId: inviteeUserId, actorId: inviterId });
  return { granted: true };
}

// Daily cron backstop — catches invitees who completed an action after
// verifying (so the eager trigger in /verify saw nothing). Scoped to
// recently-verified cohorts: an invitee who verified 60+ days ago and
// still hasn't done a post/link/purchase isn't going to, and re-scanning
// every rewarded account forever doesn't scale. `maybeGrantReferralReward`
// itself no-ops on an already-rewarded invitee.
const REFERRAL_SWEEP_LOOKBACK_DAYS = 60;

export async function runReferralRewardSweepOnce() {
  const since = new Date(Date.now() - REFERRAL_SWEEP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rewarded = new Set(
    (
      await db.ledgerTransaction.findMany({
        where: { kind: "referral_reward" },
        select: { relatedObjectId: true },
      })
    ).map((t) => t.relatedObjectId),
  );

  const candidates = await db.user.findMany({
    where: { referredByUserId: { not: null }, emailVerifiedAt: { gte: since } },
    select: { id: true },
    orderBy: { emailVerifiedAt: "desc" },
    take: 5000,
  });

  let granted = 0;
  for (const { id } of candidates) {
    if (rewarded.has(id)) continue;
    try {
      if ((await maybeGrantReferralReward(id)).granted) granted += 1;
    } catch (err) {
      logger.error("referral-sweep: failed for invitee", err, { inviteeUserId: id });
    }
  }
  const result = { candidates: candidates.length, granted };
  logger.info("referral-sweep: done", undefined, result);
  return result;
}

export async function getReferralStats(userId: string) {
  const code = await getOrCreateReferralCode(userId);
  const [attributedSignups, rewardedInvites] = await Promise.all([
    db.user.count({ where: { referredByUserId: userId } }),
    db.ledgerTransaction.count({ where: { kind: "referral_reward", actorUserId: userId } }),
  ]);
  return {
    code,
    attributedSignups,
    rewardedInvites,
    maxRewarded: WALLET_LIMITS.REFERRAL_MAX_REWARDED_INVITES_PER_INVITER,
    rewardCoins: WALLET_LIMITS.REFERRAL_REWARD_INVITER_COINS,
  };
}
