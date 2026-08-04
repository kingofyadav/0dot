import "server-only";
import { db } from "@/lib/db";

// spec §4.3's third literal acceptance criterion: "cancelling a
// subscription retains access through current_period_end, not
// immediately." A cancelled-but-not-yet-expired subscription is still
// effectively active for access purposes — this stub build has no
// processor webhook to flip status at the exact expiry moment, so
// "effective access" is computed live from status + currentPeriodEnd
// rather than trusting status alone. Shared by both access-check shapes
// below so the two never drift into checking this differently.
const effectivelyActiveSubscription = { OR: [{ status: "active" }, { status: "cancelled", currentPeriodEnd: { gt: new Date() } }] };

// phase-5 spec §4.2: the one gating rule reused (adapted per entity) by
// §5/§8/§9/§10/§11 — never a second parallel access check. A viewer has
// access to content gated to `requiredTierId` if they hold an effectively
// active MembershipSubscription (see above) to that tier or any
// same-creator tier with a higher `level` (subscribing to a higher tier
// subsumes every lower one).
export async function hasTierAccess(
  viewerId: string | null,
  creatorId: string,
  requiredTierId: string | null
): Promise<boolean> {
  if (!requiredTierId) return true;
  if (!viewerId) return false;
  if (viewerId === creatorId) return true; // a creator always sees their own gated content

  const requiredTier = await db.membershipTier.findUnique({
    where: { id: requiredTierId },
    select: { level: true },
  });
  if (!requiredTier) return true; // a dangling/deleted tier reference no longer gates anything

  const subscription = await db.membershipSubscription.findFirst({
    where: {
      fanId: viewerId,
      ...effectivelyActiveSubscription,
      tier: { creatorId, level: { gte: requiredTier.level } },
    },
    select: { id: true },
  });
  return subscription !== null;
}

// Bulk sibling of hasTierAccess, same "one query pair per feed render"
// reasoning as getBlockedEitherWayUserIds in post-visibility.ts — used to
// build a where-clause fragment instead of calling hasTierAccess per
// candidate row. Returns the viewer's highest active subscription level per
// creator they're subscribed to.
export async function getActiveMaxTierLevelsByCreator(viewerId: string): Promise<Map<string, number>> {
  const subscriptions = await db.membershipSubscription.findMany({
    where: { fanId: viewerId, ...effectivelyActiveSubscription },
    select: { tier: { select: { creatorId: true, level: true } } },
  });
  const maxLevels = new Map<string, number>();
  for (const { tier } of subscriptions) {
    const current = maxLevels.get(tier.creatorId);
    if (current === undefined || tier.level > current) maxLevels.set(tier.creatorId, tier.level);
  }
  return maxLevels;
}
