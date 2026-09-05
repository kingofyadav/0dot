import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

// SEO plan Phase 5: the static list below used to be this file's entire
// output, on the reasoning that unbounded user-generated content is better
// discovered by crawlers via on-page links than enumerated here. That still
// holds for genuinely unbounded/high-churn content (posts — see
// getPostById's own sitemap comment, feed-query.ts), but durable, evergreen
// content (a business, a community, a published event) benefits from direct
// enumeration rather than waiting on crawl-through discovery. generateSitemaps
// splits this one route segment into named sub-sitemaps — Next.js serves
// each at /sitemap/{id}.xml and /sitemap.xml itself becomes the index
// referencing all of them, so robots.ts's single `sitemap:` entry still
// covers everything.
export async function generateSitemaps() {
  return [
    { id: "static" },
    { id: "profiles" },
    { id: "businesses" },
    { id: "communities" },
    { id: "events" },
    { id: "jobs" },
    { id: "marketplace" },
  ];
}

const STATIC_ROUTES = ["", "/explore", "/login", "/signup", "/trending", "/jobs", "/map"];

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const category = await id;

  switch (category) {
    case "static":
      return STATIC_ROUTES.map((route) => ({
        url: `https://0dot.in${route}`,
        lastModified: new Date(),
        changeFrequency: route === "" ? "daily" : ("weekly" as const),
        priority: route === "" ? 1 : 0.6,
      }));

    // discoverableInSearch/isPrivate are the same settings-page flags a
    // profile owner already controls (src/app/actions/profile.ts) — this
    // just respects them instead of introducing a new, separate opt-out.
    case "profiles": {
      const usernames = await db.username.findMany({
        where: { user: { profile: { discoverableInSearch: true, isPrivate: false } } },
        select: { handle: true },
      });
      return usernames.map((u) => ({ url: `https://0dot.in/${u.handle}`, changeFrequency: "weekly" as const, priority: 0.5 }));
    }

    // Matches the public-facing filter every other business surface already
    // uses (ExploreDiscovery.tsx's own where: { status: "active" }).
    case "businesses": {
      const businesses = await db.business.findMany({ where: { status: "active" }, select: { slug: true, updatedAt: true } });
      return businesses.map((b) => ({ url: `https://0dot.in/b/${b.slug}`, lastModified: b.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 }));
    }

    case "communities": {
      const communities = await db.community.findMany({ where: { visibility: "public" }, select: { slug: true } });
      return communities.map((c) => ({ url: `https://0dot.in/c/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.6 }));
    }

    case "events": {
      const events = await db.event.findMany({ where: { status: "published" }, select: { slug: true, updatedAt: true } });
      return events.map((e) => ({ url: `https://0dot.in/e/${e.slug}`, lastModified: e.updatedAt, changeFrequency: "daily" as const, priority: 0.5 }));
    }

    // Job has no own updatedAt column — postedAt is the closest signal, same
    // one the job detail page's own JobPosting JSON-LD uses for datePosted.
    case "jobs": {
      const jobs = await db.job.findMany({
        where: { status: "open", business: { status: "active" } },
        select: { id: true, postedAt: true, business: { select: { slug: true } } },
      });
      return jobs.map((j) => ({
        url: `https://0dot.in/b/${j.business.slug}/jobs/${j.id}`,
        lastModified: j.postedAt,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
    }

    case "marketplace": {
      const listings = await db.marketplaceListing.findMany({ where: { status: "active" }, select: { id: true, updatedAt: true } });
      return listings.map((l) => ({ url: `https://0dot.in/m/${l.id}`, lastModified: l.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 }));
    }

    default:
      return [];
  }
}
