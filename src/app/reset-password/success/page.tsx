import Link from "next/link";

export default function ResetPasswordSuccessPage() {
  return (
    <div className="authWrap">
      <div className="authCard">
        <h1>Password updated</h1>
        <p className="mutedText">
          You can now log in with your new password. We&apos;ve also signed you
          out everywhere else, just in case.
        </p>
        <Link href="/login" className="button">
          Log in
        </Link>
      </div>
    </div>
  );
}
