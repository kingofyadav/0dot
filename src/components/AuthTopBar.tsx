import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThemeToggleLogo } from "./ThemeToggleLogo";

// /login and /signup's replacement for the old standalone .landingLogo —
// still just a logo, but now paired with an explicit way back to the
// marketing page (spec §15: same visual language as landing, without the
// full MarketingNav — these stay single-purpose task pages, not a second
// place to browse Product/Communities/Business from).
export function AuthTopBar() {
  return (
    <div className="authTopBar">
      <ThemeToggleLogo size={32} />
      <Link href="/" className="authTopBarBack">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to <span className="brandUrl">0dot</span>
      </Link>
    </div>
  );
}
