import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createUser, fundWallet } from "@/test/factories";
import { issueAuthorizationCode, exchangeAuthorizationCode } from "@/lib/oauth";
import { getWalletBalance } from "@/lib/wallet/ledger";
import { runWalletReconciliationOnce } from "@/lib/wallet/reconcile";
import { POST as postPurchase } from "@/app/api/v1/wallet/purchases/route";
import { GET as getItem } from "@/app/api/v1/marketplace/[category]/[id]/route";
import { POST as postDownload } from "@/app/api/v1/marketplace/[category]/[id]/download/route";

async function bearerFor(userId: string, scopes: string[]) {
  const app = await db.developerApp.create({
    data: {
      ownerType: "user",
      ownerUserId: userId,
      name: "Marketplace Purchase Test App",
      description: "test",
      clientId: `client_${randomUUID()}`,
      clientSecretHash: "unused",
      isPublicClient: true,
      redirectUrisJson: JSON.stringify(["https://example.com/callback"]),
    },
  });
  const code = await issueAuthorizationCode({
    appId: app.id,
    userId,
    redirectUri: "https://example.com/callback",
    approvedScopes: scopes,
    codeChallenge: "verifier123",
    codeChallengeMethod: "plain",
  });
  const result = await exchangeAuthorizationCode({ code, codeVerifier: "verifier123", redirectUri: "https://example.com/callback", appId: app.id });
  if ("error" in result) throw new Error(result.error);
  return result.accessToken;
}

