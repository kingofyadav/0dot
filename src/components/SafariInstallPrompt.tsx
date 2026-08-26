"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";

const DISMISSED_KEY = "safariInstallPromptDismissed";

type SafariPlatform = "ios" | "mac" | null;

// Chromium browsers (Chrome/Edge on Android and desktop Linux/Windows) get a
// native one-tap "Install app" affordance from the `beforeinstallprompt`
// event. Safari never fires that event on any Apple device — iOS, iPadOS, or
// macOS — so there's nothing to hook into there, including Chrome-for-iOS
// (still WebKit under Apple's App Store rules). This walks Safari users
// through the only path that exists on each: Share -> Add to Home Screen on
// iOS/iPadOS, Share -> Add to Dock on macOS. Dismissal is remembered
// per-browser so it only needs to be seen once.
function detectPlatform(nav: Navigator & { standalone?: boolean }): SafariPlatform {
  const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(nav.userAgent);
  if (!isSafari) return null;

  const isStandalone = nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  if (isStandalone) return null;

  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return "ios";
  // iPadOS reports itself as "Macintosh" in the UA string since iPadOS 13 —
  // multi-touch is the only reliable signal left to tell it apart from an
  // actual Mac.
  if (nav.platform === "MacIntel" && nav.maxTouchPoints > 1) return "ios";
  if (nav.platform === "MacIntel" || /Macintosh/.test(nav.userAgent)) return "mac";
  return null;
}

export function SafariInstallPrompt() {
  const [platform, setPlatform] = useState<SafariPlatform>(null);

  useEffect(() => {
    const detected = detectPlatform(window.navigator as Navigator & { standalone?: boolean });
    if (detected && localStorage.getItem(DISMISSED_KEY) !== "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR renders nothing (server has no navigator); this flips visibility on once the client determines it's Safari post-hydration.
      setPlatform(detected);
    }
  }, []);

  if (!platform) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setPlatform(null);
  };

  return (
    <div className="iosInstallBanner" role="region" aria-label="Install 0dot">
      <p className="iosInstallBannerText">
        {platform === "ios" ? (
          <>
            Install <span className="brandUrl">0dot</span>: tap <Share size={15} aria-hidden="true" className="iosInstallBannerIcon" /> then{" "}
            <strong>Add to Home Screen</strong>
            <SquarePlus size={15} aria-hidden="true" className="iosInstallBannerIcon" />
          </>
        ) : (
          <>
            Install <span className="brandUrl">0dot</span>: click <Share size={15} aria-hidden="true" className="iosInstallBannerIcon" /> in the
            toolbar, then <strong>Add to Dock</strong>
            <SquarePlus size={15} aria-hidden="true" className="iosInstallBannerIcon" />
            {" "}(older Safari: <strong>Add to Home Screen</strong>)
          </>
        )}
      </p>
      <button type="button" className="iosInstallBannerClose" aria-label="Dismiss" onClick={dismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
