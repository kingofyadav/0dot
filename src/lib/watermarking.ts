import "server-only";
import { db } from "@/lib/db";

// phase-13 spec §6.1: generated asynchronously, never synchronously during
// the upload request — same posture as ai-accessibility.ts's captioning
// job. No image-processing library exists in this codebase yet (no sharp/
// jimp/canvas dependency), so this derives a placeholder watermarked URL
// rather than actually compositing a mark; swapping in a real pipeline
// later only touches this one function, not FileAsset's shape or any
// caller of watermarkedFileUrl below.
async function generateWatermarkedUrlFor(asset: { id: string; url: string }): Promise<void> {
  const separator = asset.url.includes("?") ? "&" : "?";
  await db.fileAsset.update({
    where: { id: asset.id },
    data: { watermarkedUrl: `${asset.url}${separator}watermark=1` },
  });
}

async function processPendingWatermarkJobs(): Promise<void> {
  const pending = await db.fileAsset.findMany({
    where: { watermarkEnabled: true, watermarkedUrl: null },
    take: 20,
  });
  for (const asset of pending) {
    await generateWatermarkedUrlFor(asset);
  }
}

const WATERMARK_JOB_INTERVAL_MS = 2 * 60 * 1000;

const globalForWatermarking = globalThis as unknown as { watermarkSchedulerStarted?: boolean };

export function startWatermarkScheduler(): void {
  if (globalForWatermarking.watermarkSchedulerStarted) return;
  globalForWatermarking.watermarkSchedulerStarted = true;

  const tick = () => void processPendingWatermarkJobs();
  tick();
  setInterval(tick, WATERMARK_JOB_INTERVAL_MS);
}

// phase-13 spec §6.1's acceptance criterion: a verified purchaser (or the
// asset's owner) always gets the clean original; every other viewer gets
// the watermarked preview when one exists and enabled, falling back to the
// original if the async job hasn't produced one yet.
export function watermarkedFileUrl(
  asset: { url: string; watermarkEnabled: boolean; watermarkedUrl: string | null },
  viewerIsOwnerOrVerifiedPurchaser: boolean
): string {
  if (viewerIsOwnerOrVerifiedPurchaser) return asset.url;
  if (asset.watermarkEnabled && asset.watermarkedUrl) return asset.watermarkedUrl;
  return asset.url;
}
