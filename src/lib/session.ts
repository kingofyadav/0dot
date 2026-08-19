import "server-only";
import { cookies, headers } from "next/headers";
import { randomBytes, createHash } from "crypto";
import { Prisma } from "@/generated/prisma/client";
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

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // account-settings-hardening addendum §4: an update (not findUnique) so
  // the active-sessions page's "last active" column stays fresh — this
  // already runs once per request, so bumping lastSeenAt here is a field
  // added to an existing query, not a new one. A missing token (already
  // logged out/expired-and-deleted elsewhere) throws P2025, caught below.
  const tokenHash = hashToken(token);
  let session;
  try {
    session = await db.session.update({
      where: { tokenHash },
      data: { lastSeenAt: new Date() },
      include: {
        user: {
          include: { username: true, profile: true },
        },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
    throw err;
  }

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

  return session.user;
}

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
