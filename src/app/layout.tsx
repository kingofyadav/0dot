import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/session";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
      <body>
        <SiteHeader />
        <main className="appMain">{children}</main>
      </body>
    </html>
  );
}
