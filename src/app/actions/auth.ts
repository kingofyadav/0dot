"use server";

import { randomBytes, createHash } from "crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, createTwoFactorChallenge } from "@/lib/session";
import { revokeAllOtherSessions } from "@/app/actions/session-management";
import { validateUsernameFormat } from "@/lib/reserved-usernames";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { toE164 } from "@/lib/country-codes";
import { getEmailSender, getAppOrigin } from "@/lib/email";
import { isInternalSystemAccountEmail } from "@/lib/first-party-apps";

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
  // Honeypot: a field styled off-screen (see .honeypotField in globals.css)
  // and never exposed to autofill, so only a script filling every input
  // blindly ever populates it. Redirect straight to the same success
  // destination a real signup hits — same response shape either way, no
  // "invalid" signal a bot could learn from — without touching the DB or
  // spending a rate-limit slot on it.
  if (String(formData.get("website") ?? "").trim()) {
    redirect("/verify/sent");
  }

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

  // getEmailSender() falls back to a console-log stub until SMTP_HOST is
  // configured (see src/lib/email.ts) — same dev/prod seam as payments.
  const sender = getEmailSender();
  const verifyUrl = `${getAppOrigin()}/verify?token=${token}`;
  await sender.send({
    to: email,
    subject: "Verify your 0dot.in email",
    html: `<p>Confirm your email to finish setting up your account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
  });

  // Only the console stub needs the token surfaced back on the page — once
  // a real sender is configured, an account-verification token has no
  // business appearing in a URL that can land in browser history, a
  // Referer header, or a screenshot.
  redirect(sender.name === "console-stub" ? `/verify/sent?token=${token}` : "/verify/sent");
}

export type UsernameAvailability = "available" | "taken" | "invalid" | "reserved";

// Exposes the same authoritative checks signup() already runs
// (validateUsernameFormat + db.username.findUnique) ahead of submission, so
// the signup form can show availability while typing (spec §11) instead of
// only discovering a conflict on submit — signup() above remains the actual
// authority and re-runs both checks itself; this is a preview, not a second
// source of truth. IP-rate-limited like every other unauthenticated write/
// read here, generous enough for a debounced typeahead (UsernameField
// debounces ~400ms) without allowing a scripted enumeration sweep.
export async function checkUsernameAvailability(handle: string): Promise<UsernameAvailability> {
  const normalized = handle.trim().toLowerCase();

  const ip = await getClientIp();
  const ok = checkRateLimit(`username-check:ip:${ip}`, { max: 30, windowMs: 60 * 1000 });
  if (!ok) {
    // Treated as "invalid" by the caller (no distinct rate-limit UI state
    // for a background typeahead check) rather than surfacing a dedicated
    // error — the field's own required/pattern attributes still catch a bad
    // final submission, and signup() re-validates regardless.
    return "invalid";
  }

  const formatError = validateUsernameFormat(normalized);
  if (formatError === "invalid_format") return "invalid";
  if (formatError === "reserved") return "reserved";

  const existing = await db.username.findUnique({ where: { handle: normalized } });
  return existing ? "taken" : "available";
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
  // addendum §10: one LoginEvent row per login() attempt — only possible
  // when a user actually resolved (the schema's userId is required), so a
  // bad identifier that matches no account still can't be logged against
  // anyone. The extra insert only on the user-found path re-introduces a
  // small timing gap versus the DUMMY_HASH fix above, but it's a single
  // indexed write (~1ms) against a ~100ms bcrypt compare — not a
  // meaningful reopening of that side channel.
  if (user) {
    const headersList = await headers();
    await db.loginEvent.create({
      data: { userId: user.id, ipAddress: ip, userAgent: headersList.get("user-agent"), success: passwordValid, method: "password" },
    });
  }
  if (!user || !passwordValid || isInternalSystemAccountEmail(user.email)) {
    return { error: "Incorrect email/username/mobile number or password." };
  }

  if (user.status !== "active") {
    // addendum §7: a deactivated account (deletionScheduledFor set, still
    // within the 30-day window) gets a reactivation path here instead of
    // the generic rejection every other non-active status hits.
    if (user.status === "deactivated" && user.deletionScheduledFor && user.deletionScheduledFor > new Date()) {
      await db.user.update({ where: { id: user.id }, data: { status: "active", deletionScheduledFor: null } });
    } else {
      // Deliberately generic — doesn't distinguish suspended/deactivated/deleted
      // to a caller who already has the right password for this email.
      return { error: "This account is no longer active." };
    }
  }

  // addendum §3: password check passed — branch before creating a real
  // session if 2FA is enabled. The LoginEvent above already recorded the
  // password stage; verifyLoginTwoFactor (two-factor.ts) records its own
  // row for the TOTP/recovery-code stage once that completes.
  if (user.twoFactorEnabledAt) {
    await createTwoFactorChallenge(user.id);
    redirect("/login/2fa");
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
  // dev-only link only ever appears when a token was actually created. An
  // internal system account (e.g. platform-apps@0dot.internal) is treated
  // identically to a nonexistent one — it must never become loggable-into.
  if (!user || isInternalSystemAccountEmail(user.email)) {
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

  const sender = getEmailSender();
  const resetUrl = `${getAppOrigin()}/reset-password?token=${token}`;
  await sender.send({
    to: email,
    subject: "Reset your 0dot.in password",
    html: `<p>Reset your password using the link below:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });

  // Same account-takeover-token-in-a-URL concern as signup verification
  // above — only the console stub needs it echoed back on the page.
  redirect(sender.name === "console-stub" ? `/forgot-password/sent?token=${token}` : "/forgot-password/sent");
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
  await revokeAllOtherSessions(user.id);

  return { success: true };
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
