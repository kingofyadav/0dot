import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";

// A thin server wrapper around the client form — live-site QA pass
// (2026-08-25) found /login stayed fully submittable even when already
// logged in, unlike src/app/page.tsx's own `if (user?.username)
// redirect("/feed")` guard. Same condition here, so a logged-in visitor
// never sees a login form they don't need.
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user?.username) redirect("/feed");

  return <LoginForm />;
}
