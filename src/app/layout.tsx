import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { ContextualRail } from "@/components/ContextualRail";
import { MessagingProvider } from "@/components/MessagingProvider";
import { ToastProvider } from "@/components/Toast";
import { AgeGatePrompt } from "@/components/AgeGatePrompt";
import { getCurrentUser } from "@/lib/session";
import { showsContextualRail, isChromelessPath } from "@/lib/route-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Same x-pathname mechanism SiteHeader already reads (see proxy.ts) —
  // the contextual rail is opt-in per route (docs/foundations/NAVIGATION.md:
  // "optional per page, not a fixed global element"), so RootLayout needs
  // to know the current route too, not just SiteHeader.
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  const showRail = showsContextualRail(pathname);
  const chromeless = isChromelessPath(pathname);
  const currentUser = await getCurrentUser();

  const bodyClassNames = [showRail && "hasRail", chromeless && "noChrome"]
    .filter(Boolean)
    .join(" ");

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies a previously-chosen manual theme before first paint, so
            there's no flash of the wrong theme while React hydrates. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('0dot-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={bodyClassNames || undefined}>
        <a href="#main-content" className="skipLink">
          Skip to content
        </a>
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
      </body>
    </html>
  );
}
