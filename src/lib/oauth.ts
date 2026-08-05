import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { hashApiToken, generateOpaqueToken, isAllowedRedirectUri } from "@/lib/developer-apps";
import { createTrustSafetyCase } from "@/lib/trust-safety";

// spec §4.1: fixed, curated scope catalog — seeded here (seedOAuthScopes,
// called lazily from the developer dashboard and the authorize page, same
// "ensure the fixed catalog exists" idiom as this codebase doesn't have a
// migration seed step) rather than free-form scope strings a developer
// could invent. Deliberately representative, not exhaustive — widened by
// adding an entry here, same posture as marketplace.ts's EMBED_PROVIDERS.
export const OAUTH_SCOPES = [
  { key: "profile:read", description: "Read your public profile", sensitivity: "low" },
  { key: "posts:read", description: "Read your posts", sensitivity: "low" },
  { key: "posts:write", description: "Create posts on your behalf", sensitivity: "medium" },
  { key: "events:read", description: "Read events you host or attend", sensitivity: "low" },
  { key: "marketplace:read", description: "Read your marketplace purchases and listings", sensitivity: "low" },
  { key: "messages:read", description: "Read your private messages", sensitivity: "high" },
  { key: "messages:write", description: "Send messages on your behalf", sensitivity: "high" },
  { key: "payments:read", description: "Read your payout and transaction history", sensitivity: "high" },
] as const;

export type OAuthScopeKey = (typeof OAUTH_SCOPES)[number]["key"];

export async function seedOAuthScopes(): Promise<void> {
  for (const scope of OAUTH_SCOPES) {
    await db.oAuthScope.upsert({
      where: { key: scope.key },
      create: scope,
      update: { description: scope.description, sensitivity: scope.sensitivity },
    });
  }
}

// spec §4.3: low/medium sensitivity scopes are usable immediately; a
// high-sensitivity scope sits at "pending" until an admin approves it
// (approveDeveloperAppScope, admin-developer.ts) — the app cannot request
// it from any user before that, checked again at authorize time below, not
// only at request time.
export async function requestDeveloperAppScope(appId: string, scopeKey: string): Promise<{ error: string } | { ok: true }> {
  const scope = await db.oAuthScope.findUnique({ where: { key: scopeKey } });
  if (!scope) return { error: "Unknown scope." };
  const status = scope.sensitivity === "high" ? "pending" : "approved";
  await db.developerAppScope.upsert({
    where: { appId_scopeKey: { appId, scopeKey } },
    create: { appId, scopeKey, status, reviewedAt: status === "approved" ? new Date() : null },
    update: {},
  });
  // phase-12 spec §11 step 3: wires the sensitive-scope gate into the
  // unified queue — DeveloperAppScope.status stays the source of truth
  // (§3.3). subjectId encodes the composite appId:scopeKey key, same "store
  // exactly what the resolver needs" precedent notifications.ts's
  // subjectId conventions already use.
  if (status === "pending") {
    await createTrustSafetyCase({ caseType: "oauth_scope_review", subjectType: "developer_app_scope", subjectId: `${appId}:${scopeKey}` });
  }
  return { ok: true };
}

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes, standard OAuth authorization-code lifetime
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour access token

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

// PKCE S256 verification (spec §4.2/§4.4: required for any public client).
// "plain" is accepted only because some legacy/embedded clients can't
// compute SHA-256 client-side — S256 is what every modern client should
// send, and this codebase doesn't distinguish confidential vs. public
// clients at registration time, so PKCE is required of every authorization
// request rather than only public ones (a stricter posture than the spec's
// floor, not a weaker one).
function verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
  const expected = method === "S256" ? base64UrlEncode(createHash("sha256").update(codeVerifier).digest()) : codeVerifier;
  const a = Buffer.from(expected);
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function resolveApprovableScopes(appId: string, requestedScopesJson: string): Promise<{ error: string } | { scopes: string[] }> {
  const requested: string[] = JSON.parse(requestedScopesJson || "[]");
  if (requested.length === 0) return { error: "No scopes requested." };
  const appScopes = await db.developerAppScope.findMany({ where: { appId, scopeKey: { in: requested } } });
  const grantable = appScopes.filter((s) => s.status === "approved").map((s) => s.scopeKey);
  const missing = requested.filter((s) => !grantable.includes(s));
  if (missing.length > 0) return { error: `This app isn't approved to request: ${missing.join(", ")}.` };
  return { scopes: grantable };
}

