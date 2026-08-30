import { describe, it, expect } from "vitest";
import { issueDownloadToken, verifyDownloadToken } from "@/lib/protected-storage";

// DOWNLOAD_TOKEN_SECRET is unset under vitest and NODE_ENV=test, so
// getTokenSecret() uses its fixed dev fallback — deterministic here.

const payload = {
  resourceType: "digital_product" as const,
  resourceId: "prod_abc",
  userId: "user_abc",
};

describe("download token", () => {
  it("round-trips a valid token", () => {
    const verified = verifyDownloadToken(issueDownloadToken(payload));
    expect(verified).toMatchObject(payload);
    expect(verified?.exp).toBeGreaterThan(Date.now());
  });

  it("rejects a token whose body was swapped (signature no longer matches)", () => {
    const [, sig] = issueDownloadToken(payload).split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ ...payload, userId: "attacker", exp: Date.now() + 600_000 }),
    ).toString("base64url");
    expect(verifyDownloadToken(`${forgedBody}.${sig}`)).toBeNull();
  });

  it("rejects a tampered signature of the right length", () => {
    const [body, sig] = issueDownloadToken(payload).split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(verifyDownloadToken(`${body}.${flipped}`)).toBeNull();
  });

  it("rejects a signature of the wrong length (timingSafeEqual guard)", () => {
    const [body] = issueDownloadToken(payload).split(".");
    expect(verifyDownloadToken(`${body}.short`)).toBeNull();
  });

  it("rejects an expired token", () => {
    expect(verifyDownloadToken(issueDownloadToken(payload, -10))).toBeNull();
  });

  it("rejects structurally invalid input", () => {
    expect(verifyDownloadToken("not-a-token")).toBeNull();
    expect(verifyDownloadToken("only.")).toBeNull();
    expect(verifyDownloadToken("")).toBeNull();
  });
});
