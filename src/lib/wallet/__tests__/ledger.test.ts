import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { createUser } from "@/test/factories";
import { signup } from "@/app/actions/auth";
import { NextRedirectSignal } from "@/test/next-test-state";
import { ensureUserAccounts, SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";
import { postTransaction, getWalletBalance, WalletError } from "@/lib/wallet/ledger";
import { chargeWallet } from "@/lib/wallet/charge";
import { issueSignupGrant } from "@/lib/wallet/grants";
import { runWalletReconciliationOnce } from "@/lib/wallet/reconcile";

async function accountsFor(userId: string) {
  return db.$transaction((tx) => ensureUserAccounts(tx, userId));
}

describe("postTransaction", () => {
  it("rejects postings that do not sum to zero", async () => {
    const user = await createUser();
    const { walletId } = await accountsFor(user.id);
    await expect(
      db.$transaction((tx) =>
        postTransaction(tx, {
          kind: "admin_adjustment",
          idempotencyKey: `t:${user.id}:bad`,
          postings: [
            { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: -100 },
            { accountId: walletId, amount: 50 },
          ],
        }),
      ),
    ).rejects.toThrow(WalletError);
  });

  it("is idempotent on idempotencyKey — a replay moves no additional value", async () => {
    const user = await createUser();
    const { walletId } = await accountsFor(user.id);
    const key = `t:${user.id}:grant`;
    const post = () =>
      db.$transaction((tx) =>
        postTransaction(tx, {
          kind: "admin_adjustment",
          idempotencyKey: key,
          postings: [
            { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: -300 },
            { accountId: walletId, amount: 300 },
          ],
        }),
      );

    const first = await post();
    const second = await post();
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.transaction.id).toBe(first.transaction.id);
    expect((await getWalletBalance(user.id)).spendableUnits).toBe(300);
  });

  it("guards an owner account against going negative and rolls the transaction back", async () => {
    const user = await createUser();
    const { walletId } = await accountsFor(user.id);

    await expect(
      db.$transaction((tx) =>
        postTransaction(tx, {
          kind: "transfer",
          idempotencyKey: `t:${user.id}:overdraft`,
          postings: [
            { accountId: walletId, amount: -100 },
            { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: 100 },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });

    expect(await db.ledgerTransaction.findUnique({ where: { idempotencyKey: `t:${user.id}:overdraft` } })).toBeNull();
    expect((await getWalletBalance(user.id)).totalUnits).toBe(0);
  });
});

describe("issueSignupGrant", () => {
  it("credits the restricted bucket via a signup_grant transaction", async () => {
    const user = await createUser();
    await db.$transaction(async (tx) => {
      await ensureUserAccounts(tx, user.id);
      await issueSignupGrant(tx, user.id);
    });

    const balance = await getWalletBalance(user.id);
    expect(balance.restricted).toBe(1);
    expect(balance.spendable).toBe(0);

    const grant = await db.ledgerTransaction.findUniqueOrThrow({ where: { idempotencyKey: `signup_grant:${user.id}` } });
    expect(grant.kind).toBe("signup_grant");
    expect(grant.expiresAt).toBeInstanceOf(Date);
  });
});

describe("signup() wiring", () => {
  it("gives a new account a signup_grant LedgerTransaction and a launch-promo grant", async () => {
    const fd = new FormData();
    fd.set("displayName", "Grant Tester");
    fd.set("username", `grant${Date.now().toString(36)}`);
    fd.set("email", `grant-${Date.now()}@example.com`);
    fd.set("password", "correct-horse-battery-staple");
    fd.set("phoneDialCode", "1");
    fd.set("phoneNumber", `415${Math.floor(1000000 + Math.random() * 8999999)}`);
    fd.set("dateOfBirth", "2000-01-01");

    let state;
    try {
      state = await signup(undefined, fd);
    } catch (err) {
      if (!(err instanceof NextRedirectSignal)) throw err;
    }
    expect(state?.error, `signup returned an error: ${state?.error}`).toBeUndefined();

    const created = await db.user.findFirstOrThrow({ where: { email: { startsWith: "grant-" } }, orderBy: { createdAt: "desc" } });
    const grant = await db.ledgerTransaction.findUnique({ where: { idempotencyKey: `signup_grant:${created.id}` } });
    expect(grant).not.toBeNull();
    const launch = await db.ledgerTransaction.findUnique({ where: { idempotencyKey: `launch_promo:${created.id}` } });
    expect(launch?.memo).toBe("launch");

    // 1-coin base grant + 6-coin launch promo, both restricted.
    const balance = await getWalletBalance(created.id);
    expect(balance.restricted).toBe(7);
    expect(balance.spendable).toBe(0);
  });
});

describe("chargeWallet (no external payee)", () => {
  it("draws the promo bucket before the spendable bucket", async () => {
    const user = await createUser();
    const { walletId, promoId } = await accountsFor(user.id);
    await db.$transaction((tx) =>
      postTransaction(tx, {
        kind: "promo_grant",
        idempotencyKey: `seed-promo:${user.id}`,
        expiresAt: new Date(Date.now() + 8.64e9),
        postings: [
          { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: -300 },
          { accountId: promoId, amount: 300 },
        ],
      }),
    );
    await db.$transaction((tx) =>
      postTransaction(tx, {
        kind: "admin_adjustment",
        idempotencyKey: `seed-wallet:${user.id}`,
        postings: [
          { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: -300 },
          { accountId: walletId, amount: 300 },
        ],
      }),
    );

    await db.$transaction((tx) =>
      chargeWallet(tx, {
        payerId: user.id,
        amountUsd: 4, // 400 units, 0dot is the payee
        currency: "usd",
        kind: "platform_subscription_charge",
        idempotencyKey: `spend:${user.id}`,
      }),
    );

    const balance = await getWalletBalance(user.id);
    expect(balance.restrictedUnits).toBe(0);
    expect(balance.spendableUnits).toBe(200);
  });
});

describe("runWalletReconciliationOnce", () => {
  it("reports healthy with a zero global sum after wallet activity", async () => {
    const user = await createUser();
    await db.$transaction(async (tx) => {
      await ensureUserAccounts(tx, user.id);
      await issueSignupGrant(tx, user.id);
    });

    const result = await runWalletReconciliationOnce();
    expect(result.globalSum).toBe(0);
    expect(result.unbalancedTransactions).toBe(0);
    expect(result.negativeOwnerAccounts).toBe(0);
    expect(result.healthy).toBe(true);
  });

  it("heals a drifted cachedBalance", async () => {
    const user = await createUser();
    const { walletId } = await accountsFor(user.id);
    await db.$transaction((tx) =>
      postTransaction(tx, {
        kind: "admin_adjustment",
        idempotencyKey: `drift:${user.id}`,
        postings: [
          { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: -500 },
          { accountId: walletId, amount: 500 },
        ],
      }),
    );
    await db.ledgerAccount.update({ where: { id: walletId }, data: { cachedBalance: 999 } });

    const result = await runWalletReconciliationOnce();
    expect(result.drift).toBeGreaterThanOrEqual(1);
    expect((await db.ledgerAccount.findUniqueOrThrow({ where: { id: walletId } })).cachedBalance).toBe(500);
  });
});
