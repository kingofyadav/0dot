"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformRole } from "@/lib/auth-guards";
import { recordIapPayoutBatch, reconcileIapPayoutBatch } from "@/lib/payments";

const PROCESSOR_VALUES = new Set(["apple_iap", "google_play_billing"]);

// Mobile pro-upgrade addendum M11: recordIapPayoutBatch/
// reconcileIapPayoutBatch (lib/payments.ts) already existed — built
// alongside the PaymentTransaction.processor/storeFee schema in the
// original Phase 15 mobile work — but had zero callers anywhere in the
// app, reachable only from a Prisma console. This is deliberately only
// those two schema-level steps, not a "mark disbursed" action: nothing
// here actually moves money to a creator, and reconcileIapPayoutBatch's
// own comment names that as dedicated finance/ops work still out of
// scope — a fake "disbursed" flip with no real transfer behind it would
// be a false record, not a shortcut.
export async function createIapPayoutBatchAction(formData: FormData): Promise<void> {
  await requirePlatformRole("admin");

  const processor = String(formData.get("processor") ?? "");
  if (!PROCESSOR_VALUES.has(processor)) return;

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return;

  const currency = String(formData.get("currency") ?? "usd").trim().toLowerCase() || "usd";

  const periodStart = new Date(String(formData.get("periodStart") ?? ""));
  const periodEndInput = new Date(String(formData.get("periodEnd") ?? ""));
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEndInput.getTime())) return;
  // <input type="date"> gives midnight-start-of-day — an admin picking
  // "through Aug 31" means everything up to the end of that day, not
  // before its first millisecond, so the end date is pushed to its own
  // last millisecond before being stored.
  const periodEnd = new Date(periodEndInput.getTime() + 24 * 60 * 60 * 1000 - 1);

  await recordIapPayoutBatch({
    processor: processor as "apple_iap" | "google_play_billing",
    amount,
    currency,
    periodStart,
    periodEnd,
  });

  revalidatePath("/admin/payments/iap-batches");
}

export async function reconcileIapPayoutBatchAction(formData: FormData): Promise<void> {
  await requirePlatformRole("admin");

  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) return;

  await reconcileIapPayoutBatch(batchId);

  revalidatePath("/admin/payments/iap-batches");
}
