"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useBrowserTab } from "@/components/BrowserTabProvider";

// Mounted once in RootLayout, authenticated users only. Opens a single
// EventSource for the whole tab (not one per component) and, on any event,
// calls router.refresh() — this re-renders the current route's Server
// Component tree (SiteHeader's unread badge, an open /messages inbox list,
// an open conversation's message list) with authoritative data from the DB,
// rather than maintaining a second, hand-rolled copy of that state on the
// client. Simpler and less likely to drift than a bespoke context/pub-sub
// layer, at the cost of a full RSC refetch per live event — acceptable at
// chat-message frequency, not high-frequency enough to need finer-grained
// patching yet.
const REFRESH_COALESCE_MS = 300;

export function MessagingProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setUnreadCount } = useBrowserTab();

  useEffect(() => {
    if (!userId) return;

    // /api/browser-tab/unread-count runs the exact same two count queries
    // router.refresh() already triggers via SiteHeader's NotificationBell/
    // MessagesBadge (both Server Components on every refreshed route) — so
    // firing it unconditionally doubles that DB work on every single
    // realtime event, for every connected client. The tab badge only has
    // anything to say when this tab *isn't* the one on screen (that's what
    // it's for — a focused tab already shows the just-refreshed header
    // badges directly), so skip the extra round trip while focused and only
    // pay for it when the badge can actually be seen.
    const fetchUnreadCount = () => {
      fetch("/api/browser-tab/unread-count")
        .then((res) => res.json())
        .then((data: { count: number }) => setUnreadCount(data.count))
        .catch(() => {});
    };

    const source = new EventSource("/api/messages/stream");
    source.onmessage = () => {
      // Coalesce bursts (e.g. several group-chat messages landing at once)
      // into a single refresh rather than one per event.
      if (pendingRef.current) return;
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        router.refresh();
        if (document.visibilityState === "hidden" || !document.hasFocus()) {
          fetchUnreadCount();
        }
      }, REFRESH_COALESCE_MS);
    };

    // Covers the tab-was-focused-when-the-event-landed case: the badge
    // fetch above was skipped, so catch up the moment the tab actually
    // becomes the backgrounded one instead of waiting on the next event.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") fetchUnreadCount();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      source.close();
      if (pendingRef.current) clearTimeout(pendingRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [userId, router, setUnreadCount]);

  return <>{children}</>;
}
