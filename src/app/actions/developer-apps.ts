"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import type { ActionState } from "@/app/actions/auth";
import { resolveDeveloperAppOwner, generateClientCredentials, parseRedirectUris, requireOwnedDeveloperApp } from "@/lib/developer-apps";
import { requestDeveloperAppScope, revokeOAuthAuthorization, seedOAuthScopes } from "@/lib/oauth";
import { ALLOWED_WEBHOOK_EVENT_TYPES, generateWebhookSecret } from "@/lib/webhooks";

// spec §3.1: name/description length caps, same "1-100"/"0-1000" bounds
// the spec's own data model literally specifies rather than this codebase's
// usual looser conventions, since this is copy that renders on a
// third-party consent screen a stranger sees, not just internal dashboard
// text.
export async function createDeveloperApp(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const ownerType = String(formData.get("ownerType") ?? "user");
  const ownerBusinessId = String(formData.get("ownerBusinessId") ?? "");
  const redirectUrisRaw = String(formData.get("redirectUris") ?? "");

  if (name.length < 1 || name.length > 100) return { error: "Name must be 1-100 characters." };
  if (description.length > 1000) return { error: "Description must be at most 1000 characters." };

  const owner = await resolveDeveloperAppOwner(user.id, ownerType, ownerBusinessId);
  if ("error" in owner) return { error: owner.error };

  const redirectUris = parseRedirectUris(redirectUrisRaw);
  if ("error" in redirectUris) return { error: redirectUris.error };

  const { clientId, clientSecret, clientSecretHash } = await generateClientCredentials();

  const app = await db.developerApp.create({
    data: { name, description, ...owner, clientId, clientSecretHash, redirectUrisJson: JSON.stringify(redirectUris.redirectUris) },
  });

  const handle = await handleFor(user.id);
  revalidatePath(`/s/${handle}/developer`);
  // spec §3.2: the raw secret is shown exactly once — passed via a
  // one-time query param the detail page reads and never persists
  // client-side beyond that first render (same "shown once at creation"
  // posture the spec calls out for client_secret_hash generally).
  redirect(`/s/${handle}/developer/${app.id}?newSecret=${encodeURIComponent(clientSecret)}`);
}

async function handleFor(userId: string): Promise<string> {
  const username = await db.username.findUnique({ where: { userId } });
  return username?.handle ?? "";
}

export async function rotateClientSecret(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const appId = String(formData.get("appId") ?? "");
  const app = await requireOwnedDeveloperApp(appId, user.id);
  if (!app) return;

  const { clientSecret, clientSecretHash } = await generateClientCredentials();
  await db.developerApp.update({ where: { id: appId }, data: { clientSecretHash } });

  const handle = await handleFor(user.id);
  revalidatePath(`/s/${handle}/developer/${appId}`);
  redirect(`/s/${handle}/developer/${appId}?newSecret=${encodeURIComponent(clientSecret)}`);
}

export async function updateRedirectUris(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const appId = String(formData.get("appId") ?? "");
  const app = await requireOwnedDeveloperApp(appId, user.id);
  if (!app) return { error: "App not found." };

  const redirectUris = parseRedirectUris(String(formData.get("redirectUris") ?? ""));
  if ("error" in redirectUris) return { error: redirectUris.error };

  await db.developerApp.update({ where: { id: appId }, data: { redirectUrisJson: JSON.stringify(redirectUris.redirectUris) } });
  revalidatePath(`/s/${await handleFor(user.id)}/developer/${appId}`);
  return undefined;
}

export async function requestScope(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const appId = String(formData.get("appId") ?? "");
  const scopeKey = String(formData.get("scopeKey") ?? "");
  const app = await requireOwnedDeveloperApp(appId, user.id);
  if (!app) return;

  await seedOAuthScopes();
  await requestDeveloperAppScope(appId, scopeKey);
  revalidatePath(`/s/${await handleFor(user.id)}/developer/${appId}`);
}

export async function createWebhookSubscription(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const appId = String(formData.get("appId") ?? "");
  const targetUrl = String(formData.get("targetUrl") ?? "").trim();
  const eventTypes = formData.getAll("eventTypes").map(String);

  const app = await requireOwnedDeveloperApp(appId, user.id);
  if (!app) return { error: "App not found." };

  try {
    if (new URL(targetUrl).protocol !== "https:") return { error: "Webhook target_url must be https." };
  } catch {
    return { error: "Invalid target_url." };
  }
  const validEventTypes = eventTypes.filter((t) => ALLOWED_WEBHOOK_EVENT_TYPES.includes(t));
  if (validEventTypes.length === 0) return { error: "Select at least one event type." };

  await db.webhookSubscription.create({
    data: { appId, targetUrl, eventTypesJson: JSON.stringify(validEventTypes), secret: generateWebhookSecret() },
  });
  revalidatePath(`/s/${await handleFor(user.id)}/developer/${appId}`);
  return undefined;
}

export async function deleteWebhookSubscription(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const subscription = await db.webhookSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) return;
  const app = await requireOwnedDeveloperApp(subscription.appId, user.id);
  if (!app) return;

  await db.webhookSubscription.delete({ where: { id: subscriptionId } });
  revalidatePath(`/s/${await handleFor(user.id)}/developer/${subscription.appId}`);
}

// spec §4.4: a one-click revoke from the user's own account settings —
// distinct from the developer-side dashboard above, this is the grantor
// (not the app owner) ending an authorization they previously approved.
export async function revokeOwnAuthorization(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const authorizationId = String(formData.get("authorizationId") ?? "");
  await revokeOAuthAuthorization(authorizationId, user.id);
  revalidatePath(`/s/${await handleFor(user.id)}/authorized-apps`);
}
