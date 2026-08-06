"use client";

import Image from "next/image";
import { getEffectiveTheme, persistTheme } from "@/lib/browser-tab";
import { useBrowserTab } from "@/components/BrowserTabProvider";

export function ThemeToggleLogo({ size = 32, priority = true }: { size?: number; priority?: boolean }) {
  const { setTheme } = useBrowserTab();

  const handleClick = () => {
    const next = getEffectiveTheme() === "light" ? "dark" : "light";
    persistTheme(next);
    // BrowserTabProvider owns the actual favicon <link> writes (it also
    // has to layer badges/dots on top), so this just reports the new theme
    // rather than touching the DOM itself.
    setTheme(next);
  };

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
    </button>
  );
}
