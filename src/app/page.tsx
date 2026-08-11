import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { DigitalHomeVisual } from "@/components/DigitalHomeVisual";
import { MarketingNav } from "@/components/marketing/MarketingNav";

export default async function Home() {
  const user = await getCurrentUser();
  if (user?.username) {
    redirect("/feed");
  }

  // Minimal, button-driven landing (explicit user direction): no embedded
  // signup/login form, no paragraph-heavy sections, no footer, no duplicate
  // CTA buttons in the hero — MarketingNav's Log in / Create your 0dot are
  // the only navigation. Just header + one centered hero screen.
  return (
    <>
      <MarketingNav />

      <div className="landingWrap landingWrap--solo">
        <section className="landingHero">
          <DigitalHomeVisual />
        </section>
      </div>
    </>
  );
}
