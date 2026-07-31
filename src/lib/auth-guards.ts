import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

// Shared by every "use server" action file that needs an authenticated,
// verified user (posts, follow, block, notifications) — extracted once
// enough call sites needed the identical check that copy-pasting it a
// third/fourth time would drift.
export async function requireVerifiedUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.emailVerifiedAt) redirect("/verify/sent");
  return user;
}

export async function requireOwnProfile() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.profile) redirect("/claim-username");
  return user;
}

// Gates /admin/businesses (phase-4 build plan decision #1) — isPlatformAdmin
// is manually granted via direct DB access, same "no self-serve flow"
// posture as Profile.isVerified, so there's no signup-time path that grants
// this, only requireVerifiedUser's usual checks plus the flag itself.
export async function requirePlatformAdmin() {
  const user = await requireVerifiedUser();
  if (!user.isPlatformAdmin) redirect("/");
  return user;
}
