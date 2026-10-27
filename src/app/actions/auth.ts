"use server";

import { headers, cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createSession, destroySession, getCurrentUser, createTwoFactorChallenge } from "@/lib/session";
import { revokeAllOtherSessions } from "@/app/actions/session-management";
import { validateUsernameFormat } from "@/lib/reserved-usernames";
import { checkRateLimit, enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { toE164 } from "@/lib/country-codes";
import { isInternalSystemAccountEmail } from "@/lib/first-party-apps";
import { ensureUserAccounts } from "@/lib/wallet/accounts";
import { issueSignupGrant, issueLaunchPromoIfEligible } from "@/lib/wallet/grants";
import { recordReferralAttribution, REFERRAL_COOKIE } from "@/lib/wallet/referral";
import {
  issuePasswordRecoveryCodes,
  consumePasswordRecoveryCode,
  sealRecoveryCodes,
  RECOVERY_CODES_COOKIE,
  RECOVERY_CODES_COOKIE_MAX_AGE_S,
} from "@/lib/password-recovery";

export type ActionState = { error?: string; success?: boolean } | undefined;

const RATE_LIMIT_ERROR = "Too many attempts. Please try again in a few minutes.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Precomputed bcrypt hash of an arbitrary fixed string, compared against
// on a login attempt for an email that doesn't exist — so bcrypt.compare
// always runs one way or another, and response time can't be used to
// enumerate registered emails (a missing user used to short-circuit
// straight past the ~100ms+ hash compare).
const DUMMY_HASH = "$2b$12$7j5EHBqwhwNexnu5VeCDiuAkZZX8k8BFFqGnK9R./JTiJFcltTVOK";

// A freeform login/recovery identifier might be a phone number — turn it into
// the exact E.164 form stored on User.phone: only when it's made of nothing
// but digits and phone punctuation (so a username that merely contains
// digits, like "john1234567", is never mistaken for one), strip everything
// but digits, then require enough of them left (7) to plausibly be a real
// number.
function phoneDigitsFromIdentifier(raw: string): string | null {
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  return digits.length >= 7 ? `+${digits}` : null;
}

// Three ways to name an account: email (has "@"), phone (digits once
// punctuation/spacing/"+" is stripped — compared against the stored E.164
// form), or otherwise a username. Not merged into one OR'd query — each
// shape has its own normalization, so keeping them as separate branches
// keeps every comparison exact instead of guessing across all three.
// Shared by login() and recoverPassword().
async function findUserByIdentifier(identifier: string, identifierRaw: string) {
  const phoneIdentifier = phoneDigitsFromIdentifier(identifierRaw);
  return identifier.includes("@")
    ? db.user.findUnique({ where: { email: identifier }, include: { username: true } })
    : phoneIdentifier
      ? db.user.findUnique({ where: { phone: phoneIdentifier }, include: { username: true } })
      : db.username.findUnique({ where: { handle: identifier } }).then((u) =>
          u ? db.user.findUnique({ where: { id: u.userId }, include: { username: true } }) : null
        );
}

// Signup requires only what an account can't exist without — a name, a
// permanent username, and a password — and logs the user straight in. Email,
// phone, and date of birth are all collected on the same form but optional
// (can also be added later from settings; date of birth is otherwise
// prompted for by AgeGatePrompt, since an unknown DOB gets the protective
// default restriction set — phase-12 spec §8.2). There is deliberately no
// verification step on any of them: the platform doesn't send mail or SMS,
// so gating on a confirmation link/code would strand every real signup the
// way the old flow did (see CHANGELOG around 534696e). Abuse resistance
// comes from the rate limits and honeypot below, plus account-age gates on
// anything farmable (coin transfers, referral rewards — see
// wallet/eligibility.ts and wallet/referral.ts). Password recovery uses the
// one-time recovery codes issued here (see lib/password-recovery.ts).
export async function signup(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Honeypot: a field styled off-screen (see .honeypotField in globals.css).
  // Named away from any recognizable autofill category (not "website",
  // "company", "url", etc.) — mobile Chrome's Android-level autofill
  // ignores autocomplete="off" and will silently populate a hidden field
  // it heuristically recognizes, which previously made every real signup
  // from an affected phone silently no-op. Redirect straight to the same
  // destination a real signup hits — same response shape either way, no
  // "invalid" signal a bot could learn from (without a session that page
  // just bounces to /login) — without touching the DB or spending a
  // rate-limit slot on it.
  if (String(formData.get("hp_extra_field") ?? "").trim()) {
    redirect("/signup/recovery-codes");
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  const handle = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phoneDialCode = String(formData.get("phoneDialCode") ?? "");
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const dateOfBirthRaw = String(formData.get("dateOfBirth") ?? "").trim();

  // Mass account creation is primarily an IP-scoped abuse pattern; the
  // per-handle limit also catches repeated retries against one username.
  // Checked before any DB work — see phase-1 spec §7.2.
  const ip = await getClientIp();
  const [ipOk, handleOk] = await Promise.all([
    enforceRateLimit(`signup:ip:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 }),
    enforceRateLimit(`signup:handle:${handle}`, { max: 3, windowMs: 15 * 60 * 1000 }),
  ]);
  if (!ipOk || !handleOk) {
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

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // All three below are optional — blank is fine — but a value that was
  // typed in gets the same format check a required field would, so a typo
  // surfaces now instead of silently creating an account with a garbage
  // email/phone/DOB.
  if (email && !EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }
  let phone: string | null = null;
  if (phoneNumber) {
    phone = toE164(phoneDialCode, phoneNumber);
    if (!phone) {
      return { error: "Enter a valid mobile number." };
    }
  }
  let dateOfBirth: Date | null = null;
  if (dateOfBirthRaw) {
    const parsed = new Date(dateOfBirthRaw);
    const now = new Date();
    // Same bounds as the existing-account backfill path (setDateOfBirth,
    // age.ts): not in the future, not implausibly old.
    const earliestPlausible = new Date(now.getFullYear() - 130, now.getMonth(), now.getDate());
    if (Number.isNaN(parsed.getTime()) || parsed > now || parsed < earliestPlausible) {
      return { error: "Enter a valid date of birth." };
    }
    dateOfBirth = parsed;
  }

  // Next.js's own guidance for Server Functions (see docs/BUGS.md "Production
  // signup intermittently fails"): model expected errors as return values,
  // not thrown exceptions — an uncaught throw here bubbles to the nearest
  // error boundary (global-error.tsx, since there's no error.tsx scoped to
  // /signup) instead of showing a friendly message via useActionState, which
  // on a cross-region DB blip that exhausts db-resilience.ts's retries made
  // signup look like it silently did nothing.
  let existingHandle: { handle: string } | null;
  let existingEmail: { id: string } | null;
  let existingPhone: { id: string } | null;
  try {
    [existingHandle, existingEmail, existingPhone] = await Promise.all([
      db.username.findUnique({ where: { handle } }),
      email ? db.user.findUnique({ where: { email } }) : null,
      phone ? db.user.findUnique({ where: { phone } }) : null,
    ]);
  } catch (err) {
    logger.error("signup: availability check failed", err, { handle });
    return { error: "Something went wrong. Please try again." };
  }
  if (existingHandle) {
    return { error: "That username is already taken." };
  }
  if (existingEmail) {
    return { error: "That email is already in use." };
  }
  if (existingPhone) {
    return { error: "That mobile number is already in use." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const refCode = (await cookies()).get(REFERRAL_COOKIE)?.value ?? null;
  let created: { user: { id: string }; recoveryCodes: string[] };
  try {
    // User row + coin ledger accounts + the audited signup grant (plus, for
    // early accounts, the launch promo, §8.1) + recovery codes all commit
    // together (addendum-coin-wallet-v2.md §7.1).
    created = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          passwordHash,
          email: email || null,
          phone,
          dateOfBirth,
          username: { create: { handle } },
          profile: { create: { displayName } },
        },
      });
      await ensureUserAccounts(tx, user.id);
      await issueSignupGrant(tx, user.id);
      await issueLaunchPromoIfEligible(tx, user.id);
      await recordReferralAttribution(tx, user.id, refCode);
      const recoveryCodes = await issuePasswordRecoveryCodes(user.id, tx);
      return { user, recoveryCodes };
    });
  } catch (err) {
    // The findUnique checks above are check-then-act, not atomic — two
    // concurrent signups for the same handle/email/phone can both pass
    // before either insert commits. Catch the resulting unique-constraint
    // violation here rather than letting it surface as an unhandled 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = err.meta?.target;
      const targets = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
      if (targets.some((t) => t.includes("email"))) {
        return { error: "That email is already in use." };
      }
      if (targets.some((t) => t.includes("phone"))) {
        return { error: "That mobile number is already in use." };
      }
      return { error: "That username is already taken." };
    }
    // Same "return, don't throw" reasoning as the availability check above —
    // most commonly a cross-region DB blip (db-resilience.ts's retries
    // exhausted) surfacing here instead.
    logger.error("signup: account creation failed", err, { handle });
    return { error: "Something went wrong creating your account. Please try again." };
  }

  await createSession(created.user.id);
  (await cookies()).set(RECOVERY_CODES_COOKIE, sealRecoveryCodes(created.user.id, created.recoveryCodes), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/signup/recovery-codes",
    maxAge: RECOVERY_CODES_COOKIE_MAX_AGE_S,
  });
  redirect("/signup/recovery-codes");
}

// "I've saved my codes" on /signup/recovery-codes: drops the one-time cookie
// and lands the new user on their own profile — the "here's your new page"
// moment the old email-verification link used to deliver.
export async function acknowledgeRecoveryCodes(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  (await cookies()).delete({ name: RECOVERY_CODES_COOKIE, path: "/signup/recovery-codes" });
  redirect(user.username ? `/${user.username.handle}` : "/feed");
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
  const [ipOk, identifierOk] = await Promise.all([
    enforceRateLimit(`login:ip:${ip}`, { max: 10, windowMs: 5 * 60 * 1000 }),
    enforceRateLimit(`login:identifier:${identifier}`, { max: 5, windowMs: 5 * 60 * 1000 }),
  ]);
  if (!ipOk || !identifierOk) {
    return { error: RATE_LIMIT_ERROR };
  }

  const user = await findUserByIdentifier(identifier, identifierRaw);

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
  if (!user || !passwordValid || (user.email && isInternalSystemAccountEmail(user.email))) {
    return { error: "Incorrect username or password." };
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

  // A returning user most likely wants to see what's new, not land back on
  // their own profile every time — a first-time signup still lands on the
  // new profile itself (acknowledgeRecoveryCodes), since that's the
  // "here's your new page" moment.
  redirect("/feed");
}

// /forgot-password: username (or email/mobile, for accounts that have one)
// + one unused recovery code + a new password. Replaces the old emailed
// reset link — the platform doesn't send mail. The code is consumed in the
// same transaction as the password change, and every session is killed,
// same as the old link-based reset.
export async function recoverPassword(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const identifierRaw = String(formData.get("identifier") ?? "").trim();
  const identifier = identifierRaw.toLowerCase();
  const code = String(formData.get("recoveryCode") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  // Recovery codes are guessable in principle, so this is the brute-force
  // surface — same pair-of-buckets shape as login(): IP-scoped for spraying,
  // identifier-scoped for a targeted attack on one account from anywhere.
  const ip = await getClientIp();
  const [ipOk, identifierOk] = await Promise.all([
    enforceRateLimit(`password-recovery:ip:${ip}`, { max: 10, windowMs: 15 * 60 * 1000 }),
    enforceRateLimit(`password-recovery:identifier:${identifier}`, { max: 5, windowMs: 15 * 60 * 1000 }),
  ]);
  if (!ipOk || !identifierOk) {
    return { error: RATE_LIMIT_ERROR };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match." };
  }

  // Hashed before the lookup so response time doesn't reveal whether an
  // email/mobile identifier belongs to an account (same concern as login()'s
  // DUMMY_HASH).
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await findUserByIdentifier(identifier, identifierRaw);
  const genericError = { error: "That username and recovery code don't match. Check both and try again." };
  // Internal system accounts must never become loggable-into — treated
  // identically to a nonexistent account, same as login().
  if (!user || (user.email && isInternalSystemAccountEmail(user.email)) || user.status !== "active") {
    return genericError;
  }

  const ok = await db.$transaction(async (tx) => {
    if (!(await consumePasswordRecoveryCode(user.id, code, tx))) return false;
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    // No session to spare — the caller isn't authenticated, so every session
    // (including any a stolen-credential attacker is mid-using) is killed.
    await tx.session.deleteMany({ where: { userId: user.id } });
    return true;
  });
  if (!ok) return genericError;

  // Same reasoning destroySession gives for its own dynamic import: keeps
  // this file from statically depending on push.ts.
  const { clearWebPushTokensForUser } = await import("@/lib/push");
  await clearWebPushTokensForUser(user.id);

  redirect("/reset-password/success");
}

export type RecoveryCodesState = { error?: string; codes?: string[] } | undefined;

// Security settings: issue a fresh set of recovery codes (invalidating the
// old ones). Current-password re-entry, same gate as every other sensitive
// account change. Returned straight to the form rather than via a cookie —
// this action doesn't touch the session, so the page doesn't re-render.
export async function regeneratePasswordRecoveryCodes(
  _prevState: RecoveryCodesState,
  formData: FormData
): Promise<RecoveryCodesState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ok = await enforceRateLimit(`recovery-codes:user:${user.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!ok) return { error: RATE_LIMIT_ERROR };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { error: "Current password is incorrect." };
  }

  return { codes: await issuePasswordRecoveryCodes(user.id) };
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
  const ok = await enforceRateLimit(`change-password:user:${user.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
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
  // but spare the one making this request, unlike recoverPassword's
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
