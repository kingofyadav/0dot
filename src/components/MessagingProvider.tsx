"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

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

  useEffect(() => {
    if (!userId) return;

    const source = new EventSource("/api/messages/stream");
    source.onmessage = () => {
      // Coalesce bursts (e.g. several group-chat messages landing at once)
      // into a single refresh rather than one per event.
      if (pendingRef.current) return;
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        router.refresh();
      }, REFRESH_COALESCE_MS);
    };

    return () => {
      source.close();
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, [userId, router]);

  return <>{children}</>;
}
