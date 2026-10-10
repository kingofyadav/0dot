"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { issueAuthorizationCode, validateRedirectUri, resolveApprovableScopes } from "@/lib/oauth";

// The consent screen's "Approve" action — re-validates the redirect_uri
// and requested scopes server-side (never trusts the hidden form fields'
// query-param origin), same "request time, not display time" posture used
// throughout this codebase for access checks.
export async function approveAuthorization(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") ?? "");
  const redirectUri = String(formData.get("redirectUri") ?? "");
  const state = String(formData.get("state") ?? "");
  const codeChallenge = String(formData.get("codeChallenge") ?? "");
  const codeChallengeMethod = String(formData.get("codeChallengeMethod") ?? "S256");
  const approvedScopes = formData.getAll("scopes").map(String);

  // Same "overlap the independent DB round trips" reasoning as
  // /oauth/authorize/page.tsx: the session check and the app lookup don't
  // depend on each other, so run them concurrently rather than serially —
  // one fewer full round trip for a flaky Turso connection to stall on
  // before this consent-screen submit can redirect to the third-party app.
  const [user, app] = await Promise.all([requireVerifiedUser(), db.developerApp.findUnique({ where: { clientId } })]);
  if (!app || app.status !== "active" || !validateRedirectUri(app.redirectUrisJson, redirectUri) || !codeChallenge) {
    redirect("/oauth/error");
  }

  const grantable = await resolveApprovableScopes(app.id, JSON.stringify(approvedScopes));
  if ("error" in grantable) redirect("/oauth/error");

  const code = await issueAuthorizationCode({
    appId: app.id,
    userId: user.id,
    redirectUri,
    approvedScopes: grantable.scopes,
    codeChallenge,
    codeChallengeMethod,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}

export async function denyAuthorization(formData: FormData): Promise<void> {
  await requireVerifiedUser();
  const redirectUri = String(formData.get("redirectUri") ?? "");
  const state = String(formData.get("state") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const app = await db.developerApp.findUnique({ where: { clientId } });
  if (!app || !validateRedirectUri(app.redirectUrisJson, redirectUri)) {
    redirect("/oauth/error");
  }

  const url = new URL(redirectUri);
  url.searchParams.set("error", "access_denied");
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}
