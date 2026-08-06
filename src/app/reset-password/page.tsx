import { createHash } from "crypto";
import Link from "next/link";
import { db } from "@/lib/db";
import { ResetPasswordForm } from "./ResetPasswordForm";

// Read-only pre-check so an invalid/expired link shows a clear message
// immediately instead of only failing after the user fills out the form.
// resetPassword (auth.ts) re-validates the same way on submit — this is a
// UX short-circuit, not the authoritative check (the token could still
// expire in the gap between this render and that submit).
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const record = token
    ? await db.passwordResetToken.findUnique({
        where: { tokenHash: createHash("sha256").update(token).digest("hex") },
      })
    : null;

  const valid = !!record && !record.usedAt && record.expiresAt > new Date();

  return (
    <div className="authWrap">
      {valid ? (
        <ResetPasswordForm token={token!} />
      ) : (
        <div className="authCard">
          <h1>Link invalid or expired</h1>
          <p className="mutedText">
            This password reset link is no longer valid. Request a new one to continue.
          </p>
          <Link href="/forgot-password" className="button">
            Request a new link
          </Link>
        </div>
      )}
    </div>
  );
}
