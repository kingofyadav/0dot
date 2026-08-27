import { db } from "@/lib/db";
import { exchangeAuthorizationCode, refreshAccessToken } from "@/lib/oauth";
import { verifyClientSecret } from "@/lib/developer-apps";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";

function tokenResponse(result: { accessToken: string; refreshToken: string; expiresIn: number; scope: string }) {
  return Response.json({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    token_type: "Bearer",
    expires_in: result.expiresIn,
    scope: result.scope,
  });
}

// Standard OAuth2 token endpoint — the third-party app's server (not the
// browser) calls this directly with its client credentials, never
// client-side, same posture that keeps client_secret off any redirect URL.
// Handles both grants RFC 6749 needs for a long-lived mobile session:
// authorization_code (initial sign-in) and refresh_token (renewing an
// access token without another browser round-trip — see oauth.ts's
// refreshAccessToken for the rotate-on-use posture).
export async function POST(request: Request) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");
  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
  }

  const clientId = String(form.get("client_id") ?? "");
  const clientSecret = String(form.get("client_secret") ?? "");

  // client_secret/authorization-code/refresh-token guessing has no throttle
  // elsewhere in this route, unlike every other credential check in this
  // codebase (login, signup, 2FA) — bcrypt already slows each individual
  // attempt, but this closes the gap for consistency and against a
  // distributed brute-force. Shared across both grants since both are
  // bearer-credential-guessing surfaces on the same endpoint.
  const ip = await getClientIp();
  const [ipOk, clientOk] = await Promise.all([
    enforceRateLimit(`oauth-token:ip:${ip}`, { max: 30, windowMs: 15 * 60 * 1000 }),
    clientId ? enforceRateLimit(`oauth-token:client:${clientId}`, { max: 15, windowMs: 15 * 60 * 1000 }) : Promise.resolve(true),
  ]);
  if (!ipOk || !clientOk) {
    return Response.json({ error: "invalid_client" }, { status: 429 });
  }

  const app = await db.developerApp.findUnique({ where: { clientId } });
  if (!app || app.status !== "active") {
    return Response.json({ error: "invalid_client" }, { status: 401 });
  }
  // Public clients (first-party mobile/desktop apps, phase-15 build plan
  // step 3) have no secret to verify — PKCE's code_verifier (authorization_code
  // grant) or possession of the refresh token itself (refresh_token grant) is
  // their sole proof of possession, same RFC 8252 posture every other
  // public-client OAuth implementation uses.
  if (!app.isPublicClient && !(await verifyClientSecret(app.clientSecretHash, clientSecret))) {
    return Response.json({ error: "invalid_client" }, { status: 401 });
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") ?? "");
    if (!refreshToken) return Response.json({ error: "invalid_request" }, { status: 400 });
    const result = await refreshAccessToken({ refreshToken, appId: app.id });
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    return tokenResponse(result);
  }

  const code = String(form.get("code") ?? "");
  const codeVerifier = String(form.get("code_verifier") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  if (!code || !codeVerifier || !redirectUri) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await exchangeAuthorizationCode({ code, codeVerifier, redirectUri, appId: app.id });
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
  return tokenResponse(result);
}
