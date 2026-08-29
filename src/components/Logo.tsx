import Image from "next/image";

// Per explicit preference: dark theme shows the dark-fill mark (0dot.png),
// light theme shows the light-fill mark (1dot.png) — the reverse of a
// contrast-matched pairing, chosen deliberately. CSS (see globals.css)
// swaps between them on the same prefers-color-scheme/data-theme signal
// the rest of the site already follows.
export function Logo({
  size = 32,
  className,
  priority = true,
}: {
  size?: number;
  className?: string;
  // Every above-the-fold call site wants this default. DigitalHomeVisual's
  // copy is a second, purely decorative render of the same mark mid-page —
  // it opts out so the landing page isn't preloading two logo images for
  // one visible mark.
  priority?: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <Image
        src="/1dot.png"
        alt="0dot"
        width={size}
        height={size}
        className={className ? `themeLogoLight ${className}` : "themeLogoLight"}
        priority={priority}
      />
      <Image
        src="/0dot.png"
        alt="0dot"
        width={size}
        height={size}
        className={className ? `themeLogoDark ${className}` : "themeLogoDark"}
        priority={priority}
      />
    </span>
  );
}
