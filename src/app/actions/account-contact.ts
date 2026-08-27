"use server";

import { randomBytes, randomInt, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getEmailSender, getAppOrigin, renderEmailChangeEmailHtml } from "@/lib/email";
import { getSmsSender } from "@/lib/sms";
import { toE164 } from "@/lib/country-codes";
import type { ActionState } from "@/app/actions/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h, same as signup's own verification token
const PHONE_CHANGE_TTL_MS = 10 * 60 * 1000; // short — a 6-digit code, not a link
const RATE_LIMIT_ERROR = "Too many attempts. Please try again in a few minutes.";

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// addendum §6: mirrors signup's verification flow — a token-in-a-link sent
// to the *new* address (proves ownership of it, not the old one), applied
// by verify-email-change/page.tsx. Requires current-password re-entry, same
// bcrypt.compare gate changePassword uses (auth.ts).
export async function requestEmailChange(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newEmail = String(formData.get("newEmail") ?? "").trim().toLowerCase();

  const ok = await enforceRateLimit(`email-change:user:${user.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!ok) return { error: RATE_LIMIT_ERROR };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect." };

  if (!EMAIL_PATTERN.test(newEmail)) return { error: "Enter a valid email address." };
  if (newEmail === user.email) return { error: "That's already your current email." };

  const existing = await db.user.findUnique({ where: { email: newEmail } });
  if (existing) return { error: "An account with that email already exists." };

  // Only the newest request should ever be redeemable — same "invalidate
  // anything outstanding before issuing a new one" posture as
  // requestPasswordReset (auth.ts).
  await db.pendingEmailChange.deleteMany({ where: { userId: user.id } });

  const token = randomBytes(24).toString("hex");
  await db.pendingEmailChange.create({
    data: { userId: user.id, newEmail, token, expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS) },
  });

  const sender = getEmailSender();
  const confirmUrl = `${getAppOrigin()}/verify-email-change?token=${token}`;
  await sender.send({
    to: newEmail,
    subject: "Confirm your new 0dot.in email",
    html: renderEmailChangeEmailHtml(confirmUrl),
  });

  return { success: true };
}

// addendum §6: no SMS provider exists yet — sms.ts's ConsoleSmsSender logs
// the code in dev. Two-step like TwoFactorSetupForm's enrollment: this
// issues the code, confirmPhoneChange below applies it.
export async function requestPhoneChange(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const phoneDialCode = String(formData.get("phoneDialCode") ?? "");
  const phoneNumber = String(formData.get("phoneNumber") ?? "");

  const ok = await enforceRateLimit(`phone-change:user:${user.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!ok) return { error: RATE_LIMIT_ERROR };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect." };

  const newPhone = toE164(phoneDialCode, phoneNumber);
  if (!newPhone) return { error: "Enter a valid mobile number." };
  if (newPhone === user.phone) return { error: "That's already your current mobile number." };

  const existing = await db.user.findUnique({ where: { phone: newPhone } });
  if (existing) return { error: "An account with that mobile number already exists." };

  await db.pendingPhoneChange.deleteMany({ where: { userId: user.id } });

  const code = String(randomInt(100000, 1000000));
  await db.pendingPhoneChange.create({
    data: { userId: user.id, newPhone, codeHash: hashCode(code), expiresAt: new Date(Date.now() + PHONE_CHANGE_TTL_MS) },
  });

  await getSmsSender().send({ to: newPhone, body: `Your 0dot.in verification code is ${code}` });

  return { success: true };
}

export async function confirmPhoneChange(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const code = String(formData.get("code") ?? "").trim();

  const ok = await enforceRateLimit(`phone-change-confirm:user:${user.id}`, { max: 8, windowMs: 15 * 60 * 1000 });
  if (!ok) return { error: RATE_LIMIT_ERROR };

  const pending = await db.pendingPhoneChange.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!pending || pending.expiresAt < new Date() || pending.codeHash !== hashCode(code)) {
    return { error: "That code is invalid or has expired." };
  }

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { phone: pending.newPhone } }),
    db.pendingPhoneChange.deleteMany({ where: { userId: user.id } }),
  ]);

  return { success: true };
}
