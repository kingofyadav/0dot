import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { ThemeToggleLogo } from "@/components/ThemeToggleLogo";
import { AuthTabs } from "@/components/AuthTabs";
import { LandingLiveShowcase } from "@/components/LandingLiveShowcase";

export default async function Home() {
  const user = await getCurrentUser();
  if (user?.username) {
    redirect("/feed");
  }

  return (
    <div className="landingWrap">
      <div className="landingLogo">
        <ThemeToggleLogo size={40} />
      </div>

      <section className="landingHero">
        <h1>One Identity. One Profile. Infinite Possibilities.</h1>
        <p>Your permanent home on the internet.</p>
        <p className="landingHeroTrust">Free to join · No ads · Yours, permanently</p>
        <Link href="/explore" className="exploreLiveButton">
          <span className="exploreLiveDot" aria-hidden="true" />
          Explore live
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>

        <LandingLiveShowcase />
      </section>

      <AuthTabs />
    </div>
  );
}