// Called after the user approves the consent screen (/oauth/authorize).
// Persists the short-lived code the app's server will exchange for a token
// — see OAuthAuthorizationCode's schema comment for why this can't just be
// held in a server session.
export async function issueAuthorizationCode(args: {
  appId: string;
  userId: string;
  redirectUri: string;
  approvedScopes: string[];
  codeChallenge: string;
  codeChallengeMethod: string;
}): Promise<string> {
  const code = generateOpaqueToken();
  await db.oAuthAuthorizationCode.create({
    data: {
      code,
      appId: args.appId,
      userId: args.userId,
      redirectUri: args.redirectUri,
      scopesJson: JSON.stringify(args.approvedScopes),
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: args.codeChallengeMethod,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}

type TokenResult = { error: string } | { accessToken: string; refreshToken: string; expiresIn: number; scope: string };

// The token-exchange step: app's server posts { code, code_verifier,
// redirect_uri, client_id, client_secret }. Validates PKCE, redirect URI
// exact-match, and single-use of the code, then mints a bearer token pair
// hashed at rest (spec §4.2, §12.1).
export async function exchangeAuthorizationCode(args: { code: string; codeVerifier: string; redirectUri: string; appId: string }): Promise<TokenResult> {
  const row = await db.oAuthAuthorizationCode.findUnique({ where: { code: args.code } });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.appId !== args.appId) {
    return { error: "Invalid or expired authorization code." };
  }
  if (row.redirectUri !== args.redirectUri) return { error: "redirect_uri does not match the authorization request." };
  if (!verifyPkce(args.codeVerifier, row.codeChallenge, row.codeChallengeMethod)) {
    return { error: "PKCE verification failed." };
  }

  const approvedScopes: string[] = JSON.parse(row.scopesJson);
  const accessToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();

  const [, authorization] = await db.$transaction([
    db.oAuthAuthorizationCode.update({ where: { code: args.code }, data: { usedAt: new Date() } }),
    db.oAuthAuthorization.upsert({
      where: { appId_userId: { appId: row.appId, userId: row.userId } },
      create: { appId: row.appId, userId: row.userId, grantedScopesJson: row.scopesJson, status: "active" },
      update: { grantedScopesJson: row.scopesJson, status: "active", revokedAt: null },
    }),
  ]);

  await db.oAuthToken.create({
    data: {
      authorizationId: authorization.id,
      accessTokenHash: hashApiToken(accessToken),
      refreshTokenHash: hashApiToken(refreshToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return { accessToken, refreshToken, expiresIn: TOKEN_TTL_MS / 1000, scope: approvedScopes.join(" ") };
}

// spec §4.4: revoking an OAuthAuthorization must immediately invalidate its
// OAuthToken rows, not just stop future issuance — deleting them (rather
// than flagging) means resolveApiRequest's accessTokenHash lookup can never
// find a live row for a revoked authorization, so there's no separate
// "and also check the parent isn't revoked" branch to forget on the read
// path.
export async function revokeOAuthAuthorization(authorizationId: string, userId: string): Promise<boolean> {
  const authorization = await db.oAuthAuthorization.findUnique({ where: { id: authorizationId } });
  if (!authorization || authorization.userId !== userId) return false;
  await db.$transaction([
    db.oAuthToken.deleteMany({ where: { authorizationId } }),
    db.oAuthAuthorization.update({ where: { id: authorizationId }, data: { status: "revoked", revokedAt: new Date() } }),
  ]);
  return true;
}

export function validateRedirectUri(redirectUrisJson: string, candidate: string): boolean {
  return isAllowedRedirectUri(redirectUrisJson, candidate);
}

export { generateOpaqueToken, hashApiToken };
export const oauthCodeChallengeBase64Url = base64UrlEncode;
