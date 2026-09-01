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
  // mobile Phase C (rich profile): editing displayName/bio/avatar/cover is
  // a real account-identity change, not a low-stakes toggle — mirrors the
  // read/write split posts:read/posts:write already established, at
  // medium sensitivity for the same reason posts:write is medium.
  { key: "profile:write", description: "Edit your profile", sensitivity: "medium" },
  { key: "posts:read", description: "Read your posts", sensitivity: "low" },
  { key: "posts:write", description: "Create posts on your behalf", sensitivity: "medium" },
  // mobile Phase B (interaction parity): like/repost are lower-stakes than
  // creating content — they don't add anything to the account's own
  // timeline the way posts:write does — so they get their own scope rather
  // than folding under posts:write, the same "match scope grain to what a
  // consent screen should actually say" reasoning notifications:read used
  // to stay separate from posts:read above.
  // Bookmarking is folded into this same scope rather than getting its own
  // (mobile pro-upgrade addendum): it's private (never shown to anyone
  // else, phase-1 spec §5.3) and exactly as low-stakes as a like — the same
  // "match scope grain to what a consent screen should actually say"
  // reasoning below just as easily covers a second low-stakes engagement
  // action as a first.
  { key: "engagement:write", description: "Like, bookmark, and repost content on your behalf", sensitivity: "low" },
  // Distinct from posts:write for the same reason: following someone
  // doesn't create content, and a consent screen listing "Create posts"
  // shouldn't silently also cover "Follow accounts."
  { key: "follows:write", description: "Follow and unfollow accounts on your behalf", sensitivity: "low" },
  { key: "events:read", description: "Read events you host or attend", sensitivity: "low" },
  // mobile pro-upgrade addendum M6: RSVPing is a state change (who's
  // going), same low-stakes-but-real-write tier as engagement:write's
  // like/bookmark/repost — split from events:read for the identical reason
  // every other domain's read/write pair is split here.
  { key: "events:write", description: "RSVP to events on your behalf", sensitivity: "low" },
  // mobile pro-upgrade addendum M4: read-only (browse/view a community, its
  // post feed, your own membership status) versus write (join/leave — a
  // membership change, not content creation) split the same way
  // follows:write stays separate from posts:write below — a consent screen
  // shouldn't lump "see communities" in with "join/leave them on your
  // behalf." Creating a post *inside* a community reuses posts:write
  // (it's the same Post table, same consent-screen meaning), not a third
  // communities scope.
  //
  // Realtime addendum Phase C: live chat (CommunityChatMessage — an
  // ephemeral broadcast stream, *not* the Post table) is a community-scoped
  // write with no post-timeline meaning, so it stays on communities:write
  // rather than posts:write. Description widened to cover it.
  { key: "communities:read", description: "Read communities, their posts, and their chat", sensitivity: "low" },
  { key: "communities:write", description: "Join and leave communities and send community chat messages on your behalf", sensitivity: "low" },
  { key: "marketplace:read", description: "Read your marketplace purchases and listings", sensitivity: "low" },
  // mobile pro-upgrade addendum M5: marketplace:read already covered
  // browsing; installing/purchasing is a real action (spending or adding
  // an app), so it gets its own write scope, same read/write split as
  // every other domain here.
  { key: "marketplace:write", description: "Purchase and install marketplace listings on your behalf", sensitivity: "medium" },
  // mobile pro-upgrade addendum M5: businesses:read covers browsing a
  // business profile/listings; write is left unused by mobile v1 (business
  // team-management stays web-only for now) but declared per this catalog's
  // own "named explicitly even before a second/first real write use,
  // matching CreatorPayoutAccount.processor's own precedent" posture —
  // reserved for a business-owner mobile flow (M8+), not added speculatively
  // beyond the declaration itself.
  { key: "businesses:read", description: "Read business profiles and listings", sensitivity: "low" },
  { key: "businesses:write", description: "Manage businesses you own or work for", sensitivity: "medium" },
  { key: "messages:read", description: "Read your private messages", sensitivity: "high" },
  { key: "messages:write", description: "Send messages on your behalf", sensitivity: "high" },
  { key: "payments:read", description: "Read your payout and transaction history", sensitivity: "high" },
  // mobile pro-upgrade addendum M6 (wallet): sending coins moves real
  // value between accounts — high sensitivity, same tier as payments:read,
  // not the low/medium tier most other :write scopes here get.
  { key: "payments:write", description: "Send coin transfers on your behalf", sensitivity: "high" },
  // phase-15 build plan step 2: the one first-party-app action (push device
  // registration) that had no scope of its own yet — low sensitivity since
  // it only lets the app register a token to receive push, not read content.
  { key: "push:write", description: "Register your device to receive push notifications", sensitivity: "low" },
  // mobile home/notifications screens: read-only, same sensitivity as
  // posts:read — marking a notification read is a state change on the
  // reader's own read receipt, not content creation, so it stays under
  // this same scope rather than needing its own :write variant.
  { key: "notifications:read", description: "Read your notifications", sensitivity: "low" },
  // Distinct from notifications:read (reading notification items) — this
  // covers reading/changing *delivery preferences* (NotificationDeliveryPreference),
  // a settings change rather than content access, same read/write split
  // reasoning as profile:write above.
  { key: "notifications:write", description: "Change your notification delivery preferences", sensitivity: "low" },
  // Mobile pro-upgrade addendum M12: settings/account parity. Read/write
  // split follows this catalog's own established convention throughout —
  // privacy settings + blocked-user list are a lower-stakes read than the
  // account-security domain below, so they get their own pair rather than
  // folding into profile:read/write (a consent screen shouldn't lump "see my
  // profile" in with "see who I've blocked").
  { key: "privacy:read", description: "Read your privacy settings and blocked users", sensitivity: "low" },
  { key: "privacy:write", description: "Change your privacy settings and block/unblock accounts", sensitivity: "medium" },
  // Covers sessions/login activity/2FA status/data export — every one of
  // these is account-takeover-adjacent (an attacker who can read this can
  // scope out how to attack the account further), same "high" tier
  // messages:read/payments:read already use for a similarly sensitive read.
  { key: "account:read", description: "Read your sessions, login activity, two-factor status, and data export", sensitivity: "high" },
  // Password/email/phone/2FA changes and deactivation/deletion are the same
  // "high" tier as payments:write — getting this scope wrong lets a
  // malicious app lock the real owner out of their own account.
  { key: "account:write", description: "Change your password, email, phone, two-factor settings, or deactivate/delete your account", sensitivity: "high" },
  { key: "preferences:read", description: "Read your language, timezone, and accessibility preferences", sensitivity: "low" },
  { key: "preferences:write", description: "Change your language, timezone, and accessibility preferences", sensitivity: "low" },
] as const;

