import type { MetadataRoute } from "next";

// Kept in sync with sitemap.ts's own generateSitemaps() ids — Next.js does
// NOT serve a "/sitemap.xml" index that auto-references these sub-sitemaps
// (confirmed empirically: with generateSitemaps in use, plain /sitemap.xml
// 404s, only /sitemap/{id}.xml resolves), so every one has to be listed
// here explicitly. Standard, fully-supported robots.txt behavior — multiple
// `Sitemap:` lines, not a single index file, is exactly what the spec
// allows for this case.
const SITEMAP_URLS = [
  "static",
  "profiles",
  "businesses",
  "communities",
  "events",
  "jobs",
  "marketplace",
].map((id) => `https://0dot.in/sitemap/${id}.xml`);

// Everything not listed here defaults to crawlable — public profile pages
// ([username]/page.tsx), /explore, /login, /signup, and the rest of the
// public content surfaces (posts, communities, events, businesses, …) all
// live at paths this rule set never touches. Only routes that are either
// pure auth/session machinery or always behind a signed-in check are
// disallowed, matching what a signed-out crawler would actually hit as a
// dead end or a duplicate of already-public content.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/feed",
        "/messages",
        "/notifications",
        "/bookmarks",
        "/form",
        "/oauth",
        "/sso",
        "/verify",
        "/reset-password",
        "/forgot-password",
        "/claim-username",
        "/dev",
      ],
    },
    sitemap: SITEMAP_URLS,
  };
}
