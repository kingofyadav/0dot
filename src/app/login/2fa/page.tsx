import { redirect } from "next/navigation";
import { getPendingTwoFactorChallenge } from "@/lib/session";
import { AuthTopBar } from "@/components/AuthTopBar";
import { Login2faForm } from "./Login2faForm";

// addendum §3: reached only via login()'s redirect once the password check
// passes for a 2FA-enabled account — a stale/expired/missing challenge
// cookie sends straight back to /login rather than showing a dead-end form.
export default async function LoginTwoFactorPage() {
  const challenge = await getPendingTwoFactorChallenge();
  if (!challenge) redirect("/login");

  return (
    <div className="landingWrap">
      <AuthTopBar />
      <div className="authStack">
        <Login2faForm />
      </div>
    </div>
  );
}
