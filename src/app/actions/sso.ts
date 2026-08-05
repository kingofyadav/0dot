"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getIdentityProviderVerifier, provisionOrLinkUserForSso, emailDomain } from "@/lib/sso";

export type SsoActionState = { error?: string } | undefined;

// spec §5: entry point from /login's "Sign in with SSO" — resolves a work
// email's domain to an Organization + its SSOConnection and hands off to
// the (stub) IdP consent screen. No account lookup happens here yet; that's
// completeSsoLogin's job once the IdP round-trip (simulated) returns.
export async function startSsoLogin(_prevState: SsoActionState, formData: FormData): Promise<SsoActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your work email." };

  const ip = await getClientIp();
  if (!checkRateLimit(`sso:start:ip:${ip}`, { max: 20, windowMs: 15 * 60 * 1000 })) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  const domain = emailDomain(email);
  const organization = await db.organization.findUnique({
    where: { domain },
    select: { id: true, name: true, ssoConnection: { select: { id: true } } },
  });
  if (!organization?.ssoConnection) {
    return { error: "No SSO connection is configured for that email's domain." };
  }

  redirect(`/sso/${organization.ssoConnection.id}/authorize?email=${encodeURIComponent(email)}`);
}

// Stands in for the IdP round-trip a real SAML/OIDC flow would do out of
// band (browser redirect to the IdP, user authenticates there, IdP posts a
// signed assertion back). See sso.ts's StubIdentityProviderVerifier for why
// this is a dev-only stand-in, not a real integration.
export async function completeSsoLogin(formData: FormData): Promise<void> {
  const connectionId = String(formData.get("connectionId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!connectionId || !email) redirect("/login");

  const ip = await getClientIp();
  if (!checkRateLimit(`sso:complete:ip:${ip}`, { max: 20, windowMs: 15 * 60 * 1000 })) {
    redirect("/login");
  }

  const connection = await db.sSOConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, organization: { select: { domain: true } } },
  });
  if (!connection) redirect("/login");

  // The email's domain must match the org's own verified domain — without
  // this, anyone could claim an arbitrary work email against someone
  // else's SSO connection.
  if (emailDomain(email) !== connection.organization.domain) redirect("/login");

  const assertion = getIdentityProviderVerifier().verify(JSON.stringify({ subjectId: `stub-${email}`, email }));
  if (!assertion) redirect("/login");

  const { userId } = await provisionOrLinkUserForSso({ ssoConnectionId: connection.id, assertion });
  await createSession(userId);

  const user = await db.user.findUnique({ where: { id: userId }, include: { profile: true } });
  redirect(user?.profile ? "/feed" : "/claim-username");
}
