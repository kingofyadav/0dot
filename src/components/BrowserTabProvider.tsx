"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  broadcastUnreadCount,
  getEffectiveTheme,
  iconHrefFor,
  renderFaviconDataUrl,
  resolveTabState,
  setFaviconHref,
  subscribeUnreadCount,
  syncAppBadge,
  type FlashState,
  type FlashStatus,
  type Theme,
} from "@/lib/browser-tab";

interface BrowserTabContextValue {
  setUnreadCount: (count: number) => void;
  setUnsaved: (dirty: boolean) => void;
  flash: (status: FlashStatus, message?: string) => void;
  setTheme: (theme: Theme) => void;
  resolveStaleSaving: (message?: string) => void;
}

const BrowserTabContext = createContext<BrowserTabContextValue | null>(null);

const SUCCESS_HOLD_MS = 2500;
const ERROR_HOLD_MS = 4000;
// Safety net, not a UX timer: a server action that redirects back to the
// same route it's already rendering on (e.g. profile settings) makes
// Next.js remount the client subtree that called flash("saving") before
// its own pending->false effect ever runs, so the explicit success/error
// call that would normally clear it never arrives. Without this ceiling
// the tab is stuck saying "Saving…" forever.
const SAVING_MAX_MS = 8_000;

const NOOP_CONTEXT: BrowserTabContextValue = {
  setUnreadCount: () => {},
  setUnsaved: () => {},
  flash: () => {},
  setTheme: () => {},
  resolveStaleSaving: () => {},
};

// Consumers (forms, ThemeToggleLogo) call this instead of touching
// document.title/favicon directly, so BrowserTabProvider stays the single
// writer and never fights another component over the same <link> tag.
export function useBrowserTab(): BrowserTabContextValue {
  return useContext(BrowserTabContext) ?? NOOP_CONTEXT;
}

export function BrowserTabProvider({
  initialUnreadCount,
  children,
}: {
  initialUnreadCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isDirty, setIsDirtyState] = useState(false);
  const [dirtyPathname, setDirtyPathname] = useState<string | null>(null);
  // Lazy initializers run on the client's first render (post-hydration,
  // where window/navigator exist) but not during SSR, so the real value is
  // there from the start with no extra effect+setState round trip.
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === "undefined" ? "light" : getEffectiveTheme()
  );
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator === "undefined" ? false : !navigator.onLine
  );
  const [flashState, setFlashState] = useState<FlashState | null>(null);
  const baseTitleRef = useRef("");
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashStateRef = useRef<FlashState | null>(null);

  // A dirty flag only counts while the page that raised it is still the
  // current one — derived at render time instead of reset via setState in
  // a pathname-change effect (cheaper, and avoids a same-tick cascading
  // render).
  const effectiveDirty = isDirty && dirtyPathname === pathname;

  const setUnsaved = useCallback(
    (dirty: boolean) => {
      setDirtyPathname(dirty ? pathname : null);
      setIsDirtyState(dirty);
    },
    [pathname]
  );

  // Reports a locally-learned count (from MessagingProvider's SSE-driven
  // fetch) to sibling tabs of the same account, so they don't have to wait
  // on their own SSE event or visibility change to catch up.
  const reportUnreadCount = useCallback((count: number) => {
    setUnreadCount(count);
    broadcastUnreadCount(count);
  }, []);

  // Applies a count learned by another tab directly to local state — no
  // re-broadcast here, or every tab would echo it back and forth forever.
  useEffect(() => subscribeUnreadCount(setUnreadCount), []);

  useEffect(() => {
    syncAppBadge(unreadCount);
  }, [unreadCount]);

  // Only a native close/refresh/URL-bar navigation trips this (via the
  // browser's own confirm prompt) — in-app <Link> navigation isn't covered,
  // that would need a separate router-level guard.
  useEffect(() => {
    if (!effectiveDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [effectiveDirty]);

  // Re-anchor the "resting" title to whatever the server/Next.js just
  // rendered for this route, so unread/unsaved prefixes stack on the real
  // per-page title instead of on our own previous override.
  useEffect(() => {
    baseTitleRef.current = document.title;
  }, [pathname]);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    // Keep following the OS scheme when the user hasn't made an explicit
    // manual choice — the static <link media="..."> tags did this for
    // free; taking over favicon writes here means we have to replicate it.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = () => {
      if (!document.documentElement.getAttribute("data-theme")) {
        setTheme(getEffectiveTheme());
      }
    };
    media.addEventListener("change", onSchemeChange);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      media.removeEventListener("change", onSchemeChange);
    };
  }, []);

  useEffect(() => {
    const resolved = resolveTabState({
      baseTitle: baseTitleRef.current,
      unreadCount,
      isDirty: effectiveDirty,
      isOffline,
      flash: flashState,
    });
    document.title = resolved.title;

    const baseHref = iconHrefFor(theme);
    if (resolved.favicon.kind === "normal") {
      setFaviconHref(baseHref);
    } else {
      renderFaviconDataUrl(baseHref, resolved.favicon).then(setFaviconHref);
    }
  }, [unreadCount, effectiveDirty, isOffline, flashState, theme, pathname]);

  const flash = useCallback((status: FlashStatus, message?: string) => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    flashStateRef.current = { status, message };
    setFlashState(flashStateRef.current);
    const holdMs = status === "success" ? SUCCESS_HOLD_MS : status === "error" ? ERROR_HOLD_MS : SAVING_MAX_MS;
    flashTimerRef.current = setTimeout(() => {
      flashStateRef.current = null;
      setFlashState(null);
    }, holdMs);
  }, []);

  // A server action that redirects back to the same route it's already
  // rendering (e.g. profile settings saving to its own URL) makes
  // Next.js remount the client subtree that called flash("saving") before
  // its own pending->false effect ever runs to resolve it. The freshly
  // mounted instance calls this once to claim that orphaned "saving" flash
  // as its own completed save, rather than waiting out SAVING_MAX_MS.
  const resolveStaleSaving = useCallback(
    (message?: string) => {
      if (flashStateRef.current?.status === "saving") {
        flash("success", message);
      }
    },
    [flash]
  );

  const value = useMemo<BrowserTabContextValue>(
    () => ({ setUnreadCount: reportUnreadCount, setUnsaved, flash, setTheme, resolveStaleSaving }),
    [reportUnreadCount, setUnsaved, flash, resolveStaleSaving]
  );

  return <BrowserTabContext.Provider value={value}>{children}</BrowserTabContext.Provider>;
}
