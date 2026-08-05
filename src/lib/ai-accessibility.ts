import "server-only";
import { db } from "@/lib/db";
import { getAIProvider } from "@/lib/ai-provider";
import { logAIGeneration } from "@/lib/ai-generation";

export type FileAssetContentType = "image" | "video" | "audio" | "document";

// phase-11 spec §6.1/§6.2: the one FileAsset creation path — called from
// uploads.ts's write helpers for every *new* upload from this phase
// forward (existing pre-phase-11 columns are addressed via the
// legacy_subject_* triplet instead, never migrated onto this table).
export async function createFileAsset(params: {
  url: string;
  contentType: FileAssetContentType;
  uploadedById: string;
}) {
  return db.fileAsset.create({
    data: { url: params.url, contentType: params.contentType, uploadedById: params.uploadedById },
  });
}

// image/video get a generated alt-text description; audio gets a
// transcript placeholder; document is skipped — no established captioning
// concept for a bare PDF/EPUB in this codebase yet.
const CAPTIONABLE_TYPES: FileAssetContentType[] = ["image", "video", "audio"];

// spec §6.3: runs as an async post-upload enrichment job, never
// synchronously during the upload request — same principle
// portfolio-sync.ts already applies to phase-6's GitHub metadata sync.
async function generateAccessibilityMetadataFor(asset: {
  id: string;
  url: string;
  contentType: string;
  uploadedById: string;
}): Promise<void> {
  const provider = getAIProvider();
  const { altText, costTokens } = await provider.describeMedia({ url: asset.url, contentType: asset.contentType });

  const generation = await logAIGeneration({
    feature: "accessibility_caption",
    requestedById: asset.uploadedById,
    subjectType: "file_asset",
    subjectId: asset.id,
    modelName: provider.modelName,
    input: { url: asset.url, contentType: asset.contentType },
    output: { altText },
    costTokens,
  });

  await db.mediaAccessibilityMetadata.create({
    data: {
      fileAssetId: asset.id,
      altText: asset.contentType === "audio" ? null : altText,
      transcript: asset.contentType === "audio" ? altText : null,
      aiGenerationId: generation.id,
    },
  });
}

async function processPendingAccessibilityJobs(): Promise<void> {
  const pending = await db.fileAsset.findMany({
    where: { contentType: { in: CAPTIONABLE_TYPES }, accessibilityMetadata: null },
    take: 50, // per-run cap, same safety-valve reasoning as trending.ts's CANDIDATE_LIMIT
  });
  for (const asset of pending) {
    await generateAccessibilityMetadataFor(asset);
  }
}

// §6.4 acceptance criterion: human_edited=true guards a row against a later
// automated re-generation overwriting a human's correction. Exposed for a
// future "regenerate" admin action; the periodic sweep above never touches
// rows that already have a MediaAccessibilityMetadata row at all (pending
// filter above only selects FileAssets with none yet), so this is the only
// place a re-generation could ever apply.
export async function regenerateAccessibilityMetadata(fileAssetId: string): Promise<void> {
  const existing = await db.mediaAccessibilityMetadata.findUnique({ where: { fileAssetId } });
  if (existing?.humanEdited) return;
  const asset = await db.fileAsset.findUnique({ where: { id: fileAssetId } });
  if (!asset) return;
  if (existing) await db.mediaAccessibilityMetadata.delete({ where: { id: existing.id } });
  await generateAccessibilityMetadataFor(asset);
}

const ACCESSIBILITY_JOB_INTERVAL_MS = 60 * 1000; // frequent — a cheap in-process stub call, not a real per-call-billed API
const globalForAccessibility = globalThis as unknown as { accessibilitySchedulerStarted?: boolean };
let running: Promise<void> | null = null;

function triggerAccessibilityRun(): void {
  if (running) return;
  running = processPendingAccessibilityJobs().finally(() => {
    running = null;
  });
}

// Registered from instrumentation.ts, same shape as
// startTrendingScheduler()/startPortfolioSyncScheduler().
export function startAccessibilityScheduler(): void {
  if (globalForAccessibility.accessibilitySchedulerStarted) return;
  globalForAccessibility.accessibilitySchedulerStarted = true;

  triggerAccessibilityRun();
  setInterval(triggerAccessibilityRun, ACCESSIBILITY_JOB_INTERVAL_MS);
}
