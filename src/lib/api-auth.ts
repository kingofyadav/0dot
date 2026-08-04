import "server-only";
import { db } from "@/lib/db";
import { hashApiToken } from "@/lib/developer-apps";

export type ApiRequestContext = { userId: string; appId: string; scopes: string[] };

// The one entry point every /api/v1/* route calls before doing anything
// else — resolves a bearer token to {userId, appId, scopes} without ever
// touching a session cookie. Deleting an OAuthToken row (revocation, token
// expiry never re-issued) makes this fail closed automatically; there's no
// separate "and check the authorization wasn't revoked" branch to forget,
// since revokeOAuthAuthorization (oauth.ts) deletes the token rows outright.
export async function resolveApiRequest(request: Request): Promise<{ error: string; status: number } | ApiRequestContext> {
  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return { error: "Missing or malformed Authorization header.", status: 401 };
  }

  const tokenRow = await db.oAuthToken.findUnique({
    where: { accessTokenHash: hashApiToken(token) },
    include: { authorization: { include: { app: true } } },
  });
  if (!tokenRow || tokenRow.expiresAt < new Date()) {
    return { error: "Invalid or expired access token.", status: 401 };
  }
  if (tokenRow.authorization.status !== "active" || tokenRow.authorization.app.status !== "active") {
    return { error: "This app's access has been revoked.", status: 401 };
  }

  return {
    userId: tokenRow.authorization.userId,
    appId: tokenRow.authorization.appId,
    scopes: JSON.parse(tokenRow.authorization.grantedScopesJson),
  };
}

export function requireScope(ctx: ApiRequestContext, scope: string): { error: string; status: number } | null {
  if (!ctx.scopes.includes(scope)) {
    return { error: `This request requires the '${scope}' scope, which the current authorization doesn't grant.`, status: 403 };
  }
  return null;
}

export function apiError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
