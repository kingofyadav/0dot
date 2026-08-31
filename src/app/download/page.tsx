import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import {
  Apple as AppleIcon,
  Bell,
  Download as DownloadIcon,
  Fingerprint,
  Monitor,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { MarketingNav } from "@/components/marketing/MarketingNav";

export const metadata: Metadata = { title: "Download" };

// Distribution reality (phase-15 build plan §5.1/§6, and the "download
// direct from the web, not a store" ask that motivated this page):
// Android genuinely supports installing an APK from a plain link — Play
// Protect will warn on an unfamiliar source, but the OS allows it. iOS does
// not: Apple only allows an app onto a device outside App Store review via
// TestFlight (still requires an Apple Developer Program account and an
// App Store Connect record) or ad-hoc distribution to pre-registered
// device UDIDs — there is no "download this .ipa from a webpage" path
// Apple permits for the general public. This page is honest about that
// difference rather than presenting a broken or misleading iOS link.
//
// ANDROID_APK_URL points at a copy of the EAS build re-hosted on Vercel
// Blob (scripts/upload not checked in — one-off), not the expo.dev
// artifacts URL EAS prints: that link is signed and expires a couple of
// weeks after the build finishes, which is fine for internal QA but not for
// a link this page keeps serving indefinitely. Re-run the same upload step
// and bump the constants below whenever a new build replaces this one.
// (The `preview` EAS profile doesn't auto-increment versionCode, so the
// build number can repeat across rebuilds — ANDROID_APK_UPDATED is what
// actually tells a returning visitor the download is fresher.)
//
// Current source build (EAS, account 0dot / project zerodot, commit bd7fb2b):
// https://expo.dev/accounts/0dot/projects/zerodot/builds/7c628817-6c39-4225-970c-5d37220fdaf7
const ANDROID_APK_URL = process.env.ANDROID_APK_DOWNLOAD_URL;
const ANDROID_APK_VERSION = "1.0.0";
const ANDROID_APK_BUILD = "6";
const ANDROID_APK_SIZE_MB = 161;
const ANDROID_APK_UPDATED = "Aug 28, 2026";
const IOS_TESTFLIGHT_URL = process.env.IOS_TESTFLIGHT_URL;

type DetectedPlatform = "android" | "ios" | "other";

function detectPlatform(userAgent: string): DetectedPlatform {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return "other";
}

export default async function DownloadPage() {
  const headersList = await headers();
  const platform = detectPlatform(headersList.get("user-agent") ?? "");

  return (
    <>
      <MarketingNav />

      {/* Same brand glow used behind the landing/auth pages
          (--gradient-brand-glow, globals.css) — fixed + isolate so it sits
          behind this page's content edge-to-edge without capturing clicks,
          same technique as .landingWrap::before. */}
      <div className="relative isolate">
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          style={{ background: "var(--gradient-brand-glow)" }}
          aria-hidden="true"
        />

        <section className="mx-auto flex max-w-[1100px] flex-col items-center gap-10 px-4 pt-8 pb-20 text-center lg:pt-16">
          {/* Theme-aware mark (same 1dot/0dot swap as the rest of the site,
              via .themeLogo* in globals.css) — the flat /icon-512.png that
              used to sit here is the light-fill version and read as a white
              block in dark mode. */}
          <Logo size={88} className="rounded-[22px] shadow-lg" />

          <div className="flex flex-col items-center gap-3">
            <h1 className="text-3xl font-bold lg:text-4xl">Get 0dot on your phone</h1>
            <p className="max-w-[46ch] text-lg opacity-75">
              Your permanent home on the internet — install the app and take it with you.
            </p>
          </div>

          <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
            <PlatformCard
              icon={Smartphone}
              title="Android"
              highlight={platform === "android"}
              action={
                ANDROID_APK_URL ? (
                  <a className="button justify-center gap-2" href={ANDROID_APK_URL}>
                    <DownloadIcon size={16} aria-hidden="true" />
                    Download APK
                  </a>
                ) : (
                  <p className="mutedText text-sm">Build coming soon.</p>
                )
              }
              meta={
                ANDROID_APK_URL
                  ? `v${ANDROID_APK_VERSION} (build ${ANDROID_APK_BUILD}) · ${ANDROID_APK_SIZE_MB} MB · updated ${ANDROID_APK_UPDATED}`
                  : undefined
              }
            />

            <PlatformCard
              icon={AppleIcon}
              title="iPhone / iPad"
              highlight={platform === "ios"}
              action={
                IOS_TESTFLIGHT_URL ? (
                  <a className="button justify-center" href={IOS_TESTFLIGHT_URL}>
                    Join TestFlight
                  </a>
                ) : (
                  <p className="mutedText text-sm">Beta coming soon.</p>
                )
              }
              note="Apple only allows installs via TestFlight, not a direct link."
            />

            <PlatformCard
              icon={Monitor}
              title="Desktop"
              highlight={platform === "other"}
              action={
                <Link className="button buttonSecondary justify-center" href="/feed">
                  Open 0dot
                </Link>
              }
              note="Installs as an app from your browser — no download needed."
            />
          </div>

          <div className="flex w-full max-w-3xl flex-col items-center gap-4 rounded-lg border border-border bg-surface p-6 shadow-md sm:flex-row sm:text-left">
            {/* Server-rendered SVG (src/app/download/qr/route.ts), same
                pattern as profile QR codes — no client JS needed to draw it. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic SVG route, not a static asset next/image's loader pipeline is for (same as TwoFactorSetupForm's QR). */}
            <img
              src="/download/qr"
              alt="QR code that opens this page"
              width={112}
              height={112}
              className="rounded-md border border-border bg-white p-2"
            />
            <div className="flex flex-col items-center gap-1 sm:items-start">
              <p className="flex items-center gap-2 font-semibold">
                <QrCode size={18} aria-hidden="true" />
                Scan to install
              </p>
              <p className="max-w-[34ch] text-sm opacity-70">
                Point your phone&apos;s camera here to open this page and download directly.
              </p>
            </div>
          </div>

          <ul className="grid w-full max-w-3xl gap-4 pt-2 text-left sm:grid-cols-2 lg:grid-cols-4">
            <Feature icon={Zap} title="Fast" body="Built native for speed, not squeezed into a mobile browser." />
            <Feature icon={Bell} title="Real-time" body="Push notifications the moment something happens." />
            <Feature icon={Fingerprint} title="Secure" body="Biometric unlock keeps your account locked down." />
            <Feature icon={RefreshCw} title="Always in sync" body="Same account, same feed, everywhere you sign in." />
          </ul>

          <p className="flex items-center gap-2 text-xs opacity-55">
            <ShieldCheck size={14} aria-hidden="true" />
            Free forever. No app store account needed.
          </p>
        </section>
      </div>
    </>
  );
}

function PlatformCard({
  icon: Icon,
  title,
  action,
  meta,
  note,
  highlight,
}: {
  icon: LucideIcon;
  title: string;
  action: React.ReactNode;
  meta?: string;
  note?: string;
  highlight: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-lg border bg-surface p-5 text-center shadow-sm"
      style={{
        borderColor: highlight ? "var(--accent)" : "var(--border)",
        boxShadow: highlight ? "0 0 0 3px var(--accent-soft)" : undefined,
      }}
    >
      <Icon size={26} aria-hidden="true" />
      <h2 className="text-base font-semibold">
        {title}
        {highlight && <span className="mutedText"> · this device</span>}
      </h2>
      <div className="flex w-full flex-col items-stretch">{action}</div>
      {meta && <p className="text-xs opacity-55">{meta}</p>}
      {note && <p className="mutedText text-xs">{note}</p>}
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <Icon size={20} aria-hidden="true" />
      <p className="font-semibold">{title}</p>
      <p className="mutedText text-sm">{body}</p>
    </li>
  );
}
