"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";
import { validateUsernameFormat } from "@/lib/reserved-usernames";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export type ActionState = { error?: string } | undefined;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RATE_LIMIT_ERROR = "Too many attempts. Please try again in a few minutes.";
// Precomputed bcrypt hash of an arbitrary fixed string, compared against
// on a login attempt for an email that doesn't exist — so bcrypt.compare
// always runs one way or another, and response time can't be used to
// enumerate registered emails (a missing user used to short-circuit
// straight past the ~100ms+ hash compare).
const DUMMY_HASH = "$2b$12$7j5EHBqwhwNexnu5VeCDiuAkZZX8k8BFFqGnK9R./JTiJFcltTVOK";

export async function signup(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const handle = String(formData.get("username") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // Mass account creation is primarily an IP-scoped abuse pattern; a
  // per-email limit also catches repeated retries against one address
  // (e.g. hammering past "email already exists"). Checked before any DB
  // work — see phase-1 spec §7.2.
  const ip = await getClientIp();
  const ipOk = checkRateLimit(`signup:ip:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 });
  const emailOk = checkRateLimit(`signup:email:${email}`, { max: 3, windowMs: 15 * 60 * 1000 });
  if (!ipOk || !emailOk) {
    return { error: RATE_LIMIT_ERROR };
  }

  if (displayName.length < 1 || displayName.length > 50) {
    return { error: "Name must be 1-50 characters." };
  }

  const usernameError = validateUsernameFormat(handle);
  if (usernameError === "invalid_format") {
    return {
      error: "Username must be 3-30 characters: letters, numbers, underscore only.",
    };
  }
  if (usernameError === "reserved") {
    return { error: "That username is reserved." };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const [existingEmail, existingHandle] = await Promise.all([
    db.user.findUnique({ where: { email } }),
    db.username.findUnique({ where: { handle } }),
  ]);
  if (existingEmail) {
    return { error: "An account with that email already exists." };
  }
  if (existingHandle) {
    return { error: "That username is already taken." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await db.user.create({
      data: {
        email,
        passwordHash,
        username: { create: { handle } },
        profile: { create: { displayName } },
      },
    });
  } catch (err) {
    // The findUnique checks above are check-then-act, not atomic — two
    // concurrent signups for the same email/handle can both pass them
    // before either insert commits. Catch the resulting unique-constraint
    // violation here rather than letting it surface as an unhandled 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "That email or username is already taken." };
    }
    throw err;
  }

  const token = randomBytes(24).toString("hex");
  await db.emailVerificationToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    },
  });

  // No transactional email provider is wired up yet (flagged in Phase 1
  // spec open questions elsewhere) — log the verification link for local
  // dev/testing rather than silently dropping it.
  const verifyUrl = `/verify?token=${token}`;
  console.log(`[dev] Verification link for ${email}: ${verifyUrl}`);

  redirect(`/verify/sent?token=${token}`);
}

export async function login(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // Per-IP catches distributed credential stuffing; per-email catches a
  // brute force targeted at one account from anywhere. Checked before the
  // DB lookup/bcrypt work — see phase-1 spec §7.2.
  const ip = await getClientIp();
  const ipOk = checkRateLimit(`login:ip:${ip}`, { max: 10, windowMs: 5 * 60 * 1000 });
  const emailOk = checkRateLimit(`login:email:${email}`, { max: 5, windowMs: 5 * 60 * 1000 });
  if (!ipOk || !emailOk) {
    return { error: RATE_LIMIT_ERROR };
  }

  const user = await db.user.findUnique({
    where: { email },
    include: { username: true },
  });

  // Always run bcrypt.compare, even when no user matched — comparing
  // against DUMMY_HASH keeps a nonexistent-email response taking
  // approximately as long as a wrong-password one, closing the timing
  // side-channel a short-circuited `!user ||` would otherwise leave open.
  const passwordValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordValid) {
    return { error: "Incorrect email or password." };
  }

  if (user.status !== "active") {
    // Deliberately generic — doesn't distinguish suspended/deactivated/deleted
    // to a caller who already has the right password for this email.
    return { error: "This account is no longer active." };
  }

  await createSession(user.id);

  if (!user.emailVerifiedAt) {
    redirect("/verify/sent");
  }
  // A returning user most likely wants to see what's new, not land back on
  // their own profile every time — the just-verified first-time signup
  // path (verify/route.ts) still lands on the new profile itself, since
  // that's the "here's your new page" moment.
  redirect("/feed");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
