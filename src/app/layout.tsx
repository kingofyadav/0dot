import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
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
import { ThemeInitScript } from "@/components/ThemeInitScript";
import { getCurrentUser } from "@/lib/session";
import { getUnreadConversationCount } from "@/lib/messaging";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { isChromelessPath, isFixedViewportPath } from "@/lib/route-context";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    title,
    description:
      "Claim your permanent home on the internet — a profile, a link hub, and a feed, all under one identity.",
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

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeInitScript />
      </head>
      <body className={bodyClassNames || undefined}>
        <a href="#main-content" className="skipLink">
          Skip to content
        </a>
        <PwaServiceWorker />
        <SafariInstallPrompt />
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
                    applies to direct children of the body grid container. */}
                {showRail && <ContextualRail />}
              </ToastProvider>
            </MessagingProvider>
          </KeyboardShortcutProvider>
         </BrowserTabProvider>
        <SpeedInsights/>
       <Analytics/> 
      </body>
    </html>
  );
}
