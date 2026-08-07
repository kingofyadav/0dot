import "server-only";
import { db } from "@/lib/db";
import { decryptAtRest } from "@/lib/message-crypto";
import { getSocialContentProvider } from "@/lib/social-content-provider";
import { isCrossPostPlatform } from "@/lib/cross-post-platforms";

// Same daily cadence and "stamp the attempt, only overwrite content on
// success" posture as portfolio-sync.ts's GitRepository sync — stale
// cached items survive a failed fetch untouched, never get cleared.
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function syncExternalContent(): Promise<void> {
  const staleBefore = new Date(Date.now() - SYNC_INTERVAL_MS);
  const dueAccounts = await db.externalSocialAccount.findMany({
    where: {
      status: "connected",
      OR: [{ lastContentSyncAt: null }, { lastContentSyncAt: { lt: staleBefore } }],
    },
    take: 200, // per-run cap, same write-volume safety valve as portfolio-sync.ts
  });

  for (const account of dueAccounts) {
    if (isCrossPostPlatform(account.platform)) {
      try {
        const accessToken = decryptAtRest(account.accessTokenEnc);
        const items = await getSocialContentProvider(account.platform).fetchRecentContent({
          accessToken,
          externalAccountId: account.id,
        });
        for (const item of items) {
          await db.externalContentItem.upsert({
            where: { externalAccountId_externalItemId: { externalAccountId: account.id, externalItemId: item.externalItemId } },
            update: { title: item.title, thumbnailUrl: item.thumbnailUrl, contentUrl: item.contentUrl, publishedAt: item.publishedAt },
            create: { externalAccountId: account.id, ...item },
          });
        }
      } catch {
        // Best-effort — a failed fetch leaves previously cached items as-is,
        // same as portfolio-sync.ts's fetchRepositoryMetadata returning null.
      }
    }
    await db.externalSocialAccount.update({ where: { id: account.id }, data: { lastContentSyncAt: new Date() } });
  }
}

const globalForContentSync = globalThis as unknown as { socialContentSyncSchedulerStarted?: boolean };
let syncing: Promise<void> | null = null;

function triggerSync(): void {
  if (syncing) return;
  syncing = syncExternalContent().finally(() => {
    syncing = null;
  });
}

// Registered from instrumentation.ts alongside startPortfolioSyncScheduler().
export function startSocialContentSyncScheduler(): void {
  if (globalForContentSync.socialContentSyncSchedulerStarted) return;
  globalForContentSync.socialContentSyncSchedulerStarted = true;

  triggerSync();
  setInterval(triggerSync, SYNC_INTERVAL_MS);
}
