import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { ContextualRail } from "@/components/ContextualRail";
import { MessagingProvider } from "@/components/MessagingProvider";
import { BrowserTabProvider } from "@/components/BrowserTabProvider";
import { ToastProvider } from "@/components/Toast";
import { AgeGatePrompt } from "@/components/AgeGatePrompt";
import { PwaServiceWorker } from "@/components/PwaServiceWorker";
import { ThemeInitScript } from "@/components/ThemeInitScript";
import { getCurrentUser } from "@/lib/session";
import { getUnreadConversationCount } from "@/lib/messaging";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { isChromelessPath } from "@/lib/route-context";

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
export const viewport: Viewport = {
  viewportFit: "cover",
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
    },
    // phase-15 spec §5.1/§9 step 5: "desktop app" is this same web app,
    // installed via standard PWA installability (manifest + service
    // worker) rather than a sixth native codebase.
    manifest: "/manifest.json",
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

  const bodyClassNames = [showRail && "hasRail", showBottomNav && "hasBottomNav", chromeless && "noChrome"]
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
        <BrowserTabProvider initialUnreadCount={initialUnreadCount}>
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
        </BrowserTabProvider>
      </body>
    </html>
  );
}
