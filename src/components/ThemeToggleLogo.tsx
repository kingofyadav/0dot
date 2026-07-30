"use client";

import Image from "next/image";
import { useEffect } from "react";

const STORAGE_KEY = "0dot-theme";
type Theme = "light" | "dark";

function iconHrefFor(theme: Theme) {
  // Per explicit preference: dark theme uses the dark-fill mark (0dot.png),
  // light theme uses the light-fill mark (1dot.png) — same mapping as the
  // header/avatar logo swap.
  return theme === "dark" ? "/0dot.png" : "/1dot.png";
}

function getEffectiveTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function syncFavicon(theme: Theme) {
  const href = iconHrefFor(theme);
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
    .forEach((link) => {
      link.href = href;
    });
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(STORAGE_KEY, theme);
  syncFavicon(theme);
}

export function ThemeToggleLogo({ size = 32 }: { size?: number }) {
  useEffect(() => {
    // Keep the favicon in sync with whatever theme is actually in effect
    // on mount (OS preference, or a stored manual choice the inline head
    // script already applied before paint) — the static media-based
    // <link> tags only ever track OS preference on their own.
    syncFavicon(getEffectiveTheme());
  }, []);

  return (
    <button
      type="button"
      onClick={() => applyTheme(getEffectiveTheme() === "light" ? "dark" : "light")}
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
        priority
      />
      <Image
        src="/0dot.png"
        alt="0dot"
        width={size}
        height={size}
        className="themeLogoDark"
        priority
      />
    </button>
  );
}
