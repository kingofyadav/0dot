import { headers } from "next/headers";
import Link from "next/link";

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
// Both URLs are unset until a real EAS build exists (mobile/eas.json's
// `preview` profile: `eas build --profile preview --platform android`
// produces a direct-download APK; the iOS equivalent still needs
// TestFlight setup) — showing a "coming soon" state instead of a fabricated
// link until then.
const ANDROID_APK_URL = process.env.ANDROID_APK_DOWNLOAD_URL;
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
    <div className="authWrap">
      <div className="authCard">
        <h1>Get 0dot</h1>
        <p className="mutedText">Choose your device below.</p>

        <PlatformSection
          title="Android"
          highlight={platform === "android"}
          body={
            ANDROID_APK_URL ? (
              <a className="button" href={ANDROID_APK_URL}>
                Download APK
              </a>
            ) : (
              <p className="mutedText">Android build coming soon.</p>
            )
          }
        />

        <PlatformSection
          title="iPhone / iPad"
          highlight={platform === "ios"}
          body={
            IOS_TESTFLIGHT_URL ? (
              <>
                <a className="button" href={IOS_TESTFLIGHT_URL}>
                  Join the TestFlight beta
                </a>
                <p className="mutedText" style={{ fontSize: "0.8rem" }}>
                  Apple doesn&apos;t allow installing apps from a plain
                  download link — TestFlight is the closest thing to
                  direct-from-web install iOS permits.
                </p>
              </>
            ) : (
              <p className="mutedText">iOS beta coming soon.</p>
            )
          }
        />

        <PlatformSection
          title="Desktop"
          highlight={platform === "other"}
          body={
            <>
              <p className="mutedText">Install 0dot as an app from your browser — no download needed.</p>
              <Link className="button buttonSecondary" href="/feed">
                Open 0dot
              </Link>
            </>
          }
        />
      </div>
    </div>
  );
}

function PlatformSection({ title, body, highlight }: { title: string; body: React.ReactNode; highlight: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", opacity: highlight ? 1 : 0.75 }}>
      <h2 style={{ fontSize: "var(--text-md, 1rem)", fontWeight: 600 }}>
        {title}
        {highlight ? " (this device)" : ""}
      </h2>
      {body}
    </div>
  );
}
