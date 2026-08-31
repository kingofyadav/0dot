import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { createUser, createPost } from "@/test/factories";
import { signup } from "@/app/actions/auth";
import { cookieJar, NextRedirectSignal } from "@/test/next-test-state";
import {
  getOrCreateReferralCode,
  recordReferralAttribution,
  maybeGrantReferralReward,
  runReferralRewardSweepOnce,
  getReferralStats,
} from "@/lib/wallet/referral";
import { getWalletBalance } from "@/lib/wallet/ledger";
import { runWalletReconciliationOnce } from "@/lib/wallet/reconcile";

async function attribute(inviteeId: string, code: string) {
  await db.$transaction((tx) => recordReferralAttribution(tx, inviteeId, code));
}

describe("referral code + attribution", () => {
  it("mints one stable code per user and resolves it", async () => {
    const inviter = await createUser();
    const code = await getOrCreateReferralCode(inviter.id);
    expect(code).toMatch(/^[a-z0-9]{4,8}$/);
    expect(await getOrCreateReferralCode(inviter.id)).toBe(code);

    const invitee = await createUser();
    await attribute(invitee.id, code);
    expect((await db.user.findUniqueOrThrow({ where: { id: invitee.id } })).referredByUserId).toBe(inviter.id);
  });

  it("ignores an unknown code and a self-referral", async () => {
    const user = await createUser();
    const ownCode = await getOrCreateReferralCode(user.id);
    await attribute(user.id, ownCode);
    await attribute(user.id, "nope-not-real");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).referredByUserId).toBeNull();
  });

  it("records attribution at signup from the ref cookie", async () => {
    const inviter = await createUser();
    const code = await getOrCreateReferralCode(inviter.id);
    cookieJar.set("ref", code);

    const fd = new FormData();
    fd.set("displayName", "Referred User");
    fd.set("username", `ref${Date.now().toString(36)}`);
    fd.set("email", `referred-${Date.now()}@example.com`);
    fd.set("password", "correct-horse-battery-staple");
    fd.set("phoneDialCode", "1");
    fd.set("phoneNumber", `415${Math.floor(1000000 + Math.random() * 8999999)}`);
    fd.set("dateOfBirth", "2000-01-01");

    try {
      await signup(undefined, fd);
    } catch (err) {
      if (!(err instanceof NextRedirectSignal)) throw err;
    } finally {
      cookieJar.delete("ref");
    }

    const created = await db.user.findFirstOrThrow({ where: { email: { startsWith: "referred-" } }, orderBy: { createdAt: "desc" } });
    expect(created.referredByUserId).toBe(inviter.id);
  });
});

describe("maybeGrantReferralReward", () => {
  async function pair() {
    const inviter = await createUser(); // 2 days old by default → past age gate
    await getOrCreateReferralCode(inviter.id);
    const invitee = await createUser();
    await attribute(invitee.id, await getOrCreateReferralCode(inviter.id));
    return { inviter, invitee };
  }

  it("pays both sides into the restricted bucket once the invitee acts", async () => {
    const { inviter, invitee } = await pair();

    expect((await maybeGrantReferralReward(invitee.id)).reason).toBe("no_action");
    await createPost({ authorId: invitee.id });

    const r = await maybeGrantReferralReward(invitee.id);
    expect(r.granted).toBe(true);

    expect((await getWalletBalance(inviter.id)).restricted).toBe(3);
    expect((await getWalletBalance(invitee.id)).restricted).toBe(3);

    const txn = await db.ledgerTransaction.findUniqueOrThrow({ where: { idempotencyKey: `referral_reward:${invitee.id}` } });
    expect(txn.actorUserId).toBe(inviter.id);
    const postings = await db.ledgerPosting.findMany({ where: { transactionId: txn.id } });
    expect(postings.reduce((s, p) => s + p.amount, 0)).toBe(0);

    // Idempotent.
    expect((await maybeGrantReferralReward(invitee.id)).reason).toBe("already_rewarded");
    expect((await getWalletBalance(inviter.id)).restricted).toBe(3);
    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
  });

  it("won't pay for an unverified invitee or a too-new inviter", async () => {
    const freshInviter = await createUser({ createdAt: new Date() });
    await getOrCreateReferralCode(freshInviter.id);
    const invitee1 = await createUser();
    await attribute(invitee1.id, await getOrCreateReferralCode(freshInviter.id));
    await createPost({ authorId: invitee1.id });
    expect((await maybeGrantReferralReward(invitee1.id)).reason).toBe("inviter_too_new");

    const inviter = await createUser();
    await getOrCreateReferralCode(inviter.id);
    const unverified = await createUser({ emailVerifiedAt: null });
    await attribute(unverified.id, await getOrCreateReferralCode(inviter.id));
    await createPost({ authorId: unverified.id });
    expect((await maybeGrantReferralReward(unverified.id)).reason).toBe("unverified");
  });

  it("the sweep grants pending rewards", async () => {
    const { inviter, invitee } = await pair();
    await createPost({ authorId: invitee.id });

    const result = await runReferralRewardSweepOnce();
    expect(result.granted).toBeGreaterThanOrEqual(1);
    expect((await getWalletBalance(invitee.id)).restricted).toBe(3);

    const stats = await getReferralStats(inviter.id);
    expect(stats.attributedSignups).toBeGreaterThanOrEqual(1);
    expect(stats.rewardedInvites).toBeGreaterThanOrEqual(1);
  });
});
