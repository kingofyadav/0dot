import "server-only";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// spec §5.1/§5.4: 0dot as SAML2/OIDC *service provider*, trusting an
// enterprise customer's own IdP — the reverse role from Phase 10's
// identity-provider work. Real SAML/OIDC assertion parsing and signature
// verification (XML signature-wrapping defenses in particular, §5.4) is a
// dedicated security review this codebase hasn't done — same "no real
// hosted integration exists to wait on" posture as payments.ts's
// StubPaymentProcessor, and flagged with the same seriousness: this stub
// trusts whatever the caller submits and must never be treated as
// launch-ready for a real customer's IdP.
export type IdentityAssertion = { subjectId: string; email: string };

export interface IdentityProviderVerifier {
  readonly name: string;
  verify(rawAssertion: string): IdentityAssertion | null;
}

class StubIdentityProviderVerifier implements IdentityProviderVerifier {
  readonly name = "stub";

  // rawAssertion is JSON `{"subjectId": "...", "email": "..."}` — a stand-in
  // for a parsed-and-verified SAML <Assertion>/OIDC ID token. No signature
  // check happens here at all.
  verify(rawAssertion: string): IdentityAssertion | null {
    try {
      const parsed = JSON.parse(rawAssertion);
      if (typeof parsed.subjectId !== "string" || typeof parsed.email !== "string" || !parsed.subjectId || !parsed.email) {
        return null;
      }
      return { subjectId: parsed.subjectId, email: parsed.email.trim().toLowerCase() };
    } catch {
      return null;
    }
  }
}

// The stub trusts caller-submitted `{subjectId, email}` with no signature
// check — fine for local dev, a full account-takeover primitive for any
// domain with SSO configured if it ever runs in production. Gated off by
// default; only NODE_ENV !== "production" or an explicit opt-in (for a
// controlled staging smoke-test) allows it to run at all.
export function isStubSsoAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_STUB_SSO === "true";
}

export function getIdentityProviderVerifier(): IdentityProviderVerifier {
  if (!isStubSsoAllowed()) {
    throw new Error(
      "SSO login is disabled: the only verifier implemented is an unauthenticated dev stub, which must not run in production. Implement real SAML/OIDC assertion verification before enabling SSO, or set ALLOW_STUB_SSO=true for a deliberate, trusted staging test only."
    );
  }
  return new StubIdentityProviderVerifier();
}

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

// spec §5.2: JIT provisioning, going through the same username-claim rules
// as any other signup — no bypass. Links to an existing account with a
// matching email if one exists; otherwise creates a bare User (no
// Username/Profile yet, same shape claimUsername's own "user exists,
// profile doesn't" precondition already expects) that the person finishes
// setting up via the ordinary /claim-username flow after their first SSO
// login. Either way this is the person's one ordinary account (§5.2/
// mission principle "One Identity, One Profile"), never a second
// walled-off "enterprise identity."
export async function provisionOrLinkUserForSso(args: {
  ssoConnectionId: string;
  assertion: IdentityAssertion;
}): Promise<{ userId: string }> {
  const existingIdentity = await db.sSOIdentity.findUnique({
    where: { ssoConnectionId_externalSubjectId: { ssoConnectionId: args.ssoConnectionId, externalSubjectId: args.assertion.subjectId } },
  });
  if (existingIdentity) {
    await db.sSOIdentity.update({ where: { id: existingIdentity.id }, data: { lastLoginAt: new Date() } });
    return { userId: existingIdentity.userId };
  }

  const existingUser = await db.user.findUnique({ where: { email: args.assertion.email }, select: { id: true } });
  if (existingUser) {
    await db.sSOIdentity.create({
      data: {
        ssoConnectionId: args.ssoConnectionId,
        userId: existingUser.id,
        externalSubjectId: args.assertion.subjectId,
        lastLoginAt: new Date(),
      },
    });
    return { userId: existingUser.id };
  }

  // No account with this email yet — auto-provision one. passwordHash is a
  // required column with no real password behind it; a random unusable hash
  // fills it the same way an OAuth-only account would need to (this
  // codebase has no separate "passwordless" account shape). The person
  // authenticates via SSO from here on, or sets a real password later
  // through account settings — either is a "non-employer-controlled path,"
  // per §5.3; SSO itself is never their only route in since this doesn't
  // touch auth.ts's ordinary login() at all.
  const unusablePasswordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
  const user = await db.user.create({
    data: {
      email: args.assertion.email,
      passwordHash: unusablePasswordHash,
      emailVerifiedAt: new Date(), // the IdP already vouches for this email
    },
  });
  await db.sSOIdentity.create({
    data: {
      ssoConnectionId: args.ssoConnectionId,
      userId: user.id,
      externalSubjectId: args.assertion.subjectId,
      lastLoginAt: new Date(),
    },
  });
  return { userId: user.id };
}
