"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { UserRound, Link2, Newspaper, Users, Briefcase, Store } from "lucide-react";
import { Logo } from "./Logo";

type DigitalHomeNode = {
  id: string;
  label: string;
  description: string;
  icon: typeof UserRound;
  href?: string;
  angle: number; // degrees, 0 = top, clockwise
};

// The product metaphor from the spec (identity -> home -> links/content/
// community/business), config-driven per its own "don't hardcode every
// object" instruction (§52) rather than one-off JSX per node. Only "Posts",
// "Community", "Business" and "Marketplace" link anywhere — /explore, /c,
// /b, /m are real, public routes (see INFORMATION_ARCHITECTURE.md); "Links"
// stays a plain label (no dedicated page exists yet), and "Profile" calls
// onProfileActivate instead of navigating, since a logged-out visitor has
// no profile yet — clicking it should point at the signup form, not a 404.
const NODES: DigitalHomeNode[] = [
  { id: "profile", label: "Profile", description: "Your identity, one address.", icon: UserRound, angle: 0 },
  { id: "links", label: "Links", description: "Every important link, one home.", icon: Link2, angle: 60 },
  { id: "posts", label: "Content", description: "Share more than links.", icon: Newspaper, href: "/explore", angle: 120 },
  { id: "community", label: "Community", description: "Find people who belong in your world.", icon: Users, href: "/c", angle: 180 },
  { id: "business", label: "Business", description: "Turn your presence into opportunity.", icon: Briefcase, href: "/b", angle: 240 },
  { id: "store", label: "Store", description: "Sell what you make.", icon: Store, href: "/m", angle: 300 },
];

type DigitalHomeVisualProps = {
  /** hero = interactive (parallax, hover expansion); calm = idle-only, per
   *  spec §16 ("your home is waiting for you", not a demo to play with). */
  variant?: "hero" | "calm";
  /** Focuses the signup form's first field when the decorative "Profile"
   *  node is activated. Omitted on /login, where there's no signup form to
   *  jump to. */
  onProfileActivate?: () => void;
};

export function DigitalHomeVisual({ variant = "hero", onProfileActivate }: DigitalHomeVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pointer parallax: hero variant only, and only when reduced motion isn't
  // requested — mirrors LandingLiveShowcase's matchMedia guard rather than
  // relying solely on the CSS-side blanket override, since this is
  // JS-driven inline-style movement, not a CSS transition/animation. Read
  // directly inside the effect (not synced into state first) — nothing
  // here needs to re-render if the OS preference changes mid-session, so
  // there's no setState-in-effect to trigger react-hooks/set-state-in-effect.
  useEffect(() => {
    if (variant !== "hero") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = containerRef.current;
    if (!el) return;

    function handlePointerMove(e: PointerEvent) {
      const rect = el!.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      // Clamped small — the interface should never feel like it's chasing
      // the cursor (spec §6).
      el!.style.setProperty("--dh-px", `${Math.max(-1, Math.min(1, px)) * 8}px`);
      el!.style.setProperty("--dh-py", `${Math.max(-1, Math.min(1, py)) * 8}px`);
    }
    function handlePointerLeave() {
      el!.style.setProperty("--dh-px", "0px");
      el!.style.setProperty("--dh-py", "0px");
    }

    window.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [variant]);

  return (
    <div ref={containerRef} className={`dhVisual dhVisual--${variant}`}>
      {/* Deliberately not role="img": this contains real focusable
          buttons/links (Profile/Links/Content/Community/Business/Store),
          and role="img" on an element with interactive descendants can make
          assistive tech flatten or skip them entirely — exactly the
          keyboard/screen-reader access this component exists to provide
          (spec §46/§47). Each node's own link/button semantics plus its
          visible label (.dhNodeLabel) already announce fine on their own;
          the surrounding headline/copy in page.tsx/login/signup state the
          same "one identity, one home" pitch in plain text besides. */}
      <span className="dhRing" aria-hidden="true" />
      <span className="dhGlow" aria-hidden="true" />

      <div className="dhCenter" aria-hidden="true">
        <Logo size={32} priority={false} />
      </div>

      {NODES.map((node) => {
        const Icon = node.icon;
        const inner = (
          <>
            <Icon size={16} aria-hidden="true" />
            <span className="dhNodeLabel">{node.label}</span>
          </>
        );
        return (
          <div className="dhNodeWrap" key={node.id} style={{ "--dh-angle": `${node.angle}deg` } as React.CSSProperties}>
            {node.href ? (
              // prefetch={false}: this visual mounts with 4 of these nodes
              // viewport-visible at once on the landing/login/signup pages —
              // Next's default prefetch would fire all 4 RSC payload fetches
              // together on every anonymous page view, on top of the other
              // links these same pages render (nav CTAs, forgot-password).
              // Same DB-connection-burst-503 root cause NavLinks.tsx's own
              // comment documents; same fix.
              <Link
                href={node.href}
                prefetch={false}
                className="dhNode"
                onClick={() => track("3d_node_click", { node: node.id })}
              >
                {inner}
              </Link>
            ) : (
              <button
                type="button"
                className="dhNode"
                onClick={() => {
                  track("3d_node_click", { node: node.id });
                  onProfileActivate?.();
                }}
              >
                {inner}
              </button>
            )}
            <span className="dhNodeCard">{node.description}</span>
          </div>
        );
      })}
    </div>
  );
}
