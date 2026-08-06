import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

const SESSION_COOKIE = "0dot_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: { token, userId, expiresAt },
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
    const session = await db.session.findUnique({ where: { token }, select: { userId: true } });
    await db.session.deleteMany({ where: { token } });
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

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        include: { username: true, profile: true },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) await db.session.delete({ where: { token } });
    return null;
  }

  if (session.user.status !== "active") {
    // Status can change after a session already exists (suspension, deletion,
    // etc.) — checking only at login time would let an existing session keep
    // working indefinitely after the account is no longer active.
    await db.session.delete({ where: { token } });
    return null;
  }

  return session.user;
}
