import "server-only";
import { db } from "@/lib/db";

// phase-13 spec §7: the one write path for OwnershipTransfer — a
// lightweight historical log, not a full chain-of-title system with
// transfer-approval workflows (§7's consent-model question is left open
// for product/legal, §11). Callers are responsible for actually updating
// the subject's own owner/author field; this only records that it happened.
export async function recordOwnershipTransfer(params: {
  subjectType: string;
  subjectId: string;
  fromUserId: string | null;
  toUserId: string;
  reason?: string;
}): Promise<void> {
  await db.ownershipTransfer.create({
    data: {
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      fromUserId: params.fromUserId,
      toUserId: params.toUserId,
      reason: params.reason ?? null,
    },
  });
}
