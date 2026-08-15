import Link from "next/link";
import { ResendVerificationButton } from "./ResendVerificationButton";

export default async function VerifySentPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="authWrap">
      <div className="authCard">
        <h1>Check your email</h1>
        <p className="mutedText">
          We&apos;ve sent a verification link to your email address.
        </p>

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
