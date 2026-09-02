import { describe, it, expect, vi, afterEach } from "vitest";
import { isOwnBlobUploadUrl, verifyRemoteImageBytes } from "@/lib/uploads";

const OWN_URL = "https://abc123.public.blob.vercel-storage.com/uploads/some-file.png";

// The client-upload token (post-media/route.ts) only enforces the
// *declared* Content-Type — these two functions are what actually decide
// whether a mediaUrls entry gets accepted (isOwnBlobUploadUrl: is this even
// our store, under our prefix) and whether its bytes really are an image
// (verifyRemoteImageBytes: magic-byte sniff, defeats a spoofed
// Content-Type). See uploads.ts's own comment on this split.
describe("isOwnBlobUploadUrl", () => {
  it("accepts our store's uploads/ prefix", () => {
    expect(isOwnBlobUploadUrl(OWN_URL)).toBe(true);
  });

  it("rejects a different host entirely", () => {
    expect(isOwnBlobUploadUrl("https://evil.example.com/uploads/x.png")).toBe(false);
  });

  it("rejects our own Blob host but outside the uploads/ prefix (e.g. protected/)", () => {
    expect(isOwnBlobUploadUrl("https://abc123.public.blob.vercel-storage.com/protected/x.pdf")).toBe(false);
  });

  it("rejects a non-https URL", () => {
    expect(isOwnBlobUploadUrl("http://abc123.public.blob.vercel-storage.com/uploads/x.png")).toBe(false);
  });

  it("rejects an unparseable URL instead of throwing", () => {
    expect(isOwnBlobUploadUrl("not a url")).toBe(false);
  });
});

describe("verifyRemoteImageBytes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null without fetching when the URL isn't our own Blob store", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await verifyRemoteImageBytes("https://evil.example.com/uploads/x.png");

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the real extension when the bytes match a real PNG signature", async () => {
    // file-type needs the 8-byte magic signature plus a structurally valid
    // IHDR chunk to detect PNG — the signature bytes alone aren't enough,
    // so this builds a minimal-but-real PNG header rather than a bare
    // magic number.
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrLength = Buffer.from([0, 0, 0, 13]);
    const ihdrType = Buffer.from("IHDR");
    const ihdrData = Buffer.alloc(13);
    const pngHeader = Buffer.concat([signature, ihdrLength, ihdrType, ihdrData]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(pngHeader, { status: 200 }))
    );

    expect(await verifyRemoteImageBytes(OWN_URL)).toBe("png");
  });

  it("rejects bytes that don't match any allowed image format, even from our own store (spoofed Content-Type)", async () => {
    const notAnImage = Buffer.from("<script>alert(1)</script>");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(notAnImage, { status: 200 }))
    );

    expect(await verifyRemoteImageBytes(OWN_URL)).toBeNull();
  });

  it("returns null when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 }))
    );

    expect(await verifyRemoteImageBytes(OWN_URL)).toBeNull();
  });
});
