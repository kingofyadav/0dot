import { redirect } from "next/navigation";
import { BadgeCheck, Calendar, Palette, ShoppingBag } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { AuthTabs } from "@/components/AuthTabs";

const FEATURES = [
  {
    title: "One permanent link",
    body: "0dot.in/yourname — put it in every bio, resume, and business card. It never changes.",
  },
  {
    title: "A profile that grows with you",
    body: "Posts, portfolio, community, and business — all under one identity, not a second account.",
  },
  {
    title: "You own it",
    body: "No algorithm decides who finds you, and no platform can take your name away.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (user?.username) {
    redirect("/feed");
  }

  return (
    <div className="landingWrap">
      <div className="landingLogo">
        <Logo size={40} />
      </div>

      <section className="landingHero">
        <h1>One Identity. One Profile. Infinite Possibilities.</h1>
        <p>Your permanent home on the internet.</p>
        <ul className="landingFeatures">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <strong>{feature.title}</strong>
              <span>{feature.body}</span>
            </li>
          ))}
        </ul>

        <div className="landingPreview" aria-hidden="true">
          <div className="landingPreviewChrome">
            <span className="landingPreviewDot" />
            <span className="landingPreviewDot" />
            <span className="landingPreviewDot" />
            <span className="landingPreviewUrl">0dot.in/priya</span>
          </div>
          <div className="landingPreviewBody">
            <div className="landingPreviewCover" />
            <div className="landingPreviewHeaderRow">
              <span className="landingPreviewAvatar" />
              <div className="landingPreviewIdentity">
                <div className="landingPreviewName">
                  Priya Sharma
                  <span className="verifiedBadge">
                    <BadgeCheck size={13} aria-hidden="true" />
                  </span>
                </div>
                <div className="landingPreviewHandle">Designer &amp; Creator</div>
              </div>
            </div>
            <div className="landingPreviewStats">
              <span><strong>12.4k</strong> followers</span>
              <span><strong>340</strong> following</span>
              <span><strong>28</strong> links</span>
            </div>
            <div className="landingPreviewLinks">
              <div className="landingPreviewLink">
                <Palette size={14} aria-hidden="true" /> Portfolio
              </div>
              <div className="landingPreviewLink">
                <ShoppingBag size={14} aria-hidden="true" /> Shop my designs
              </div>
              <div className="landingPreviewLink">
                <Calendar size={14} aria-hidden="true" /> Book a call
              </div>
            </div>
          </div>
          <span className="landingPreviewBadge">Live preview</span>
        </div>
      </section>

      <AuthTabs />
    </div>
  );
}
