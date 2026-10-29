import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getOfficialDesk, getPlatformStats, getWirePage, initialWireCursor, type PlatformStats, type WirePage } from "@/lib/front-page";
import { logger } from "@/lib/logger";
import { SITE_DESCRIPTION } from "@/lib/site-metadata";
import { FRONT_PAGE, validVideos } from "@/lib/landing-content";
import { getChannelVideos, mergeVideos } from "@/lib/youtube-channel";
import { FrontPage } from "@/components/frontpage/FrontPage";
import { DismissibleNotice } from "@/components/DismissibleNotice";

// Link previews for "/" use the newspaper front-page card
// (src/app/front-page/og/route.tsx) instead of the site-wide default.
// openGraph/twitter are replaced wholesale when a page sets them (Next
// merges metadata one level deep), so this restates the layout's fields.
const SHARE_TITLE = "0dot — One identity. One profile. Infinite possibilities.";
const SHARE_IMAGE = { url: "/front-page/og", width: 1200, height: 630, alt: "The 0dot Dispatch — today's front page" };

export const metadata: Metadata = {
  openGraph: {
    title: SHARE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: "0dot",
    type: "website",
    url: "/",
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SHARE_IMAGE.url],
  },
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>;
}) {
  const { link } = await searchParams;
  const user = await getCurrentUser();
  if (user?.username) {
    // Forward the notice through to /feed — that's where a fully onboarded
    // user actually lands, so the query param can't just die here.
    redirect(link === "unavailable" ? "/feed?link=unavailable" : "/feed");
  }

  // Logged-out landing page, laid out as a newspaper front page
  // (src/components/frontpage/FrontPage.tsx). The signup/login forms live
  // on their own /signup and /login pages; every CTA here links to them.
  // A failed dispatches read degrades to the column's empty state rather
  // than taking down the highest-traffic page on the site.
  const desk = await getOfficialDesk().catch((err) => {
    logger.error("front page: official desk unavailable", err);
    return null;
  });

  // First Wire batch server-rendered (in the HTML for crawlers and no-JS
  // visitors). On failure, start empty but keep the cursor, so the client
  // simply retries it.
  const firstCursor = initialWireCursor(desk);
  const [wire, channelVideos, stats]: [WirePage, Awaited<ReturnType<typeof getChannelVideos>>, PlatformStats | null] = await Promise.all([
    getWirePage(firstCursor).catch((err) => {
      logger.error("front page: first wire page failed", err);
      return { items: [], next: firstCursor };
    }),
    getChannelVideos(FRONT_PAGE.youtubeChannelId),
    getPlatformStats().catch((err) => {
      logger.error("front page: platform stats unavailable", err);
      return null;
    }),
  ]);
  const videos = mergeVideos(validVideos(), channelVideos);

  // No MarketingNav here: FrontPage brings its own sticky masthead nav.
  // No footer either — the landing page ends on the Wire stream itself.
  return (
    <FrontPage
      desk={desk}
      wire={wire}
      videos={videos}
      stats={stats}
      notice={
        link === "unavailable" && (
          <div className="landingNotice">
            <DismissibleNotice message="That link isn't available." />
          </div>
        )
      }
    />
  );
}
