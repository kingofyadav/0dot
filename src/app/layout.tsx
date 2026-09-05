import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { ContextualRail } from "@/components/ContextualRail";
import { MessagingProvider } from "@/components/MessagingProvider";
import { BrowserTabProvider } from "@/components/BrowserTabProvider";
import { KeyboardShortcutProvider } from "@/components/KeyboardShortcutProvider";
import { ToastProvider } from "@/components/Toast";
import { AgeGatePrompt } from "@/components/AgeGatePrompt";
import { PwaServiceWorker } from "@/components/PwaServiceWorker";
import { SafariInstallPrompt } from "@/components/SafariInstallPrompt";
import { ConsoleSelfXssWarning } from "@/components/ConsoleSelfXssWarning";
import { ThemeInitScript } from "@/components/ThemeInitScript";
import { ContextualRailSkeleton } from "@/components/Skeleton";
import { getCurrentUser } from "@/lib/session";
import { getUnreadConversationCount } from "@/lib/messaging";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { isChromelessPath, isFixedViewportPath } from "@/lib/route-context";
import { SITE_DESCRIPTION } from "@/lib/site-metadata";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"

// Self-hosted (not next/font/google) — Turbopack's Lightning CSS minifier
// corrupts the Basic-Latin unicode-range it generates for Google-fonts
// subsets (`U+0-FF` becomes literal invalid `U+??`, in both dev and prod
// builds), which silently drops plain-ASCII text to the Arial fallback.
// Local fonts get one @font-face with no unicode-range splitting, so
// there's nothing for that bug to corrupt. Files are Vercel's own
// official variable-font binaries, vendored from the `geist` npm package.
const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

// preload:false — its only real consumer is .kbd styling inside
// CommandPalette/ShortcutsHelp (see KeyboardShortcutProvider.tsx), both
// lazy-loaded and closed by default, so there's no reason to fetch this
// font on every route's first load.
const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  preload: false,
});

// viewport-fit=cover so env(safe-area-inset-bottom) resolves to the actual
// home-indicator inset (iOS PWA standalone mode, per manifest.json's
// "display": "standalone") instead of 0 — MobileBottomNav pads against it.
// themeColor matches manifest.json's theme_color so Safari's chrome (and the
// status bar once added to the iOS home screen) tints consistently even
// before a user has installed anything.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#000000",
};

