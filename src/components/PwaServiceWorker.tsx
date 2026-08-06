"use client";

import { useEffect } from "react";

// phase-15 spec §5.2/§9 step 5: registers the read-time-offline-caching
// service worker (public/sw.js) — the PWA surface itself needs no other
// client code, since "desktop app" (§5.1) is just this same installable
// web app.
export function PwaServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
