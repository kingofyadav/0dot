import { Platform } from "react-native";

// EXPO_PUBLIC_* vars are inlined at build time (Expo SDK 49+) — lets local
// dev point at a Next.js dev server (e.g. http://192.168.x.x:3000) without
// touching this file, while shipped builds default to production.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://0dot.in";

// Unset until a Sentry project exists for this app — app/_layout.tsx's
// Sentry.init() no-ops without a DSN, so local dev and any build made
// before a project is provisioned behave identically to today. Once
// created at sentry.io, set via `eas secret:create --scope project --name
// EXPO_PUBLIC_SENTRY_DSN --value ...` (and as a local .env entry for dev
// builds) — never hardcoded here, same reasoning API_BASE_URL's own
// env-var indirection follows.
export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? null;

// Full three-way shape of /api/oauth/first-party-clients' response —
// "desktop" is the PWA's own client, never something this native binary
// resolves to itself (see NativePlatform below).
export type FirstPartyPlatform = "ios" | "android" | "desktop";

// What Platform.OS can actually resolve to inside this Expo binary —
// narrower than FirstPartyPlatform on purpose, so call sites that only
// make sense for a native device token (push registration, the redirect
// URI) don't need a runtime "what if it's desktop" branch that could never
// be true here.
export type NativePlatform = "ios" | "android";

// Matches app.json's "scheme": ["zerodot-ios", "zerodot-android"] and the
// redirect URIs first-party-apps.ts registered server-side — must be an
// exact match, since validateRedirectUri (oauth.ts) does exact-string
// comparison, not prefix/wildcard. "zerodot-*", not "0dot-*": a URI scheme
// must start with a letter (RFC 3986 §3.1) — expo-doctor's schema check on
// app.json's scheme array is what caught the original "0dot-*" values.
export const FIRST_PARTY_PLATFORM: NativePlatform = Platform.OS === "ios" ? "ios" : "android";

export const REDIRECT_URI =
  FIRST_PARTY_PLATFORM === "ios" ? "zerodot-ios://oauth/callback" : "zerodot-android://oauth/callback";
