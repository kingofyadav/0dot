import { Link2, Newspaper, Users, Store, KeyRound, ArrowRight, BadgeCheck } from "lucide-react";
import { Icon } from "@/components/Icon";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { TrackedLink } from "@/components/marketing/TrackedLink";

// Redesign Phase 3 (docs/specs/phase-0-redesign.md §6). The below-the-fold
// story on "/" — the hero + AuthTabs card above this get a visitor straight
// to signup; this is the argument for staying. Each section is quiet and
// disciplined: an eyebrow, one display heading, a lead line, and one small
// CSS-built visual (no images, same posture as DigitalHomeVisual). The
// identity-node motif in the hero stays the single bold element.
//
// Server component: the scroll-reveal behaviour lives in MarketingSection
// and the CTA's analytics ping in TrackedLink, so the whole story renders
// statically and only those leaves hydrate.

export function MarketingStory() {
  return (
    <div className="marketingStory">
      <MarketingSection
        eyebrow="Links"
        title="One link that holds everything you are."
        visual={
          <div className="msLinkStack">
            {["Portfolio", "Latest writing", "Book a call", "Newsletter"].map((label, i) => (
              <span className="msLinkRow" key={label} style={{ "--i": i } as React.CSSProperties}>
                <Icon as={Link2} size="sm" />
                {label}
              </span>
            ))}
          </div>
        }
      >
        Put one address in every bio, signature, and business card. It never
        breaks, it never gets sold, and it grows with you instead of staying a
        flat list.
      </MarketingSection>

      <MarketingSection
        eyebrow="Feed"
        flip
        title="Proof you're real — not just a bio."
        visual={
          <div className="msPostStack">
            {[
              "Shipped the thing I've been quiet about for a month.",
              "Notes from today's talk are up.",
              "Small win, still counts.",
            ].map((body, i) => (
              <span className="msPost" key={body} style={{ "--i": i } as React.CSSProperties}>
                <span className="msPostHead">
                  <span className="msPostAvatar" />
                  <span className="msPostName">
                    You <Icon as={BadgeCheck} size="sm" />
                  </span>
                </span>
                {body}
              </span>
            ))}
          </div>
        }
      >
        Post updates, work, and thoughts right on your identity. Anyone who
        lands on your profile sees a living person, not a placeholder.
      </MarketingSection>

      <MarketingSection
        eyebrow="Communities & business"
        title="The rooms where your people already are."
        visual={
          <div className="msOrbit">
            <span className="msOrbitCenter">
              <Icon as={Users} size="md" />
            </span>
            {[Store, Newspaper, Users, Link2].map((C, i) => (
              <span className="msOrbitNode" key={i} style={{ "--a": `${i * 90}deg` } as React.CSSProperties}>
                <Icon as={C} size="sm" />
              </span>
            ))}
          </div>
        }
      >
        Run a community, open a storefront, take bookings, sell what you make —
        each one attaches to the same identity, so your reputation follows you
        everywhere.
      </MarketingSection>

      <MarketingSection
        eyebrow="For developers"
        flip
        title="An identity other apps can build on."
        visual={
          <div className="msConsent">
            <span className="msConsentHead">
              <Icon as={KeyRound} size="sm" /> Continue with 0dot
            </span>
            <span className="msConsentRow">Share your name and avatar</span>
            <span className="msConsentRow">Verify you own the account</span>
            <span className="msConsentBtn">Authorize</span>
          </div>
        }
      >
        &ldquo;Sign in with 0dot&rdquo;, a public REST API, and signed webhooks.
        The identity layer is programmable by the people who own it.
      </MarketingSection>

      <section className="marketingCta">
        <h2 className="display-2">Claim your corner of the internet.</h2>
        <p>Your username is permanent. Setup takes about a minute.</p>
        <TrackedLink
          href="/signup"
          className="button"
          event="story_cta_click"
          eventData={{ where: "footer_band" }}
        >
          Create your 0dot <Icon as={ArrowRight} size="sm" />
        </TrackedLink>
        <span className="marketingCtaNote">Free forever · no card required</span>
      </section>
    </div>
  );
}
