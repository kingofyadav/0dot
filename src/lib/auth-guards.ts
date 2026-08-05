import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

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

const STAFF_ROLE_RANK: Record<string, number> = { reviewer: 1, senior_reviewer: 2, admin: 3 };

// phase-12 spec §3.2/§3.3: TrustSafetyStaffRole is the real gate for case
// assignment ("assigned_to must hold a TrustSafetyStaffRole row"), same
// "manually granted, no self-serve flow" posture as isPlatformAdmin itself.
// Rather than building a dedicated role-management UI this phase doesn't
// need, an isPlatformAdmin user is bootstrapped into an `admin`-rank staff
// row on first use — same bootstrap relationship already implied by
// isPlatformAdmin gating every other /admin/* review queue.
export async function requireTrustSafetyStaff(minRole: "reviewer" | "senior_reviewer" | "admin" = "reviewer") {
  const user = await requireVerifiedUser();

  let staffRole = await db.trustSafetyStaffRole.findUnique({ where: { userId: user.id } });
  if (!staffRole && user.isPlatformAdmin) {
    staffRole = await db.trustSafetyStaffRole.create({ data: { userId: user.id, role: "admin" } });
  }
  if (!staffRole || STAFF_ROLE_RANK[staffRole.role] < STAFF_ROLE_RANK[minRole]) redirect("/");

  return { user, staffRole };
}
