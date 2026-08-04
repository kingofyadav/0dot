import { db } from "@/lib/db";
import { exchangeAuthorizationCode } from "@/lib/oauth";
import { verifyClientSecret } from "@/lib/developer-apps";

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
