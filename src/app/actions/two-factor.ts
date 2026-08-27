"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSession, getPendingTwoFactorChallenge, clearTwoFactorChallenge } from "@/lib/session";
import {
  generateSecret,
  buildEnrollmentUri,
  verifyTotpCode,
  verifyRecoveryCode,
  generateRecoveryCodes,
  storeRecoveryCodes,
} from "@/lib/two-factor";
import type { ActionState } from "@/app/actions/auth";

// addendum §3: generates a secret and stores it unconfirmed (twoFactorSecret
// set, twoFactorEnabledAt still null) — confirmTwoFactorEnrollment below is
// what actually turns 2FA on, so an abandoned enrollment never half-enables
// anything. Called directly from the client component (not a
// useActionState form action) since the QR data needs to come back as data,
// not just an error/success flag.
export async function startTwoFactorEnrollment(): Promise<{ error: string } | { qrDataUrl: string; otpauthUrl: string }> {
  const user = await requireVerifiedUser();
  if (user.twoFactorEnabledAt) {
    return { error: "Two-factor authentication is already enabled." };
  }

  const secret = generateSecret();
  await db.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });

  const { otpauthUrl, qrDataUrl } = await buildEnrollmentUri(secret, user.email);
  return { otpauthUrl, qrDataUrl };
}

export async function confirmTwoFactorEnrollment(code: string): Promise<{ error: string } | { recoveryCodes: string[] }> {
  const user = await requireVerifiedUser();

  const ok = await enforceRateLimit(`2fa-enroll:user:${user.id}`, { max: 10, windowMs: 15 * 60 * 1000 });
  if (!ok) return { error: "Too many attempts. Please try again in a few minutes." };

  if (!user.twoFactorSecret) {
    return { error: "Start enrollment before confirming a code." };
  }

  const valid = await verifyTotpCode(user.twoFactorSecret, code);
  if (!valid) {
    return { error: "That code didn't match. Check your authenticator app and try again." };
  }

  const recoveryCodes = generateRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabledAt: new Date() } });
  await storeRecoveryCodes(user.id, recoveryCodes);

  // Deliberately no revalidatePath here (unlike disableTwoFactor below) —
  // this page.tsx branches on twoFactorEnabledAt, and revalidating
  // immediately would re-render the parent Server Component mid-step,
  // unmounting TwoFactorSetupForm (and the one-time recovery codes it's
  // about to show) before the user ever sees them. TwoFactorSetupForm's own
  // "Done" button does a full reload once the user has actually seen them.
  return { recoveryCodes };
}

// Same bcrypt.compare re-entry gate changePassword uses (auth.ts) — turning
// 2FA off is as sensitive as changing the password itself.
export async function disableTwoFactor(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");

  const ok = await enforceRateLimit(`2fa-disable:user:${user.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!ok) return { error: "Too many attempts. Please try again in a few minutes." };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect." };

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { twoFactorSecret: null, twoFactorEnabledAt: null } }),
    db.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
  ]);

  revalidatePath("/s", "layout");
  return { success: true };
}

export async function regenerateRecoveryCodes(currentPassword: string): Promise<{ error: string } | { recoveryCodes: string[] }> {
  const user = await requireVerifiedUser();

  const ok = await enforceRateLimit(`2fa-regen:user:${user.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!ok) return { error: "Too many attempts. Please try again in a few minutes." };

  if (!user.twoFactorEnabledAt) return { error: "Two-factor authentication isn't enabled." };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect." };

  const recoveryCodes = generateRecoveryCodes();
  await storeRecoveryCodes(user.id, recoveryCodes);
  return { recoveryCodes };
}

// addendum §3/§10: the second step of login() once it redirects to
// /login/2fa — accepts a TOTP code or a one-time recovery code, rate-limited
// per-user like login()'s own login:identifier bucket. Writes its own
// LoginEvent (method totp | recovery_code), separate from the "password"
// stage row login() already wrote.
export async function verifyLoginTwoFactor(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const challenge = await getPendingTwoFactorChallenge();
  if (!challenge) redirect("/login");

  const code = String(formData.get("code") ?? "").trim();

  const ok = await enforceRateLimit(`2fa:user:${challenge.userId}`, { max: 8, windowMs: 15 * 60 * 1000 });
  if (!ok) return { error: "Too many attempts. Please try again in a few minutes." };

  const user = await db.user.findUnique({ where: { id: challenge.userId } });
  if (!user || !user.twoFactorSecret) redirect("/login");

  // A TOTP code is always 6 digits; recovery codes (randomBytes(15) as
  // base64url) are much longer, so the shape alone picks the branch without
  // needing to try both against every submission.
  let method: "totp" | "recovery_code" = "totp";
  let valid = /^\d{6}$/.test(code) && (await verifyTotpCode(user.twoFactorSecret, code));
  if (!valid && code.length > 6) {
    method = "recovery_code";
    valid = await verifyRecoveryCode(user.id, code);
  }

  const headersList = await headers();
  await db.loginEvent.create({
    data: { userId: user.id, ipAddress: await getClientIp(), userAgent: headersList.get("user-agent"), success: valid, method },
  });

  if (!valid) {
    return { error: "That code didn't match." };
  }

  await clearTwoFactorChallenge();
  await createSession(user.id);

  if (!user.emailVerifiedAt) redirect("/verify/sent");
  redirect("/feed");
}