export type OAuthScopeKey = (typeof OAUTH_SCOPES)[number]["key"];

export async function seedOAuthScopes(): Promise<void> {
  // One read + one bulk insert of the missing rows, rather than an upsert
  // per scope. seedOAuthScopes runs fire-and-forget from instrumentation.ts
  // on every boot; ~27 sequential upserts (each its own interactive
  // transaction) could sit half-open on a cold-start event loop long enough
  // for Turso to expire the stream and 404 the rest — see the matching note
  // in first-party-apps.ts ensureFirstPartyApps().
  const existing = await db.oAuthScope.findMany({
    select: { key: true, description: true, sensitivity: true },
  });
  const byKey = new Map(existing.map((s) => [s.key, s]));

  const missing = OAUTH_SCOPES.filter((s) => !byKey.has(s.key)).map((s) => ({
    key: s.key,
    description: s.description,
    sensitivity: s.sensitivity,
  }));
  if (missing.length > 0) {
    try {
      await db.oAuthScope.createMany({ data: missing });
    } catch (err) {
      // Lost a race with a concurrently-booting instance — its rows are
      // fine. Anything else propagates to runStartupTask's logger.
      if (!(typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002")) {
        throw err;
      }
    }
  }

  // Patch description/sensitivity drift on scopes that already exist (these
  // strings are edited in this file over time). Targeted single-row updates,
  // and only when a value actually changed — normally a no-op.
  for (const scope of OAUTH_SCOPES) {
    const current = byKey.get(scope.key);
    if (current && (current.description !== scope.description || current.sensitivity !== scope.sensitivity)) {
      await db.oAuthScope.update({
        where: { key: scope.key },
        data: { description: scope.description, sensitivity: scope.sensitivity },
      });
    }
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

  // RFC 6749 §4.1.2: an authorization code is single-use. The checks above
  // are check-then-act — two concurrent exchanges of the same code would
  // each see usedAt: null and each mint a token pair. Consume the code with
  // a conditional updateMany (usedAt: null in the WHERE) *inside* the same
  // transaction that upserts the authorization and mints the first token,
  // so exactly one racer wins and the code / authorization / token either
  // all commit together or not at all (a mid-way failure leaves the code
  // still redeemable). The claim runs after PKCE/redirect_uri validation so
  // a wrong-verifier attempt can't burn a code the real client still needs.
  const authorization = await db.$transaction(async (tx) => {
    const claimed = await tx.oAuthAuthorizationCode.updateMany({
      where: { code: args.code, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return null;

    const auth = await tx.oAuthAuthorization.upsert({
      where: { appId_userId: { appId: row.appId, userId: row.userId } },
      create: { appId: row.appId, userId: row.userId, grantedScopesJson: row.scopesJson, status: "active" },
      update: { grantedScopesJson: row.scopesJson, status: "active", revokedAt: null },
    });
    await tx.oAuthToken.create({
      data: {
        authorizationId: auth.id,
        accessTokenHash: hashApiToken(accessToken),
        refreshTokenHash: hashApiToken(refreshToken),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });
    return auth;
  });

  if (!authorization) return { error: "Invalid or expired authorization code." };

  return { accessToken, refreshToken, expiresIn: TOKEN_TTL_MS / 1000, scope: approvedScopes.join(" ") };
}

// RFC 6749 §6: rotates on every use — the presented refresh token's
// OAuthToken row is deleted and replaced by a fresh access/refresh pair
// rather than updated in place, so a stolen-then-used-elsewhere refresh
// token stops working the moment either side redeems it (whichever redeems
// second gets "Invalid refresh token", not a silently-shared session).
// Refresh tokens don't carry their own separate expiry — expiresAt on the
// row bounds only the access token half — so a session stays alive until
// the user signs out or revokes the app, the same long-lived-refresh
// posture every first-party mobile OAuth client takes, not a departure
// from it.
export async function refreshAccessToken(args: { refreshToken: string; appId: string }): Promise<TokenResult> {
  const tokenRow = await db.oAuthToken.findUnique({
    where: { refreshTokenHash: hashApiToken(args.refreshToken) },
    include: { authorization: true },
  });
  if (!tokenRow || tokenRow.authorization.appId !== args.appId) {
    return { error: "Invalid refresh token." };
  }
  if (tokenRow.authorization.status !== "active") {
    return { error: "This app's access has been revoked." };
  }

  const accessToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();

  // Claim this row before minting its replacement: two concurrent refreshes
  // with the same token both read tokenRow above, so gate the delete on the
  // row still existing (deleteMany → count) rather than delete({ id }),
  // which throws P2025 for the loser and would surface as a 500 instead of
  // the "Invalid refresh token" this rotation is meant to give the side
  // that redeems second.
  const claimed = await db.oAuthToken.deleteMany({ where: { id: tokenRow.id } });
  if (claimed.count === 0) {
    return { error: "Invalid refresh token." };
  }

  await db.oAuthToken.create({
    data: {
      authorizationId: tokenRow.authorizationId,
      accessTokenHash: hashApiToken(accessToken),
      refreshTokenHash: hashApiToken(refreshToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: TOKEN_TTL_MS / 1000,
    scope: JSON.parse(tokenRow.authorization.grantedScopesJson).join(" "),
  };
}

// spec §4.4: revoking an OAuthAuthorization must immediately invalidate its
// OAuthToken rows, not just stop future issuance — deleting them (rather
// than flagging) means resolveApiRequest's accessTokenHash lookup can never
// find a live row for a revoked authorization, so there's no separate
// "and also check the parent isn't revoked" branch to forget on the read
// path.
export async function revokeOAuthAuthorization(authorizationId: string, userId: string): Promise<boolean> {
  const authorization = await db.oAuthAuthorization.findUnique({ where: { id: authorizationId }, include: { app: { select: { clientId: true } } } });
  if (!authorization || authorization.userId !== userId) return false;
  await db.$transaction([
    db.oAuthToken.deleteMany({ where: { authorizationId } }),
    db.oAuthAuthorization.update({ where: { id: authorizationId }, data: { status: "revoked", revokedAt: new Date() } }),
  ]);
  // phase-15 spec §4.4: revoking a first-party app's access (§3.3's
  // connected-apps page) must also clear the DeviceToken rows it
  // registered — a stale token must not keep receiving pushes after
  // disconnect.
  const { clearDeviceTokensForApp } = await import("@/lib/push");
  await clearDeviceTokensForApp(userId, authorization.app.clientId);
  return true;
}

export function validateRedirectUri(redirectUrisJson: string, candidate: string): boolean {
  return isAllowedRedirectUri(redirectUrisJson, candidate);
}

export { generateOpaqueToken, hashApiToken };
export const oauthCodeChallengeBase64Url = base64UrlEncode;