// Dynamic (not a static `metadata` export) specifically so the tab title
// can reflect auth state: a generic "Welcome" before login, just the real
// user's name (no "Welcome" prefix) after — matching the header logo area.
export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  const title = user?.profile ? user.profile.displayName : "Welcome";

  return {
    // Required for next/og-generated images (opengraph-image.tsx) and any
    // relative URL in metadata to resolve to an absolute one — without it
    // Next.js warns at build time and social scrapers (which never share
    // this app's own base URL) get a relative, unusable image path.
    metadataBase: new URL("https://0dot.in"),
    // `default` is what renders as-is on routes with no title of their own
    // (marketing pages, the account name itself) — unchanged from before.
    // `template` only kicks in for routes that set their own `title`
    // (settings pages, /feed, etc — see their own metadata/generateMetadata
    // exports), composing "0dot · <page>" so open tabs are distinguishable
    // instead of every one just repeating your own name.
    title: { default: title, template: "0dot · %s" },
    description: SITE_DESCRIPTION,
    // Site-wide defaults for link previews (Slack, Discord, iMessage,
    // Facebook, LinkedIn, ...) — previously unset entirely, so every share
    // of any page rendered with no image and the browser's generic
    // fallback title/description instead of this. Profile/business/
    // community pages override title/description/images with the real
    // subject's own data in their own generateMetadata; this is what every
    // other route (marketing, auth, /explore, /trending, ...) gets as-is.
    // No explicit `images` here — Next.js's file-convention
    // opengraph-image.tsx at this same segment supplies it automatically,
    // and a page-specific generateMetadata that sets its own `images`
    // overrides it, same resolution order as title/description above.
    openGraph: {
      title,
      description: SITE_DESCRIPTION,
      siteName: "0dot",
      type: "website",
    },
    // "summary_large_image" is what actually makes X/Twitter render a
    // large image card instead of a small thumbnail; without it the image
    // above renders tiny even though it's set. Twitter's own card
    // validator falls back to og:image when no separate twitter:image is
    // set, so one image source covers both without a duplicate file.
    twitter: {
      card: "summary_large_image",
      title,
      description: SITE_DESCRIPTION,
    },
    icons: {
      icon: [
        { url: "/1dot.png", media: "(prefers-color-scheme: light)" },
        { url: "/0dot.png", media: "(prefers-color-scheme: dark)" },
      ],
      // Flattened onto solid black (public/apple-touch-icon.png, generated
      // from 1dot.png) rather than reusing the transparent source icon —
      // iOS composites a transparent apple-touch-icon onto its own white
      // square, which would show a mismatched white tile on the home
      // screen instead of matching manifest.json's black theme.
      apple: "/apple-touch-icon.png",
    },
    // phase-15 spec §5.1/§9 step 5: "desktop app" is this same web app,
    // installed via standard PWA installability (manifest + service
    // worker) rather than a sixth native codebase.
    manifest: "/manifest.json",
    // iOS/iPadOS Safari never fires `beforeinstallprompt` (Apple doesn't
    // implement it on any WebKit-based browser, including Chrome-for-iOS),
    // so there's no native "Install" affordance there — only the manual
    // Share -> Add to Home Screen path IosInstallPrompt below walks users
    // through. These tags are what make that manual add behave like a real
    // app (standalone, no Safari chrome) instead of just a bookmark.
    // `statusBarStyle: "black"` (not "black-translucent") deliberately,
    // since black-translucent draws content under the status bar/notch and
    // this app only has bottom safe-area-inset handling (MobileBottomNav)
    // today, not top.
    appleWebApp: {
      title: "0dot",
      statusBarStyle: "black",
    },
    // This Next.js version's `appleWebApp` only emits the unprefixed
    // `mobile-web-app-capable` tag (see node_modules/next/dist/docs) — add
    // the Apple-prefixed one directly too, since older iOS Safari versions
    // only ever honored that one.
    other: {
      "apple-mobile-web-app-capable": "yes",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Same x-pathname mechanism SiteHeader already reads (see proxy.ts) —
  // RootLayout needs to know the current route too, not just SiteHeader.
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  // proxy.ts's per-request CSP nonce — Next.js applies this automatically to
  // its own inline/framework scripts, but ThemeInitScript is hand-authored,
  // so it needs the nonce passed down explicitly (see that component).
  const nonce = headersList.get("x-nonce") ?? undefined;
  const chromeless = isChromelessPath(pathname);
  const fixedViewport = isFixedViewportPath(pathname);
  const currentUser = await getCurrentUser();
  // The rail is a fixed global element, same posture as the left sidebar
  // (SiteHeader) — shown on every page that has chrome at all, for every
  // visitor. ContextualRail branches internally on currentUser: signed-in
  // visitors get the full personalized rail, anonymous visitors get a
  // sign-in prompt plus non-personalized suggestions (see
  // AnonymousContextualRail in ContextualRail.tsx) rather than nothing.
  const showRail = !chromeless;
  // Mirrors MobileBottomNav's own visibility condition (profileHandle
  // truthy, see SiteHeader.tsx/MobileBottomNav.tsx) — a body class rather
  // than plumbing the same boolean through props, since this only exists to
  // let .appMain reserve scroll space for the fixed bar in globals.css.
  const showBottomNav = !chromeless && Boolean(currentUser?.profile);

  const bodyClassNames = [
    showRail && "hasRail",
    showBottomNav && "hasBottomNav",
    chromeless && "noChrome",
    fixedViewport && "fixedViewport",
  ]
    .filter(Boolean)
    .join(" ");

  const initialUnreadCount = currentUser
    ? await Promise.all([
        getUnreadConversationCount(currentUser.id),
        getUnreadNotificationCount(currentUser.id),
      ]).then(([conversations, notifications]) => conversations + notifications)
    : 0;

  // account-settings-hardening addendum §11: read server-side (not a
  // client-side effect) so these apply before first paint, same "no client
  // flash" reasoning ThemeInitScript already handles for color theme.
  const accessibilityPrefs = currentUser?.accessibilityPrefsJson
    ? (JSON.parse(currentUser.accessibilityPrefsJson) as { reducedMotion?: boolean; fontScale?: string; highContrast?: boolean })
    : null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      data-reduced-motion={accessibilityPrefs?.reducedMotion ? "true" : undefined}
      data-font-scale={accessibilityPrefs?.fontScale && accessibilityPrefs.fontScale !== "default" ? accessibilityPrefs.fontScale : undefined}
      data-high-contrast={accessibilityPrefs?.highContrast ? "true" : undefined}
      suppressHydrationWarning
    >
      <head>
        <ThemeInitScript nonce={nonce} />
        {/* WebSite + Organization JSON-LD (SEO plan Phase 2) — site-wide,
            not per-page, so it lives here rather than in any individual
            page's metadata. The SearchAction is what makes 0dot eligible
            for a Google sitelinks search box; /search?q= is the same query
            param shape src/app/search/page.tsx already reads. Nonce'd like
            ThemeInitScript above — this is hand-authored, not one of
            Next's own framework scripts that the CSP nonce covers
            automatically. */}
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "0dot",
              url: "https://0dot.in",
              description: SITE_DESCRIPTION,
              publisher: {
                "@type": "Organization",
                name: "0dot",
                url: "https://0dot.in",
                logo: "https://0dot.in/icon-512.png",
              },
              potentialAction: {
                "@type": "SearchAction",
                target: "https://0dot.in/search?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
      </head>
      <body className={bodyClassNames || undefined}>
        <a href="#main-content" className="skipLink">
          Skip to content
        </a>
        <PwaServiceWorker />
        <SafariInstallPrompt />
        <ConsoleSelfXssWarning />
        <BrowserTabProvider initialUnreadCount={initialUnreadCount}>
          {/* Inside BrowserTabProvider (not outside) so CommandPalette's
              theme-toggle command hits the real useBrowserTab() context
              instead of BrowserTabProvider's own outside-the-tree NOOP
              fallback. */}
          <KeyboardShortcutProvider profileHandle={currentUser?.username?.handle ?? null}>
            <MessagingProvider userId={currentUser?.id ?? null}>
              <ToastProvider>
                {!chromeless && <SiteHeader />}
                <main id="main-content" tabIndex={-1} className="appMain">
                  {/* Rendered inside .appMain, not as a body-level sibling —
                      body is a CSS grid with named areas at desktop width
                      (header/sidebar/main/aside), and an unassigned grid-area
                      child gets auto-placed into whatever cell is next,
                      overlapping the sidebar instead of appearing above the
                      page content. */}
                  {!chromeless && currentUser && !currentUser.dateOfBirth && <AgeGatePrompt />}
                  {children}
                </main>
                {/* Sibling of .appMain, not nested inside it — grid-area only
                    applies to direct children of the body grid container.
                    Behind <Suspense> so the rail's ~6 reads plus a
                    logAIGeneration write (getSuggestedUsers) stream in
                    separately instead of holding back the page shell's
                    first byte — the skeleton keeps the grid column from
                    reflowing when it arrives. */}
                {showRail && (
                  <Suspense fallback={<ContextualRailSkeleton />}>
                    <ContextualRail />
                  </Suspense>
                )}
              </ToastProvider>
            </MessagingProvider>
          </KeyboardShortcutProvider>
         </BrowserTabProvider>
        {/* Both scripts only resolve when actually served from Vercel's own
            edge (they fetch /_vercel/speed-insights/script.js and
            /_vercel/insights/script.js, which only exist there) — gated on
            Vercel's own VERCEL env var so a non-Vercel deployment (e.g. this
            app's self-hosted box) doesn't render them at all, rather than
            rendering them to fail every load with a console.log("Failed to
            load script...") on every single page view. */}
        {process.env.VERCEL && (
          <>
            <SpeedInsights />
            <Analytics />
          </>
        )}
      </body>
    </html>
  );
}
