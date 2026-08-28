import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Lock, Unplug, Gauge, Accessibility, Scale } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Icon } from "@/components/Icon";

// Redesign Phase 3 (docs/specs/phase-0-redesign.md §6). The first real
// marketing page beyond "/". Every claim here is a position already stated
// in docs/VISION.md - this page is that document's public-facing face, not
// new copy inventing a stance.
export const metadata: Metadata = {
  title: "About",
  description:
    "0dot is an identity layer: one permanent, user-owned home on the internet that social, commerce, portfolio, and community surfaces attach to.",
};

const PRINCIPLES: { icon: typeof Lock; title: string; body: string }[] = [
  {
    icon: ShieldCheck,
    title: "User-first",
    body: "When a feature helps our growth metrics at your expense — dark patterns, friction to leaving, anxiety-driven notifications — you win.",
  },
  {
    icon: Lock,
    title: "Private by default",
    body: "New fields and features start at the most private reasonable setting. Visibility is something you opt into, not out of.",
  },
  {
    icon: Unplug,
    title: "Yours to take",
    body: "The identity data you own is exportable, and over time programmable by you. Not locked in.",
  },
  {
    icon: Gauge,
    title: "Fast and reliable",
    body: "Premium means polish and trustworthiness — fast, consistent, no broken states — not maximal visual flourish.",
  },
  {
    icon: Accessibility,
    title: "Accessible",
    body: "A standing requirement on every feature, checked before it ships — not a module we get to later.",
  },
  {
    icon: Scale,
    title: "Permanent addresses",
    body: "A username, once claimed and active, is a permanent address — the same way an email or phone number is.",
  },
];

const WONT_BUILD = [
  "An attention-maximizing social network. The feed gives your identity a pulse; it isn't an engagement-ranked time sink.",
  "An ad-first business. Monetization is subscriptions, transactions, and fees — never data sales.",
  "A crypto or NFT speculation platform, regardless of trend pressure.",
  "Dark-pattern growth. Account deletion is as easy as account creation.",
];

export default function AboutPage() {
  return (
    <>
      <MarketingNav />

      <main className="aboutPage">
        <header className="aboutHero">
          <span className="eyebrow">About 0dot</span>
          <h1 className="display-2">
            Your online identity, owned by you — not by the platforms it lives on.
          </h1>
          <p>
            A person&rsquo;s presence is scattered across services that each own a
            slice of it and can revoke access at any time. 0dot is one durable,
            user-owned home at <span className="brandUrl">0dot.in</span>/username
            that social, commerce, portfolio, and community surfaces attach to —
            an identity layer, not a destination people &ldquo;check.&rdquo;
          </p>
        </header>

        <section className="aboutSection">
          <span className="eyebrow">What we test ourselves against</span>
          <p className="aboutSectionLede">
            Five years from now, when someone wants to know who a person or
            business is on the internet,{" "}
            <span className="brandUrl">0dot.in</span>/username is the answer.
            Infrastructure, not a place to hang out.
          </p>
        </section>

        <section className="aboutSection">
          <span className="eyebrow">Principles</span>
          <div className="aboutGrid">
            {PRINCIPLES.map((p) => (
              <div className="aboutCard" key={p.title}>
                <span className="aboutCardIcon">
                  <Icon as={p.icon} size="md" />
                </span>
                <h2>{p.title}</h2>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="aboutSection">
          <span className="eyebrow">What we deliberately won&rsquo;t build</span>
          <ul className="aboutList">
            {WONT_BUILD.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="marketingCta">
          <h2 className="display-3">One identity. One profile.</h2>
          <p>Your username is permanent. Setup takes about a minute.</p>
          <Link href="/signup" className="button">
            Create your 0dot
          </Link>
          <span className="marketingCtaNote">Free forever · no card required</span>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
