import "server-only";
import { db } from "@/lib/db";

// Used by followUser (can't follow/be-followed across a block), notification
// producers (a blocked user's actions never notify — phase-2 spec §4.5), and
// the profile page (suppress Follow/Block controls if either party has
// blocked the other).
export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const row = await db.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });
  return row !== null;
}

export async function isBlockedEitherWay(userAId: string, userBId: string): Promise<boolean> {
  const [aBlockedB, bBlockedA] = await Promise.all([
    isBlocked(userAId, userBId),
    isBlocked(userBId, userAId),
  ]);
  return aBlockedB || bBlockedA;
}
