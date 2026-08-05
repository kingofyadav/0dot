import "server-only";
import { Prisma } from "@/generated/prisma/client";

// phase-13 spec §3.3's literal acceptance criterion: the ContentRevision
// row must exist before the change is visible, not after. Callers create
// this inside the same $transaction as the Post/Article update, calling it
// first — the tx client (not the module-level db) makes that atomic.
export async function recordContentRevision(
  tx: Prisma.TransactionClient,
  subjectType: "post" | "article",
  subjectId: string,
  bodySnapshot: string,
  editedBy: string
): Promise<void> {
  await tx.contentRevision.create({
    data: { subjectType, subjectId, bodySnapshot, editedBy },
  });
}
