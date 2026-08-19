import { db } from "@/lib/db";
import { exchangeAuthorizationCode } from "@/lib/oauth";
import { verifyClientSecret } from "@/lib/developer-apps";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Standard OAuth2 token endpoint — the third-party app's server (not the
// browser) calls this directly with its client credentials, never
// client-side, same posture that keeps client_secret off any redirect URL.
export async function POST(request: Request) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");
  if (grantType !== "authorization_code") {
    return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
  }

  const clientId = String(form.get("client_id") ?? "");
  const clientSecret = String(form.get("client_secret") ?? "");
  const code = String(form.get("code") ?? "");
  const codeVerifier = String(form.get("code_verifier") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");

  // client_secret/authorization-code guessing has no throttle elsewhere in
  // this route, unlike every other credential check in this codebase
  // (login, signup, 2FA) — bcrypt already slows each individual attempt,
  // but this closes the gap for consistency and against a distributed
  // brute-force.
  const ip = await getClientIp();
  if (
    !checkRateLimit(`oauth-token:ip:${ip}`, { max: 30, windowMs: 15 * 60 * 1000 }) ||
    (clientId && !checkRateLimit(`oauth-token:client:${clientId}`, { max: 15, windowMs: 15 * 60 * 1000 }))
  ) {
    return Response.json({ error: "invalid_client" }, { status: 429 });
  }

  const app = await db.developerApp.findUnique({ where: { clientId } });
  if (!app || app.status !== "active" || !(await verifyClientSecret(app.clientSecretHash, clientSecret))) {
    return Response.json({ error: "invalid_client" }, { status: 401 });
  }
  if (!code || !codeVerifier || !redirectUri) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await exchangeAuthorizationCode({ code, codeVerifier, redirectUri, appId: app.id });
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });

  return Response.json({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    token_type: "Bearer",
    expires_in: result.expiresIn,
    scope: result.scope,
  });
}
