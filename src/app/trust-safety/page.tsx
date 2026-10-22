import type { Metadata } from "next";
import Link from "next/link";
import { Flag, UserCog, Store, Bot, Users, Copyright } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Icon } from "@/components/Icon";
import { getCurrentUser } from "@/lib/session";
import { DmcaTakedownNoticeForm } from "./DmcaTakedownNoticeForm";

// The public Trust & Safety policy page — distinct from the owner-only
// /s/[username]/trust-safety (your own enforcement actions and appeals).
// Previously /trust-safety WAS that private page (requireVerifiedUser()),
// so the public footer/legal-nav link to it sent every signed-out visitor
// straight to /login instead of any policy content. This is the real page
// that link was always supposed to reach.
export const metadata: Metadata = {
  title: "Trust & Safety",
  description: "What we moderate on 0dot, how reports and appeals work, and how to file a DMCA notice.",
};

const WHAT_WE_MODERATE: { icon: typeof Flag; title: string; body: string }[] = [
  {
    icon: Flag,
    title: "Posts, profiles & comments",
    body: "Reported content is reviewed against the Terms of Service — illegal content, harassment, exploitation, spam and scams.",
  },
  {
    icon: UserCog,
    title: "Accounts",
    body: "Impersonation, name-squatting, and accounts that put others at risk can be restricted, same as any other enforcement action.",
  },
  {
    icon: Store,
    title: "Businesses & marketplace",
    body: "Business claims and marketplace listings are reviewed before and after they go live, not just on report.",
  },
  {
    icon: Bot,
    title: "AI-assisted moderation",
    body: "Some content is flagged by automated moderation before any person sees it. Every AI-assisted action is appealable exactly like a human one.",
  },
  {
    icon: Users,
    title: "Community spaces",
    body: "Day-to-day moderation inside a community — a post removed, a member banned — stays with that community's own moderators, not platform staff.",
  },
  {
    icon: Copyright,
    title: "Copyright (DMCA)",
    body: "Takedown notices and counter-notices follow the DMCA process below, separate from a general content report.",
  },
];

export default async function TrustSafetyPage() {
  const user = await getCurrentUser();
  const enforcementHref = user?.username ? `/s/${user.username.handle}/trust-safety` : null;

  return (
    <>
      <MarketingNav />

      <main className="aboutPage">
        <header className="aboutHero">
          <span className="eyebrow">Trust &amp; Safety</span>
          <h1 className="display-2">How we keep 0dot safe — and enforcement fair.</h1>
          <p>
            0dot is a place you put your real identity. That only works if reports get reviewed, enforcement is
            explained, and every decision can be appealed — not a black box.
          </p>
        </header>

        <section className="aboutSection">
          <span className="eyebrow">What we moderate</span>
          <div className="aboutGrid">
            {WHAT_WE_MODERATE.map((item) => (
              <div className="aboutCard" key={item.title}>
                <span className="aboutCardIcon">
                  <Icon as={item.icon} size="md" />
                </span>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="aboutSection">
          <span className="eyebrow">How review works</span>
          <ul className="aboutList">
            <li>Report a post, profile, business or listing from its own report button — you don&rsquo;t need to contact us separately.</li>
            <li>We review the report against the Terms of Service and either act on it or dismiss it.</li>
            <li>Whoever filed the report and whoever it was filed against are both notified of the outcome.</li>
            <li>A platform-level action can be appealed once, and — wherever staffing allows — the appeal is reviewed by someone other than the original reviewer.</li>
          </ul>
        </section>

        <section className="aboutSection">
          <span className="eyebrow">Appeals</span>
          <p className="aboutSectionLede">
            If a platform-level action was taken on your account, you can appeal it from{" "}
            {enforcementHref ? (
              <Link href={enforcementHref}>Settings → Trust &amp; Safety</Link>
            ) : (
              <>Settings → Trust &amp; Safety once you&rsquo;re signed in</>
            )}
            . Routine moderation inside a community you don&rsquo;t run stays with that community, not us.
          </p>
        </section>

        <section className="aboutSection">
          <span className="eyebrow">Copyright (DMCA)</span>
          <p className="aboutSectionLede">
            If you own a copyrighted work and believe it&rsquo;s been posted on 0dot without permission, file a
            takedown notice below. Statutory attestations apply — only file if the statements are true.
          </p>
          <DmcaTakedownNoticeForm />
          <p className="mutedText" style={{ maxWidth: "60ch" }}>
            If your own content was taken down this way, you can file a counter-notice from Settings → Trust &amp;
            Safety once you&rsquo;re signed in.
          </p>
        </section>

        <section className="aboutSection">
          <span className="eyebrow">Read more</span>
          <p className="aboutSectionLede">
            What you may not do is in the <Link href="/terms">Terms of Service</Link>. What we collect and why is
            in the <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
