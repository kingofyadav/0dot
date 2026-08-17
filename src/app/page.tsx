import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { DigitalHomeVisual } from "@/components/DigitalHomeVisual";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { AuthTabs } from "@/components/AuthTabs";
import { ExploreLiveLink } from "@/components/ExploreLiveLink";

export default async function Home() {
  const user = await getCurrentUser();
  if (user?.username) {
    redirect("/feed");
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
          <h1>One identity. One profile. Infinite possibilities.</h1>
          <p>Your permanent home on the internet.</p>
          <ExploreLiveLink />

          <DigitalHomeVisual />
        </section>

        <AuthTabs />
      </div>
    </>
  );
}
