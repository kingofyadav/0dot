import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/session";
import { ensureUserAccounts, ensureBusinessAccounts, SYSTEM_ACCOUNT_IDS } from "@/lib/wallet/accounts";
import { postTransaction } from "@/lib/wallet/ledger";

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}${counter}-${randomUUID().slice(0, 8)}`;
}

export async function createUser(
  overrides: Partial<{ status: string; email: string; passwordHash: string; createdAt: Date; emailVerifiedAt: Date | null }> = {},
) {
  const email = overrides.email ?? `${unique("user")}@example.com`;
  const user = await db.user.create({
    data: {
      email,
      passwordHash: overrides.passwordHash ?? (await bcrypt.hash("correct-horse-battery-staple", 4)),
      status: overrides.status ?? "active",
      emailVerifiedAt: overrides.emailVerifiedAt === undefined ? new Date() : overrides.emailVerifiedAt,
      // Established by default (2 days old) so the coin-transfer account-age
      // gate (WALLET_LIMITS.TRANSFER_MIN_ACCOUNT_AGE_HOURS) doesn't trip in
      // fixtures. Pass createdAt to test the new-account path.
      createdAt: overrides.createdAt ?? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      username: { create: { handle: unique("handle") } },
      profile: { create: { displayName: unique("Name") } },
    },
    include: { username: true, profile: true },
  });
  return user;
}

export async function createCommunity(overrides: Partial<{ visibility: string; creatorId: string }> = {}) {
  const creatorId = overrides.creatorId ?? (await createUser()).id;
  return db.community.create({
    data: {
      slug: unique("community"),
      name: unique("Community"),
      visibility: overrides.visibility ?? "public",
      createdBy: creatorId,
    },
  });
}

export async function addCommunityMember(communityId: string, userId: string, overrides: Partial<{ role: string; status: string }> = {}) {
  return db.communityMember.create({
    data: {
      communityId,
      userId,
      role: overrides.role ?? "member",
      status: overrides.status ?? "active",
    },
  });
}

export async function createPost(overrides: Partial<{ authorId: string; body: string; communityId: string; businessAuthorId: string }> = {}) {
  const authorId = overrides.authorId ?? (await createUser()).id;
  return db.post.create({
    data: {
      authorId,
      body: overrides.body ?? unique("post body "),
      communityId: overrides.communityId,
      businessAuthorId: overrides.businessAuthorId,
    },
  });
}

export async function createBusiness(overrides: Partial<{ status: string; creatorId: string }> = {}) {
  const creatorId = overrides.creatorId ?? (await createUser()).id;
  return db.business.create({
    data: {
      slug: unique("business"),
      name: unique("Business"),
      category: "other",
      status: overrides.status ?? "pending",
      createdBy: creatorId,
    },
  });
}

export async function blockUser(blockerId: string, blockedId: string) {
  return db.block.create({ data: { blockerId, blockedId } });
}

// Credits a test user's coin ledger from system_promo_issuance.
// `bucket: "spendable"` funds user_wallet (can be transferred); `"promo"`
// funds user_promo (restricted, expiring). createUser() itself deliberately
// grants nothing — factory users start empty, matching a fresh signup
// before its grant.
export async function fundWallet(
  userId: string,
  coins: number,
  bucket: "spendable" | "promo" = "spendable",
) {
  await db.$transaction(async (tx) => {
    const { walletId, promoId } = await ensureUserAccounts(tx, userId);
    await postTransaction(tx, {
      kind: bucket === "spendable" ? "admin_adjustment" : "promo_grant",
      idempotencyKey: `test-fund:${randomUUID()}`,
      memo: "test funding",
      expiresAt:
        bucket === "promo" ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) : null,
      postings: [
        { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: -coins * 100 },
        { accountId: bucket === "spendable" ? walletId : promoId, amount: coins * 100 },
      ],
    });
  });
}

// Credits a business ledger wallet (§6.5) from system_promo_issuance.
export async function fundBusinessWallet(
  businessId: string,
  coins: number,
  bucket: "spendable" | "promo" = "spendable",
) {
  await db.$transaction(async (tx) => {
    const { walletId, promoId } = await ensureBusinessAccounts(tx, businessId);
    await postTransaction(tx, {
      kind: bucket === "spendable" ? "admin_adjustment" : "promo_grant",
      idempotencyKey: `test-fund-biz:${randomUUID()}`,
      memo: "test funding",
      postings: [
        { accountId: SYSTEM_ACCOUNT_IDS.system_promo_issuance, amount: -coins * 100 },
        { accountId: bucket === "spendable" ? walletId : promoId, amount: coins * 100 },
      ],
    });
  });
}

export async function addBusinessMember(businessId: string, userId: string, role = "owner") {
  return db.businessMember.create({ data: { businessId, userId, role } });
}

// Returns the raw token (as if it were the session cookie's value) — the
// DB row only ever stores its hash, matching session.ts's createSession.
export async function createSessionForUser(userId: string) {
  const token = randomUUID();
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return token;
}
