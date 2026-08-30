import { describe, it, expect, afterEach, vi } from "vitest";
import { isOwnHost, buildCsp, customDomainRewritePath } from "@/lib/proxy-routing";

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  vi.unstubAllEnvs();
});

describe("isOwnHost", () => {
  it("recognizes local, *.vercel.app, and the APP_ORIGIN host", () => {
    expect(isOwnHost("localhost")).toBe(true);
    expect(isOwnHost("127.0.0.1")).toBe(true);
    expect(isOwnHost("0dot-app-git-main.vercel.app")).toBe(true);
    process.env.APP_ORIGIN = "https://0dot.in";
    expect(isOwnHost("0dot.in")).toBe(true);
  });

  it("rejects a third-party custom domain", () => {
    process.env.APP_ORIGIN = "https://0dot.in";
    expect(isOwnHost("alice.example")).toBe(false);
  });

  it("does not throw on a malformed APP_ORIGIN", () => {
    process.env.APP_ORIGIN = "not a url";
    expect(() => isOwnHost("alice.example")).not.toThrow();
    expect(isOwnHost("alice.example")).toBe(false);
  });
});

describe("customDomainRewritePath", () => {
  it("maps the root path to the bare identity prefix", () => {
    expect(customDomainRewritePath("/", "/alice")).toBe("/alice");
    expect(customDomainRewritePath("/", "/b/acme")).toBe("/b/acme");
  });

  it("nests every other path under the prefix", () => {
    expect(customDomainRewritePath("/wiki/page", "/alice")).toBe("/alice/wiki/page");
    expect(customDomainRewritePath("/courses/x", "/b/acme")).toBe("/b/acme/courses/x");
  });
});

describe("buildCsp", () => {
  it("carries the per-request nonce and the hardening directives", () => {
    const csp = buildCsp("abc123");
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("allows the Blob upload hosts in connect-src", () => {
    const csp = buildCsp("n");
    expect(csp).toContain("https://*.public.blob.vercel-storage.com");
    expect(csp).toContain("https://blob.vercel-storage.com");
  });

  it("omits 'unsafe-eval' in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(buildCsp("n")).not.toContain("unsafe-eval");
  });
});
