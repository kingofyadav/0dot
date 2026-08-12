import "server-only";
import { db } from "@/lib/db";

// addendum §7: hourly sweep, same module-scope setInterval-on-globalThis
// scheduler posture as startDmcaRestorationScheduler (dmca.ts) — the
// literal trigger is deletionScheduledFor having passed, not manual staff
// follow-through.
async function deleteEligibleAccounts(): Promise<void> {
  const eligible = await db.user.findMany({
    where: { status: "deactivated", deletionScheduledFor: { lte: new Date() } },
    select: { id: true },
  });

  for (const { id } of eligible) {
    try {
      // Most of this schema's User relations cascade (see the field
      // comments throughout schema.prisma) — a hard delete is the default
      // outcome. A handful of relations without an explicit cascade (e.g.
      // content this user moderated/reviewed rather than authored) can
      // still block the delete with a foreign-key error; falling back to
      // anonymizing keeps the sweep moving instead of stalling on one row.
      await db.user.delete({ where: { id } });
    } catch {
      await db.user.update({
        where: { id },
        data: {
          email: `deleted-${id}@0dot.invalid`,
          phone: null,
          passwordHash: "",
          status: "deleted",
          twoFactorSecret: null,
          twoFactorEnabledAt: null,
        },
      });
    }
  }
}

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly is plenty for a 30-day grace window

const globalForAccountDeletion = globalThis as unknown as { accountDeletionSchedulerStarted?: boolean };

export function startAccountDeletionScheduler(): void {
  if (globalForAccountDeletion.accountDeletionSchedulerStarted) return;
  globalForAccountDeletion.accountDeletionSchedulerStarted = true;

  const tick = () => void deleteEligibleAccounts();
  tick();
  setInterval(tick, SWEEP_INTERVAL_MS);
}
