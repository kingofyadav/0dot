import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SignupForm } from "./SignupForm";

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
