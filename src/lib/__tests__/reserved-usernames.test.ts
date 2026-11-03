import { describe, it, expect } from "vitest";
import { RESERVED_USERNAMES } from "@/lib/reserved-usernames";

// Regression coverage for the gap found in a 2026-11-03 doc audit: several
// top-level src/app routes (e.g. /wallet, /download) were missing from
// RESERVED_USERNAMES, letting a user claim that handle and permanently
// shadow the real page. This list must be kept in sync with src/app's
// top-level route segments whenever a new one is added.
describe("RESERVED_USERNAMES", () => {
  const liveTopLevelRoutes = [
    "admin", "api", "www", "help", "settings", "s", "about", "feed",
    "explore", "trending", "c", "b", "p", "e", "jobs", "store", "blog",
    "developers", "login", "signup", "logout", "verify", "claim-username",
    "search", "bookmarks", "notifications", "r", "uploads", "qr", "dmca",
    "trust-safety", "org", "sso", "l", "m", "form", "fund", "live", "map",
    "messages", "newsletter", "oauth", "podcast", "aff", "assistant",
    "dev", "download", "front-page", "join", "privacy", "reset-password",
    "terms", "verify-email-change", "wallet",
  ];

  it.each(liveTopLevelRoutes)("reserves the live route segment %s", (segment) => {
    expect(RESERVED_USERNAMES.has(segment)).toBe(true);
  });
});
