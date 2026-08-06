"use server";

import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { registerDeviceToken, unregisterDeviceToken, setDeliveryPreference, type PushPlatform } from "@/lib/push";

const VALID_PLATFORMS: PushPlatform[] = ["ios", "android", "web_push"];

// Called by a first-party client (§3) after it authenticates via PKCE and
// obtains a push token from the OS — appClientId is that same OAuth
// client_id, so revoking the app's authorization can trace back to and
// clear the tokens it registered (revokeOAuthAuthorization, oauth.ts).
export async function registerDeviceTokenAction(args: { platform: string; token: string; appClientId: string }): Promise<{ error: string } | { ok: true }> {
  const user = await requireVerifiedUser();
  if (!VALID_PLATFORMS.includes(args.platform as PushPlatform)) return { error: "Invalid platform." };
  if (!args.token || !args.appClientId) return { error: "Missing token or appClientId." };

  await registerDeviceToken({ userId: user.id, platform: args.platform as PushPlatform, token: args.token, appClientId: args.appClientId });
  return { ok: true };
}

export async function unregisterDeviceTokenAction(token: string): Promise<void> {
  const user = await requireVerifiedUser();
  await unregisterDeviceToken(user.id, token);
}

export async function setNotificationDeliveryPreferenceAction(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const notificationType = String(formData.get("notificationType") ?? "");
  const channel = String(formData.get("channel") ?? "");
  const enabled = formData.get("enabled") === "on";
  if (!notificationType || !channel) return;

  await setDeliveryPreference({ userId: user.id, notificationType, channel, enabled });
  revalidatePath("/s", "layout");
}
