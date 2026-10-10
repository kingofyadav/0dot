"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { saveUploadedImage } from "@/lib/uploads";
import type { ActionState } from "@/app/actions/auth";
import { resolveDeveloperAppOwner, generateClientCredentials, parseRedirectUris, requireOwnedDeveloperApp } from "@/lib/developer-apps";
import { requestDeveloperAppScope, revokeOAuthAuthorization, seedOAuthScopes } from "@/lib/oauth";
import { ALLOWED_WEBHOOK_EVENT_TYPES, generateWebhookSecret } from "@/lib/webhooks";
import { switchApiPlan } from "@/lib/api-usage-billing";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

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

  let logoUrl: string | undefined;
  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    const logoResult = await saveUploadedImage(logoFile, { maxBytes: MAX_LOGO_BYTES, uploadedById: user.id });
    if ("error" in logoResult) return { error: logoResult.error };
    logoUrl = logoResult.url;
  }

  const { clientId, clientSecret, clientSecretHash } = await generateClientCredentials();

  const app = await db.developerApp.create({
    data: { name, description, logoUrl, ...owner, clientId, clientSecretHash, redirectUrisJson: JSON.stringify(redirectUris.redirectUris) },
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

// The one edit path for an already-registered app. Unlike Form's title/
// fields (locked post-creation because responses are keyed by field label),
// name/description/logo here are just display copy shown on the OAuth
// consent screen — nothing references them by value, so they're safe to
// change anytime.
export async function updateDeveloperApp(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const appId = String(formData.get("appId") ?? "");

  const app = await requireOwnedDeveloperApp(appId, user.id);
  if (!app) return { error: "App not found." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 100) return { error: "Name must be 1-100 characters." };

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 1000) return { error: "Description must be at most 1000 characters." };

  let logoUrl = app.logoUrl;
  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    const logoResult = await saveUploadedImage(logoFile, { maxBytes: MAX_LOGO_BYTES, uploadedById: user.id });
    if ("error" in logoResult) return { error: logoResult.error };
    logoUrl = logoResult.url;
  }

  await db.developerApp.update({ where: { id: app.id }, data: { name, description, logoUrl } });

  const handle = await handleFor(user.id);
  revalidatePath(`/s/${handle}/developer`);
  revalidatePath(`/s/${handle}/developer/${app.id}`);
  return undefined;
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

const BILLING_PLAN_VALUES = new Set(["free", "pay_as_you_go", "committed"]);

// billing addendum §4.1: an app's own owner chooses its billing plan —
// switching to pay_as_you_go/committed lifts api-rate-limit.ts's hard cap
// in exchange for paying for usage in coins (addendum-wallet-only-payments.md
// §3.4, api-usage-billing.ts's switchApiPlan). Settles synchronously — no
// checkout redirect.
export async function updateBillingPlan(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const appId = String(formData.get("appId") ?? "");
  const app = await requireOwnedDeveloperApp(appId, user.id);
  if (!app) return { error: "App not found." };

  const billingPlan = String(formData.get("billingPlan") ?? "");
  if (!BILLING_PLAN_VALUES.has(billingPlan)) return { error: "Choose a valid billing plan." };

  const result = await switchApiPlan(appId, billingPlan as "free" | "pay_as_you_go" | "committed");
  revalidatePath(`/s/${await handleFor(user.id)}/developer/${appId}`);
  if (result.error) return { error: result.error };
  return { success: true };
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

// Every child row (scopes, authorization codes, authorizations, tokens,
// webhook subscriptions, usage counters) cascades at the DB level — see
// each of their `onDelete: Cascade` relations to DeveloperApp in
// schema.prisma — so this is a genuine hard delete, not a status flip, and
// every live OAuthToken for this app stops working the instant this
// commits. MarketplaceListing.developerAppId is the one exception
// (`onDelete: SetNull`): a listing created via this app survives its
// deletion, just loses the backref, same as a seller's own account being
// deletable without nuking their past listings elsewhere in this schema.
// DeviceToken has no FK relation (keyed by the clientId string, not
// appId), so it needs an explicit cleanup call — see
// clearAllDeviceTokensForApp's comment.
export async function deleteDeveloperApp(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const appId = String(formData.get("appId") ?? "");
  const app = await requireOwnedDeveloperApp(appId, user.id);
  if (!app) return;

  await db.developerApp.delete({ where: { id: appId } });

  const { clearAllDeviceTokensForApp } = await import("@/lib/push");
  await clearAllDeviceTokensForApp(app.clientId);

  revalidatePath(`/s/${await handleFor(user.id)}/developer`);
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
