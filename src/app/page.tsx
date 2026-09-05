import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getCurrentUser } from "@/lib/session";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingStory } from "@/components/marketing/MarketingStory";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { AuthTabs } from "@/components/AuthTabs";
import { ExploreLiveLink } from "@/components/ExploreLiveLink";
import { DismissibleNotice } from "@/components/DismissibleNotice";

// Dynamic rather than static: purely decorative (pointer-parallax + 6
// lucide icons), not needed for the hero's LCP text, so it shouldn't share
// the auth form's hydration-critical chunk (see AuthTabs.tsx's dynamic()
// calls for the same reasoning). The fallback reuses .dhVisual's own
// aspect-ratio box (globals.css) so its footprint is identical before and
// after the real component hydrates in — no layout shift.
const DigitalHomeVisual = dynamic(() =>
  import("@/components/DigitalHomeVisual").then((m) => m.DigitalHomeVisual)
, {
  loading: () => <div className="dhVisual dhVisual--hero" aria-hidden="true" />,
});

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
