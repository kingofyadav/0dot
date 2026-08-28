import Link from "next/link";
import { Logo } from "@/components/Logo";

// Redesign Phase 3. Marketing footer for "/" only. Links point exclusively
// at routes that actually exist (NAVIGATION.md rule 2 — no dead entries):
// /about, /help, /blog, and a pricing page are still "Future" per
// docs/ROADMAP.md, so they're deliberately absent.
const GROUPS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Explore", href: "/explore" },
      { label: "Trending", href: "/trending" },
      { label: "Get the app", href: "/download" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { label: "Create your 0dot", href: "/signup" },
      { label: "Log in", href: "/login" },
    ],
  },
  {
    heading: "Trust",
    links: [
      { label: "Trust & Safety", href: "/trust-safety" },
      { label: "Copyright / DMCA", href: "/dmca" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="marketingFooter">
      <div className="marketingFooterInner">
        <div className="marketingFooterBrand">
          <Logo size={28} />
          <p>
            One identity. One profile.
            <br />
            Your permanent home on the internet.
          </p>
        </div>
        <nav className="marketingFooterNav" aria-label="Footer">
          {GROUPS.map((group) => (
            <div className="marketingFooterGroup" key={group.heading}>
              <span className="eyebrow">{group.heading}</span>
              {group.links.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div className="marketingFooterBase">
        <span className="brandUrl">0dot.in</span>
        <span>&copy; {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
