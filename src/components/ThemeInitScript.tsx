"use client";

// Applies a previously-chosen manual theme before first paint, so there's no
// flash of the wrong theme while React hydrates. Must be a Client Component
// (not inlined in the Server Component RootLayout): the type toggle below
// only avoids React's dev-only "script tag" warning if this code actually
// re-executes in the browser (on React Strict Mode's remount), which never
// happens for Server Component output.
export function ThemeInitScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem('0dot-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
      }}
    />
  );
}
