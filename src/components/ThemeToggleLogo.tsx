"use client";

import Image from "next/image";
import { getEffectiveTheme, persistTheme } from "@/lib/browser-tab";
import { useBrowserTab } from "@/components/BrowserTabProvider";

export function ThemeToggleLogo({
  size = 32,
  priority = true,
  interactive = true,
}: {
  size?: number;
  priority?: boolean;
  // MarketingNav is the one caller that already wraps this in its own
  // <Link href="/">: a <button> nested inside an <a> is invalid HTML and
  // Lighthouse/axe flag it as a broken touch target (the anchor's own
  // clickable box collapses to a few stray px around the button). There,
  // pass false to render just the theme-aware image pair and let the Link
  // be the only interactive element (losing click-to-toggle there, but the
  // logo's "go home" affordance was the intended one — toggling was a side
  // effect of reusing this component for its light/dark image swap).
  interactive?: boolean;
}) {
  const { setTheme } = useBrowserTab();

  const handleClick = () => {
    const next = getEffectiveTheme() === "light" ? "dark" : "light";
    persistTheme(next);
    // BrowserTabProvider owns the actual favicon <link> writes (it also
    // has to layer badges/dots on top), so this just reports the new theme
    // rather than touching the DOM itself.
    setTheme(next);
  };

  const images = (
    <>
      <Image
        src="/1dot.png"
        alt="0dot"
        width={size}
        height={size}
        className="themeLogoLight"
        priority={priority}
      />
      <Image
        src="/0dot.png"
        alt="0dot"
        width={size}
        height={size}
        className="themeLogoDark"
        priority={priority}
      />
    </>
  );

  if (!interactive) {
    return <span style={{ display: "inline-flex", alignItems: "center" }}>{images}</span>;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Toggle dark/light theme"
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
    >
      {images}
    </button>
  );
}
