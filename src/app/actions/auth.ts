"use server";

import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, getCurrentSessionToken } from "@/lib/session";
import { validateUsernameFormat } from "@/lib/reserved-usernames";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { toE164 } from "@/lib/country-codes";

export type ActionState = { error?: string; success?: boolean } | undefined;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
// Shorter than VERIFICATION_TTL_MS above and deliberately so — a password
// reset token grants account takeover, not just email-ownership
// confirmation, so it stays valid for a much narrower window.
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h
const RATE_LIMIT_ERROR = "Too many attempts. Please try again in a few minutes.";
// Precomputed bcrypt hash of an arbitrary fixed string, compared against
// on a login attempt for an email that doesn't exist — so bcrypt.compare
// always runs one way or another, and response time can't be used to
// enumerate registered emails (a missing user used to short-circuit
// straight past the ~100ms+ hash compare).
const DUMMY_HASH = "$2b$12$7j5EHBqwhwNexnu5VeCDiuAkZZX8k8BFFqGnK9R./JTiJFcltTVOK";

// PasswordResetToken stores this hash, never the raw token — see that
// model's comment in schema.prisma. SHA-256, not bcrypt: the raw token
// already has 192 bits of entropy (randomBytes(24)) so this isn't defending
// against brute force, only against a DB leak being directly replayable —
// a fast, deterministic hash is the right tool for that, unlike passwords.
function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function signup(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const handle = String(formData.get("username") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const phoneDialCode = String(formData.get("phoneDialCode") ?? "");
  const phoneNumber = String(formData.get("phoneNumber") ?? "");
  const dateOfBirthRaw = String(formData.get("dateOfBirth") ?? "");

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

  const phone = toE164(phoneDialCode, phoneNumber);
  if (!phone) {
    return { error: "Enter a valid mobile number." };
  }

  // Same bounds as the existing-account backfill path (setDateOfBirth,
  // actions/age.ts) — collected up front here instead, so a new signup never
  // hits AgeGatePrompt (RootLayout only renders it when dateOfBirth is null).
  const dateOfBirth = new Date(dateOfBirthRaw);
  const now = new Date();
  const earliestPlausibleDob = new Date(now.getFullYear() - 130, now.getMonth(), now.getDate());
  if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > now || dateOfBirth < earliestPlausibleDob) {
    return { error: "Enter a valid date of birth." };
  }

  const [existingEmail, existingHandle, existingPhone] = await Promise.all([
    db.user.findUnique({ where: { email } }),
    db.username.findUnique({ where: { handle } }),
    db.user.findUnique({ where: { phone } }),
  ]);
  if (existingEmail) {
    return { error: "An account with that email already exists." };
  }
  if (existingHandle) {
    return { error: "That username is already taken." };
  }
  if (existingPhone) {
    return { error: "An account with that mobile number already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await db.user.create({
      data: {
        email,
        phone,
        dateOfBirth,
        passwordHash,
        username: { create: { handle } },
        profile: { create: { displayName } },
      },
    });
  } catch (err) {
    // The findUnique checks above are check-then-act, not atomic — two
    // concurrent signups for the same email/handle/phone can both pass them
    // before either insert commits. Catch the resulting unique-constraint
    // violation here rather than letting it surface as an unhandled 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "That email, username, or mobile number is already taken." };
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
  const identifierRaw = String(formData.get("identifier") ?? "").trim();
  const identifier = identifierRaw.toLowerCase();
  const password = String(formData.get("password") ?? "");

  // Per-IP catches distributed credential stuffing; per-identifier catches a
  // brute force targeted at one account from anywhere, whichever of
  // email/username/phone they typed — see phase-1 spec §7.2.
  const ip = await getClientIp();
  const ipOk = checkRateLimit(`login:ip:${ip}`, { max: 10, windowMs: 5 * 60 * 1000 });
  const identifierOk = checkRateLimit(`login:identifier:${identifier}`, { max: 5, windowMs: 5 * 60 * 1000 });
  if (!ipOk || !identifierOk) {
    return { error: RATE_LIMIT_ERROR };
  }

  // Three ways to name an account: email (has "@"), phone (digits once
  // punctuation/spacing/"+" is stripped — compared against the stored E.164
  // form), or otherwise a username. Not merged into one OR'd query — each
  // shape has its own normalization, so keeping them as separate branches
  // keeps every comparison exact instead of guessing across all three.
  const phoneDigits = identifierRaw.replace(/[^0-9]/g, "");
  const user = identifier.includes("@")
    ? await db.user.findUnique({ where: { email: identifier }, include: { username: true } })
    : phoneDigits.length >= 7
      ? await db.user.findUnique({ where: { phone: `+${phoneDigits}` }, include: { username: true } })
      : await db.username.findUnique({ where: { handle: identifier } }).then((u) =>
          u ? db.user.findUnique({ where: { id: u.userId }, include: { username: true } }) : null
        );

  // Always run bcrypt.compare, even when no user matched — comparing
  // against DUMMY_HASH keeps a nonexistent-account response taking
  // approximately as long as a wrong-password one, closing the timing
  // side-channel a short-circuited `!user ||` would otherwise leave open.
  const passwordValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordValid) {
    return { error: "Incorrect email/username/mobile number or password." };
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

export async function requestPasswordReset(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  // Same pair-of-buckets shape as signup's ip/email limit above — a mass
  // request pattern is IP-scoped, while a targeted one hammers a single
  // address (e.g. spamming someone's inbox with reset links).
  const ip = await getClientIp();
  const ipOk = checkRateLimit(`password-reset-request:ip:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 });
  const emailOk = checkRateLimit(`password-reset-request:email:${email}`, { max: 3, windowMs: 15 * 60 * 1000 });
  if (!ipOk || !emailOk) {
    return { error: RATE_LIMIT_ERROR };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const user = await db.user.findUnique({ where: { email } });

  // Same enumeration posture as /verify/sent: no error branch for "no such
  // account" — the confirmation page's copy stays generic either way, and a
  // dev-only link only ever appears when a token was actually created.
  if (!user) {
    redirect("/forgot-password/sent");
  }

  // Only the newest link should ever work — invalidate anything still
  // outstanding before issuing a new one, so an old email lying around
  // (inbox, "sent" history) can't be replayed after a later request.
  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(24).toString("hex");
  await db.passwordResetToken.create({
    data: {
      tokenHash: hashResetToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    },
  });

  // Same "no transactional email provider yet" posture as signup's
  // verification link above.
  const resetUrl = `/reset-password?token=${token}`;
  console.log(`[dev] Password reset link for ${email}: ${resetUrl}`);

  redirect(`/forgot-password/sent?token=${token}`);
}

export async function resetPassword(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const ip = await getClientIp();
  const ipOk = checkRateLimit(`password-reset-confirm:ip:${ip}`, { max: 10, windowMs: 15 * 60 * 1000 });
  if (!ipOk) {
    return { error: RATE_LIMIT_ERROR };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match." };
  }

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: "This link is invalid or has expired. Request a new one." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    // Covers this token plus any stragglers requestPasswordReset's own
    // invalidation missed (e.g. one requested concurrently) in one query.
    db.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    // No session to spare here — the caller isn't authenticated, so every
    // session (including any a stolen-credential attacker is mid-using)
    // gets killed, not just this one.
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  // Same reasoning destroySession gives for its own dynamic import: keeps
  // this file from statically depending on push.ts.
  const { clearWebPushTokensForUser } = await import("@/lib/push");
  await clearWebPushTokensForUser(record.userId);

  redirect("/reset-password/success");
}

export async function changePassword(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Per-user, not per-IP/global — this form is only reachable while
  // authenticated, so the account itself is the meaningful rate-limit key
  // for guarding the current-password check from being brute-forced.
  const ok = checkRateLimit(`change-password:user:${user.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!ok) {
    return { error: RATE_LIMIT_ERROR };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmNewPassword = String(formData.get("confirmNewPassword") ?? "");

  const currentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentValid) {
    return { error: "Current password is incorrect." };
  }

  if (newPassword.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (newPassword !== confirmNewPassword) {
    return { error: "Passwords don't match." };
  }
  if (newPassword === currentPassword) {
    return { error: "New password must be different from your current one." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });

  // Kill every *other* session — standard practice after a credential
  // change, closes the "stolen session survives a password change" gap —
  // but spare the one making this request, unlike resetPassword's
  // kill-everything (there, the caller isn't authenticated at all; here
  // logging the user straight back out after they just saved would be a
  // worse experience for no added security).
  const currentToken = await getCurrentSessionToken();
  await db.session.deleteMany({
    where: { userId: user.id, token: { not: currentToken ?? "" } },
  });

  return { success: true };
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
