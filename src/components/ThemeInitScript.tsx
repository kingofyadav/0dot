"use client";

// Applies a previously-chosen manual theme before first paint, so there's no
// flash of the wrong theme while React hydrates. Must be a Client Component
// (not inlined in the Server Component RootLayout): the type toggle below
// only avoids React's dev-only "script tag" warning if this code actually
// re-executes in the browser (on React Strict Mode's remount), which never
// happens for Server Component output.
//
// `nonce` comes from RootLayout's x-nonce header (set per-request by
// proxy.ts). Unlike Next's own framework scripts, a hand-authored <script>
// like this one isn't auto-covered by the CSP nonce Next.js threads through
// internally — it has to be applied here explicitly or the browser blocks it.
export function ThemeInitScript({ nonce }: { nonce?: string }) {
  return (
    <script
      nonce={nonce}
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem('0dot-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
      }}
    />
  );
}
