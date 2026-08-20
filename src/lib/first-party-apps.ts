import "server-only";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { generateClientCredentials } from "@/lib/developer-apps";
import { OAUTH_SCOPES, seedOAuthScopes } from "@/lib/oauth";

// phase-15 spec §3.1: 0dot's own iOS/Android/desktop apps register as real
// DeveloperApp rows owned by a designated platform User, rather than
// widening DeveloperApp.owner_type with a "platform" case for something
// that happens a handful of times total, not per-customer.
const PLATFORM_ACCOUNT_EMAIL = "platform-apps@0dot.internal";

// This account (and any future "@0dot.internal" system account) only ever
// exists to own DeveloperApp rows via ownerUserId — its password hash is an
// unrecoverable random value set at creation, but nothing previously stopped
// the normal password-reset flow from overwriting that hash and making it a
// real, loggable-into account. auth.ts checks this before login and before
// issuing a reset token.
export function isInternalSystemAccountEmail(email: string): boolean {
  return email.toLowerCase().endsWith("@0dot.internal");
}

// Custom URL schemes for the native apps' redirect (native PKCE, §3.2) plus
// an https callback for the PWA/desktop surface — parseRedirectUris
// (developer-apps.ts) rejects non-https/non-localhost URIs since that
// validation exists for user-submitted third-party apps; these are
// server-seeded, so written directly.
//
// "zerodot-*", not "0dot-*": a URI scheme must start with a letter (RFC
// 3986 §3.1's `scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )`) —
// mobile/app.json's own scheme registration failed expo-doctor's schema
// validation against a leading digit, which is what surfaced this.
const FIRST_PARTY_APPS = [
  { platform: "ios", name: "0dot iOS App", description: "0dot's first-party iOS app.", redirectUris: ["zerodot-ios://oauth/callback"] },
  { platform: "android", name: "0dot Android App", description: "0dot's first-party Android app.", redirectUris: ["zerodot-android://oauth/callback"] },
  { platform: "desktop", name: "0dot Desktop", description: "0dot's first-party desktop app (installable PWA).", redirectUris: ["https://0dot.in/desktop/oauth/callback"] },
] as const;

export type FirstPartyPlatform = (typeof FIRST_PARTY_APPS)[number]["platform"];

async function ensurePlatformAccount(): Promise<{ id: string }> {
  const existing = await db.user.findUnique({ where: { email: PLATFORM_ACCOUNT_EMAIL }, select: { id: true } });
  if (existing) return existing;

  // Unusable password — this account is never meant to log in through the
  // normal /login flow, only to own DeveloperApp rows via ownerUserId.
  const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
  return db.user.create({
    data: { email: PLATFORM_ACCOUNT_EMAIL, passwordHash, emailVerifiedAt: new Date(), status: "active" },
    select: { id: true },
  });
}

// Idempotent — safe to call on every server start (instrumentation.ts),
// same "ensure the fixed catalog exists" idiom as seedOAuthScopes rather
// than a one-off migration seed step this codebase doesn't have.
export async function ensureFirstPartyApps(): Promise<void> {
  await seedOAuthScopes();
  const platformUser = await ensurePlatformAccount();

  for (const spec of FIRST_PARTY_APPS) {
    const existing = await db.developerApp.findFirst({ where: { ownerUserId: platformUser.id, name: spec.name } });

    let appId: string;
    if (existing) {
      // Self-healing for rows created before isPublicClient existed, or with
      // the invalid "0dot-*" scheme (see FIRST_PARTY_APPS' comment above) —
      // same "runs on every server start, patches forward" idiom the rest of
      // this function already relies on, rather than a one-off migration
      // backfill.
      const wantRedirectUris = JSON.stringify(spec.redirectUris);
      const patch: { isPublicClient?: true; redirectUrisJson?: string } = {};
      if (!existing.isPublicClient) patch.isPublicClient = true;
      if (existing.redirectUrisJson !== wantRedirectUris) patch.redirectUrisJson = wantRedirectUris;
      if (Object.keys(patch).length > 0) {
        await db.developerApp.update({ where: { id: existing.id }, data: patch });
      }
      appId = existing.id;
    } else {
      const { clientId, clientSecretHash } = await generateClientCredentials();
      const app = await db.developerApp.create({
        data: {
          ownerType: "user",
          ownerUserId: platformUser.id,
          name: spec.name,
          description: spec.description,
          clientId,
          clientSecretHash,
          isPublicClient: true,
          redirectUrisJson: JSON.stringify(spec.redirectUris),
        },
      });
      appId = app.id;
    }

    // spec §3.3: the security model doesn't relax for first-party apps —
    // every scope goes through the same DeveloperAppScope row a
    // third-party app would have, just pre-approved outright (0dot owns
    // both sides of this grant) rather than sitting `pending` for
    // high-sensitivity scopes the way an external app's request would.
    //
    // Runs for *existing* apps too, not just newly-created ones — otherwise
    // a scope added to OAUTH_SCOPES after an app's first boot would never
    // get backfilled here (previously this loop sat only in the "new app"
    // branch above, unreachable once the app row already existed), and the
    // first-party app's own OAuth flow would start failing resolveApprovableScopes
    // ("This app isn't approved to request: ...") the moment it asked for
    // the new scope.
    for (const scope of OAUTH_SCOPES) {
      await db.developerAppScope.upsert({
        where: { appId_scopeKey: { appId, scopeKey: scope.key } },
        create: { appId, scopeKey: scope.key, status: "approved", reviewedAt: new Date() },
        update: {},
      });
    }
  }
}

// phase-15 build plan step 3: client_id is generated randomly per
// environment (generateClientCredentials, developer-apps.ts) rather than a
// fixed constant a compiled app could hardcode — a mobile build needs a way
// to discover its own client_id at runtime. client_id is not sensitive (the
// OAuth authorization redirect already puts it in a browser-visible URL),
// so this is safe to expose without auth; see the GET route at
// /api/oauth/first-party-clients.
export async function getFirstPartyClientIds(): Promise<Record<FirstPartyPlatform, string | null>> {
  const platformUser = await ensurePlatformAccount();
  let apps = await db.developerApp.findMany({ where: { ownerUserId: platformUser.id }, select: { name: true, clientId: true } });

  // instrumentation.ts's register() is supposed to have already run
  // ensureFirstPartyApps() once at boot, before this instance ever serves a
  // request — but a production check after first deploying this route
  // showed it returning null client_ids consistently across a warm,
  // already-serving instance, an outcome that shouldn't be reachable if
  // register() genuinely ran and awaited successfully first. Rather than
  // leave every first-party client permanently unable to even start
  // sign-in on an unclear boot-time race, this read path is self-healing
  // too — ensureFirstPartyApps is the same idempotent call register()
  // already makes, just invoked lazily here as a fallback instead of only
  // trusted to have already succeeded.
  if (FIRST_PARTY_APPS.some((spec) => !apps.some((a) => a.name === spec.name))) {
    await ensureFirstPartyApps();
    apps = await db.developerApp.findMany({ where: { ownerUserId: platformUser.id }, select: { name: true, clientId: true } });
  }

  const clientIdByName = new Map(apps.map((a) => [a.name, a.clientId]));
  return Object.fromEntries(
    FIRST_PARTY_APPS.map((spec) => [spec.platform, clientIdByName.get(spec.name) ?? null])
  ) as Record<FirstPartyPlatform, string | null>;
}
