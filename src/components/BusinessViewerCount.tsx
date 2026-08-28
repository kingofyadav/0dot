"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

// Realtime addendum Phase E. Mounted on /b/[slug] for *every* viewer — a
// lightweight beacon every 30s (no held connection) keeps them in the
// business's viewer set. Only the owner (isOwner) additionally opens the
// SSE that shows the live "N viewing now" count.
const PING_INTERVAL_MS = 30_000;

export function BusinessViewerCount({ businessSlug, isOwner }: { businessSlug: string; isOwner: boolean }) {
  const [count, setCount] = useState<number | null>(null);

  // Beacon: keep this tab counted while the page is visible.
  useEffect(() => {
    const base = `/api/b/${encodeURIComponent(businessSlug)}/viewers/ping`;
    // One key per tab for this session — a reload keeps the same slot
    // instead of briefly double-counting.
    let viewerKey: string;
    try {
      viewerKey = sessionStorage.getItem("bizview:key") ?? crypto.randomUUID();
      sessionStorage.setItem("bizview:key", viewerKey);
    } catch {
      viewerKey = crypto.randomUUID();
    }

    const ping = () => {
      if (document.visibilityState !== "visible") return;
      void fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerKey }),
        keepalive: true,
      }).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, PING_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    const leave = () => {
      try {
        navigator.sendBeacon(base, new Blob([JSON.stringify({ viewerKey, leaving: true })], { type: "application/json" }));
      } catch {
        // best-effort — the 45s TTL reaps us anyway
      }
    };
    window.addEventListener("pagehide", leave);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [businessSlug]);

  // Owner-only: the live count.
  useEffect(() => {
    if (!isOwner) return;
    const source = new EventSource(`/api/b/${encodeURIComponent(businessSlug)}/viewers/stream`);
    source.onmessage = (e) => {
      try {
        setCount((JSON.parse(e.data) as { count: number }).count);
      } catch {
        /* ignore a malformed frame */
      }
    };
    return () => source.close();
  }, [businessSlug, isOwner]);

  if (!isOwner || count === null || count < 1) return null;

  return (
    <span className="mutedText" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
      <Eye size={14} aria-hidden="true" />
      {count} viewing now
    </span>
  );
}
