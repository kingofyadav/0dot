import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

// "IDs of every account this user follows" — the follow-graph lookup that
// /feed's page, the ContextualRail (layout chrome), and getSuggestedUsers
// (also in the rail) each ran independently, firing the identical query
// three times per /feed render, every one a round trip to the libsql
// backend. cache() collapses them into one call per request, same posture
// as getCurrentUser in session.ts.
export const getFolloweeIds = cache(async (userId: string): Promise<string[]> => {
  const rows = await db.follow.findMany({
    where: { followerId: userId },
    select: { followeeId: true },
  });
  return rows.map((r) => r.followeeId);
});