async function buy(userId: string, body: Record<string, unknown>) {
  const token = await bearerFor(userId, ["payments:write"]);
  return postPurchase(
    new Request("https://0dot.in/api/v1/wallet/purchases", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function detail(userId: string, category: string, id: string) {
  const token = await bearerFor(userId, ["marketplace:read"]);
  return getItem(new Request(`https://0dot.in/api/v1/marketplace/${category}/${id}`, { headers: { Authorization: `Bearer ${token}` } }), {
    params: Promise.resolve({ category, id }),
  });
}

async function download(userId: string, category: string, id: string) {
  const token = await bearerFor(userId, ["marketplace:read"]);
  return postDownload(
    new Request(`https://0dot.in/api/v1/marketplace/${category}/${id}/download`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
    { params: Promise.resolve({ category, id }) }
  );
}

function createListing(sellerUserId: string, overrides: Partial<{ price: number | null; status: string }> = {}) {
  const price = overrides.price === undefined ? 10 : overrides.price;
  return db.marketplaceListing.create({
    data: {
      sellerType: "user",
      sellerUserId,
      category: "theme",
      title: "Dark theme",
      price,
      currency: price === null ? null : "usd",
      status: overrides.status ?? "active",
      payload: "{}",
    },
  });
}

function createProduct(creatorId: string, price = 5) {
  return db.digitalProduct.create({
    data: {
      creatorId,
      title: "Icon pack",
      price,
      currency: "usd",
      fileKey: `protected/${"b".repeat(32)}.zip`,
      fileMimeType: "application/zip",
      fileSizeBytes: 1024,
      status: "active",
    },
  });
}

describe("POST /api/v1/wallet/purchases — item targets", () => {
  it("buys a marketplace listing with coins, then answers a retry with 409 and no second charge", async () => {
    const buyer = await createUser();
    const seller = await createUser();
    await fundWallet(buyer.id, 50);
    const listing = await createListing(seller.id);

    const first = await buy(buyer.id, { target: "marketplace_listing", id: listing.id });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, target: "marketplace_listing", free: false });
    expect((await getWalletBalance(buyer.id)).spendableUnits).toBe(4000);

    const retry = await buy(buyer.id, { target: "marketplace_listing", id: listing.id });
    expect(retry.status).toBe(409);
    expect((await getWalletBalance(buyer.id)).spendableUnits).toBe(4000);
    expect(await db.marketplacePurchase.count({ where: { listingId: listing.id } })).toBe(1);
    expect((await runWalletReconciliationOnce()).healthy).toBe(true);
  });

  it("claims a free listing without touching the wallet", async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const listing = await createListing(seller.id, { price: null });

    const res = await buy(buyer.id, { target: "marketplace_listing", id: listing.id });
    expect(res.status).toBe(200);
    expect((await res.json()).free).toBe(true);
    expect(await db.marketplacePurchase.count({ where: { listingId: listing.id, buyerId: buyer.id } })).toBe(1);
  });

  it("rejects an insufficient balance and leaves no purchase behind", async () => {
    const buyer = await createUser();
    const seller = await createUser();
    await fundWallet(buyer.id, 3);
    const listing = await createListing(seller.id, { price: 10 });

    const res = await buy(buyer.id, { target: "marketplace_listing", id: listing.id });
    expect(res.status).toBe(400);
    expect(await db.marketplacePurchase.count({ where: { listingId: listing.id } })).toBe(0);
    expect((await getWalletBalance(buyer.id)).spendableUnits).toBe(300);
  });

  it("buys a course and grants access", async () => {
    const buyer = await createUser();
    const creator = await createUser();
    await fundWallet(buyer.id, 50);
    const course = await db.course.create({ data: { creatorId: creator.id, title: "Course", status: "active", price: 20, currency: "usd" } });

    const res = await buy(buyer.id, { target: "course", id: course.id });
    expect(res.status).toBe(200);
    expect(await db.courseAccessGrant.count({ where: { courseId: course.id, userId: buyer.id } })).toBe(1);
    expect((await buy(buyer.id, { target: "course", id: course.id })).status).toBe(409);
  });

  // Regression: purchaseCourseForUser/purchaseProductForUser used to mint a
  // fresh random idempotencyKey per call (`course:coin:${randomUUID()}`),
  // which defeats settleCoinPurchase's dedup (ledger.ts's postTransaction
  // keys on idempotencyKey, returning the existing row instead of posting
  // again on a repeat key) — unlike purchaseListingForUser, whose key was
  // already deterministic (userId + listingId). A race between two
  // concurrent buys that both pass the pre-check's courseAccessGrant lookup
  // before either charge commits would double-charge the buyer. Simulating
  // that race directly (rather than relying on real thread interleaving,
  // which SQLite's single-writer serialization makes unreliable to force in
  // a test) by deleting the access grant between two sequential buys: the
  // pre-check lets the second call through exactly as a true race would,
  // and the fixed deterministic key must still stop it from charging twice.
  it("never double-charges a course buy even if the access-grant pre-check is bypassed", async () => {
    const buyer = await createUser();
    const creator = await createUser();
    await fundWallet(buyer.id, 50);
    const course = await db.course.create({ data: { creatorId: creator.id, title: "Course", status: "active", price: 20, currency: "usd" } });

    const first = await buy(buyer.id, { target: "course", id: course.id });
    expect(first.status).toBe(200);
    expect((await getWalletBalance(buyer.id)).spendableUnits).toBe(3000);

    // Simulates the losing side of a real concurrent race: its pre-check
    // ran before the winner's access-grant row existed.
    await db.courseAccessGrant.deleteMany({ where: { courseId: course.id, userId: buyer.id } });

    const second = await buy(buyer.id, { target: "course", id: course.id });
    expect(second.status).toBe(200);

    expect(await db.paymentTransaction.count({ where: { kind: "course_purchase", payeeId: creator.id } })).toBe(1);
    expect((await getWalletBalance(buyer.id)).spendableUnits).toBe(3000);

    const ledgerTxn = await db.ledgerTransaction.findFirst({ where: { relatedObjectType: "course", relatedObjectId: course.id } });
    expect(ledgerTxn?.idempotencyKey).toBe(`course:coin:${buyer.id}:${course.id}`);
  });

  it("buys a digital product, which the detail route then reports as owned and downloadable", async () => {
    const buyer = await createUser();
    const creator = await createUser();
    await fundWallet(buyer.id, 50);
    const product = await createProduct(creator.id);

    const before = await (await detail(buyer.id, "digital_product", product.id)).json();
    expect(before).toMatchObject({ owned: false, downloadable: false, price: 5, available: true });
    expect((await download(buyer.id, "digital_product", product.id)).status).toBe(403);

    expect((await buy(buyer.id, { target: "digital_product", id: product.id })).status).toBe(200);

    const after = await (await detail(buyer.id, "digital_product", product.id)).json();
    expect(after).toMatchObject({ owned: true, downloadable: true });
    const dl = await download(buyer.id, "digital_product", product.id);
    expect(dl.status).toBe(200);
    expect((await dl.json()).url).toMatch(/^\/api\/downloads\//);
  });

  it("requires an item id and refuses a token without payments:write", async () => {
    const buyer = await createUser();
    expect((await buy(buyer.id, { target: "course" })).status).toBe(400);

    const token = await bearerFor(buyer.id, ["marketplace:read"]);
    const res = await postPurchase(
      new Request("https://0dot.in/api/v1/wallet/purchases", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target: "course", id: "x" }),
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/marketplace/[category]/[id]", () => {
  it("hides a non-active listing from a non-owner but keeps it visible to its buyer", async () => {
    const buyer = await createUser();
    const other = await createUser();
    const seller = await createUser();
    await fundWallet(buyer.id, 50);
    const listing = await createListing(seller.id);
    expect((await buy(buyer.id, { target: "marketplace_listing", id: listing.id })).status).toBe(200);
    await db.marketplaceListing.update({ where: { id: listing.id }, data: { status: "archived" } });

    expect((await detail(other.id, "theme", listing.id)).status).toBe(404);
    const mine = await detail(buyer.id, "theme", listing.id);
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ owned: true, available: false, webPath: `/m/${listing.id}` });
  });

  it("404s when the category doesn't match the item", async () => {
    const viewer = await createUser();
    const seller = await createUser();
    const listing = await createListing(seller.id);
    expect((await detail(viewer.id, "app", listing.id)).status).toBe(404);
    expect((await detail(viewer.id, "course", listing.id)).status).toBe(404);
  });

  it("flags the seller's own item", async () => {
    const seller = await createUser();
    const listing = await createListing(seller.id);
    expect(await (await detail(seller.id, "theme", listing.id)).json()).toMatchObject({ isOwnItem: true, owned: false });
  });
});
