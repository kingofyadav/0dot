"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";

// The /notifications page itself already marks a viewed page's rows read
// on render (spec §4.4: "mark-as-read on view, not on click-through") —
// these two are the explicit, always-available affordances the same
// section's API contract requires independent of that auto-mark: a single
// item (for a future non-full-page consumer, e.g. a rail-preview item) and
// a manual "mark all" for anything the auto-mark-on-view hasn't reached
// yet (unread items beyond the current page).
export async function markNotificationRead(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const notificationId = String(formData.get("notificationId") ?? "");
  if (!notificationId) return;

  await db.notification.updateMany({
    where: { id: notificationId, recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireVerifiedUser();

  await db.notification.updateMany({
    where: { recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");
}

// Destructive counterpart to markAllNotificationsRead — removes every row
// rather than just flagging it read, so it's gated behind ConfirmButton on
// the page rather than a bare submit button.
export async function clearAllNotifications(): Promise<void> {
  const user = await requireVerifiedUser();

  await db.notification.deleteMany({
    where: { recipientId: user.id },
  });

  revalidatePath("/notifications");
}
