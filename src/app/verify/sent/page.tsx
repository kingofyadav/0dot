import type { Metadata } from "next";
import Link from "next/link";
import { ResendVerificationButton } from "./ResendVerificationButton";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifySentPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; sendFailed?: string }>;
}) {
  const { token, sendFailed } = await searchParams;

  return (
    <div className="authWrap">
      <div className="authCard">
        <h1>Check your email</h1>
        {sendFailed ? (
          <p className="errorText">
            We couldn&apos;t send that email just now. Your account was created — tap
            &quot;Resend email&quot; below to try again.
          </p>
        ) : (
          <p className="mutedText">
            We&apos;ve sent a verification link to your email address.
          </p>
        )}

        <ResendVerificationButton />

        {token && (
          <>
            <p className="mutedText">
              No email provider is configured yet in local development, so
              here&apos;s the link directly:
            </p>
            <Link href={`/verify?token=${token}`} className="button">
              Verify email
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
