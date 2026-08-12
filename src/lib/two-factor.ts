import "server-only";
import { randomBytes, createHash } from "crypto";
import { generateSecret as otpGenerateSecret, generate as otpGenerate, verify as otpVerify, generateURI } from "otplib";
import QRCode from "qrcode";
import { db } from "@/lib/db";

// addendum §2/§3: same "account-takeover-capable secret" reasoning as
// PasswordResetToken.tokenHash — sha256, not bcrypt, since a recovery code
// already has 120 bits of entropy (randomBytes(15)); this only defends
// against a raw DB leak being directly replayable, not brute force.
function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateSecret(): string {
  return otpGenerateSecret();
}

export async function buildEnrollmentUri(secret: string, email: string): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
  const otpauthUrl = generateURI({ issuer: "0dot.in", label: email, secret });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { otpauthUrl, qrDataUrl };
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const result = await otpVerify({ secret, token: code });
  return result.valid;
}

// Only used by startTwoFactorEnrollment/confirmTwoFactorEnrollment to
// self-test the freshly generated secret is usable before it's ever shown
// to a user — not part of the login-time verification path.
export async function generateTotpCode(secret: string): Promise<string> {
  return otpGenerate({ secret });
}

// 10 codes, each randomBytes(15)-based (120 bits, base64url so it's short
// enough to read/type back), hashed at rest per §2's convention.
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => randomBytes(15).toString("base64url"));
}

export async function storeRecoveryCodes(userId: string, codes: string[]): Promise<void> {
  await db.twoFactorRecoveryCode.deleteMany({ where: { userId } });
  await db.twoFactorRecoveryCode.createMany({
    data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
  });
}

// One-time use: marks the matching row usedAt on success so it can't be
// replayed. Returns false for both "wrong code" and "already used" — same
// generic-failure posture as login()'s own DUMMY_HASH comparison, no signal
// to a caller about which case it was.
export async function verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
  const record = await db.twoFactorRecoveryCode.findUnique({
    where: { codeHash: hashRecoveryCode(code) },
  });
  if (!record || record.userId !== userId || record.usedAt) return false;

  await db.twoFactorRecoveryCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return true;
}
