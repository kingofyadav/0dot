import type { MetadataRoute } from "next";

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
    sitemap: "https://0dot.in/sitemap.xml",
  };
}
