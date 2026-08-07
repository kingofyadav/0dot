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
const FIRST_PARTY_APPS = [
  { name: "0dot iOS App", description: "0dot's first-party iOS app.", redirectUris: ["0dot-ios://oauth/callback"] },
  { name: "0dot Android App", description: "0dot's first-party Android app.", redirectUris: ["0dot-android://oauth/callback"] },
  { name: "0dot Desktop", description: "0dot's first-party desktop app (installable PWA).", redirectUris: ["https://0dot.in/desktop/oauth/callback"] },
] as const;

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
    if (existing) continue;

    const { clientId, clientSecretHash } = await generateClientCredentials();
    const app = await db.developerApp.create({
      data: {
        ownerType: "user",
        ownerUserId: platformUser.id,
        name: spec.name,
        description: spec.description,
        clientId,
        clientSecretHash,
        redirectUrisJson: JSON.stringify(spec.redirectUris),
      },
    });

    // spec §3.3: the security model doesn't relax for first-party apps —
    // every scope goes through the same DeveloperAppScope row a
    // third-party app would have, just pre-approved outright (0dot owns
    // both sides of this grant) rather than sitting `pending` for
    // high-sensitivity scopes the way an external app's request would.
    for (const scope of OAUTH_SCOPES) {
      await db.developerAppScope.upsert({
        where: { appId_scopeKey: { appId: app.id, scopeKey: scope.key } },
        create: { appId: app.id, scopeKey: scope.key, status: "approved", reviewedAt: new Date() },
        update: {},
      });
    }
  }
}
