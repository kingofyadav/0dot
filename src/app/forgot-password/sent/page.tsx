import Link from "next/link";

export default async function ForgotPasswordSentPage({
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
          If an account matches, we&apos;ve sent a link to the email on file to reset your password.
          It expires in 1 hour.
        </p>

        {token && (
          <>
            <p className="mutedText">
              No email provider is configured yet in local development, so
              here&apos;s the link directly:
            </p>
            <Link href={`/reset-password?token=${token}`} className="button">
              Reset password
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
