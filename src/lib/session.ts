import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/rate-limit";

const SESSION_COOKIE = "0dot_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// The raw token only ever lives in the httpOnly cookie — the DB stores
// sha256(token), same pattern two-factor.ts's hashRecoveryCode uses, so a
// DB read exposure can't yield a directly-usable session token. Exported so
// callers that already hold the raw cookie value via getCurrentSessionToken
// (the active-sessions page's "this device" check, revokeAllOtherSessions)
// can compare/filter against tokenHash themselves without duplicating this.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // account-settings-hardening addendum §4: captured once at creation so the
  // active-sessions settings page can show "Chrome on macOS" style rows
  // without a live lookup — ip/UA drift over a session's 30-day life is
  // acceptable for that display purpose (lastSeenAt below is what's kept
  // fresh, not these).
  const headersList = await headers();
  const userAgent = headersList.get("user-agent");
  const ipAddress = await getClientIp();

  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, userAgent, ipAddress },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    const session = await db.session.findUnique({ where: { tokenHash }, select: { userId: true } });
    await db.session.deleteMany({ where: { tokenHash } });
    // phase-15 spec §4.4: "revoking/logging out clears the associated
    // DeviceToken" — delegates to push.ts's own device-token interface
    // (clearWebPushTokensForUser) rather than reaching into db.deviceToken
    // directly, so this stays in sync with however push.ts's device-token
    // cleanup evolves instead of silently drifting from it.
    if (session) {
      const { clearWebPushTokensForUser } = await import("@/lib/push");
      await clearWebPushTokensForUser(session.userId);
    }
  }
  cookieStore.delete(SESSION_COOKIE);
}

// Read-only lookup of the caller's own session token, so a mutation that
// kills a user's *other* sessions (changePassword, auth.ts) knows which one
// to spare instead of logging the requester out along with everyone else.
export async function getCurrentSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

// Wrapped in React's cache() below — every layout/page/component on a given
// request calls getCurrentUser independently (it's the standard auth check),
// so without per-request memoization a single page load was firing this
// several times over, each one a DB round trip. cache() collapses those into
// one call per request.
async function loadCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // account-settings-hardening addendum §4: needs to stay a find, not the
  // unconditional update this used to be — that turned every single
  // getCurrentUser call (i.e. every page load and every server action) into
  // a DB write. The lastSeenAt bump below is now throttled instead, so a
  // request only writes when the timestamp is actually stale. A missing
  // token (already logged out/expired-and-deleted elsewhere) is just null,
  // no exception needed since this is a read again.
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { username: true, profile: true },
      },
    },
  });
  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { tokenHash } });
    return null;
  }

  if (session.user.status !== "active") {
    // Status can change after a session already exists (suspension, deletion,
    // etc.) — checking only at login time would let an existing session keep
    // working indefinitely after the account is no longer active.
    await db.session.delete({ where: { tokenHash } });
    return null;
  }

  // account-settings-hardening addendum §4: the active-sessions page's "last
  // active" column just needs to be roughly fresh, not exact — throttling to
  // once per 5min turns nearly every request into a plain read instead of a
  // write, without the active-sessions display going noticeably stale.
  // Awaited (not fire-and-forget): serverless functions can freeze right
  // after the response is sent, so an un-awaited write here could silently
  // never happen.
  if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await db.session.update({ where: { tokenHash }, data: { lastSeenAt: new Date() } });
  }

  return session.user;
}

export const getCurrentUser = cache(loadCurrentUser);

const TWO_FACTOR_CHALLENGE_COOKIE = "0dot_2fa_challenge";
const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 min

// addendum §3: login() calls this instead of createSession when the account
// has 2FA enabled — a PendingTwoFactorChallenge row plus a short-lived
// cookie referencing it, mirroring Session's own opaque-token-in-cookie
// shape rather than a JWT, so /login/2fa can find its way back to the right
// user without a real session existing yet.
export async function createTwoFactorChallenge(userId: string): Promise<void> {
  const challenge = await db.pendingTwoFactorChallenge.create({
    data: { userId, expiresAt: new Date(Date.now() + TWO_FACTOR_CHALLENGE_TTL_MS) },
  });

  const cookieStore = await cookies();
  cookieStore.set(TWO_FACTOR_CHALLENGE_COOKIE, challenge.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: challenge.expiresAt,
  });
}

// Read-only, doesn't consume the challenge — /login/2fa's page render needs
// to know which account it's verifying without deleting the row on every
// GET (a failed code submission should be retryable within the TTL).
export async function getPendingTwoFactorChallenge(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies();
  const challengeId = cookieStore.get(TWO_FACTOR_CHALLENGE_COOKIE)?.value;
  if (!challengeId) return null;

  const challenge = await db.pendingTwoFactorChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.expiresAt < new Date()) return null;

  return { userId: challenge.userId };
}

// Called once verifyLoginTwoFactor succeeds, so the same challenge can't be
// replayed after the real session is created.
export async function clearTwoFactorChallenge(): Promise<void> {
  const cookieStore = await cookies();
  const challengeId = cookieStore.get(TWO_FACTOR_CHALLENGE_COOKIE)?.value;
  if (challengeId) {
    await db.pendingTwoFactorChallenge.deleteMany({ where: { id: challengeId } });
  }
  cookieStore.delete(TWO_FACTOR_CHALLENGE_COOKIE);
}
