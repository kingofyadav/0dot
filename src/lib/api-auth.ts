import "server-only";
import bcrypt from "bcryptjs";
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
    include: { authorization: { include: { app: true, user: { select: { status: true } } } } },
  });
  if (!tokenRow || tokenRow.expiresAt < new Date()) {
    return { error: "Invalid or expired access token.", status: 401 };
  }
  if (tokenRow.authorization.status !== "active" || tokenRow.authorization.app.status !== "active") {
    return { error: "This app's access has been revoked.", status: 401 };
  }
  // session.ts's getCurrentUser() re-checks User.status on every read so a
  // suspension/deactivation/deletion kills an already-open web session
  // immediately, not just at next login — this bearer-token path resolved
  // straight to {userId, appId, scopes} without ever making the same check,
  // so a deactivated account's existing mobile/OAuth tokens would keep
  // working right up until natural expiry. Same fail-closed posture here.
  if (tokenRow.authorization.user.status !== "active") {
    return { error: "This account is no longer active.", status: 401 };
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

// API-route equivalent of auth-guards.ts's requireVerifiedUser — same
// emailVerifiedAt check every write server action already gates on, just
// returning an error object instead of redirect() (meaningless outside a
// page render). A valid bearer token only proves the authorization is
// live (resolveApiRequest), not that the underlying account has since
// finished verification or been reinstated after suspension — write
// endpoints need the same account-standing check web writes already get,
// not a weaker one just because the caller is a bearer-token client.
export async function requireVerifiedApiUser(ctx: ApiRequestContext): Promise<{ error: string; status: number } | null> {
  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { emailVerifiedAt: true } });
  if (!user?.emailVerifiedAt) {
    return { error: "Your account must have a verified email to do this.", status: 403 };
  }
  return null;
}

// M12: the same bcrypt.compare re-entry gate every sensitive web action
// (changePassword, disableTwoFactor, deactivateAccount, ...) applies before
// a security-relevant change — extracted here once it had 3+ /api/v1 call
// sites (password change, 2FA disable/regen, contact change, account
// lifecycle), same "extract once it's shared, not before" posture
// session-management.ts's own revokeAllOtherSessions extraction used.
export async function requireCurrentPassword(
  ctx: ApiRequestContext,
  currentPassword: string
): Promise<{ error: string; status: number } | null> {
  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { passwordHash: true } });
  if (!user) return { error: "Not found.", status: 404 };
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { error: "Current password is incorrect.", status: 400 };
  }
  return null;
}

export function apiError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
