import { describe, it, expect, vi, afterEach } from "vitest";
import { isStubSsoAllowed, getIdentityProviderVerifier } from "@/lib/sso";

// Regression coverage for the SSO auth-bypass fix: completeSsoLogin's only
// IdentityProviderVerifier implementation trusts a caller-submitted
// {subjectId, email} with zero signature verification — a full
// account-takeover primitive for any org with SSO configured, if it were
// ever reachable in production. isStubSsoAllowed/getIdentityProviderVerifier
// are the gate that's supposed to keep it dev-only.
describe("SSO stub gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is allowed outside production (the suite's own NODE_ENV=test)", () => {
    expect(isStubSsoAllowed()).toBe(true);
    expect(() => getIdentityProviderVerifier()).not.toThrow();
  });

  it("refuses to run in production without an explicit opt-in", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_STUB_SSO", "");

    expect(isStubSsoAllowed()).toBe(false);
    expect(() => getIdentityProviderVerifier()).toThrow(/disabled/i);
  });

  it("only unblocks in production via the explicit ALLOW_STUB_SSO opt-in", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_STUB_SSO", "true");

    expect(isStubSsoAllowed()).toBe(true);
    expect(() => getIdentityProviderVerifier()).not.toThrow();
  });
});
