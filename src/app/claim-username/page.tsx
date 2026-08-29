import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ClaimUsernameForm } from "./ClaimUsernameForm";

export const metadata: Metadata = { title: "Claim your username" };

// A thin server wrapper around the client form — mirrors exactly the
// guard already inside claimUsername (app/actions/profile.ts) itself, so a
// visitor who can't successfully submit this form (not logged in, already
// claimed, unverified email) doesn't see it rendered as if they could
// (live-site QA pass, 2026-08-25: was previously unguarded at the page
// level, unlike the action).
export default async function ClaimUsernamePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profile) redirect(`/${user.username!.handle}`);
  if (!user.emailVerifiedAt) redirect("/verify/sent");

  return <ClaimUsernameForm />;
}
