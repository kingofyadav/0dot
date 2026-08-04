import "server-only";
import { randomBytes, randomUUID, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isBusinessOwner } from "@/lib/businesses";

export type DeveloperAppOwner = { ownerType: "user"; ownerUserId: string; ownerBusinessId: null } | { ownerType: "business"; ownerUserId: null; ownerBusinessId: string };

// spec §3.1: two-way owner XOR — communities are excluded, same as
// marketplace.ts's seller side, unlike InstalledApp's three-way installer
// XOR. Business ownership requires being an owner outright (isBusinessOwner),
// not just catalog-manage staff — registering API credentials that can act
// on the business's behalf is a higher-stakes grant than editing a listing.
export async function resolveDeveloperAppOwner(userId: string, ownerType: string, ownerBusinessId: string): Promise<DeveloperAppOwner | { error: string }> {
  if (ownerType === "user") {
    return { ownerType: "user", ownerUserId: userId, ownerBusinessId: null };
  }
  if (ownerType === "business") {
    if (!ownerBusinessId || !(await isBusinessOwner(ownerBusinessId, userId))) {
      return { error: "You must be an owner of that business to register an app for it." };
    }
    return { ownerType: "business", ownerUserId: null, ownerBusinessId };
  }
  return { error: "Choose who owns this app." };
}

// Hashed the same way as OAuthToken's bearer credentials (§4.2, §12.1) —
// bcrypt (this codebase's existing password-hashing choice, auth.ts) rather
// than a fast digest, since a client secret is checked rarely (token
// exchange only) and is exactly as sensitive as a password.
export async function generateClientCredentials(): Promise<{ clientId: string; clientSecret: string; clientSecretHash: string }> {
  const clientId = randomUUID();
  const clientSecret = randomBytes(32).toString("base64url");
  const clientSecretHash = await bcrypt.hash(clientSecret, 12);
  return { clientId, clientSecret, clientSecretHash };
}

export async function verifyClientSecret(clientSecretHash: string, candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, clientSecretHash);
}

// Bearer tokens are checked on every API request, unlike a client secret —
// a fast keyed digest (not bcrypt) keeps that path cheap. Still opaque and
// unrecoverable from the hash alone, same non-retrievable posture as §3.2
// requires; sha256 is adequate here because the token itself is 256 bits of
// crypto-random entropy (unlike a user-chosen password, which needs bcrypt's
// deliberate slowness against guessing).
export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

const MAX_REDIRECT_URIS = 10;

export function parseRedirectUris(raw: string): { error: string } | { redirectUris: string[] } {
  const uris = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (uris.length === 0) return { error: "At least one redirect URI is required." };
  if (uris.length > MAX_REDIRECT_URIS) return { error: `At most ${MAX_REDIRECT_URIS} redirect URIs.` };
  for (const uri of uris) {
    try {
      const parsed = new URL(uri);
      if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && parsed.hostname === "localhost")) {
        return { error: `${uri} must be https (or http://localhost for local development).` };
      }
    } catch {
      return { error: `${uri} is not a valid URL.` };
    }
  }
  return { redirectUris: uris };
}

// spec §3.2's literal acceptance criterion: exact string match, no
// prefix/wildcard matching — the classic open-redirect vector in OAuth
// implementations that get this wrong.
export function isAllowedRedirectUri(redirectUrisJson: string, candidate: string): boolean {
  const uris: string[] = JSON.parse(redirectUrisJson);
  return uris.includes(candidate);
}

export async function requireOwnedDeveloperApp(appId: string, userId: string) {
  const app = await db.developerApp.findUnique({ where: { id: appId } });
  if (!app) return null;
  if (app.ownerUserId === userId) return app;
  if (app.ownerBusinessId && (await isBusinessOwner(app.ownerBusinessId, userId))) return app;
  return null;
}
