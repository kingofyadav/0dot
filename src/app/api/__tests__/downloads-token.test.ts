import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createUser } from "@/test/factories";
import { GET } from "@/app/api/downloads/[token]/route";
import { issueDownloadToken } from "@/lib/protected-storage";

// Keep issue/verify real; stub only the byte-streaming so no Blob network
// call happens — the route's job under test is the entitlement re-check.
vi.mock("@/lib/protected-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/protected-storage")>();
  return {
    ...actual,
    streamProtectedFile: vi.fn(async () => new Response("STREAM_OK", { status: 200 })),
  };
});

function call(token: string) {
  return GET(new Request(`https://0dot.in/api/downloads/${token}`), {
    params: Promise.resolve({ token }),
  });
}

async function makeDigitalPurchase(status: string) {
  const creator = await createUser();
  const buyer = await createUser();
  const product = await db.digitalProduct.create({
    data: {
      creatorId: creator.id,
      title: "Test Product",
      price: 9,
      fileKey: `protected/${"a".repeat(32)}.pdf`,
      fileMimeType: "application/pdf",
      fileSizeBytes: 1234,
      status: "active",
    },
  });
  const tx = await db.paymentTransaction.create({
    data: {
      kind: "digital_purchase",
      payerId: buyer.id,
      payeeId: creator.id,
      amount: 9,
      currency: "usd",
      platformFee: 1,
      processorReference: `cs_test_${randomUUID()}`,
      status,
    },
  });
  await db.digitalProductPurchase.create({
    data: { productId: product.id, buyerId: buyer.id, paymentTransactionId: tx.id },
  });
  return { buyer, product };
}

describe("GET /api/downloads/[token] — digital product", () => {
  it("streams the file for a valid, paid purchase", async () => {
    const { buyer, product } = await makeDigitalPurchase("succeeded");
    const token = issueDownloadToken({ resourceType: "digital_product", resourceId: product.id, userId: buyer.id });
    const res = await call(token);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("STREAM_OK");
  });

  it("404s when the purchase's payment was refunded", async () => {
    const { buyer, product } = await makeDigitalPurchase("refunded");
    const token = issueDownloadToken({ resourceType: "digital_product", resourceId: product.id, userId: buyer.id });
    expect((await call(token)).status).toBe(404);
  });

  it("404s for a forged / unparseable token", async () => {
    expect((await call("garbage.token.value")).status).toBe(404);
  });

  it("404s when the token's user never bought the product", async () => {
    const { product } = await makeDigitalPurchase("succeeded");
    const stranger = await createUser();
    const token = issueDownloadToken({ resourceType: "digital_product", resourceId: product.id, userId: stranger.id });
    expect((await call(token)).status).toBe(404);
  });
});

describe("GET /api/downloads/[token] — private published file", () => {
  async function makePrivateFile() {
    const owner = await createUser();
    const file = await db.publishedFile.create({
      data: {
        profileId: owner.profile!.id,
        slug: `file-${randomUUID().slice(0, 8)}`,
        title: "Secret",
        fileKey: `protected/${"b".repeat(32)}.pdf`,
        fileMimeType: "application/pdf",
        fileSizeBytes: 10,
        visibility: "private",
      },
    });
    return { owner, file };
  }

  it("streams for the owner and records the download", async () => {
    const { owner, file } = await makePrivateFile();
    const token = issueDownloadToken({ resourceType: "published_file", resourceId: file.id, userId: owner.id });
    const res = await call(token);
    expect(res.status).toBe(200);
    const after = await db.publishedFile.findUnique({ where: { id: file.id } });
    expect(after?.downloadCount).toBe(1);
  });

  it("404s for a non-owner", async () => {
    const { file } = await makePrivateFile();
    const stranger = await createUser();
    const token = issueDownloadToken({ resourceType: "published_file", resourceId: file.id, userId: stranger.id });
    expect((await call(token)).status).toBe(404);
  });
});
