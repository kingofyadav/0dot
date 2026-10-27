import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SignupForm } from "./SignupForm";

// Applies to every Server Action invoked from this page, including
// `signup` (see docs/BUGS.md "Production signup intermittently fails") —
// made explicit, not relying on the platform default, since a signup under
// db-resilience.ts's retry/backoff on a cross-region Hobby instance can run
// a few seconds longer than the common case.
export const maxDuration = 30;

// A thin server wrapper around the client form — live-site QA pass
// (2026-08-25) found /signup stayed fully submittable even when already
// logged in, unlike src/app/page.tsx's own `if (user?.username)
// redirect("/feed")` guard. Same condition here, so a logged-in visitor
// never sees a submittable "create account" form for an account they
// already have.
export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user?.username) redirect("/feed");

  return <SignupForm />;
}
