import type { MetadataRoute } from "next";

// Only the handful of static, always-public marketing/discovery routes —
// everything else (profile pages, posts, communities, …) is user-generated
// and unbounded, better discovered by crawlers via on-page links than
// enumerated here. Keeps this file from needing a DB query at build/request
// time, matching robots.ts's split between "public" and "gated" above it.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/explore", "/login", "/signup", "/trending", "/jobs", "/map"];

  return routes.map((route) => ({
    url: `https://0dot.in${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.6,
  }));
}
