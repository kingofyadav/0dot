import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { DigitalHomeVisual } from "@/components/DigitalHomeVisual";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingStory } from "@/components/marketing/MarketingStory";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { AuthTabs } from "@/components/AuthTabs";
import { ExploreLiveLink } from "@/components/ExploreLiveLink";
import { DismissibleNotice } from "@/components/DismissibleNotice";

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

  // MarketingNav is the only header on this page (single header, all
  // devices). Below it, the same split hero/auth-card shell as /login and
  // /signup (.landingWrap, shared in globals.css) — hero copy left, the
  // signup/login form (AuthTabs) right.
  return (
    <>
      <MarketingNav />

      <div className="landingWrap">
        <section className="landingHero">
          {link === "unavailable" && <DismissibleNotice message="That link isn't available." />}
          <h1>One identity. One profile. Infinite possibilities.</h1>
          <p>Your permanent home on the internet.</p>
          <ExploreLiveLink />

          <DigitalHomeVisual />
        </section>

        <AuthTabs />
      </div>

      <MarketingStory />
      <MarketingFooter />
    </>
  );
}
